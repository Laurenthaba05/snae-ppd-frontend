import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { buildXlsx, downloadBytes, readSpreadsheet } from '../core/spreadsheet';
import { INSTITUTION_TYPES, MAX_IMPORT_ROWS, institutionTemplate, parseInstitutionTable, type ImportRow } from '../core/institutionImport';
import { Modal, Notice } from './components';
import { Icon } from './icons';

type Stage = 'choose' | 'preview' | 'running' | 'done';
interface Outcome { state: 'ok' | 'error'; message?: string; code?: string; uncertain?: boolean }
const typeLabel = (code: string) => INSTITUTION_TYPES.find(t => t.code === code)?.label ?? code;
/** Arrêt après autant d'échecs serveur/réseau consécutifs : inutile d'insister si le service est indisponible. */
const MAX_CONSECUTIVE_FAILURES = 5;

export function InstitutionImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { api, refresh } = useSession();
    const [stage, setStage] = useState<Stage>('choose');
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
    const [haltReason, setHaltReason] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const cancelled = useRef(false);
    const keys = useRef(new Map<number, string>());

    const valid = rows.filter(r => r.body);
    const invalid = rows.filter(r => !r.body);
    const created = valid.filter(r => outcomes[r.line]?.state === 'ok').length;
    const failed = valid.filter(r => outcomes[r.line]?.state === 'error');
    const untouched = valid.filter(r => !outcomes[r.line]);

    const load = async (file: File | undefined) => {
        if (!file) return;
        setProblem(null);
        try {
            const parsed = parseInstitutionTable(await readSpreadsheet(file));
            if (parsed.fatal) { setProblem(parsed.fatal); return; }
            keys.current = new Map(); setOutcomes({}); setHaltReason(null);
            setFileName(file.name); setRows(parsed.rows); setStage('preview');
        } catch (error) { setProblem(error instanceof Error ? error.message : 'Lecture du fichier impossible.'); }
    };

    const run = async (targets: ImportRow[]) => {
        if (!api) return;
        cancelled.current = false; setHaltReason(null); setStage('running');
        let consecutive = 0;
        for (const row of targets) {
            if (cancelled.current) { setHaltReason('Import interrompu : les lignes restantes n’ont pas été traitées.'); break; }
            if (!row.body) continue;
            // Une clé d'idempotence par ligne : rejouer une ligne dont le résultat est incertain ne peut pas créer de doublon.
            const key = keys.current.get(row.line) ?? crypto.randomUUID();
            keys.current.set(row.line, key);
            try {
                await api.command('/institutions', row.body, key, 'POST');
                setOutcomes(old => ({ ...old, [row.line]: { state: 'ok' } }));
                consecutive = 0;
            } catch (error) {
                const e = error instanceof ApiError ? error : null;
                setOutcomes(old => ({ ...old, [row.line]: { state: 'error', message: e?.message ?? 'Erreur inattendue.', code: e?.code, uncertain: e?.uncertain } }));
                if (e && (e.status === 401 || e.status === 403)) { setHaltReason(e.status === 401 ? 'Session expirée : reconnectez-vous puis réessayez les lignes restantes.' : 'Droits insuffisants pour créer des institutions : import arrêté.'); break; }
                consecutive = !e || e.status >= 500 || e.status === 0 ? consecutive + 1 : 0;
                if (consecutive >= MAX_CONSECUTIVE_FAILURES) { setHaltReason('Le serveur ne répond pas correctement : import arrêté. Réessayez plus tard.'); break; }
            }
        }
        setStage('done');
        void refresh();
        onDone();
    };

    const report = () => {
        const table = [['Ligne', 'Code', 'Intitulé', 'Sigle', 'Type', 'Résultat', 'Détail'], ...rows.map(r => {
            const o = outcomes[r.line];
            const result = !r.body ? 'Ignorée (invalide)' : o?.state === 'ok' ? 'Créée' : o?.state === 'error' ? 'Échec' : 'Non traitée';
            return [String(r.line), r.code, r.nom, r.sigle, r.type, result, !r.body ? r.errors.join(' ') : o?.message ?? ''];
        })];
        downloadBytes(buildXlsx([{ name: 'Rapport', rows: table, widths: [8, 18, 50, 14, 24, 20, 70] }]), 'rapport-import-institutions.xlsx');
    };

    const close = () => { if (stage !== 'running') onClose(); };
    return <Modal title="Importer des institutions depuis Excel" subtitle={stage === 'choose' ? 'Ajoutez plusieurs institutions en une seule opération.' : fileName} onClose={close} locked={stage === 'running'} wide>
        <div className="imp">
            {stage === 'choose' && <>
                <ol className="imp-steps">
                    <li><strong>Téléchargez le modèle</strong> et remplissez une institution par ligne.<button type="button" className="btn secondary small" onClick={() => downloadBytes(institutionTemplate(), 'modele-import-institutions.xlsx')}><Icon name="download" size={16} />Télécharger le modèle Excel</button></li>
                    <li><strong>Importez le fichier</strong> (.xlsx ou .csv, {MAX_IMPORT_ROWS} lignes et 2 Mo maximum). Vous pourrez tout vérifier avant la création.</li>
                </ol>
                <label className={'imp-drop' + (dragging ? ' over' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}>
                    <Icon name="upload" size={30} /><span><strong>Choisir un fichier</strong> ou le déposer ici</span><small>Colonnes attendues : Code, Intitulé, Sigle, Type</small>
                    <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {problem && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>Fichier non utilisable</strong><p>{problem}</p></div></div>}
            </>}

            {(stage === 'preview' || stage === 'running' || stage === 'done') && <>
                <div className="imp-summary" role="status" aria-live="polite">
                    <span className="imp-count ok"><b>{valid.length}</b> prête{valid.length > 1 ? 's' : ''}</span>
                    {invalid.length > 0 && <span className="imp-count warn"><b>{invalid.length}</b> ignorée{invalid.length > 1 ? 's' : ''} (erreurs)</span>}
                    {stage !== 'preview' && <><span className="imp-count ok"><b>{created}</b> créée{created > 1 ? 's' : ''}</span>{failed.length > 0 && <span className="imp-count bad"><b>{failed.length}</b> en échec</span>}{untouched.length > 0 && stage === 'done' && <span className="imp-count warn"><b>{untouched.length}</b> non traitée{untouched.length > 1 ? 's' : ''}</span>}</>}
                </div>
                {stage === 'running' && <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={valid.length} aria-valuenow={created + failed.length}><span style={{ width: valid.length ? ((created + failed.length) * 100 / valid.length) + '%' : '0%' }} /></div>}
                {haltReason && <Notice tone="warning">{haltReason}</Notice>}
                {stage === 'preview' && invalid.length > 0 && <Notice tone="warning">Les lignes en erreur seront ignorées. Corrigez-les dans le fichier et réimportez-le pour les ajouter.</Notice>}
                <div className="table-scroll imp-table"><table>
                    <thead><tr><th scope="col">Ligne</th><th scope="col">Code</th><th scope="col">Intitulé</th><th scope="col">Sigle</th><th scope="col">Type</th><th scope="col">{stage === 'preview' ? 'Contrôle' : 'Résultat'}</th></tr></thead>
                    <tbody>{rows.map(r => {
                        const o = outcomes[r.line];
                        return <tr key={r.line} className={!r.body ? 'imp-bad' : o?.state === 'error' ? 'imp-bad' : ''}>
                            <td>{r.line}</td><td><code>{r.body?.code ?? r.code}</code></td><td>{r.nom}</td><td>{r.sigle || '—'}</td><td>{r.body ? typeLabel(r.body.typeInstitution) : r.type || '—'}</td>
                            <td>{!r.body ? <span className="imp-tag bad"><Icon name="alert" size={13} />{r.errors.join(' ')}</span>
                                : o?.state === 'ok' ? <span className="imp-tag ok"><Icon name="check" size={13} />Créée</span>
                                : o?.state === 'error' ? <span className="imp-tag bad"><Icon name="alert" size={13} />{o.message}{o.uncertain ? ' (résultat incertain : réessayez, aucun doublon ne sera créé)' : ''}</span>
                                : stage === 'preview' ? <span className="imp-tag ok"><Icon name="check" size={13} />Valide</span>
                                : <span className="imp-tag idle">{stage === 'running' ? 'En attente…' : 'Non traitée'}</span>}</td></tr>;
                    })}</tbody>
                </table></div>
            </>}
        </div>
        <footer className="modal-footer">
            {stage === 'choose' && <button type="button" className="btn secondary" onClick={onClose}>Annuler</button>}
            {stage === 'preview' && <><button type="button" className="btn secondary" onClick={() => { setStage('choose'); setRows([]); }}>Choisir un autre fichier</button>
                <button type="button" className="btn primary" disabled={!valid.length} onClick={() => void run(valid)}><Icon name="check" size={17} />Importer {valid.length} institution{valid.length > 1 ? 's' : ''}</button></>}
            {stage === 'running' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Interrompre</button>}
            {stage === 'done' && <><button type="button" className="btn secondary" onClick={report}><Icon name="download" size={16} />Télécharger le rapport</button>
                {failed.length + untouched.length > 0 && <button type="button" className="btn secondary" onClick={() => void run([...failed, ...untouched])}><Icon name="refresh" size={16} />Réessayer {failed.length + untouched.length} ligne{failed.length + untouched.length > 1 ? 's' : ''}</button>}
                <button type="button" className="btn primary" onClick={onClose}>Terminer</button></>}
        </footer>
    </Modal>;
}
