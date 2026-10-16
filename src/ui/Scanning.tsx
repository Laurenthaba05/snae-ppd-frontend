import { LotAdvanceDialog } from './LotAdvanceDialog';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { canAdvance, isCaptureStage, stageName } from '../core/workflow';
import { IntentKey, uuid } from '../core/validation';
import { readImageInfo, type ImageInfo } from '../core/scanImage';
import { formatRanges, planPages, remainingGaps, type PlanRow } from '../core/pageNumbering';
import type { ColorMode, DigitizationElement, DocumentVersion, LotSummary, PageCheck, ScanLot, ScanPage, Scanner, ScannerStatus, ScannerType } from '../core/types';
import { Badge, Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { Icon } from './icons';
import { importPageRows, type ImportOutcome } from './pageImportRunner';
import { BatchImportDialog, SheetsButton, elementSheet, lotSheet } from './ScanCodes';
import { elementName } from '../core/format';

export const SCANNER_TYPES: Record<ScannerType, string> = { A_PLAT: 'À plat', ALIMENTATEUR: 'Chargeur automatique (ADF)', PLANETAIRE: 'Planétaire (livres reliés)', FILM: 'Film / diapositives', AUTRE: 'Autre' };
export const COLOR_MODES: Record<ColorMode, string> = { NOIR_BLANC: 'Noir et blanc', GRIS: 'Niveaux de gris', COULEUR: 'Couleur' };
const RESOLUTIONS = [150, 200, 300, 400, 600, 1200];
const MAX_FILES = 500;
/** Taille maximale d'une page (alignée sur snae.storage.max-bytes, 64 Mio par défaut). */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const num = (value: string) => value.trim() === '' ? null : Number(value);

/* ---------- Scanners ---------- */
export function ScannerDialog({ scanner, onClose, onSaved }: { scanner?: Scanner; onClose: () => void; onSaved: () => void }) {
    const { digitization } = useSession();
    const [f, setF] = useState({ code: scanner?.code ?? '', nom: scanner?.nom ?? '', fabricant: scanner?.fabricant ?? '', modele: scanner?.modele ?? '', numeroSerie: scanner?.numeroSerie ?? '', typeScanner: (scanner?.typeScanner ?? 'ALIMENTATEUR') as ScannerType, rectoVerso: scanner?.rectoVerso ?? false, resolutionMaxDpi: scanner?.resolutionMaxDpi?.toString() ?? '', localisation: scanner?.localisation ?? '' });
    const key = useRef(new IntentKey());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const set = <K extends keyof typeof f>(name: K, value: (typeof f)[K]) => setF(old => ({ ...old, [name]: value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true); setError(null);
        try {
            const common = { nom: f.nom.trim(), fabricant: f.fabricant.trim() || null, modele: f.modele.trim() || null, numeroSerie: f.numeroSerie.trim() || null, typeScanner: f.typeScanner, rectoVerso: f.rectoVerso, resolutionMaxDpi: num(f.resolutionMaxDpi), localisation: f.localisation.trim() || null };
            const path = scanner ? '/scanners/' + scanner.id : '/scanners';
            const method = scanner ? 'PUT' : 'POST';
            const body = scanner ? { ...common, expectedVersion: scanner.versionLock } : { ...common, code: f.code.trim() };
            await digitization!.command(path, body, key.current.forRequest(method, path, body), method);
            onSaved(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={scanner ? 'Modifier le scanner' : 'Ajouter un scanner'} subtitle="Inventaire du matériel de numérisation. Les réglages utilisés sont portés par chaque lot." onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}><div className="form-grid">
            {!scanner && <Field label="Code *" hint="Ex. SCAN-01 (lettres, chiffres, _ . -)"><input value={f.code} onChange={e => set('code', e.target.value)} required maxLength={60} disabled={busy} /></Field>}
            <Field label="Désignation *" wide={!!scanner}><input value={f.nom} onChange={e => set('nom', e.target.value)} required maxLength={255} disabled={busy} /></Field>
            <Field label="Fabricant"><input value={f.fabricant} onChange={e => set('fabricant', e.target.value)} maxLength={120} disabled={busy} /></Field>
            <Field label="Modèle"><input value={f.modele} onChange={e => set('modele', e.target.value)} maxLength={120} disabled={busy} /></Field>
            <Field label="Numéro de série"><input value={f.numeroSerie} onChange={e => set('numeroSerie', e.target.value)} maxLength={120} disabled={busy} /></Field>
            <Field label="Type *"><select value={f.typeScanner} onChange={e => set('typeScanner', e.target.value as ScannerType)} disabled={busy}>{Object.entries(SCANNER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Recto-verso"><select value={f.rectoVerso ? 'oui' : 'non'} onChange={e => set('rectoVerso', e.target.value === 'oui')} disabled={busy}><option value="non">Non (recto seul)</option><option value="oui">Oui (deux faces en un passage)</option></select></Field>
            <Field label="Résolution maximale (dpi)" hint="Facultatif"><input type="number" min={50} max={9600} value={f.resolutionMaxDpi} onChange={e => set('resolutionMaxDpi', e.target.value)} disabled={busy} /></Field>
            <Field label="Emplacement" hint="Atelier, salle…"><input value={f.localisation} onChange={e => set('localisation', e.target.value)} maxLength={255} disabled={busy} /></Field>
        </div>{error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{scanner ? 'Enregistrer' : 'Ajouter'}</button></footer></form>
    </Modal>;
}

export function scannerSettings(lot: Pick<ScanLot, 'resolutionDpi' | 'modeCouleur' | 'rectoVerso'>) {
    return [lot.resolutionDpi ? lot.resolutionDpi + ' dpi' : 'résolution non précisée', COLOR_MODES[lot.modeCouleur], lot.rectoVerso ? 'recto-verso' : 'recto seul'].join(' · ');
}

/* ---------- Lots ---------- */
export function LotDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
    const { digitization, epoch } = useSession();
    const scannersQ = useResource<Scanner[]>(s => digitization!.scanners(s), 'scanners:' + epoch);
    const active = (scannersQ.data ?? []).filter(s => s.statut === 'ACTIF');
    const [f, setF] = useState({ code: '', nom: '', scannerId: '', resolutionDpi: '300', resolutionMinDpi: '300', modeCouleur: 'COULEUR' as ColorMode, rectoVerso: false, commentaire: '' });
    const key = useRef(new IntentKey());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const scanner = active.find(s => s.id === f.scannerId);
    const set = <K extends keyof typeof f>(name: K, value: (typeof f)[K]) => setF(old => ({ ...old, [name]: value }));
    const dpi = num(f.resolutionDpi), min = num(f.resolutionMinDpi);
    const problem = dpi !== null && min !== null && dpi < min ? `La résolution de numérisation (${dpi} dpi) est inférieure au minimum exigé (${min} dpi).`
        : scanner && f.rectoVerso && !scanner.rectoVerso ? 'Ce scanner ne gère pas le recto-verso.'
        : scanner && dpi !== null && scanner.resolutionMaxDpi !== null && dpi > scanner.resolutionMaxDpi ? `Ce scanner ne dépasse pas ${scanner.resolutionMaxDpi} dpi.` : null;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problem) return;
        setBusy(true); setError(null);
        try {
            const body = { projetNumerisationId: projectId, code: f.code.trim(), nom: f.nom.trim() || null, scannerId: f.scannerId || null, resolutionDpi: dpi, resolutionMinDpi: min ?? 300, modeCouleur: f.modeCouleur, rectoVerso: f.rectoVerso, commentaire: f.commentaire.trim() || null };
            await digitization!.command('/lots', body, key.current.forRequest('POST', '/lots', body), 'POST');
            onCreated(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Créer un lot de numérisation" subtitle="Un lot regroupe des éléments scannés ensemble avec les mêmes réglages." onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Code du lot *" hint="Ex. LOT-2026-001"><input value={f.code} onChange={e => set('code', e.target.value)} required maxLength={100} disabled={busy} /></Field>
            <Field label="Nom"><input value={f.nom} onChange={e => set('nom', e.target.value)} maxLength={255} disabled={busy} /></Field>
            <Field label="Scanner" hint={scannersQ.loading ? 'Chargement…' : active.length ? 'Seuls les scanners en service sont proposés' : 'Aucun scanner en service : ajoutez-en depuis « Scanners »'}>
                <select value={f.scannerId} onChange={e => set('scannerId', e.target.value)} disabled={busy}><option value="">Non précisé</option>{active.map(s => <option key={s.id} value={s.id}>{s.code} · {s.nom}</option>)}</select></Field>
            <Field label="Mode couleur"><select value={f.modeCouleur} onChange={e => set('modeCouleur', e.target.value as ColorMode)} disabled={busy}>{Object.entries(COLOR_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Résolution de numérisation (dpi)"><input type="number" list="scan-resolutions" min={50} max={9600} value={f.resolutionDpi} onChange={e => set('resolutionDpi', e.target.value)} disabled={busy} /></Field>
            <Field label="Résolution minimale exigée (dpi) *" hint="Les pages en dessous sont signalées"><input type="number" list="scan-resolutions" min={50} max={9600} value={f.resolutionMinDpi} onChange={e => set('resolutionMinDpi', e.target.value)} required disabled={busy} /></Field>
            <datalist id="scan-resolutions">{RESOLUTIONS.map(r => <option key={r} value={r} />)}</datalist>
            <Field label="Faces"><select value={f.rectoVerso ? 'oui' : 'non'} onChange={e => set('rectoVerso', e.target.value === 'oui')} disabled={busy}><option value="non">Recto seul</option><option value="oui">Recto-verso</option></select></Field>
            <Field label="Commentaire" wide><textarea value={f.commentaire} onChange={e => set('commentaire', e.target.value)} maxLength={5000} disabled={busy} /></Field>
        </div>
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !!problem}>Créer le lot</button></footer></form>
    </Modal>;
}

function CloseLotDialog({ lot, onClose, onClosed }: { lot: ScanLot; onClose: () => void; onClosed: () => void }) {
    const { digitization } = useSession();
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setBusy(true); setError(null);
        try { await digitization!.command(`/lots/${lot.id}/close`, { motif: motif.trim() || null }, crypto.randomUUID(), 'POST'); onClosed(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={'Clore le lot ' + lot.code} subtitle="Un lot clos est figé : il n’accepte plus d’éléments ni de nouveaux réglages." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid"><Field label="Commentaire de clôture" hint="Facultatif" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} maxLength={2000} disabled={busy} /></Field></div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Clore le lot</button></footer></form>
    </Modal>;
}

function LotSummaryTable({ lotId }: { lotId: string }) {
    const { digitization, epoch } = useSession();
    const q = useResource<LotSummary>(s => digitization!.lotSummary(lotId, s), 'lot-summary:' + lotId + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error || !q.data) return <ErrorNotice error={q.error ?? new Error('Synthèse indisponible.')} onRetry={q.refresh} />;
    const s = q.data;
    return <div className="scan-summary">
        <ul className="scan-chips">
            <li>{s.elementsTermines} / {s.elements} élément(s) terminé(s)</li>
            <li>{s.pagesPresentes} page(s) numérisée(s){s.pagesAttendues ? ' sur ' + s.pagesAttendues + ' attendues' : ''}</li>
            <li className={s.pagesManquantes ? 'bad' : 'ok'}>{s.pagesManquantes} manquante(s)</li>
            <li className={s.pagesARescanner ? 'warn' : 'ok'}>{s.pagesARescanner} à rescanner</li>
            <li className={s.pagesResolutionInsuffisante ? 'warn' : 'ok'}>{s.pagesResolutionInsuffisante} sous la résolution minimale</li>
        </ul>
        {s.items.length ? <div className="table-scroll"><table><thead><tr><th>Élément</th><th>Statut</th><th>Pages</th><th>Manquantes</th><th>À rescanner</th><th>Résolution</th><th>Contrôle</th></tr></thead>
            <tbody>{s.items.map(i => <tr key={i.elementId}><td>{elementName(i.description)}</td><td><Badge value={i.statut} label={stageName(i.statut)} /></td><td>{i.presentes}{i.attendues ? ' / ' + i.attendues : ''}</td><td>{i.manquantes || '—'}</td><td>{i.aRescanner || '—'}</td><td>{i.resolutionInsuffisante || '—'}</td>
                <td>{i.complet ? <span className="scan-ok"><Icon name="check" size={14} />Complet</span> : <span className="scan-bad"><Icon name="alert" size={14} />À revoir</span>}</td></tr>)}</tbody></table></div> : <p className="page-note">Aucun élément n’est rattaché à ce lot.</p>}
    </div>;
}

export function LotsPanel({ projectId, canManage, focusLotId, projectName }: { projectId: string; canManage: boolean; focusLotId?: string | null; projectName?: string }) {
    const { me, digitization, epoch } = useSession();
    const q = useResource<ScanLot[]>(s => digitization!.lotsByProject(projectId, s), 'lots:' + projectId + ':' + epoch);
    const scannersQ = useResource<Scanner[]>(s => digitization!.scanners(s), 'lots-scanners:' + epoch);
    const names = Object.fromEntries((scannersQ.data ?? []).map(s => [s.id, s.code + ' · ' + s.nom]));
    const [creating, setCreating] = useState(false);
    const [advancing, setAdvancing] = useState<ScanLot | null>(null);
    const [closing, setClosing] = useState<ScanLot | null>(null);
    const [open, setOpen] = useState<string | null>(focusLotId ?? null);
    const [importLot, setImportLot] = useState<ScanLot | null>(null);
    const [bump, setBump] = useState(0);
    useEffect(() => { if (focusLotId) setOpen(focusLotId); }, [focusLotId]);
    const lots = q.data ?? [];
    const lotSheets = async (lot: ScanLot) => {
        const context = [...(projectName ? [projectName] : []), 'Lot ' + lot.code + ' · ' + scannerSettings(lot)];
        const summary = await digitization!.lotSummary(lot.id);
        return [lotSheet(lot, context), ...summary.items.filter(i => isCaptureStage(i.statut)).map(i => elementSheet({ id: i.elementId, descriptionSource: i.description, pagesAttendues: i.attendues, rectoVerso: lot.rectoVerso }, context))];
    };
    return <div className="panel">
        <div className="section-heading"><h3>Lots de numérisation</h3>{canManage && <button className="btn small primary" onClick={() => setCreating(true)}>Créer un lot</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : lots.length ? <div className="table-scroll"><table><thead><tr><th>Lot</th><th>Scanner</th><th>Réglages</th><th>Minimum</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{lots.flatMap(lot => [<tr key={lot.id}><td><strong>{lot.code}</strong>{lot.nom && <small className="cell-sub">{lot.nom}</small>}</td><td>{lot.scannerId ? names[lot.scannerId] ?? 'Scanner non disponible' : '—'}</td><td>{scannerSettings(lot)}</td><td>{lot.resolutionMinDpi} dpi</td><td><Badge value={lot.statut} /></td>
                <td className="table-actions"><button className="btn small secondary" aria-expanded={open === lot.id} onClick={() => setOpen(open === lot.id ? null : lot.id)}>{open === lot.id ? 'Masquer le suivi' : 'Suivi des pages'}</button>{lot.statut === 'OUVERT' && <SheetsButton label="Feuilles" title={'Feuilles du lot ' + lot.code} build={() => lotSheets(lot)} />}{canManage && lot.statut === 'OUVERT' && <button className="btn small secondary" onClick={() => setImportLot(lot)}><Icon name="upload" size={15} />Importer</button>}{(canManage || canAdvance(me)) && lot.statut === 'OUVERT' && <button className="btn small secondary" onClick={() => setAdvancing(lot)}>Faire avancer le lot</button>}{canManage && lot.statut === 'OUVERT' && <button className="btn small warning" onClick={() => setClosing(lot)}>Clore</button>}</td></tr>,
                open === lot.id ? <tr key={lot.id + ':summary'}><td colSpan={6}><LotSummaryTable key={lot.id + ':' + bump} lotId={lot.id} /></td></tr> : null])}</tbody></table></div>
            : <p className="page-note">Aucun lot dans ce projet : créez-en un pour regrouper les éléments scannés avec les mêmes réglages.</p>}
        {advancing && <LotAdvanceDialog lot={advancing} onClose={() => setAdvancing(null)} onDone={() => { q.refresh(); setBump(b => b + 1); }} />}
        {creating && <LotDialog projectId={projectId} onClose={() => setCreating(false)} onCreated={q.refresh} />}
        {closing && <CloseLotDialog lot={closing} onClose={() => setClosing(null)} onClosed={q.refresh} />}
        {importLot && <BatchImportDialog projectId={projectId} lot={importLot} onClose={() => setImportLot(null)} onDone={() => setBump(b => b + 1)} />}
    </div>;
}

/* ---------- Plan de numérisation d'un élément ---------- */
export function ScanPlanDialog({ element, lots, onClose, onSaved }: { element: DigitizationElement; lots: ScanLot[]; onClose: () => void; onSaved: () => void }) {
    const { digitization } = useSession();
    const [lotId, setLotId] = useState(element.lotId ?? '');
    const [attendues, setAttendues] = useState(element.pagesAttendues?.toString() ?? '');
    const [rectoVerso, setRectoVerso] = useState(!!element.rectoVerso);
    const [documentId, setDocumentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const lot = lots.find(l => l.id === lotId);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setBusy(true); setError(null);
        try {
            await digitization!.command(`/elements/${element.id}/scan-plan`, { lotId: lotId || null, pagesAttendues: num(attendues), rectoVerso, documentId: documentId.trim() ? uuid(documentId.trim()) : null }, crypto.randomUUID(), 'PUT');
            onSaved(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Plan de numérisation" subtitle="Lot, nombre de pages attendues et faces : le contrôle des pages manquantes s’appuie sur ces informations." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Lot" wide><select value={lotId} onChange={e => { setLotId(e.target.value); const l = lots.find(x => x.id === e.target.value); if (l) setRectoVerso(l.rectoVerso); }} disabled={busy}><option value="">Aucun lot</option>{lots.filter(l => l.statut === 'OUVERT' || l.id === element.lotId).map(l => <option key={l.id} value={l.id}>{l.code} · {scannerSettings(l)}</option>)}</select></Field>
            <Field label="Pages attendues" hint="Nombre de pages du document source"><input type="number" min={1} max={100000} value={attendues} onChange={e => setAttendues(e.target.value)} disabled={busy} /></Field>
            <Field label="Faces"><select value={rectoVerso ? 'oui' : 'non'} onChange={e => setRectoVerso(e.target.value === 'oui')} disabled={busy}><option value="non">Recto seul</option><option value="oui">Recto-verso (impair = recto, pair = verso)</option></select></Field>
            {!element.documentId && <Field label="Document de destination" hint="Identifiant du document qui recevra les images (obligatoire pour importer des fichiers)" wide><input value={documentId} onChange={e => setDocumentId(e.target.value)} disabled={busy} /></Field>}
        </div>
            {lot && <Notice>Réglages du lot : {scannerSettings(lot)} · minimum {lot.resolutionMinDpi} dpi.</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer></form>
    </Modal>;
}

/* ---------- Pages ---------- */
function CheckSummary({ check }: { check: PageCheck }) {
    const items: Array<{ tone: 'ok' | 'bad' | 'warn'; icon: string; text: string }> = [];
    if (check.complet) items.push({ tone: 'ok', icon: 'check', text: 'Numérisation complète : aucune page manquante, aucune anomalie.' });
    if (check.manquantes.length) items.push({ tone: 'bad', icon: 'alert', text: `Pages manquantes (${check.manquantes.length}) : ${formatRanges(check.manquantes)}` });
    if (check.aRescanner.length) items.push({ tone: 'warn', icon: 'refresh', text: `Pages à rescanner : ${formatRanges(check.aRescanner)}` });
    if (check.resolutionInsuffisante.length) items.push({ tone: 'warn', icon: 'alert', text: `Résolution inférieure à ${check.resolutionMinimale} dpi : ${check.resolutionInsuffisante.map(r => `p. ${r.numero} (${r.dpi})`).join(', ')}` });
    if (check.feuilletsIncomplets.length) items.push({ tone: 'warn', icon: 'alert', text: `Feuillets dont une seule face est numérisée : ${formatRanges(check.feuilletsIncomplets.map(n => n * 2 - 1))} / ${formatRanges(check.feuilletsIncomplets.map(n => n * 2))} (recto sans verso ou l'inverse)` });
    if (check.resolutionInconnue.length) items.push({ tone: 'warn', icon: 'info', text: `Résolution non vérifiée (inconnue) : ${formatRanges(check.resolutionInconnue)}` });
    if (!items.length) items.push({ tone: 'warn', icon: 'info', text: check.attendues ? `Aucune page enregistrée sur ${check.attendues} attendues.` : 'Aucune page enregistrée.' });
    return <ul className="scan-checks">{items.map((i, n) => <li key={n} className={i.tone}><Icon name={i.icon} size={15} />{i.text}</li>)}</ul>;
}

function DeclarePageDialog({ element, initial, onClose, onDone }: { element: DigitizationElement; initial: number; onClose: () => void; onDone: () => void }) {
    const { digitization } = useSession();
    const [numero, setNumero] = useState(String(initial));
    const [kind, setKind] = useState<'MANQUANTE' | 'VIDE'>('MANQUANTE');
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setBusy(true); setError(null);
        try {
            await digitization!.command(`/elements/${element.id}/pages`, { pages: [{ numeroPage: Number(numero), statut: kind, motif: motif.trim() || null }] }, crypto.randomUUID(), 'POST');
            onDone(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Déclarer une page sans image" subtitle="Une page absente du document source ou volontairement blanche : elle ne sera plus comptée comme oubliée." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Numéro de page *"><input type="number" min={1} value={numero} onChange={e => setNumero(e.target.value)} required disabled={busy} /></Field>
            <Field label="Nature *"><select value={kind} onChange={e => setKind(e.target.value as 'MANQUANTE' | 'VIDE')} disabled={busy}><option value="MANQUANTE">Page manquante dans le document source</option><option value="VIDE">Page blanche (verso vide, intercalaire)</option></select></Field>
            <Field label={kind === 'MANQUANTE' ? 'Motif *' : 'Remarque'} wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required={kind === 'MANQUANTE'} maxLength={500} disabled={busy} /></Field>
        </div>{error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer></form>
    </Modal>;
}

function RescanDialog({ page, onClose, onDone }: { page: ScanPage; onClose: () => void; onDone: () => void }) {
    const { digitization } = useSession();
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setBusy(true); setError(null);
        try { await digitization!.command(`/pages/${page.id}/status`, { statut: 'A_RESCANNER', expectedVersion: page.versionLock, motif: motif.trim() }, crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={'Page ' + page.numeroPage + ' à rescanner'} subtitle="La page restera en attente d’un nouveau fichier ; l’élément ne pourra pas être terminé sans justification." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid"><Field label="Motif *" hint="Flou, coupée, de travers, résolution insuffisante…" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required minLength={3} maxLength={500} disabled={busy} /></Field></div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Marquer à rescanner</button></footer></form>
    </Modal>;
}

export function PagesSection({ element, lots, canManage, onChanged }: { element: DigitizationElement; lots: ScanLot[]; canManage: boolean; onChanged: () => void }) {
    const { digitization, epoch } = useSession();
    const stamp = [element.id, element.versionLock, epoch].join(':');
    const pagesQ = useResource<ScanPage[]>(s => digitization!.pagesByElement(element.id, s), 'pages:' + stamp);
    const checkQ = useResource<PageCheck>(s => digitization!.pageCheck(element.id, s), 'page-check:' + stamp);
    const [planning, setPlanning] = useState(false);
    const [importing, setImporting] = useState(false);
    const [declaring, setDeclaring] = useState(false);
    const [rescan, setRescan] = useState<ScanPage | null>(null);
    const capture = isCaptureStage(element.statut);
    const review = element.statut === 'NUMERISATION' || element.statut === 'CONTROLE_QUALITE';
    const lot = lots.find(l => l.id === element.lotId);
    const refresh = () => { pagesQ.refresh(); checkQ.refresh(); };
    const accept = async (page: ScanPage) => {
        await digitization!.command(`/pages/${page.id}/status`, { statut: 'PRESENTE', expectedVersion: page.versionLock }, crypto.randomUUID(), 'POST');
        refresh();
    };
    const pages = pagesQ.data ?? [];
    const firstGap = checkQ.data?.manquantes[0] ?? ((pages.reduce((m, p) => Math.max(m, p.numeroPage), 0)) + 1);
    return <div className="scan-pages">
        <div className="section-heading"><h4>Pages numérisées</h4>
            {canManage && capture && <div className="table-actions"><SheetsButton label="Feuille séparatrice" title="Feuille séparatrice" build={async () => [elementSheet(element, lot ? ['Lot ' + lot.code] : [])]} /><button className="btn small secondary" onClick={() => setPlanning(true)}>Plan de numérisation</button><button className="btn small secondary" onClick={() => setDeclaring(true)}>Déclarer une page sans image</button><button className="btn small primary" onClick={() => setImporting(true)}><Icon name="upload" size={15} />Importer des pages</button></div>}</div>
        <p className="scan-plan">Lot : <strong>{lot ? lot.code : 'aucun'}</strong> · Pages attendues : <strong>{element.pagesAttendues ?? 'non précisées'}</strong> · Faces : <strong>{element.rectoVerso ? 'recto-verso' : 'recto seul'}</strong>{lot && <> · Minimum <strong>{lot.resolutionMinDpi} dpi</strong></>}</p>
        {checkQ.loading ? <Busy /> : checkQ.error ? <ErrorNotice error={checkQ.error} onRetry={checkQ.refresh} /> : checkQ.data && <CheckSummary check={checkQ.data} />}
        {pagesQ.loading ? <Busy /> : pagesQ.error ? <ErrorNotice error={pagesQ.error} onRetry={pagesQ.refresh} /> : pages.length ? <div className="table-scroll scan-table"><table><thead><tr><th>N°</th><th>Face</th><th>Statut</th><th>Résolution</th><th>Taille (px)</th><th>Fichier</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{pages.map(p => <tr key={p.id} className={p.statut === 'MANQUANTE' || p.statut === 'A_RESCANNER' ? 'scan-flag' : ''}><td>{p.numeroPage}</td><td>{p.face === 'VERSO' ? 'Verso' : 'Recto'}</td><td><Badge value={p.statut} />{p.motif && <small className="cell-sub">{p.motif}</small>}</td>
                <td>{p.dpi ? p.dpi + ' dpi' : '—'}{p.dpi && p.sourceDpi === 'SAISIE' ? <small className="cell-sub">saisie</small> : null}</td><td>{p.largeurPx && p.hauteurPx ? p.largeurPx + ' × ' + p.hauteurPx : '—'}</td><td>{p.fichierId ? 'Enregistré' : '—'}</td>
                <td className="table-actions">{canManage && review && p.statut === 'PRESENTE' && <button className="btn small secondary" onClick={() => setRescan(p)}>À rescanner</button>}{canManage && review && p.statut === 'A_RESCANNER' && <button className="btn small secondary" onClick={() => void accept(p)}>Accepter</button>}</td></tr>)}</tbody></table></div>
            : <p className="page-note">Aucune page enregistrée pour cet élément.</p>}
        {planning && <ScanPlanDialog element={element} lots={lots} onClose={() => setPlanning(false)} onSaved={onChanged} />}
        {declaring && <DeclarePageDialog element={element} initial={firstGap} onClose={() => setDeclaring(false)} onDone={refresh} />}
        {rescan && <RescanDialog page={rescan} onClose={() => setRescan(null)} onDone={refresh} />}
        {importing && <PageImportDialog element={element} lot={lot ?? null} pages={pages} check={checkQ.data ?? null} onClose={() => setImporting(false)} onDone={refresh} onPlan={() => { setImporting(false); setPlanning(true); }} />}
    </div>;
}

/* ---------- Import de pages (fichiers du scanner) ---------- */
type Stage = 'choose' | 'running' | 'done';

export function PageImportDialog({ element, lot, pages, check, onClose, onDone, onPlan }: { element: DigitizationElement; lot: ScanLot | null; pages: ScanPage[]; check: PageCheck | null; onClose: () => void; onDone: () => void; onPlan: () => void }) {
    const { digitization, records } = useSession();
    const versionsQ = useResource<DocumentVersion[]>(s => element.documentId ? records!.versions(element.documentId, s) : Promise.resolve([]), 'import-versions:' + element.id + ':' + element.documentId);
    const drafts = (versionsQ.data ?? []).filter(v => v.state === 'BROUILLON');
    const [versionId, setVersionId] = useState('');
    const [files, setFiles] = useState<Array<{ file: File; info: ImageInfo }>>([]);
    const [start, setStart] = useState(() => String(check?.manquantes[0] ?? (pages.reduce((m, p) => Math.max(m, p.numeroPage), 0) + 1)));
    const [fallbackDpi, setFallbackDpi] = useState(lot?.resolutionDpi?.toString() ?? '');
    const [problem, setProblem] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [stage, setStage] = useState<Stage>('choose');
    const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
    const [halt, setHalt] = useState<string | null>(null);
    const cancelled = useRef(false);
    const keys = useRef(new Map<string, string>());
    const taken = useMemo(() => new Set(pages.filter(p => p.statut === 'PRESENTE').map(p => p.numeroPage)), [pages]);
    const rows: PlanRow[] = useMemo(() => planPages(files.map(f => ({ name: f.file.name, size: f.file.size, info: f.info })), { start: Math.max(1, Number(start) || 1), rectoVerso: !!element.rectoVerso, resolutionMin: lot?.resolutionMinDpi ?? null, attendues: element.pagesAttendues ?? null, taken }), [files, start, element.rectoVerso, element.pagesAttendues, lot, taken]);
    const byName = useMemo(() => new Map(files.map(f => [f.file.name + '|' + f.file.size, f.file])), [files]);
    const sendable = rows.filter(r => r.errors.length === 0);
    const gaps = remainingGaps(element.pagesAttendues ?? null, [...pages.filter(p => p.statut !== 'MANQUANTE' && p.statut !== 'A_RESCANNER').map(p => p.numeroPage)], sendable.map(r => r.numero));
    const versionReady = !!(versionId || drafts[0]);
    const rowKey = (r: PlanRow) => r.name + '|' + r.size;

    const pick = async (list: FileList | File[] | null | undefined) => {
        const chosen = Array.from(list ?? []);
        if (!chosen.length) return;
        if (chosen.length > MAX_FILES) { setProblem(`Sélectionnez au plus ${MAX_FILES} fichiers à la fois.`); return; }
        setReading(true); setProblem(null);
        try {
            const read = await Promise.all(chosen.map(async file => ({ file, info: file.size > MAX_FILE_BYTES ? { format: 'INCONNU' as const, width: null, height: null, dpi: null } : await readImageInfo(file) })));
            setFiles(read); setOutcomes({}); setHalt(null); keys.current = new Map();
        } catch (e) { setProblem(e instanceof Error ? e.message : 'Lecture des fichiers impossible.'); } finally { setReading(false); }
    };

    const run = async (targets: PlanRow[]) => {
        const version = versionId || drafts[0]?.id;
        if (!version || !digitization || !records) return;
        cancelled.current = false; setStage('running'); setHalt(null);
        const jobs = targets.flatMap(row => { const file = byName.get(rowKey(row)); return file ? [{ id: rowKey(row), row, file }] : []; });
        const reason = await importPageRows({ digitization, records, elementId: element.id, versionId: version, jobs, fallbackDpi: fallbackDpi.trim() ? Number(fallbackDpi) : null, keys: keys.current, isCancelled: () => cancelled.current, onOutcome: (id, outcome) => setOutcomes(old => ({ ...old, [id]: outcome })) });
        setHalt(reason);
        setStage('done'); onDone();
    };

    const created = rows.filter(r => outcomes[rowKey(r)]?.state === 'ok').length;
    const failed = rows.filter(r => outcomes[rowKey(r)]?.state === 'error');
    const pending = sendable.filter(r => !outcomes[rowKey(r)]);
    const noDocument = !element.documentId;
    const close = () => { if (stage !== 'running') onClose(); };
    return <Modal title="Importer des pages numérisées" subtitle={element.descriptionSource ?? 'Fichiers produits par le scanner (une image par page)'} onClose={close} locked={stage === 'running'} wide>
        <div className="imp">
            {noDocument ? <Notice tone="warning">Cet élément n’est lié à aucun document : les images sont stockées dans une version de document. <button type="button" className="text-link" onClick={onPlan}>Indiquer le document dans le plan de numérisation</button></Notice>
                : versionsQ.loading ? <Busy /> : versionsQ.error ? <ErrorNotice error={versionsQ.error} onRetry={versionsQ.refresh} />
                : !drafts.length ? <Notice tone="warning">Le document de cet élément n’a aucune version en brouillon : créez une nouvelle version depuis la fiche du document avant d’importer.</Notice>
                : <>
                    {stage === 'choose' && <div className="form-grid">
                        <Field label="Version du document" hint="Les images sont ajoutées comme maîtres de conservation"><select value={versionId || drafts[0]!.id} onChange={e => setVersionId(e.target.value)}>{drafts.map(v => <option key={v.id} value={v.id}>Version {v.number}</option>)}</select></Field>
                        <Field label="Première page importée" hint={element.rectoVerso ? 'Recto-verso : impair = recto, pair = verso' : undefined}><input type="number" min={1} value={start} onChange={e => setStart(e.target.value)} /></Field>
                        <Field label="Résolution si absente du fichier (dpi)" hint="Saisie, signalée comme telle" ><input type="number" min={50} max={9600} value={fallbackDpi} onChange={e => setFallbackDpi(e.target.value)} /></Field>
                    </div>}
                    {stage === 'choose' && !files.length && <label className="imp-drop"><Icon name="upload" size={30} /><span><strong>{reading ? 'Lecture des fichiers…' : 'Choisir les images'}</strong> (TIFF, JPEG ou PNG, une par page)</span><small>Elles sont numérotées dans l’ordre naturel des noms (scan2 avant scan10)</small>
                        <input type="file" multiple accept=".tif,.tiff,.jpg,.jpeg,.png,image/tiff,image/jpeg,image/png" disabled={reading} onChange={e => { void pick(e.target.files); e.target.value = ''; }} /></label>}
                    {stage === 'choose' && files.length > 0 && <div className="imp-reselect"><span>{files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}</span><label className="btn secondary small">Changer la sélection<input type="file" multiple hidden accept=".tif,.tiff,.jpg,.jpeg,.png,image/tiff,image/jpeg,image/png" disabled={reading} onChange={e => { void pick(e.target.files); e.target.value = ''; }} /></label></div>}
                    {problem && <Notice tone="warning">{problem}</Notice>}
                    {rows.length > 0 && <>
                        <div className="imp-summary" role="status" aria-live="polite"><span className="imp-count ok"><b>{sendable.length}</b> prête{sendable.length > 1 ? 's' : ''}</span>{rows.length - sendable.length > 0 && <span className="imp-count bad"><b>{rows.length - sendable.length}</b> bloquée{rows.length - sendable.length > 1 ? 's' : ''}</span>}
                            {rows.some(r => r.warnings.length > 0) && <span className="imp-count warn"><b>{rows.filter(r => r.warnings.length > 0).length}</b> à vérifier</span>}{stage !== 'choose' && <><span className="imp-count ok"><b>{created}</b> importée{created > 1 ? 's' : ''}</span>{failed.length > 0 && <span className="imp-count bad"><b>{failed.length}</b> en échec</span>}</>}</div>
                        {stage === 'running' && <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={sendable.length} aria-valuenow={created + failed.length}><span style={{ width: sendable.length ? ((created + failed.length) * 100 / sendable.length) + '%' : '0%' }} /></div>}
                        {halt && <Notice tone="warning">{halt}</Notice>}
                        {gaps.length > 0 && stage === 'choose' && <Notice tone="warning">Après cet import, il manquera encore les pages : {formatRanges(gaps)}. Vous pourrez les importer plus tard ou les déclarer manquantes.</Notice>}
                        <div className="table-scroll imp-table"><table><thead><tr><th>N°</th><th>Face</th><th>Fichier</th><th>Taille (px)</th><th>Résolution</th><th>{stage === 'choose' ? 'Contrôle' : 'Résultat'}</th></tr></thead>
                            <tbody>{rows.map(r => { const o = outcomes[rowKey(r)]; return <tr key={rowKey(r)} className={r.errors.length || o?.state === 'error' ? 'imp-bad' : ''}><td>{r.numero || '—'}</td><td>{r.numero ? (r.face === 'VERSO' ? 'Verso' : 'Recto') : '—'}</td><td>{r.name}</td><td>{r.info.width && r.info.height ? r.info.width + ' × ' + r.info.height : '—'}</td><td>{!r.numero ? '—' : r.info.dpi ? r.info.dpi + ' dpi' : fallbackDpi ? fallbackDpi + ' (saisie)' : '—'}</td>
                                <td>{r.errors.length ? <span className="imp-tag bad"><Icon name="alert" size={13} />{r.errors.join(' ')}</span> : o?.state === 'ok' ? <span className="imp-tag ok"><Icon name="check" size={13} />Importée</span> : o?.state === 'error' ? <span className="imp-tag bad"><Icon name="alert" size={13} />{o.message}</span>
                                    : r.warnings.length ? <span className="imp-tag warn"><Icon name="alert" size={13} />{r.warnings.join(' ')}</span> : <span className="imp-tag ok"><Icon name="check" size={13} />{stage === 'choose' ? 'Valide' : 'En attente…'}</span>}</td></tr>; })}</tbody></table></div>
                    </>}
                </>}
        </div>
        <footer className="modal-footer">
            {stage === 'choose' && <><button type="button" className="btn secondary" onClick={onClose}>Annuler</button><button type="button" className="btn primary" disabled={!sendable.length || !versionReady || noDocument} onClick={() => void run(sendable)}><Icon name="check" size={17} />Importer {sendable.length} page{sendable.length > 1 ? 's' : ''}</button></>}
            {stage === 'running' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Interrompre</button>}
            {stage === 'done' && <>{failed.length + pending.length > 0 && <button type="button" className="btn secondary" onClick={() => void run([...failed, ...pending])}><Icon name="refresh" size={16} />Réessayer {failed.length + pending.length} page{failed.length + pending.length > 1 ? 's' : ''}</button>}<button type="button" className="btn primary" onClick={onClose}>Terminer</button></>}
        </footer>
    </Modal>;
}

export const scannerStatusActions: Record<ScannerStatus, Array<{ to: ScannerStatus; label: string }>> = {
    ACTIF: [{ to: 'MAINTENANCE', label: 'Mettre en maintenance' }, { to: 'RETIRE', label: 'Retirer du parc' }],
    MAINTENANCE: [{ to: 'ACTIF', label: 'Remettre en service' }, { to: 'RETIRE', label: 'Retirer du parc' }],
    RETIRE: []
};
