import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { MovementDialog } from './HeritageMovements';
import { ReportFields, useAlterations } from './HeritageConservation';
import { printHtml } from './printHtml';
import { dayText } from '../core/placement';
import { MAX_DAYS_AHEAD, addDays } from '../core/movements';
import { emptyReportForm, reportBody, reportProblems } from '../core/conservation';
import type { ReportForm } from '../core/conservation';
import {
    NATURE_LABELS, STAGE_FILTERS, STAGE_NEXT_STEPS, dossierBody, dossierFormOf, dossierProblems, elementBody, elementFormOf, elementProblems, elementSummary, elementUpdateBody, emptyDossierForm, emptyElementForm,
    emptyProlongForm, isOpen, journalSummary, lateText, natureLabel, periodText, prolongBody, prolongProblems, sortieText, stageLabel, termsBody, termsFormOf, termsProblems, timeline,
    transitionBody, transitionLabel, transitionProblems, transportSheetHtml, valueText
} from '../core/dossiers';
import type { DossierForm, ElementForm, ProlongForm, TermsForm } from '../core/dossiers';
import type { LoanDossier, DossierElement, DossierJournalEntry, DossierNature, DossierPage, DossierRow, DossierStage, DossierSummary, DossierTransitionOption, HeritageAsset, HeritageAssetPage, HeritageAssetSummary } from '../core/types';
import { display } from '../core/format';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Le badge d'une étape : une classe à part, pour que les couleurs des dossiers ne se mêlent pas à celles des autres modules. */
function StageBadge({ stage, late = false }: { stage: DossierStage; late?: boolean }) {
    return <><Badge value={'L_' + stage} label={stageLabel(stage)} />{late && <Badge value="L_RETARD" label="En retard" />}</>;
}

/** Une action sur le serveur : une à la fois, l'erreur est montrée telle quelle. */
function useRun() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const run = async (action: () => Promise<unknown>): Promise<boolean> => {
        setBusy(true); setError(null);
        try { await action(); return true; } catch (e) { setError(e); return false; } finally { setBusy(false); }
    };
    return { busy, error, run };
}

// ---------- choix des originaux

export interface PickedOriginal { bienId: string; bienIdentifiant: string; bienIntitule: string; archiveId: string; cote: string }

/** Cherche un bien de l'institution et propose ses originaux physiques : un original ne part que s'il est relié à un bien. */
function OriginalPicker({ institutionId, taken, onPick }: { institutionId: string; taken: readonly string[]; onPick: (o: PickedOriginal) => void }) {
    const { heritage, epoch } = useSession();
    const [term, setTerm] = useState('');
    const [applied, setApplied] = useState('');
    const [open, setOpen] = useState<HeritageAssetSummary | null>(null);
    const listQ = useResource<HeritageAssetPage>(s => applied.trim().length >= 2 ? heritage!.assets({ q: applied.trim(), page: 0, size: 8 }, s) : Promise.resolve({ items: [], page: 0, size: 8, total: 0, hasMore: false }), 'dossier-picker:' + applied + ':' + epoch);
    const detailQ = useResource<HeritageAsset | null>(s => open ? heritage!.asset(open.id, s) : Promise.resolve(null), 'dossier-picker-asset:' + (open?.id ?? '') + ':' + epoch);
    const items = (listQ.data?.items ?? []).filter(b => b.institutionId === institutionId);
    return <div className="dossier-picker">
        {/* Pas de formulaire ici : le sélecteur se trouve dans les formulaires de montage, et deux formulaires ne s'emboîtent pas. */}
        <div className="asset-filters" role="search" aria-label="Chercher un bien">
            <Field label="Chercher un bien (au moins 2 caractères)"><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Intitulé, numéro d’inventaire ou identifiant"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setApplied(term); setOpen(null); } }} /></Field>
            <button type="button" className="btn small secondary" onClick={() => { setApplied(term); setOpen(null); }}>Chercher</button>
        </div>
        {listQ.loading && applied.trim().length >= 2 ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : applied.trim().length >= 2 && items.length === 0
            ? <p className="wf-note">Aucun bien de l’institution ne correspond.</p>
            : <ul aria-label="Biens trouvés">{items.map(b => <li key={b.id}>
                <div className="asset-links"><span><strong>{b.identifiant}</strong> — {b.intitule}</span><button type="button" className="btn small secondary" onClick={() => setOpen(open?.id === b.id ? null : b)}>{open?.id === b.id ? 'Fermer' : 'Ses originaux'}</button></div>
                {open?.id === b.id && (detailQ.loading ? <Busy /> : detailQ.error ? <ErrorNotice error={detailQ.error} onRetry={detailQ.refresh} />
                    : (detailQ.data?.originaux.length ?? 0) === 0 ? <p className="wf-note">Ce bien n’a pas d’original physique relié.</p>
                    : <ul className="asset-picker">{detailQ.data!.originaux.map(o => <li key={o.archivePhysiqueId}><span>{o.cote}{o.libelle && <small> — {o.libelle}</small>}</span>
                        <button type="button" className="btn small primary" disabled={taken.includes(o.archivePhysiqueId)} onClick={() => onPick({ bienId: b.id, bienIdentifiant: b.identifiant, bienIntitule: b.intitule, archiveId: o.archivePhysiqueId, cote: o.cote })}>
                            {taken.includes(o.archivePhysiqueId) ? 'Déjà choisi' : 'Choisir'}</button></li>)}</ul>)}</li>)}</ul>}
    </div>;
}

// ---------- montage d'un dossier

function CreateDialog({ nature, institutionId, initial, onClose, onDone }: { nature: DossierNature; institutionId: string; initial: PickedOriginal[]; onClose: () => void; onDone: (id: string) => void }) {
    const { heritage } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<DossierForm>(emptyDossierForm(nature));
    const [picked, setPicked] = useState<PickedOriginal[]>(initial);
    const action = useRun();
    const today = todayIso();
    const problems = dossierProblems(form, today);
    const pret = nature === 'PRET';
    const set = (patch: Partial<DossierForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        const body = { ...dossierBody(form), institutionId, originaux: picked.map(p => ({ bienId: p.bienId, archiveId: p.archiveId })) };
        let id = '';
        if (await action.run(async () => { id = (await heritage!.command<LoanDossier>('/dossiers', body, key.current, 'POST')).id; })) { onDone(id); onClose(); }
    };
    return <Modal title={pret ? 'Monter un prêt sortant' : 'Monter une exposition'} onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <Notice>{pret
                ? 'Un prêt réunit les originaux qui partent chez un emprunteur, la convention, l’assurance et le transport. Il est accepté par une autre personne que vous ; vous complétez ensuite la convention, l’assurance et le transport, avant la remise des originaux.'
                : 'Une exposition réunit les originaux que l’institution montre dans un lieu, avec ses dates. Elle est acceptée par une autre personne que vous ; chaque original sort ensuite par une demande de mouvement, avec un constat d’état au départ et au retour.'}</Notice>
            <div className="form-grid">
                <Field label={pret ? 'Intitulé du prêt *' : 'Titre de l’exposition *'} wide><input value={form.intitule} onChange={e => set({ intitule: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Objet * (au moins 10 caractères)" wide hint="Pourquoi les originaux sortent"><textarea value={form.objet} onChange={e => set({ objet: e.target.value })} rows={3} maxLength={4000} disabled={action.busy} /></Field>
                {pret && <Field label="Emprunteur *" hint="Organisme ou personne"><input value={form.emprunteurNom} onChange={e => set({ emprunteurNom: e.target.value })} maxLength={255} disabled={action.busy} /></Field>}
                {pret && <Field label="Coordonnées de l’emprunteur" hint="Facultatif"><input value={form.emprunteurContact} onChange={e => set({ emprunteurContact: e.target.value })} maxLength={2000} disabled={action.busy} /></Field>}
                {!pret && <Field label="Commissaire" hint="Facultatif"><input value={form.commissaire} onChange={e => set({ commissaire: e.target.value })} maxLength={255} disabled={action.busy} /></Field>}
                <Field label={pret ? 'Lieu chez l’emprunteur *' : 'Lieu de l’exposition *'}><input value={form.lieuNom} onChange={e => set({ lieuNom: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Adresse" hint="Facultatif"><input value={form.lieuAdresse} onChange={e => set({ lieuAdresse: e.target.value })} maxLength={2000} disabled={action.busy} /></Field>
                <Field label={pret ? 'Début du prêt *' : 'Ouverture *'}><input type="date" min={today} value={form.dateDebut} onChange={e => set({ dateDebut: e.target.value })} disabled={action.busy} /></Field>
                {!pret && <Field label="Fermeture *"><input type="date" min={form.dateDebut || today} value={form.dateFin} onChange={e => set({ dateFin: e.target.value })} disabled={action.busy} /></Field>}
                <Field label={pret ? 'Retour prévu * (fin du prêt)' : 'Retour des originaux prévu *'} hint="Cinq ans au plus"><input type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={form.retourPrevu} onChange={e => set({ retourPrevu: e.target.value })} disabled={action.busy} /></Field>
            </div>
            <section className="asset-group"><h4>Originaux qui sortent ({picked.length})</h4>
                {picked.length > 0 && <ul className="dossier-picked" aria-label="Originaux choisis">{picked.map(p => <li key={p.archiveId}>{p.cote} — {p.bienIntitule}<button type="button" aria-label={'Retirer ' + p.cote} onClick={() => setPicked(picked.filter(x => x.archiveId !== p.archiveId))}>×</button></li>)}</ul>}
                <OriginalPicker institutionId={institutionId} taken={picked.map(p => p.archiveId)} onPick={o => setPicked([...picked, o])} /></section>
            {problems.length > 0 && (form.intitule !== '' || form.objet !== '' || form.lieuNom !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>{pret ? 'Monter le prêt' : 'Monter l’exposition'}</button></footer>
        </form>
    </Modal>;
}

function EditDialog({ dossier, onClose, onDone }: { dossier: LoanDossier; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [form, setForm] = useState<DossierForm>(() => dossierFormOf(dossier));
    const action = useRun();
    const today = todayIso();
    const problems = dossierProblems(form, today, false);
    const pret = dossier.nature === 'PRET';
    const set = (patch: Partial<DossierForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id, { ...dossierBody(form, false), expectedVersion: dossier.version }, crypto.randomUUID(), 'PUT'))) { onDone(); onClose(); }
    };
    return <Modal title="Modifier le dossier" subtitle={dossier.numero} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={form.intitule} onChange={e => set({ intitule: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Objet * (au moins 10 caractères)" wide><textarea value={form.objet} onChange={e => set({ objet: e.target.value })} rows={3} maxLength={4000} disabled={action.busy} /></Field>
                {pret && <Field label="Emprunteur *"><input value={form.emprunteurNom} onChange={e => set({ emprunteurNom: e.target.value })} maxLength={255} disabled={action.busy} /></Field>}
                {pret && <Field label="Coordonnées de l’emprunteur"><input value={form.emprunteurContact} onChange={e => set({ emprunteurContact: e.target.value })} maxLength={2000} disabled={action.busy} /></Field>}
                {!pret && <Field label="Commissaire"><input value={form.commissaire} onChange={e => set({ commissaire: e.target.value })} maxLength={255} disabled={action.busy} /></Field>}
                <Field label="Lieu *"><input value={form.lieuNom} onChange={e => set({ lieuNom: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Adresse"><input value={form.lieuAdresse} onChange={e => set({ lieuAdresse: e.target.value })} maxLength={2000} disabled={action.busy} /></Field>
                <Field label={pret ? 'Début du prêt *' : 'Ouverture *'}><input type="date" value={form.dateDebut} onChange={e => set({ dateDebut: e.target.value })} disabled={action.busy} /></Field>
                {!pret && <Field label="Fermeture *"><input type="date" value={form.dateFin} onChange={e => set({ dateFin: e.target.value })} disabled={action.busy} /></Field>}
                <Field label={pret ? 'Retour prévu * (fin du prêt)' : 'Retour des originaux prévu *'}><input type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={form.retourPrevu} onChange={e => set({ retourPrevu: e.target.value })} disabled={action.busy} /></Field>
            </div>
            {problems.length > 0 && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

// ---------- convention, assurance, transport

function TermsDialog({ dossier, onClose, onDone }: { dossier: LoanDossier; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [form, setForm] = useState<TermsForm>(() => termsFormOf(dossier));
    const action = useRun();
    const problems = termsProblems(form, todayIso());
    const set = (patch: Partial<TermsForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/terms', { expectedVersion: dossier.version, termes: termsBody(form) }, crypto.randomUUID(), 'PUT'))) { onDone(); onClose(); }
    };
    return <Modal title="Convention, assurance et transport" subtitle={dossier.numero} onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <Notice>Les originaux ne partent qu’avec la convention de prêt (référence et date de signature), une assurance (police qui couvre du départ au retour, ou absence d’assurance motivée par écrit) et un mode de transport. Ces informations se complètent jusqu’à la remise.</Notice>
            <h4 className="conservation-subtitle">Convention de prêt</h4>
            <div className="form-grid">
                <Field label="Référence de la convention"><input value={form.conventionReference} onChange={e => set({ conventionReference: e.target.value })} maxLength={120} disabled={action.busy} /></Field>
                <Field label="Signée le"><input type="date" max={todayIso()} value={form.conventionSigneeLe} onChange={e => set({ conventionSigneeLe: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Signataire de l’emprunteur" wide><input value={form.conventionSignataire} onChange={e => set({ conventionSignataire: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
            </div>
            <fieldset className="placement-choices" disabled={action.busy}><legend>Assurance</legend>
                <label><input type="radio" name="assurance" value="POLICE" checked={form.assuranceMode === 'POLICE'} onChange={() => set({ assuranceMode: 'POLICE' })} /><span><strong>Une police d’assurance</strong><small>Assureur, numéro de police et période de couverture.</small></span></label>
                <label><input type="radio" name="assurance" value="EXONERATION" checked={form.assuranceMode === 'EXONERATION'} onChange={() => set({ assuranceMode: 'EXONERATION' })} /><span><strong>Pas d’assurance</strong><small>Garantie de l’État, décision ou convention : le motif s’écrit.</small></span></label>
            </fieldset>
            <div className="form-grid">
                {form.assuranceMode === 'POLICE' ? <>
                    <Field label="Assureur"><input value={form.assureur} onChange={e => set({ assureur: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                    <Field label="Numéro de police"><input value={form.assurancePolice} onChange={e => set({ assurancePolice: e.target.value })} maxLength={120} disabled={action.busy} /></Field>
                    <Field label="Couverture du"><input type="date" value={form.assuranceDu} onChange={e => set({ assuranceDu: e.target.value })} disabled={action.busy} /></Field>
                    <Field label="Couverture au" hint={'Au moins jusqu’au retour prévu (' + dayText(dossier.retourPrevu) + ')'}><input type="date" value={form.assuranceAu} onChange={e => set({ assuranceAu: e.target.value })} disabled={action.busy} /></Field>
                </> : <Field label="Motif de l’absence d’assurance * (au moins 10 caractères)" wide><textarea value={form.exonerationMotif} onChange={e => set({ exonerationMotif: e.target.value })} rows={3} maxLength={2000} disabled={action.busy} /></Field>}
                <Field label="Devise des valeurs assurées" hint="Code à trois lettres, par exemple GNF"><input value={form.devise} onChange={e => set({ devise: e.target.value })} maxLength={3} disabled={action.busy} /></Field>
            </div>
            <h4 className="conservation-subtitle">Transport</h4>
            <div className="form-grid">
                <Field label="Mode de transport"><input value={form.transportMode} onChange={e => set({ transportMode: e.target.value })} maxLength={120} disabled={action.busy} /></Field>
                <Field label="Transporteur"><input value={form.transporteur} onChange={e => set({ transporteur: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Convoyeur"><input value={form.convoyeur} onChange={e => set({ convoyeur: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <span />
                <Field label="Transport aller le"><input type="date" value={form.transportAllerLe} onChange={e => set({ transportAllerLe: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Transport retour le"><input type="date" value={form.transportRetourLe} onChange={e => set({ transportRetourLe: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Emballage" wide><textarea value={form.emballage} onChange={e => set({ emballage: e.target.value })} rows={2} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {problems.length > 0 && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

// ---------- originaux du dossier

function AddOriginalDialog({ dossier, onClose, onDone }: { dossier: LoanDossier; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [picked, setPicked] = useState<PickedOriginal | null>(null);
    const [form, setForm] = useState<ElementForm>(emptyElementForm);
    const action = useRun();
    const problems = elementProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!picked || problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/elements', elementBody(form, picked.bienId, picked.archiveId), crypto.randomUUID(), 'POST'))) { onDone(); onClose(); }
    };
    return <Modal title="Ajouter un original" subtitle={dossier.numero} onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            {!picked ? <OriginalPicker institutionId={dossier.institutionId} taken={dossier.elements.map(e => e.archiveId)} onPick={setPicked} />
                : <><p className="placement-summary"><strong>{picked.cote}</strong> — {picked.bienIdentifiant}, {picked.bienIntitule} <button type="button" className="text-link" onClick={() => setPicked(null)}>Changer</button></p>
                    <div className="form-grid">
                        {dossier.nature === 'PRET' && <Field label="Valeur assurée" hint="Exigée quand le prêt est assuré par une police"><input inputMode="decimal" value={form.valeur} onChange={e => setForm({ ...form, valeur: e.target.value })} disabled={action.busy} /></Field>}
                        <Field label="Emplacement" hint="Salle, vitrine…"><input value={form.emplacement} onChange={e => setForm({ ...form, emplacement: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                        <Field label="Conditions de présentation" wide hint="Lumière, humidité, vitrine, manipulation…"><textarea value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} rows={2} maxLength={4000} disabled={action.busy} /></Field>
                    </div></>}
            {problems.length > 0 && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || !picked || problems.length > 0}>Ajouter au dossier</button></footer>
        </form>
    </Modal>;
}

function ElementDialog({ dossier, element, onClose, onDone }: { dossier: LoanDossier; element: DossierElement; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [form, setForm] = useState<ElementForm>(() => elementFormOf(element));
    const action = useRun();
    const problems = elementProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/elements/' + element.id, elementUpdateBody(form), crypto.randomUUID(), 'PUT'))) { onDone(); onClose(); }
    };
    return <Modal title={'Original ' + element.cote} subtitle={element.bienIntitule} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {dossier.nature === 'PRET' && <Field label="Valeur assurée"><input inputMode="decimal" value={form.valeur} onChange={e => setForm({ ...form, valeur: e.target.value })} disabled={action.busy} /></Field>}
                <Field label="Emplacement"><input value={form.emplacement} onChange={e => setForm({ ...form, emplacement: e.target.value })} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Conditions de présentation" wide><textarea value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} rows={3} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {problems.length > 0 && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/** Le constat d'état de départ : c'est celui de la conservation, enregistré depuis le dossier (le contexte « avant un mouvement » est imposé). */
function DepartureReportDialog({ dossier, element, onClose, onDone }: { dossier: LoanDossier; element: DossierElement; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const references = useAlterations();
    const [form, setForm] = useState<ReportForm>(() => emptyReportForm(''));
    const action = useRun();
    const problems = reportProblems(form, todayIso(), true);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/elements/' + element.id + '/departure-report', { constat: reportBody(form, true) }, crypto.randomUUID(), 'POST'))) { onDone(); onClose(); }
    };
    return <Modal title="Constat d’état de départ" subtitle={element.cote + ' · ' + element.bienIntitule} onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <Notice>Le constat se fait juste avant le départ. Il devient le dernier état connu de l’original : s’il interdit la manipulation, l’original ne sortira pas.</Notice>
            <ReportFields form={form} setForm={setForm} references={references} institutionId={dossier.institutionId} final disabled={action.busy} />
            {problems.length > 0 && form.etat !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Enregistrer le constat</button></footer>
        </form>
    </Modal>;
}

// ---------- passages et prolongation

function TransitionDialog({ dossier, option, onClose, onDone }: { dossier: LoanDossier; option: DossierTransitionOption; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [texte, setTexte] = useState('');
    const action = useRun();
    const problems = transitionProblems(option, texte);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/transitions', transitionBody(option.vers, dossier.version, texte), crypto.randomUUID(), 'POST'))) { onDone(); onClose(); }
    };
    return <Modal title={transitionLabel(option.vers)} subtitle={dossier.numero} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {option.vers === 'ACCEPTE' && <Notice>L’acceptation engage l’institution : elle est conservée avec son auteur et sa date. Elle est donnée par une autre personne que celle qui a monté le dossier ; les originaux sont jugés de nouveau à la remise.</Notice>}
            {(option.vers === 'REFUSE' || option.vers === 'ANNULE') && <Notice tone="warning">Cette décision est définitive.{option.vers === 'ANNULE' && ' Les sorties demandées pour ce dossier sont annulées avec lui.'}</Notice>}
            {option.vers === 'CLOS' && <Notice>Tous les originaux sont rentrés avec leur constat d’état : le dossier est clos et ne se modifie plus.</Notice>}
            <div className="form-grid">{(option.motifRequis || option.vers === 'CLOS') &&
                <Field label={option.motifRequis ? 'Motif * (au moins 10 caractères)' : 'Bilan'} wide hint={option.motifRequis ? undefined : 'Facultatif : déroulement, incidents, enseignements'}>
                    <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>}</div>
            {problems.length > 0 && texte !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Retour</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

function ProlongDialog({ dossier, onClose, onDone }: { dossier: LoanDossier; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [form, setForm] = useState<ProlongForm>(emptyProlongForm);
    const action = useRun();
    const today = todayIso();
    const problems = prolongProblems(form, dossier, today);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        if (await action.run(() => heritage!.command('/dossiers/' + dossier.id + '/prolong', prolongBody(form, dossier.version), crypto.randomUUID(), 'POST'))) { onDone(); onClose(); }
    };
    return <Modal title={dossier.nature === 'PRET' ? 'Prolonger le prêt' : 'Prolonger l’exposition'} subtitle={dossier.numero + ' · fin actuelle le ' + dayText(dossier.dateFin)} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice>{dossier.nature === 'PRET' ? 'La nouvelle fin est aussi la nouvelle date de retour de chaque original. L’assurance doit couvrir cette date : prolongez-la d’abord si besoin.' : 'La fermeture recule, et le retour des originaux avec elle (le délai de démontage est conservé).'}</Notice>
            <div className="form-grid">
                <Field label="Nouvelle fin *" hint="Cinq ans au plus"><input type="date" min={addDays(dossier.dateFin, 1)} max={addDays(today, MAX_DAYS_AHEAD)} value={form.nouvelleFin} onChange={e => setForm({ ...form, nouvelleFin: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Motif * (au moins 10 caractères)" wide><textarea value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} rows={3} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {problems.length > 0 && (form.nouvelleFin !== '' || form.motif !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button><button type="submit" className="btn primary" disabled={action.busy || problems.length > 0}>Prolonger</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche d'un dossier

function ElementCard({ dossier, element, onOpenMovement, onEdit, onReport, onRemove, busy }: {
    dossier: LoanDossier; element: DossierElement; onOpenMovement: (id: string) => void; onEdit: (e: DossierElement) => void; onReport: (e: DossierElement) => void; onRemove: (e: DossierElement) => void; busy: boolean;
}) {
    const status = element.sortie?.statut ?? null;
    const tone = element.sortie?.enRetard ? 'bad' : status === 'RETOURNEE' ? 'ok' : status === 'REFUSEE' || status === 'ANNULEE' || element.obstacles.length > 0 ? 'bad' : status === null || status === 'DEMANDEE' || status === 'AUTORISEE' ? 'warn' : '';
    const money = element.valeurAssuree === null ? null : valueText({ valeurTotale: element.valeurAssuree, assurance: dossier.assurance });
    const out = status === 'REMISE' || status === 'RECUE';
    return <li className={'dossier-element ' + tone}>
        <header><h5>{element.cote} — {element.bienIntitule} <small>({element.bienIdentifiant})</small></h5><Badge value={'R_' + (status ?? 'AUCUNE')} label={sortieText(element)} /></header>
        <p>{elementSummary(element)}{element.sortie?.enRetard && <strong> En retard.</strong>}</p>
        {(money || element.conditions || element.emplacement) && <p>{[money && 'Valeur assurée : ' + money, element.emplacement && 'Emplacement : ' + element.emplacement, element.conditions && 'Conditions : ' + element.conditions].filter(Boolean).join(' · ')}</p>}
        {element.obstacles.length > 0 && <ul className="wf-blockers" aria-label={'Obstacles ' + element.cote}>{element.obstacles.map(o => <li key={o.code} className="bad"><span>{o.message}</span></li>)}</ul>}
        <div className="table-actions">
            {element.sortie && <button type="button" className="btn small secondary" onClick={() => onOpenMovement(element.sortie!.id)}>Ouvrir la sortie</button>}
            {dossier.peutConstater && !out && status !== 'RETOURNEE' && <button type="button" className="btn small secondary" disabled={busy} onClick={() => onReport(element)}>Constat de départ</button>}
            {dossier.peutCompleter && <button type="button" className="btn small secondary" disabled={busy} onClick={() => onEdit(element)}>Modifier</button>}
            {dossier.peutModifier && <button type="button" className="btn small secondary" disabled={busy} onClick={() => onRemove(element)}>Retirer du dossier</button>}
        </div>
    </li>;
}

export function DossierDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [chosen, setChosen] = useState<DossierTransitionOption | null>(null);
    const [dialog, setDialog] = useState<null | 'edit' | 'terms' | 'add' | 'prolong'>(null);
    const [editing, setEditing] = useState<DossierElement | null>(null);
    const [reporting, setReporting] = useState<DossierElement | null>(null);
    const [movementId, setMovementId] = useState<string | null>(null);
    const action = useRun();
    const q = useResource<LoanDossier>(s => heritage!.dossier(id, s), 'dossier:' + id + ':' + revision + ':' + epoch);
    const journalQ = useResource<DossierJournalEntry[]>(s => heritage!.dossierJournal(id, s), 'dossier-journal:' + id + ':' + revision + ':' + epoch);
    const last = useRef<LoanDossier | null>(null);
    if (q.data) last.current = q.data;
    const dossier = q.data ?? last.current;
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    if (!dossier && q.loading) return <Modal title="Dossier de prêt ou d’exposition" onClose={onClose} wide><Busy /></Modal>;
    if (!dossier) return <Modal title="Dossier de prêt ou d’exposition" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const pret = dossier.nature === 'PRET';
    const open = isOpen(dossier.statut);
    const late = lateText(dossier);
    const prepare = () => void action.run(async () => { await heritage!.command('/dossiers/' + dossier.id + '/prepare', { expectedVersion: dossier.version }, crypto.randomUUID(), 'POST'); refresh(); });
    const remove = (element: DossierElement) => void action.run(async () => { await heritage!.command('/dossiers/' + dossier.id + '/elements/' + element.id + '/remove', { expectedVersion: dossier.version }, crypto.randomUUID(), 'POST'); refresh(); });
    const value = valueText(dossier);
    return <Modal title={dossier.intitule} subtitle={dossier.numero + ' · ' + natureLabel(dossier.nature)} onClose={onClose} wide>
        <div className="entry-head"><Badge value={'L_' + dossier.nature} label={natureLabel(dossier.nature)} /><StageBadge stage={dossier.etape} late={dossier.enRetard} />
            {dossier.prolongations > 0 && <Badge value="L_AUCUNE" label={dossier.prolongations === 1 ? 'Prolongé une fois' : 'Prolongé ' + dossier.prolongations + ' fois'} />}</div>
        <p className="placement-summary modal-summary">{STAGE_NEXT_STEPS[dossier.etape]}{late && ' ' + late + '.'}</p>
        <ol className="order-timeline" aria-label="Déroulé du dossier">{timeline(dossier).map(s => <li key={s.key} className={s.state}><span aria-hidden="true" className="order-dot" />{s.label}<small>{s.state === 'done' ? 'Fait' : s.state === 'current' ? 'En cours' : s.state === 'cancelled' ? 'Sans suite' : 'À venir'}</small></li>)}</ol>
        <div className="asset-transitions"><div className="table-actions">
            {dossier.passages.map(option => {
                const blocked = option.bloquants.length > 0;
                const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
                return <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULE' || option.vers === 'REFUSE' ? 'secondary' : 'primary')} disabled={!option.peutAgir || blocked} title={why} onClick={() => setChosen(option)}>{transitionLabel(option.vers)}</button>;
            })}
            {dossier.peutPreparer && <button type="button" className="btn small primary" disabled={action.busy} onClick={prepare}>Demander les sorties ({dossier.sortiesADemander})</button>}
            {dossier.peutProlonger && <button type="button" className="btn small secondary" onClick={() => setDialog('prolong')}>Prolonger</button>}
            {dossier.peutModifier && <button type="button" className="btn small secondary" onClick={() => setDialog('edit')}>Modifier le dossier</button>}
            {pret && dossier.peutCompleter && <button type="button" className="btn small secondary" onClick={() => setDialog('terms')}>Convention, assurance, transport</button>}
            <button type="button" className="btn small secondary" onClick={() => printHtml(transportSheetHtml(dossier))}>{pret ? 'Imprimer la fiche de transport' : 'Imprimer la fiche de sortie'}</button>
        </div>
            {dossier.passages.filter(o => o.peutAgir && o.bloquants.length > 0 && (o.vers !== 'CLOS' || dossier.etape === 'EN_COURS' || dossier.etape === 'A_CLORE')).map(o => <ul key={o.vers} className="wf-blockers" aria-label={transitionLabel(o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}</div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {open && <div className="dossier-checklist">{dossier.preparation.length > 0
            ? <ul className="wf-blockers" aria-label={dossier.statut === 'ACCEPTE' ? 'Avant le départ' : 'À prévoir avant le départ'}>{dossier.preparation.map(g => <li key={g.code} className="warn"><span>{g.message}</span></li>)}</ul>
            : dossier.statut === 'ACCEPTE' ? <Notice>Tout est prêt pour le départ : la remise de chaque original peut avoir lieu une fois sa sortie autorisée.</Notice> : null}</div>}
        <div className="asset-tab">
            <dl className="asset-fields">
                <div className="wide"><dt>Objet</dt><dd className="conservation-text">{dossier.objet}</dd></div>
                <div><dt>{pret ? 'Emprunteur' : 'Commissaire'}</dt><dd>{(pret ? dossier.emprunteurNom : dossier.commissaire) ?? '—'}{pret && dossier.emprunteurContact && <small className="cell-sub">{dossier.emprunteurContact}</small>}</dd></div>
                <div><dt>Lieu</dt><dd>{dossier.lieuNom}{dossier.lieuAdresse && <small className="cell-sub">{dossier.lieuAdresse}</small>}</dd></div>
                <div><dt>{pret ? 'Période du prêt' : 'Exposition'}</dt><dd>{periodText(dossier)}</dd></div>
                <div><dt>Retour des originaux prévu le</dt><dd>{dayText(dossier.retourPrevu)}{late && <small className="cell-sub bad">{late}</small>}</dd></div>
                <div><dt>Monté</dt><dd>{dayText(dossier.creation.le)}{dossier.creation.par && <small className="cell-sub">par {dossier.creation.par}</small>}</dd></div>
                {dossier.decision && <div><dt>{dossier.statut === 'REFUSE' ? 'Refusé' : 'Décidé'}</dt><dd>{dayText(dossier.decision.le)}{dossier.decision.par && <small className="cell-sub">par {dossier.decision.par}</small>}</dd></div>}
                {dossier.decisionMotif && <div className="wide"><dt>Motif du refus</dt><dd>{dossier.decisionMotif}</dd></div>}
                {dossier.fermeture && <div><dt>{dossier.statut === 'CLOS' ? 'Clos' : 'Annulé'}</dt><dd>{dayText(dossier.fermeture.le)}{dossier.fermeture.par && <small className="cell-sub">par {dossier.fermeture.par}</small>}</dd></div>}
                {dossier.fermeMotif && <div className="wide"><dt>{dossier.statut === 'CLOS' ? 'Bilan' : 'Motif de l’annulation'}</dt><dd>{dossier.fermeMotif}</dd></div>}
            </dl>
            {pret && <section className="asset-group"><h4>Convention, assurance et transport</h4><dl className="asset-fields">
                <div><dt>Convention</dt><dd>{dossier.convention.reference ?? '—'}{dossier.convention.signeeLe && <small className="cell-sub">signée le {dayText(dossier.convention.signeeLe)}{dossier.convention.signataire && ' par ' + dossier.convention.signataire}</small>}</dd></div>
                <div><dt>Assurance</dt><dd>{dossier.assurance.exonerationMotif ? 'Sans police' : dossier.assurance.assureur ?? '—'}
                    <small className="cell-sub">{dossier.assurance.exonerationMotif ?? (dossier.assurance.police ? 'police ' + dossier.assurance.police + (dossier.assurance.du && dossier.assurance.au ? ', du ' + dayText(dossier.assurance.du) + ' au ' + dayText(dossier.assurance.au) : '') : 'non renseignée')}</small></dd></div>
                {value && <div><dt>Valeur assurée totale</dt><dd>{value}</dd></div>}
                <div><dt>Transport</dt><dd>{display(dossier.transport.mode)}<small className="cell-sub">{[dossier.transport.transporteur, dossier.transport.convoyeur && 'convoyeur ' + dossier.transport.convoyeur].filter(Boolean).join(' · ')}</small></dd></div>
                <div><dt>Aller / retour</dt><dd>{dayText(dossier.transport.allerLe)} / {dayText(dossier.transport.retourLe)}</dd></div>
                {dossier.transport.emballage && <div className="wide"><dt>Emballage</dt><dd>{dossier.transport.emballage}</dd></div>}
            </dl></section>}
            <section className="asset-group"><div className="section-heading"><h4>Originaux ({dossier.elements.length})</h4>{dossier.peutModifier && <button type="button" className="btn small secondary" onClick={() => setDialog('add')}>Ajouter un original</button>}</div>
                <ul className="dossier-elements" aria-label="Originaux du dossier">{dossier.elements.map(e => <ElementCard key={e.id} dossier={dossier} element={e} busy={action.busy} onOpenMovement={setMovementId} onEdit={setEditing} onReport={setReporting} onRemove={remove} />)}</ul></section>
            <section className="asset-group"><h4>Historique</h4>
                {journalQ.loading ? <Busy /> : journalQ.error ? <ErrorNotice error={journalQ.error} onRetry={journalQ.refresh} /> : <ol className="wf-history asset-journal">{[...(journalQ.data ?? [])].reverse().map(e => <li key={e.id}>
                    <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time><span>{journalSummary(e.genre, e.champ, e.ancienneValeur, e.nouvelleValeur)}</span>{e.motif && <p>Motif : {e.motif}</p>}</li>)}</ol>}</section>
        </div>
        {chosen && <TransitionDialog dossier={dossier} option={chosen} onClose={() => setChosen(null)} onDone={refresh} />}
        {dialog === 'edit' && <EditDialog dossier={dossier} onClose={() => setDialog(null)} onDone={refresh} />}
        {dialog === 'terms' && <TermsDialog dossier={dossier} onClose={() => setDialog(null)} onDone={refresh} />}
        {dialog === 'add' && <AddOriginalDialog dossier={dossier} onClose={() => setDialog(null)} onDone={refresh} />}
        {dialog === 'prolong' && <ProlongDialog dossier={dossier} onClose={() => setDialog(null)} onDone={refresh} />}
        {editing && <ElementDialog dossier={dossier} element={editing} onClose={() => setEditing(null)} onDone={refresh} />}
        {reporting && <DepartureReportDialog dossier={dossier} element={reporting} onClose={() => setReporting(null)} onDone={refresh} />}
        {movementId && <MovementDialog id={movementId} onClose={() => setMovementId(null)} onChanged={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- liste des dossiers (page Patrimoine)

const SUMMARY_CARDS: Array<[keyof DossierSummary, string, string, 'warn' | 'bad' | '']> = [
    ['aDecider', 'EN_INSTRUCTION', 'À décider', 'warn'], ['aPreparer', 'A_PREPARER', 'À préparer', 'warn'], ['enPreparation', 'EN_PREPARATION', 'En préparation', ''], ['enCours', 'EN_COURS', 'Originaux sortis', ''],
    ['enRetard', 'EN_RETARD', 'En retard', 'bad'], ['aClore', 'A_CLORE', 'À clore', 'warn']
];

function Row({ row, onOpen }: { row: DossierRow; onOpen: (id: string) => void }) {
    return <tr>
        <td className="nowrap"><button type="button" className="text-link" onClick={() => onOpen(row.id)}>{row.numero}</button><small className="cell-sub">{natureLabel(row.nature)}</small></td>
        <td>{row.intitule}<small className="cell-sub">{row.lieuNom}{row.emprunteurNom && ' · ' + row.emprunteurNom}</small></td>
        <td>{periodText(row)}</td>
        <td className="nowrap">{dayText(row.retourPrevu)}{row.enRetard && <small className="cell-sub bad">{lateText(row)}</small>}</td>
        <td>{row.originaux}</td>
        <td><StageBadge stage={row.etape} late={row.enRetard} /></td>
    </tr>;
}

export function DossiersPanel() {
    const { me, heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const [form, setForm] = useState({ statut: 'OUVERTS', nature: '', q: '', mine: false });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const [creating, setCreating] = useState<DossierNature | null>(null);
    const filters = { statut: applied.statut, nature: applied.nature, q: applied.q, mine: applied.mine ? 'true' : '' };
    const listQ = useResource<DossierPage>(s => heritage!.dossiers({ ...filters, page, size: 20 }, s), JSON.stringify(['heritage-dossiers', applied, page, revision, epoch]));
    const summaryQ = useResource<DossierSummary>(s => heritage!.dossiersSummary(s), JSON.stringify(['heritage-dossiers-summary', revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    const filtered = applied.statut !== 'OUVERTS' || applied.nature || applied.q || applied.mine;
    const canCreate = !!scope.institutionId && can(me, 'HERITAGE_LOAN_MANAGE', { institutionId: scope.institutionId, departmentId: scope.departmentId });
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Prêts sortants et expositions</h3>
                {canCreate && <div className="table-actions"><button type="button" className="btn small primary" onClick={() => setCreating('PRET')}>Monter un prêt</button><button type="button" className="btn small secondary" onClick={() => setCreating('EXPOSITION')}>Monter une exposition</button></div>}</div>
            <p className="wf-note">Un prêt ou une exposition réunit les originaux qui sortent, la convention, l’assurance, le transport et les constats d’état. Le dossier est accepté par une autre personne que celle qui l’a monté ; chaque original ne part qu’avec ses conditions réunies et ne rentre qu’avec un constat d’état.</p>
            {summaryQ.data && <ul className="dossier-summary" aria-label="À faire">{SUMMARY_CARDS.map(([key, filter, label, tone]) => <li key={key}>
                <button type="button" className={summaryQ.data![key] > 0 ? tone : ''} aria-pressed={applied.statut === filter} onClick={() => apply({ ...form, statut: filter })}><strong>{summaryQ.data![key]}</strong><span>{label}</span></button></li>)}
                <li><span className="wf-note">{summaryQ.data.retoursSous30Jours} retour{summaryQ.data.retoursSous30Jours > 1 ? 's' : ''} attendu{summaryQ.data.retoursSous30Jours > 1 ? 's' : ''} sous 30 jours</span></li></ul>}
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un dossier">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, intitulé, lieu, cote ou bien" /></Field>
                <Field label="Nature"><select value={form.nature} onChange={e => apply({ ...form, nature: e.target.value })}><option value="">Toutes</option>{(Object.keys(NATURE_LABELS) as DossierNature[]).map(n => <option key={n} value={n}>{NATURE_LABELS[n]}</option>)}</select></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{STAGE_FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <label className="field asset-flag"><input type="checkbox" checked={form.mine} onChange={e => apply({ ...form, mine: e.target.checked })} /><span>Mes dossiers</span></label>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} dossier{listQ.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Dossier</th><th>Intitulé</th><th>Période</th><th>Retour prévu</th><th>Originaux</th><th>Étape</th></tr></thead>
                    <tbody>{items.map(r => <Row key={r.id} row={r} onOpen={setOpened} />)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun dossier" description={filtered ? 'Aucun dossier ne correspond à ces critères.' : 'Aucun prêt ni aucune exposition n’est ouvert dans votre périmètre.' + (canCreate ? ' Montez-en un avec les boutons ci-dessus.' : '')} />}
        </div>
        {creating && scope.institutionId && <CreateDialog nature={creating} institutionId={scope.institutionId} initial={[]} onClose={() => setCreating(null)} onDone={id => { setRevision(r => r + 1); setOpened(id); }} />}
        {opened && <DossierDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}

// ---------- onglet « Prêts et expositions » d'un bien

export function DossiersTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const [creating, setCreating] = useState<DossierNature | null>(null);
    const q = useResource<DossierRow[]>(s => heritage!.assetDossiers(asset.id, s), 'asset-dossiers:' + asset.id + ':' + asset.version + ':' + revision + ':' + epoch);
    const last = useRef<DossierRow[] | null>(null);
    if (q.data) last.current = q.data;
    const rows = q.data ?? last.current;
    const canCreate = can(me, 'HERITAGE_LOAN_MANAGE', { institutionId: asset.institutionId, departmentId: asset.departementId });
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    if (!rows && q.loading) return <Busy />;
    if (!rows) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const initial: PickedOriginal[] = asset.originaux.map(o => ({ bienId: asset.id, bienIdentifiant: asset.identifiant, bienIntitule: String(asset.champs.intitule ?? asset.identifiant), archiveId: o.archivePhysiqueId, cote: o.cote }));
    const openRows = rows.filter(r => isOpen(r.statut)); const closedRows = rows.filter(r => !isOpen(r.statut));
    const list = (items: DossierRow[]) => <ul className="asset-links">{items.map(r => <li key={r.id}>
        <span><strong>{r.numero}</strong> — {r.intitule} <StageBadge stage={r.etape} late={r.enRetard} /><small> · {natureLabel(r.nature)}, {periodText(r)}</small></span>
        <button type="button" className="btn small secondary" onClick={() => setOpened(r.id)}>Ouvrir</button></li>)}</ul>;
    return <div className="asset-tab">
        <Notice>Un bien part en prêt ou en exposition par un dossier : la convention, l’assurance et les constats d’état de départ et de retour y sont contrôlés, et chaque original sort par une demande de mouvement autorisée par une autre personne.</Notice>
        {canCreate && asset.originaux.length > 0 && <div className="table-actions"><button type="button" className="btn small primary" onClick={() => setCreating('PRET')}>Monter un prêt avec ce bien</button><button type="button" className="btn small secondary" onClick={() => setCreating('EXPOSITION')}>Monter une exposition avec ce bien</button></div>}
        {rows.length === 0 ? <Empty title="Aucun prêt ni exposition" description="Ce bien ne figure à aucun dossier de prêt sortant ou d’exposition." /> : <>
            {openRows.length > 0 && <section className="asset-group"><h4>Dossiers ouverts</h4>{list(openRows)}</section>}
            {closedRows.length > 0 && <section className="asset-group"><h4>Dossiers clos</h4>{list(closedRows)}</section>}</>}
        {creating && <CreateDialog nature={creating} institutionId={asset.institutionId} initial={initial} onClose={() => setCreating(null)} onDone={id => { changed(); setOpened(id); }} />}
        {opened && <DossierDialog id={opened} onClose={() => setOpened(null)} onChanged={changed} />}
    </div>;
}
