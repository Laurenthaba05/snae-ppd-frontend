import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import { navigate } from './navigation';
import {
    ACTION_LABELS, NATURE_HINTS, NATURE_LABELS, RULE_TEXTS, STATUS_LABELS, approvalProblems, examinationProblems, executionProblems, natureLabel, proposableNatures, proposalProblems, statusLabel,
    valueText, waitingFor, type AssetExits, type Exit, type ExitNature, type ExitPage, type ExitStatus, type ExitSummary, type ProposalInput
} from '../core/deaccessions';
import type { HeritageAsset, HeritageReference } from '../core/types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Une règle connue du serveur se dit en toutes lettres ; le reste reste l'erreur d'origine. */
function ruleError(error: unknown): unknown {
    if (error instanceof ApiError && error.code && RULE_TEXTS[error.code]) return new Error(RULE_TEXTS[error.code]);
    return error;
}

function StatusBadge({ status }: { status: ExitStatus }) {
    return <Badge value={'L_' + status} label={statusLabel(status)} />;
}

// ------------------------------------------------------------------------------------------------ la fiche d'un bien
/** L'onglet « Sortie de collection » d'un bien : ses dossiers de sortie, et ce qui empêcherait aujourd'hui d'en proposer un. */
export function DeaccessionTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [proposing, setProposing] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const q = useResource<AssetExits>(s => heritage!.assetDeaccessions(asset.id, s), `asset-exits:${asset.id}:${revision}:${asset.version}:${epoch}`);
    const data = q.data;
    const reload = () => { setRevision(n => n + 1); onChanged(); };
    return <div className="asset-tab">
        {asset.statutPriseEnCharge === 'SORTI' && <Notice tone="warning">Ce bien est sorti de la collection. Sa fiche et ses originaux ne se modifient plus ; son historique est conservé.</Notice>}
        {q.loading && !data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : data && <>
            {data.peutProposer && <div className="toolbar-right"><button type="button" className="btn small primary" onClick={() => setProposing(true)}>Proposer la sortie du bien</button></div>}
            {!data.peutProposer && !data.ouverte && asset.statutPriseEnCharge !== 'SORTI' && proposableNatures(data.obstacles).length === 0 && <Notice>
                <strong>Aucune sortie ne peut être proposée pour ce bien aujourd’hui.</strong>
                <ul>{Array.from(new Set(Object.values(data.obstacles).flat().map(o => o.message))).map(m => <li key={m}>{m}</li>)}</ul></Notice>}
            {data.items.length === 0 ? <Empty title="Aucune sortie" description="Ce bien n’a fait l’objet d’aucun dossier de sortie." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Dossier</th><th>Nature</th><th>État</th><th>Proposé le</th><th /></tr></thead>
                    <tbody>{data.items.map(e => <tr key={e.id}>
                        <td><strong>{e.numero}</strong><small className="cell-sub">{e.motifLabel}</small></td>
                        <td>{natureLabel(e.nature)}{e.destinataire && <small className="cell-sub">{e.destinataire}</small>}</td>
                        <td><StatusBadge status={e.statut} /></td>
                        <td>{formatDate(e.proposeLe)}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenId(e.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
            {proposing && <ProposeDialog asset={asset} exits={data} onClose={() => setProposing(false)} onDone={id => { setProposing(false); reload(); setOpenId(id); }} />}
        </>}
        {openId && <DeaccessionDialog id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>;
}

function ProposeDialog({ asset, exits, onClose, onDone }: { asset: HeritageAsset; exits: AssetExits; onClose: () => void; onDone: (id: string) => void }) {
    const { heritage, epoch } = useSession();
    const natures = proposableNatures(exits.obstacles);
    const [form, setForm] = useState<ProposalInput>({ nature: natures[0] ?? '', motif: '', justification: '', destinataire: '', valeurVenale: '', devise: '', valeurSource: '' });
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const motifs = useResource<HeritageReference[]>(s => heritage!.references('MOTIF_SORTIE', s), `exit-motifs:${epoch}`);
    const problems = proposalProblems(form);
    const set = (patch: Partial<ProposalInput>) => setForm(f => ({ ...f, ...patch }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const value = form.valeurVenale.trim() === '' ? null : Number(form.valeurVenale.trim().replace(',', '.'));
        const body = { bienId: asset.id, nature: form.nature, motif: form.motif, justification: form.justification.trim(),
            destinataire: form.nature === 'DISPARITION' ? null : form.destinataire.trim(), valeurVenale: value, devise: value === null ? null : form.devise.trim().toUpperCase(),
            valeurSource: value === null ? null : form.valeurSource.trim() };
        const created = await action.run(body, key => heritage!.proposeDeaccession(body, key));
        if (created) onDone(created.id);
    };
    return <Modal title="Proposer la sortie du bien" subtitle={`${asset.identifiant} — ${asset.champs.intitule}`} onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <Notice>La sortie est une décision grave : elle est examinée et décidée par d’autres personnes que vous, puis exécutée par une personne autre que celle qui décide. Rien n’est supprimé.</Notice>
            <div className="form-grid">
                <Field label="Nature *" wide hint={form.nature ? NATURE_HINTS[form.nature] : undefined}>
                    <select value={form.nature} onChange={e => set({ nature: e.target.value as ExitNature | '' })} disabled={action.busy}>
                        <option value="">Choisir…</option>{natures.map(n => <option key={n} value={n}>{NATURE_LABELS[n]}</option>)}</select></Field>
                <Field label="Motif *" wide hint="Les motifs sont ceux du référentiel de l’institution.">
                    <select value={form.motif} onChange={e => set({ motif: e.target.value })} disabled={action.busy || motifs.loading}>
                        <option value="">Choisir…</option>{(motifs.data ?? []).filter(m => m.actif).map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}</select></Field>
                {form.nature !== 'DISPARITION' && <Field label="Destinataire *" wide hint="Le propriétaire ou déposant, ou le nouveau détenteur."><input value={form.destinataire}
                    onChange={e => set({ destinataire: e.target.value })} maxLength={255} disabled={action.busy} /></Field>}
                <Field label="Justification *" wide hint="Pourquoi le bien sort de la collection (30 caractères au moins)."><textarea value={form.justification}
                    onChange={e => set({ justification: e.target.value })} rows={4} maxLength={10000} disabled={action.busy} /></Field>
                <Field label="Valeur vénale" hint="Facultative : elle n’existe que sur ce dossier."><input inputMode="decimal" value={form.valeurVenale}
                    onChange={e => set({ valeurVenale: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Devise" hint="Code à trois lettres."><input value={form.devise} onChange={e => set({ devise: e.target.value })} maxLength={3} disabled={action.busy} /></Field>
                {(form.valeurVenale.trim() !== '' || form.devise.trim() !== '') && <Field label="Comment la valeur a été établie *" wide><input value={form.valeurSource}
                    onChange={e => set({ valeurSource: e.target.value })} maxLength={2000} disabled={action.busy} /></Field>}
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Proposer la sortie</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ un dossier
type Panel = null | 'examine' | 'approve' | 'refuse' | 'execute' | 'cancel';

export function DeaccessionDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [panel, setPanel] = useState<Panel>(null);
    const q = useResource<Exit>(s => heritage!.deaccession(id, s), `deaccession:${id}:${revision}:${epoch}`);
    const last = useRef<Exit | null>(null);
    if (q.data) last.current = q.data;
    const e = q.data ?? last.current;
    const refresh = () => { setRevision(n => n + 1); onChanged(); };
    if (!e) return <Modal title="Sortie de collection" onClose={onClose} wide>{q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <Busy />}</Modal>;
    const allowed = (a: string) => (e.actions as string[]).includes(a);
    const value = valueText(e.valeurVenale, e.devise);
    return <Modal title={`${e.numero} — ${e.bienIdentifiant}`} subtitle={`${e.bienIntitule} · ${statusLabel(e.statut)}`} onClose={onClose} wide>
        <p><small>{waitingFor(e.statut)}</small></p>
        <dl className="preservation-summary">
            <div><dt>Nature et motif</dt><dd>{natureLabel(e.nature)} — {e.motifLabel}</dd></div>
            {e.destinataire && <div><dt>Destinataire</dt><dd>{e.destinataire}</dd></div>}
            <div><dt>Justification</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{e.justification}</dd></div>
            {value && <div><dt>Valeur vénale</dt><dd>{value}{e.valeurSource ? ` — ${e.valeurSource}` : ''}</dd></div>}
            <div><dt>Proposée</dt><dd>{e.proposeParNom ?? '—'} · {formatDate(e.proposeLe)}</dd></div>
            {e.examineLe && <div><dt>Examen</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{e.examen} — {e.examineParNom ?? '—'}, le {formatDate(e.examineLe)}</dd></div>}
            {e.decideLe && e.statut !== 'REFUSEE' && <div><dt>Décision</dt><dd>Acte « {e.decisionReference} » du {formatDate(e.decisionDate)} — {e.decideParNom ?? '—'}, le {formatDate(e.decideLe)}</dd></div>}
            {e.statut === 'REFUSEE' && <div><dt>Refus</dt><dd>{e.decisionMotif} — {e.decideParNom ?? '—'}, le {formatDate(e.decideLe)}</dd></div>}
            {e.executeLe && <div><dt>Exécution</dt><dd>Sortie du {formatDate(e.dateSortie)}, acte « {e.acteReference} » — {e.executeParNom ?? '—'}{e.observations ? ` · ${e.observations}` : ''}</dd></div>}
            {e.annuleLe && <div><dt>Annulation</dt><dd>{e.annulationMotif} — {e.annuleParNom ?? '—'}, le {formatDate(e.annuleLe)}</dd></div>}
        </dl>
        {e.originaux.length > 0 && <><h4>Originaux concernés</h4><ul>{e.originaux.map(o => <li key={o.archiveId}>{o.reference}{o.label ? ` — ${o.label}` : ''}</li>)}</ul></>}
        {e.obstacles.length > 0 && <Notice tone="warning"><strong>Ce qui retient la sortie :</strong><ul>{e.obstacles.map(o => <li key={o.code}>{o.message}</li>)}</ul></Notice>}
        <footer className="modal-footer">
            {allowed('EXAMINE') && <button type="button" className="btn primary" onClick={() => setPanel('examine')}>{ACTION_LABELS.EXAMINE}</button>}
            {allowed('APPROVE') && <button type="button" className="btn primary" onClick={() => setPanel('approve')}>{ACTION_LABELS.APPROVE}</button>}
            {allowed('REFUSE') && <button type="button" className="btn secondary" onClick={() => setPanel('refuse')}>{ACTION_LABELS.REFUSE}</button>}
            {allowed('EXECUTE') && <button type="button" className="btn danger" onClick={() => setPanel('execute')}>{ACTION_LABELS.EXECUTE}</button>}
            {allowed('CANCEL') && <button type="button" className="btn secondary" onClick={() => setPanel('cancel')}>{ACTION_LABELS.CANCEL}</button>}
            <button type="button" className="btn secondary" onClick={() => navigate(`/app/patrimoine?bien=${e.bienId}`)}>Ouvrir la fiche du bien</button>
            <button type="button" className="btn secondary" onClick={onClose}>Fermer</button>
        </footer>
        {panel === 'examine' && <ExamineDialog exit={e} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'approve' && <ApproveDialog exit={e} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'execute' && <ExecuteDialog exit={e} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'refuse' && <ReasonPrompt title="Refuser la sortie" subtitle="Le bien reste dans la collection" hint="Pourquoi la sortie est refusée (10 caractères au moins)." confirm="Refuser la sortie"
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await heritage!.decideDeaccession(e.id, { version: e.version, approuve: false, reference: null, date: null, motif: reason }, key); refresh(); }} />}
        {panel === 'cancel' && <ReasonPrompt title="Annuler le dossier de sortie" subtitle="Le bien reste dans la collection ; un autre dossier pourra être ouvert" hint="Pourquoi (10 caractères au moins)." confirm="Annuler le dossier"
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await heritage!.cancelDeaccession(e.id, { version: e.version, motif: reason }, key); refresh(); }} />}
    </Modal>;
}

function ExamineDialog({ exit: e, onClose, onDone }: { exit: Exit; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [text, setText] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = examinationProblems(text);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { version: e.version, examen: text.trim() };
        if (await action.run({ examine: e.id, ...body }, key => heritage!.examineDeaccession(e.id, body, key))) onDone();
    };
    return <Modal title="Examiner la sortie" subtitle="Vérification juridique et de provenance" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Field label="Examen *" wide hint="Titre de propriété, clauses de dépôt ou de donation, accords, restrictions : ce qui a été vérifié et ce que l’on en conclut (30 caractères au moins).">
                <textarea value={text} onChange={ev => setText(ev.target.value)} rows={6} maxLength={10000} disabled={action.busy} /></Field>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer l’examen</button></footer>
        </form>
    </Modal>;
}

function ApproveDialog({ exit: e, onClose, onDone }: { exit: Exit; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(todayIso());
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = approvalProblems({ reference, date }, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { version: e.version, approuve: true, reference: reference.trim(), date, motif: null };
        if (await action.run({ approve: e.id, ...body }, key => heritage!.decideDeaccession(e.id, body, key))) onDone();
    };
    return <Modal title="Approuver la sortie" subtitle="La décision se fonde sur un acte : citez-le" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Référence de l’acte *" wide hint="Décision, arrêté, délibération… qui fonde la sortie."><input value={reference} onChange={ev => setReference(ev.target.value)} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Date de l’acte *"><input type="date" value={date} max={todayIso()} onChange={ev => setDate(ev.target.value)} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Approuver</button></footer>
        </form>
    </Modal>;
}

function ExecuteDialog({ exit: e, onClose, onDone }: { exit: Exit; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [dateSortie, setDateSortie] = useState(todayIso());
    const [acte, setActe] = useState('');
    const [remarks, setRemarks] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = executionProblems({ dateSortie, acteReference: acte }, todayIso(), e.decisionDate);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { version: e.version, dateSortie, acteReference: acte.trim(), observations: remarks.trim() || null };
        if (await action.run({ execute: e.id, ...body }, key => heritage!.executeDeaccession(e.id, body, key))) onDone();
    };
    return <Modal title="Exécuter la sortie" subtitle="Le bien est marqué sorti : lui et ses originaux ne se modifient plus et ne bougent plus" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">N’exécutez la sortie qu’une fois le bien réellement remis (ou la disparition constatée). L’opération est définitive : elle ne s’annule pas.</Notice>
            <div className="form-grid">
                <Field label="Date de la sortie *"><input type="date" value={dateSortie} min={e.decisionDate ?? undefined} max={todayIso()} onChange={ev => setDateSortie(ev.target.value)} disabled={action.busy} /></Field>
                <Field label="Référence de l’acte de sortie *" wide hint="Procès-verbal de remise, acte de cession, déclaration de perte ou de vol…"><input value={acte}
                    onChange={ev => setActe(ev.target.value)} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Observations" wide><textarea value={remarks} onChange={ev => setRemarks(ev.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn danger" disabled={action.busy}>Exécuter la sortie</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ la page
/** Les sorties de collection visibles pour la personne connectée : ce qui attend un examen, une décision ou une exécution en tête. */
export function DeaccessionsPanel() {
    const { me, heritage, epoch } = useSession();
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);
    const q = useResource<ExitPage>(s => heritage!.deaccessions({ status: status || undefined, page }, s), `deaccessions:${status}:${page}:${revision}:${epoch}`);
    const items: ExitSummary[] = q.data?.items ?? [];
    const canAct = can(me, 'HERITAGE_DEACCESSION_PROPOSE', {}) || can(me, 'HERITAGE_DEACCESSION_DECIDE', {});
    return <section className="panel" aria-label="Sorties de collection">
        <div className="section-heading"><h3>Sorties de collection</h3></div>
        <div className="panel-padding"><p><small>La sortie définitive d’un bien se <strong>propose</strong> depuis sa fiche, puis elle est <strong>examinée</strong>, <strong>décidée</strong> et <strong>exécutée</strong> par des personnes distinctes.
            {canAct ? '' : ' Votre rôle ne comporte pas d’habilitation de sortie : vous consultez les dossiers.'}</small></p>
            <Field label="État"><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
                <option value="">Tous</option>{(Object.keys(STATUS_LABELS) as ExitStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></Field></div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucun dossier de sortie" description="Aucune sortie de collection n’est ouverte dans votre périmètre." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Dossier</th><th>Bien</th><th>Nature</th><th>État</th><th>Proposé le</th><th /></tr></thead>
                    <tbody>{items.map(e => <tr key={e.id}>
                        <td><strong>{e.numero}</strong><small className="cell-sub">{e.motifLabel}</small></td>
                        <td>{e.bienIdentifiant}<small className="cell-sub">{e.bienIntitule}</small></td>
                        <td>{natureLabel(e.nature)}</td>
                        <td><StatusBadge status={e.statut} /></td>
                        <td>{formatDate(e.proposeLe)}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenId(e.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {q.data && (page > 0 || q.data.hasMore) && <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={items.length} />}
        {openId && <DeaccessionDialog id={openId} onClose={() => setOpenId(null)} onChanged={() => setRevision(n => n + 1)} />}
    </section>;
}
