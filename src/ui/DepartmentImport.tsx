import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { buildXlsx, downloadBytes, readSpreadsheet } from '../core/spreadsheet';
import { MAX_IMPORT_ROWS } from '../core/institutionImport';
import { departmentTemplate, parseDepartmentTable, type DepartmentRow } from '../core/departmentImport';
import type { Department } from '../core/types';
import { Busy, ErrorNotice, Field, Modal, Notice } from './components';
import { Icon } from './icons';
import { EntityName } from './names';
import { InstitutionChoice } from './InstitutionChoice';
import { display } from '../core/format';

type Stage = 'choose' | 'preview' | 'running' | 'done';
interface Outcome { state: 'ok' | 'error'; message?: string; code?: string; uncertain?: boolean }
/** Arrêt après autant d'échecs serveur/réseau consécutifs : inutile d'insister si le service est indisponible. */
const MAX_CONSECUTIVE_FAILURES = 5;
const PAGE = 100;
const MAX_PAGES = 100;

/** Les départements déjà enregistrés dans l'institution : code en majuscules → identifiant (pour reconnaître un parent et refuser un code pris). */
async function loadExisting(api: NonNullable<ReturnType<typeof useSession>['api']>, institutionId: string, signal: AbortSignal): Promise<Map<string, string>> {
    const known = new Map<string, string>();
    for (let page = 0; page < MAX_PAGES; page++) {
        const result = await api.list<Department>('departments', { institutionId, page, size: PAGE }, signal);
        for (const d of result.items) known.set(d.code.toUpperCase(), d.id);
        if (!result.hasMore) return known;
    }
    throw new Error('Cette institution compte trop de départements pour être vérifiée avant l’import.');
}

export function DepartmentImport({ initialInstitutionId, onClose, onDone }: { initialInstitutionId: string | null; onClose: () => void; onDone: () => void }) {
    const { api, refresh } = useSession();
    const [stage, setStage] = useState<Stage>('choose');
    const [institutionId, setInstitutionId] = useState(initialInstitutionId ?? '');
    const [existing, setExisting] = useState<{ state: 'idle' } | { state: 'loading' } | { state: 'error'; error: unknown } | { state: 'ready'; codes: Map<string, string> }>({ state: 'idle' });
    const [attempt, setAttempt] = useState(0);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<DepartmentRow[]>([]);
    const [order, setOrder] = useState<number[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
    const [haltReason, setHaltReason] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const cancelled = useRef(false);
    const keys = useRef(new Map<number, string>());
    /** Identifiant des départements créés pendant cet import, par ligne : les enfants s'y rattachent. */
    const created = useRef(new Map<number, string>());

    useEffect(() => {
        if (!institutionId || !api) { setExisting({ state: 'idle' }); return; }
        const controller = new AbortController();
        setExisting({ state: 'loading' });
        loadExisting(api, institutionId, controller.signal).then(codes => { if (!controller.signal.aborted) setExisting({ state: 'ready', codes }); })
            .catch(error => { if (!controller.signal.aborted) setExisting({ state: 'error', error }); });
        return () => controller.abort();
    }, [api, institutionId, attempt]);

    const valid = rows.filter(r => r.body);
    const invalid = rows.filter(r => !r.body);
    const doneCount = valid.filter(r => outcomes[r.line]?.state === 'ok').length;
    const failed = valid.filter(r => outcomes[r.line]?.state === 'error');
    const untouched = valid.filter(r => !outcomes[r.line]);
    const byLine = new Map(rows.map(r => [r.line, r]));
    const inOrder = (list: DepartmentRow[]) => [...list].sort((a, b) => order.indexOf(a.line) - order.indexOf(b.line));

    const chooseInstitution = (id: string) => { setInstitutionId(id); setProblem(null); };
    const load = async (file: File | undefined) => {
        if (!file || existing.state !== 'ready') return;
        setProblem(null);
        try {
            const parsed = parseDepartmentTable(await readSpreadsheet(file), existing.codes);
            if (parsed.fatal) { setProblem(parsed.fatal); return; }
            keys.current = new Map(); created.current = new Map(); setOutcomes({}); setHaltReason(null);
            setFileName(file.name); setRows(parsed.rows); setOrder(parsed.order); setStage('preview');
        } catch (error) { setProblem(error instanceof Error ? error.message : 'Lecture du fichier impossible.'); }
    };

    const run = async (targets: DepartmentRow[]) => {
        if (!api || !institutionId) return;
        cancelled.current = false; setHaltReason(null); setStage('running');
        let consecutive = 0;
        for (const row of inOrder(targets)) {
            if (cancelled.current) { setHaltReason('Import interrompu : les lignes restantes n’ont pas été traitées.'); break; }
            if (!row.body) continue;
            let parentId: string | null = null;
            if (row.parent?.kind === 'existing') parentId = row.parent.id;
            else if (row.parent?.kind === 'file') {
                const parent = row.parent;
                parentId = created.current.get(parent.line) ?? null;
                if (!parentId) {
                    setOutcomes(old => ({ ...old, [row.line]: { state: 'error', message: `Non créé : le parent « ${parent.code} » (ligne ${parent.line}) n’a pas été créé.` } }));
                    continue;
                }
            }
            // Une clé d'idempotence par ligne : rejouer une ligne dont le résultat est incertain ne peut pas créer de doublon.
            const key = keys.current.get(row.line) ?? crypto.randomUUID();
            keys.current.set(row.line, key);
            try {
                const result = await api.command<{ id?: string }>('/departments', { institutionId, parentId, code: row.body.code, nom: row.body.nom, typeUnite: row.body.typeUnite }, key, 'POST');
                if (result?.id) created.current.set(row.line, result.id);
                setOutcomes(old => ({ ...old, [row.line]: { state: 'ok' } }));
                consecutive = 0;
            } catch (error) {
                const e = error instanceof ApiError ? error : null;
                setOutcomes(old => ({ ...old, [row.line]: { state: 'error', message: e?.message ?? 'Erreur inattendue.', code: e?.code, uncertain: e?.uncertain } }));
                if (e && (e.status === 401 || e.status === 403)) { setHaltReason(e.status === 401 ? 'Session expirée : reconnectez-vous puis réessayez les lignes restantes.' : 'Droits insuffisants pour créer des départements dans cette institution : import arrêté.'); break; }
                consecutive = !e || e.status >= 500 || e.status === 0 ? consecutive + 1 : 0;
                if (consecutive >= MAX_CONSECUTIVE_FAILURES) { setHaltReason('Le serveur ne répond pas correctement : import arrêté. Réessayez plus tard.'); break; }
            }
        }
        setStage('done');
        void refresh();
        onDone();
    };

    const parentText = (r: DepartmentRow) => r.parent ? (r.parent.kind === 'existing' ? 'existant' : `ligne ${r.parent.line}`) : '';
    const report = () => {
        const table = [['Ligne', 'Code', 'Intitulé', 'Code du parent', 'Type d’unité', 'Résultat', 'Détail'], ...rows.map(r => {
            const o = outcomes[r.line];
            const result = !r.body ? 'Ignorée (invalide)' : o?.state === 'ok' ? 'Créé' : o?.state === 'error' ? 'Échec' : 'Non traité';
            return [String(r.line), r.code, r.nom, r.parentCode, r.typeUnite, result, !r.body ? r.errors.join(' ') : o?.message ?? ''];
        })];
        downloadBytes(buildXlsx([{ name: 'Rapport', rows: table, widths: [8, 18, 50, 18, 20, 20, 70] }]), 'rapport-import-departements.xlsx');
    };

    const close = () => { if (stage !== 'running') onClose(); };
    const ready = existing.state === 'ready';
    return <Modal title="Importer des départements depuis Excel" subtitle={stage === 'choose' ? 'Ajoutez plusieurs départements à une institution en une seule opération.' : fileName} onClose={close} locked={stage === 'running'} wide>
        <div className="imp">
            {stage === 'choose' && <>
                <ol className="imp-steps">
                    <li><strong>Choisissez l’institution</strong> à laquelle les départements du fichier seront rattachés.
                        <Field label="Institution"><InstitutionChoice value={institutionId} onChange={chooseInstitution} /></Field>
                        {existing.state === 'loading' && <Busy label="Lecture des départements existants…" />}
                        {existing.state === 'error' && <ErrorNotice error={existing.error} onRetry={() => setAttempt(n => n + 1)} />}
                        {ready && <small className="imp-note">{existing.codes.size === 0 ? 'Aucun département n’existe encore dans cette institution.' : `${existing.codes.size} département${existing.codes.size > 1 ? 's existent' : ' existe'} déjà : ils peuvent servir de parent.`}</small>}
                    </li>
                    <li><strong>Téléchargez le modèle</strong> et remplissez un département par ligne ; le « Code du parent » rattache un département à un autre.<button type="button" className="btn secondary small" onClick={() => downloadBytes(departmentTemplate(), 'modele-import-departements.xlsx')}><Icon name="download" size={16} />Télécharger le modèle Excel</button></li>
                    <li><strong>Importez le fichier</strong> (.xlsx ou .csv, {MAX_IMPORT_ROWS} lignes et 2 Mo maximum). Vous pourrez tout vérifier avant la création.</li>
                </ol>
                <label className={'imp-drop' + (dragging ? ' over' : '') + (ready ? '' : ' disabled')} aria-disabled={!ready} onDragOver={e => { e.preventDefault(); if (ready) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}>
                    <Icon name="upload" size={30} /><span><strong>Choisir un fichier</strong> ou le déposer ici</span><small>{ready ? 'Colonnes attendues : Code, Intitulé, Code du parent, Type d’unité' : 'Choisissez d’abord une institution'}</small>
                    <input type="file" disabled={!ready} accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {problem && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>Fichier non utilisable</strong><p>{problem}</p></div></div>}
            </>}

            {(stage === 'preview' || stage === 'running' || stage === 'done') && <>
                <p className="imp-note">Institution : <strong><EntityName kind="institutions" id={institutionId} fallback="sélectionnée" /></strong></p>
                <div className="imp-summary" role="status" aria-live="polite">
                    <span className="imp-count ok"><b>{valid.length}</b> prêt{valid.length > 1 ? 's' : ''}</span>
                    {invalid.length > 0 && <span className="imp-count warn"><b>{invalid.length}</b> ignoré{invalid.length > 1 ? 's' : ''} (erreurs)</span>}
                    {stage !== 'preview' && <><span className="imp-count ok"><b>{doneCount}</b> créé{doneCount > 1 ? 's' : ''}</span>{failed.length > 0 && <span className="imp-count bad"><b>{failed.length}</b> en échec</span>}{untouched.length > 0 && stage === 'done' && <span className="imp-count warn"><b>{untouched.length}</b> non traité{untouched.length > 1 ? 's' : ''}</span>}</>}
                </div>
                {stage === 'running' && <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={valid.length} aria-valuenow={doneCount + failed.length}><span style={{ width: valid.length ? ((doneCount + failed.length) * 100 / valid.length) + '%' : '0%' }} /></div>}
                {haltReason && <Notice tone="warning">{haltReason}</Notice>}
                {stage === 'preview' && invalid.length > 0 && <Notice tone="warning">Les lignes en erreur seront ignorées, ainsi que les départements qui en dépendent. Corrigez-les dans le fichier et réimportez-le pour les ajouter.</Notice>}
                <div className="table-scroll imp-table"><table>
                    <thead><tr><th scope="col">Ligne</th><th scope="col">Code</th><th scope="col">Intitulé</th><th scope="col">Parent</th><th scope="col">Type d’unité</th><th scope="col">{stage === 'preview' ? 'Contrôle' : 'Résultat'}</th></tr></thead>
                    <tbody>{rows.map(r => {
                        const o = outcomes[r.line];
                        return <tr key={r.line} className={!r.body ? 'imp-bad' : o?.state === 'error' ? 'imp-bad' : ''}>
                            <td>{r.line}</td><td><code>{r.body?.code ?? r.code}</code></td><td>{r.nom}</td>
                            <td>{r.parent ? <><code>{r.parent.code}</code><small className="cell-sub">{parentText(r)}{r.parent.kind === 'file' && !byLine.get(r.parent.line)?.body ? ' (ignoré)' : ''}</small></> : r.parentCode ? <code>{r.parentCode}</code> : '—'}</td>
                            <td>{display(r.typeUnite)}</td>
                            <td>{!r.body ? <span className="imp-tag bad"><Icon name="alert" size={13} />{r.errors.join(' ')}</span>
                                : o?.state === 'ok' ? <span className="imp-tag ok"><Icon name="check" size={13} />Créé</span>
                                : o?.state === 'error' ? <span className="imp-tag bad"><Icon name="alert" size={13} />{o.message}{o.uncertain ? ' (résultat incertain : réessayez, aucun doublon ne sera créé)' : ''}</span>
                                : stage === 'preview' ? <span className="imp-tag ok"><Icon name="check" size={13} />Valide</span>
                                : <span className="imp-tag idle">{stage === 'running' ? 'En attente…' : 'Non traité'}</span>}</td></tr>;
                    })}</tbody>
                </table></div>
            </>}
        </div>
        <footer className="modal-footer">
            {stage === 'choose' && <button type="button" className="btn secondary" onClick={onClose}>Annuler</button>}
            {stage === 'preview' && <><button type="button" className="btn secondary" onClick={() => { setStage('choose'); setRows([]); setOrder([]); }}>Choisir un autre fichier</button>
                <button type="button" className="btn primary" disabled={!valid.length} onClick={() => void run(valid)}><Icon name="check" size={17} />Importer {valid.length} département{valid.length > 1 ? 's' : ''}</button></>}
            {stage === 'running' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Interrompre</button>}
            {stage === 'done' && <><button type="button" className="btn secondary" onClick={report}><Icon name="download" size={16} />Télécharger le rapport</button>
                {failed.length + untouched.length > 0 && <button type="button" className="btn secondary" onClick={() => void run([...failed, ...untouched])}><Icon name="refresh" size={16} />Réessayer {failed.length + untouched.length} ligne{failed.length + untouched.length > 1 ? 's' : ''}</button>}
                <button type="button" className="btn primary" onClick={onClose}>Terminer</button></>}
        </footer>
    </Modal>;
}
