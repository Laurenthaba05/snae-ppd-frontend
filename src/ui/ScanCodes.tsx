import React, { useRef, useState } from 'react';
import { isCaptureStage } from '../core/workflow';
import { useSession } from '../auth/session';
import { sheetsDocument, type SheetSpec } from '../core/codeSheets';
import { PROBLEM_TEXT, resolveGroups, splitByCodes, type ScannedFile } from '../core/batchPlan';
import { formatRanges, planPages, remainingGaps, type PlanRow } from '../core/pageNumbering';
import { parseCode, resolveAmong } from '../core/scanCodes';
import { readImageInfo, type ImageInfo } from '../core/scanImage';
import type { DigitizationElement, DocumentVersion, ScanLot, ScanPage } from '../core/types';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { readFileCodes } from './codeReading';
import { Icon } from './icons';
import { importPageRows, type ImportOutcome } from './pageImportRunner';
import { printHtml } from './printHtml';
import { elementName } from '../core/format';

/* ---------- Impression des feuilles séparatrices ---------- */
/** Imprime les feuilles depuis un cadre invisible de la page (aucune fenêtre n'est ouverte : rien à autoriser, rien qui partage l'origine de l'application par `window.opener`). */
export function printSheets(title: string, sheets: SheetSpec[]): void {
    printHtml(sheetsDocument(title, sheets));
}

export const elementSheet = (element: Pick<DigitizationElement, 'id' | 'descriptionSource' | 'pagesAttendues' | 'rectoVerso'> & Partial<Pick<DigitizationElement, 'ordre'>>, context: string[] = []): SheetSpec => ({
    kind: 'ELEMENT', id: element.id, title: elementName(element.descriptionSource, element.ordre),
    details: [...context, element.pagesAttendues ? `${element.pagesAttendues} page(s) attendue(s) · ${element.rectoVerso ? 'recto-verso' : 'recto seul'}` : element.rectoVerso ? 'Recto-verso' : 'Recto seul']
});
export const lotSheet = (lot: Pick<ScanLot, 'id' | 'code' | 'nom'>, context: string[] = []): SheetSpec => ({ kind: 'LOT', id: lot.id, title: lot.code + (lot.nom ? ' — ' + lot.nom : ''), details: context });

/** Bouton qui prépare puis imprime des feuilles ; le message d'erreur reste affiché si l'impression échoue. */
export function SheetsButton({ label, title, build, small = true }: { label: string; title: string; build: () => Promise<SheetSpec[]>; small?: boolean }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const click = async () => {
        setBusy(true); setError(null);
        try {
            const sheets = await build();
            if (!sheets.length) setError('Aucune feuille à imprimer.');
            else printSheets(title, sheets);
        } catch (e) { setError(e instanceof Error ? e.message : 'Préparation impossible.'); } finally { setBusy(false); }
    };
    return <>
        <button type="button" className={'btn secondary' + (small ? ' small' : '')} disabled={busy} onClick={() => void click()}><Icon name="docList" size={15} />{busy ? 'Préparation…' : label}</button>
        {error && <span className="scan-bad" role="alert">{error}</span>}
    </>;
}

/* ---------- Recherche par code (douchette USB ou saisie) ---------- */
/**
 * Une douchette USB se comporte comme un clavier : elle « tape » le code puis Entrée. Le champ garde le focus après chaque lecture
 * pour enchaîner les scans. Un code court n'est résolu que parmi les éléments et lots du projet ouvert.
 */
export function CodeLookup({ projectId, elements, lots, onElement, onLot }: { projectId: string | null; elements: readonly DigitizationElement[]; lots: readonly ScanLot[]; onElement: (projectId: string, elementId: string) => void; onLot: (projectId: string, lotId: string) => void }) {
    const { digitization } = useSession();
    const [value, setValue] = useState('');
    const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const code = parseCode(value);
        setValue('');
        if (!code) { setMessage({ tone: 'bad', text: 'Ce n’est pas un code SNAE (SNAE:E:… pour un élément, SNAE:L:… pour un lot).' }); return; }
        setBusy(true); setMessage(null);
        try {
            if (code.full) {
                if (code.kind === 'ELEMENT') { const e = await digitization!.element(code.ref.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')); onElement(e.projetNumerisationId, e.id); }
                else { const l = await digitization!.lot(code.ref.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')); onLot(l.projetNumerisationId, l.id); }
                setMessage({ tone: 'ok', text: code.kind === 'ELEMENT' ? 'Élément ouvert.' : 'Lot affiché.' });
            } else if (!projectId) setMessage({ tone: 'bad', text: 'Code court : ouvrez d’abord le projet concerné.' });
            else {
                const found = code.kind === 'ELEMENT' ? resolveAmong(code, elements) : resolveAmong(code, lots);
                if (found.ambiguous) setMessage({ tone: 'bad', text: 'Code court ambigu dans ce projet : utilisez le code QR complet.' });
                else if (!found.match) setMessage({ tone: 'bad', text: 'Aucun ' + (code.kind === 'ELEMENT' ? 'élément' : 'lot') + ' de ce projet ne correspond à ce code.' });
                else { if (code.kind === 'ELEMENT') onElement(projectId, found.match.id); else onLot(projectId, found.match.id); setMessage({ tone: 'ok', text: code.kind === 'ELEMENT' ? 'Élément ouvert.' : 'Lot affiché.' }); }
            }
        } catch (e) { setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Code introuvable.' }); } finally { setBusy(false); }
    };
    return <form className="code-lookup" onSubmit={e => void submit(e)} role="search" aria-label="Rechercher par code">
        <label><Icon name="search" size={16} /><span className="sr-only">Code à rechercher</span>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder="Scanner ou saisir un code (SNAE:E:…)" autoComplete="off" spellCheck={false} disabled={busy} /></label>
        <button type="submit" className="btn secondary small" disabled={busy || !value.trim()}>Ouvrir</button>
        {message && <span className={message.tone === 'ok' ? 'scan-ok' : 'scan-bad'} role="status">{message.text}</span>}
    </form>;
}

/* ---------- Import d'un lot de fichiers découpé par feuilles séparatrices ---------- */
interface ReadFile extends ScannedFile { file: File; info: ImageInfo }
interface PlannedGroup {
    key: string;
    separator: string;
    element: DigitizationElement | null;
    error: string | null;
    warnings: string[];
    versionId: string | null;
    rows: PlanRow[];
    files: Map<string, File>;
}
type Stage = 'choose' | 'reading' | 'plan' | 'running' | 'done';

const rowId = (group: PlannedGroup, row: PlanRow) => group.key + '|' + row.name + '|' + row.size;

export function BatchImportDialog({ projectId, lot, onClose, onDone }: { projectId: string; lot: ScanLot | null; onClose: () => void; onDone: () => void }) {
    const { digitization, records, epoch } = useSession();
    const elementsQ = useResource<DigitizationElement[]>(s => digitization!.elementsByProject(projectId, s), 'batch-elements:' + projectId + ':' + epoch);
    const lotsQ = useResource<ScanLot[]>(s => digitization!.lotsByProject(projectId, s), 'batch-lots:' + projectId + ':' + epoch);
    const [stage, setStage] = useState<Stage>('choose');
    const [useLibrary, setUseLibrary] = useState(true);
    const [fallbackDpi, setFallbackDpi] = useState(lot?.resolutionDpi?.toString() ?? '');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [problem, setProblem] = useState<string | null>(null);
    const [notes, setNotes] = useState<string[]>([]);
    const [groups, setGroups] = useState<PlannedGroup[]>([]);
    const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
    const [halt, setHalt] = useState<string | null>(null);
    const [readFiles, setReadFiles] = useState<ReadFile[]>([]);
    const [manualElement, setManualElement] = useState('');
    const [manualBusy, setManualBusy] = useState(false);
    const cancelled = useRef(false);
    const keys = useRef(new Map<string, string>());

    const importable = groups.filter(g => !g.error && g.versionId && g.rows.some(r => !r.errors.length));
    const sendable = (g: PlannedGroup) => g.rows.filter(r => !r.errors.length);
    const total = importable.reduce((n, g) => n + sendable(g).length, 0);
    const created = importable.reduce((n, g) => n + sendable(g).filter(r => outcomes[rowId(g, r)]?.state === 'ok').length, 0);
    const failed = importable.reduce((n, g) => n + sendable(g).filter(r => outcomes[rowId(g, r)]?.state === 'error').length, 0);

    /** Prépare l'import des pages d'un élément : version en brouillon, numérotation, résolution, pages manquantes. Sert au découpage par feuilles comme à l'import sans feuille. */
    const planGroup = async (key: string, separator: string, element: DigitizationElement | null, problem: string | null, pages: ReadFile[]): Promise<PlannedGroup> => {
        const files = new Map<string, File>(pages.map(p => [p.name + '|' + p.size, p.file]));
        const base: PlannedGroup = { key, separator, element, error: problem, warnings: [], versionId: null, rows: [], files };
        if (element && !base.error) {
            if (!isCaptureStage(element.statut)) base.error = 'Cet élément a quitté l’étape de numérisation : ses pages ne peuvent plus changer.';
            else if (!element.documentId) base.error = 'Cet élément n’est lié à aucun document : indiquez-le dans son plan de numérisation.';
            else {
                const [existing, versions] = await Promise.all([digitization!.pagesByElement(element.id), records!.versions(element.documentId)]);
                const draft = versions.find((v: DocumentVersion) => v.state === 'BROUILLON');
                if (!draft) base.error = 'Le document de cet élément n’a aucune version en brouillon.';
                else {
                    base.versionId = draft.id;
                    const taken = new Set(existing.filter((p: ScanPage) => p.statut === 'PRESENTE').map(p => p.numeroPage));
                    const start = existing.reduce((m: number, p: ScanPage) => Math.max(m, p.numeroPage), 0) + 1;
                    const minimum = (lotsQ.data ?? []).find(l => l.id === element.lotId)?.resolutionMinDpi ?? lot?.resolutionMinDpi ?? null;
                    base.rows = planPages(pages.map(p => ({ name: p.name, size: p.size, info: p.info })), { start, rectoVerso: !!element.rectoVerso, resolutionMin: minimum, attendues: element.pagesAttendues ?? null, taken });
                    const gaps = remainingGaps(element.pagesAttendues ?? null, existing.filter(p => p.statut !== 'MANQUANTE' && p.statut !== 'A_RESCANNER').map(p => p.numeroPage), base.rows.filter(r => !r.errors.length).map(r => r.numero));
                    if (gaps.length) base.warnings.push(`Il manquera encore ${gaps.length} page(s) : ${formatRanges(gaps)}.`);
                    if (lot && element.lotId !== lot.id) base.warnings.push('Cet élément n’est pas rattaché au lot sélectionné.');
                }
            }
        }
        return base;
    };

    const analyse = async (chosen: File[]) => {
        if (!digitization || !records || !elementsQ.data) return;
        cancelled.current = false; setProblem(null); setNotes([]); setStage('reading'); setProgress({ done: 0, total: chosen.length });
        try {
            const read: ReadFile[] = [];
            for (const file of chosen) {
                if (cancelled.current) { setStage('choose'); return; }
                const info = await readImageInfo(file);
                const { hits, unreadable } = await readFileCodes(file, info, useLibrary);
                read.push({ file, info, name: file.name, size: file.size, codes: hits.map(h => h.text), unreadable });
                setProgress(p => ({ ...p, done: p.done + 1 }));
            }
            setReadFiles(read); setManualElement('');
            const split = splitByCodes(read);
            if (split.unreadable.length) {
                setProblem(`Le navigateur ne peut pas lire le contenu de ${split.unreadable.length} fichier(s) (${split.unreadable.slice(0, 3).map(u => u.name).join(', ')}${split.unreadable.length > 3 ? '…' : ''}), typiquement des TIFF. Sans lecture, une feuille séparatrice serait prise pour une page : enregistrez les scans en JPEG ou PNG, ou importez élément par élément.`);
                setStage('choose'); return;
            }
            const extra: string[] = [];
            if (split.orphans.length && split.groups.length) extra.push(`${split.orphans.length} fichier(s) précèdent la première feuille séparatrice et ne seront pas importés : ${split.orphans.slice(0, 4).map(o => o.name).join(', ')}${split.orphans.length > 4 ? '…' : ''}.`);
            for (const sheet of split.lotSheets) {
                const wanted = lot ? sheet.code.full ? sheet.code.ref === lot.id.replace(/-/g, '') : lot.id.replace(/-/g, '').startsWith(sheet.code.ref) : true;
                const known = resolveAmong(sheet.code, lotsQ.data ?? []);
                extra.push(!wanted ? `La feuille de lot « ${sheet.file.name} » désigne un autre lot que ${lot?.code} : vérifiez que ces fichiers appartiennent bien à ce lot.` : known.match ? `Feuille de lot reconnue : ${known.match.code}.` : `La feuille de lot « ${sheet.file.name} » ne correspond à aucun lot de ce projet.`);
            }
            const resolved = resolveGroups(split.groups, elementsQ.data);
            const planned: PlannedGroup[] = [];
            for (const [index, entry] of resolved.entries())
                planned.push(await planGroup(String(index), entry.group.separator.name, entry.element, entry.problem ? PROBLEM_TEXT[entry.problem] : null, entry.group.pages as ReadFile[]));
            setNotes(extra); setGroups(planned); keys.current = new Map(); setOutcomes({}); setHalt(null); setStage('plan');
        } catch (e) { setProblem(e instanceof Error ? e.message : 'Analyse impossible.'); setStage('choose'); }
    };

    /** Les fichiers sans feuille séparatrice : ceux qui ne portent aucun code SNAE (une feuille reconnue n'est jamais importée comme une page). */
    const pagesWithoutSheet = readFiles.filter(f => !f.codes.some(c => parseCode(c)));
    const acceptingElements = (elementsQ.data ?? []).filter(e => isCaptureStage(e.statut) && !!e.documentId);
    /** Importe les fichiers choisis, dans l'ordre de la sélection, comme pages d'un seul élément : pour un lot sans feuille séparatrice, ou un essai. */
    const planManual = async () => {
        const element = acceptingElements.find(e => e.id === manualElement);
        if (!element || !pagesWithoutSheet.length) return;
        setManualBusy(true); setProblem(null);
        try {
            const group = await planGroup('manuel', 'Sélection manuelle', element, null, pagesWithoutSheet);
            setNotes([`Import sans feuille séparatrice : les ${pagesWithoutSheet.length} fichier(s), dans l’ordre de la sélection, deviennent les pages de l’élément choisi. Vérifiez l’ordre avant d’importer.`]);
            setGroups([group]); keys.current = new Map(); setOutcomes({}); setHalt(null);
        } catch (e) { setProblem(e instanceof Error ? e.message : 'Préparation impossible.'); } finally { setManualBusy(false); }
    };

    const run = async (only?: PlannedGroup[]) => {
        if (!digitization || !records) return;
        cancelled.current = false; setStage('running'); setHalt(null);
        for (const group of only ?? importable) {
            if (!group.element || !group.versionId) continue;
            const jobs = sendable(group).filter(r => outcomes[rowId(group, r)]?.state !== 'ok').flatMap(row => { const file = group.files.get(row.name + '|' + row.size); return file ? [{ id: rowId(group, row), row, file }] : []; });
            const reason = await importPageRows({ digitization, records, elementId: group.element.id, versionId: group.versionId, jobs, fallbackDpi: fallbackDpi.trim() ? Number(fallbackDpi) : null, keys: keys.current, isCancelled: () => cancelled.current, onOutcome: (id, outcome) => setOutcomes(old => ({ ...old, [id]: outcome })) });
            if (reason) { setHalt(reason); break; }
        }
        setStage('done'); onDone();
    };

    const loading = elementsQ.loading || lotsQ.loading;
    const close = () => { if (stage !== 'running') { cancelled.current = true; onClose(); } };
    const retryable = importable.some(g => sendable(g).some(r => outcomes[rowId(g, r)]?.state !== 'ok'));
    return <Modal title="Importer un lot de fichiers" subtitle={lot ? 'Lot ' + lot.code + ' · découpage par feuilles séparatrices' : 'Découpage par feuilles séparatrices (codes QR / Code 128)'} onClose={close} locked={stage === 'running' || stage === 'reading'} wide>
        <div className="imp">
            {loading ? <Busy /> : elementsQ.error ? <ErrorNotice error={elementsQ.error} onRetry={elementsQ.refresh} /> : <>
                {stage === 'choose' && <>
                    <Notice>Déposez dans l’ordre toutes les images du lot, <strong>feuilles séparatrices comprises</strong> (imprimées depuis le projet ou le lot). Chaque feuille ouvre un élément ; les images qui la suivent deviennent ses pages. Les feuilles ne sont pas conservées.</Notice>
                    <div className="form-grid">
                        <Field label="Résolution si absente du fichier (dpi)" hint="Saisie, signalée comme telle"><input type="number" min={50} max={9600} value={fallbackDpi} onChange={e => setFallbackDpi(e.target.value)} /></Field>
                        <Field label="Lecture des codes"><select value={useLibrary ? 'oui' : 'non'} onChange={e => setUseLibrary(e.target.value === 'oui')}><option value="oui">Lecteur interne, puis ZXing si rien n’est trouvé</option><option value="non">Lecteur interne seulement</option></select></Field>
                    </div>
                    <label className="imp-drop"><Icon name="upload" size={30} /><span><strong>Choisir les images du lot</strong> (JPEG ou PNG)</span><small>Jusqu’à 500 fichiers · les TIFF ne sont pas lisibles par le navigateur</small>
                        <input type="file" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png,.tif,.tiff" onChange={e => { const list = Array.from(e.target.files ?? []); e.target.value = ''; if (list.length > 500) setProblem('Sélectionnez au plus 500 fichiers à la fois.'); else if (list.length) void analyse(list); }} /></label>
                    {problem && <Notice tone="warning">{problem}</Notice>}
                </>}
                {stage === 'reading' && <><p className="scan-plan" role="status">Lecture des codes : {progress.done} / {progress.total} fichier(s)…</p>
                    <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: progress.total ? progress.done * 100 / progress.total + '%' : '0%' }} /></div></>}
                {(stage === 'plan' || stage === 'running' || stage === 'done') && <>
                    <div className="imp-summary" role="status" aria-live="polite">
                        <span className="imp-count ok"><b>{groups.filter(g => !g.error).length}</b> élément(s) reconnu(s)</span>
                        {groups.some(g => g.error) && <span className="imp-count bad"><b>{groups.filter(g => g.error).length}</b> groupe(s) bloqué(s)</span>}
                        <span className="imp-count"><b>{total}</b> page(s) à importer</span>
                        {stage !== 'plan' && <><span className="imp-count ok"><b>{created}</b> importée(s)</span>{failed > 0 && <span className="imp-count bad"><b>{failed}</b> en échec</span>}</>}
                    </div>
                    {stage === 'running' && <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={created + failed}><span style={{ width: total ? (created + failed) * 100 / total + '%' : '0%' }} /></div>}
                    {halt && <Notice tone="warning">{halt}</Notice>}
                    {notes.map((n, i) => <Notice key={i} tone="warning">{n}</Notice>)}
                    {!groups.length && <Notice tone="warning">Aucune feuille séparatrice n’a été reconnue dans {readFiles.length === 1 ? 'le fichier sélectionné' : 'les ' + readFiles.length + ' fichiers sélectionnés'}. Une feuille séparatrice est un QR ou un Code 128 imprimé depuis le projet, le lot ou l’élément, puis scanné avec les pages : une capture d’écran ou une photo sans code n’en est pas une. Ajoutez-la à la sélection, ou importez les fichiers sans feuille séparatrice ci-dessous.</Notice>}
                    {!groups.length && stage === 'plan' && pagesWithoutSheet.length > 0 && <section className="batch-manual" aria-label="Importer sans feuille séparatrice">
                        <h4>Importer sans feuille séparatrice</h4>
                        <p>{pagesWithoutSheet.length === 1 ? 'Ce fichier peut devenir une page' : 'Ces ' + pagesWithoutSheet.length + ' fichiers peuvent devenir, dans l’ordre de la sélection, les pages'} d’un seul élément du projet. Chaque page est contrôlée comme d’habitude (résolution, doublons, numérotation) avant l’envoi.</p>
                        {acceptingElements.length === 0 ? <Notice tone="warning">Aucun élément de ce projet n’accepte de pages pour le moment : il faut un élément à l’étape de numérisation, lié à un document.</Notice>
                            : <div className="form-grid"><Field label="Élément qui reçoit les pages"><select value={manualElement} onChange={e => setManualElement(e.target.value)} disabled={manualBusy}><option value="">Choisir…</option>
                                {acceptingElements.map(e => <option key={e.id} value={e.id}>{elementName(e.descriptionSource, e.ordre)}</option>)}</select></Field>
                                <div className="batch-manual-actions"><button type="button" className="btn secondary" disabled={!manualElement || manualBusy} onClick={() => void planManual()}>{manualBusy ? 'Préparation…' : 'Préparer l’import'}</button></div></div>}
                    </section>}
                    {groups.length === 1 && groups[0]!.key === 'manuel' && <p><button type="button" className="text-link" onClick={() => setGroups([])}>Choisir un autre élément</button></p>}
                    {groups.map(group => <details key={group.key} className={'batch-group' + (group.error ? ' bad' : '')} open={!!group.error || groups.length <= 3}>
                        <summary><strong>{(group.element ? elementName(group.element.descriptionSource, group.element.ordre) : 'Feuille « ' + group.separator + ' »')}</strong>
                            <span>{group.error ? <span className="imp-tag bad"><Icon name="alert" size={13} />{group.error}</span> : <span className="imp-tag ok"><Icon name="check" size={13} />{sendable(group).length} page(s)</span>}</span></summary>
                        {group.warnings.map((w, i) => <p key={i} className="imp-tag warn"><Icon name="alert" size={13} />{w}</p>)}
                        {!group.error && <div className="table-scroll imp-table"><table><thead><tr><th>N°</th><th>Face</th><th>Fichier</th><th>Résolution</th><th>{stage === 'plan' ? 'Contrôle' : 'Résultat'}</th></tr></thead>
                            <tbody>{group.rows.map(r => { const o = outcomes[rowId(group, r)]; return <tr key={rowId(group, r)} className={r.errors.length || o?.state === 'error' ? 'imp-bad' : ''}><td>{r.numero || '—'}</td><td>{r.numero ? (r.face === 'VERSO' ? 'Verso' : 'Recto') : '—'}</td><td>{r.name}</td><td>{!r.numero ? '—' : r.info.dpi ? r.info.dpi + ' dpi' : fallbackDpi ? fallbackDpi + ' (saisie)' : '—'}</td>
                                <td>{r.errors.length ? <span className="imp-tag bad"><Icon name="alert" size={13} />{r.errors.join(' ')}</span> : o?.state === 'ok' ? <span className="imp-tag ok"><Icon name="check" size={13} />Importée</span> : o?.state === 'error' ? <span className="imp-tag bad"><Icon name="alert" size={13} />{o.message}</span> : r.warnings.length ? <span className="imp-tag warn"><Icon name="alert" size={13} />{r.warnings.join(' ')}</span> : <span className="imp-tag idle">{stage === 'plan' ? 'Valide' : stage === 'running' ? 'En attente…' : 'Non traitée'}</span>}</td></tr>; })}</tbody></table></div>}
                    </details>)}
                </>}
            </>}
        </div>
        <footer className="modal-footer">
            {stage === 'choose' && <button type="button" className="btn secondary" onClick={onClose}>Annuler</button>}
            {stage === 'reading' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Annuler la lecture</button>}
            {stage === 'plan' && <><button type="button" className="btn secondary" onClick={() => { setStage('choose'); setGroups([]); setReadFiles([]); setNotes([]); }}>Choisir d’autres fichiers</button><button type="button" className="btn primary" disabled={!total} onClick={() => void run()}><Icon name="check" size={17} />Importer {total} page{total > 1 ? 's' : ''}</button></>}
            {stage === 'running' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Interrompre</button>}
            {stage === 'done' && <>{retryable && <button type="button" className="btn secondary" onClick={() => void run()}><Icon name="refresh" size={16} />Réessayer les pages restantes</button>}<button type="button" className="btn primary" onClick={onClose}>Terminer</button></>}
        </footer>
    </Modal>;
}

