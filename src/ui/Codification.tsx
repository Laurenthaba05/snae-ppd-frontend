import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { Busy, ErrorNotice, Field, Modal, Notice, PageHead, useResource } from './components';
import { EntityName } from './names';
import {
    KIND_LABELS, MODE_LABELS, STARTERS, patternOf, segmentLabel,
    type CodificationKind, type CodificationMode, type CodificationModel, type CodificationSegment, type SegmentType
} from '../core/codification';

const KINDS: CodificationKind[] = ['DOCUMENT', 'DOSSIER', 'NOTICE'];
const TYPES: SegmentType[] = ['TEXTE', 'ANNEE', 'CLASSEMENT', 'PARENT', 'COMPTEUR'];
/** Les textes de chaque objet, écrits en entier (et non composés) pour que l'interface anglaise puisse les traduire. */
const TEXTS: Record<CodificationKind, { what: string; title: string; define: string; edit: string; remove: string }> = {
    DOCUMENT: { what: 'Comment s’écrit la référence d’un document (son identifiant métier)', title: 'Modèle de codification : documents', define: 'Définir un modèle pour les documents', edit: 'Modifier le modèle des documents', remove: 'Retirer le modèle des documents' },
    DOSSIER: { what: 'Comment s’écrit la référence d’un dossier', title: 'Modèle de codification : dossiers', define: 'Définir un modèle pour les dossiers', edit: 'Modifier le modèle des dossiers', remove: 'Retirer le modèle des dossiers' },
    NOTICE: { what: 'Comment s’écrit le code d’une notice de description (fonds, série, dossier, pièce)', title: 'Modèle de codification : notices de description', define: 'Définir un modèle pour les notices de description', edit: 'Modifier le modèle des notices de description', remove: 'Retirer le modèle des notices de description' }
};

/**
 * La codification guidée des références : l'institution du périmètre décrit, pour ses documents, ses dossiers et ses notices de description, comment s'écrit une référence. Aucun
 * modèle n'est livré : sans modèle, la référence reste libre.
 */
export function CodificationPage() {
    const { me, codification, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    const canManage = !!institutionId && can(me, 'CODIFICATION_MANAGE', scope);
    const [editing, setEditing] = useState<CodificationKind | null>(null);
    const [removing, setRemoving] = useState<CodificationKind | null>(null);
    const modelsQ = useResource<CodificationModel[]>(s => institutionId && canManage ? codification!.models(institutionId, s) : Promise.resolve([]), `codification-models:${institutionId}:${canManage}:${epoch}`);
    const byKind = new Map((modelsQ.data ?? []).map(m => [m.kind, m]));
    return <>
        <PageHead eyebrow="MODULE · ARCHIVES" title="Codification des références" description="Décrire, pour l’institution, comment s’écrivent les références des documents, des dossiers et des notices de description : le système propose la suivante et vérifie ce qui est saisi." />
        {!institutionId ? <Notice tone="warning">Choisissez une institution dans le périmètre de travail : les modèles de codification sont ceux d’une institution.</Notice>
            : !canManage ? <Notice tone="warning">Cette section exige l’habilitation de gestion de la codification pour cette institution.</Notice>
                : <div className="panel">
                    <div className="section-heading"><h2>Modèles de <EntityName kind="institutions" id={institutionId} fallback="l’institution" /></h2></div>
                    {modelsQ.loading ? <Busy /> : modelsQ.error ? <ErrorNotice error={modelsQ.error} onRetry={modelsQ.refresh} /> : <div className="table-scroll"><table>
                        <thead><tr><th>Objet</th><th>Modèle</th><th>Mode</th><th>Exemple</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{KINDS.map(kind => { const m = byKind.get(kind); return <tr key={kind}>
                            <td><strong>{KIND_LABELS[kind]}</strong>{m?.label ? <small className="cell-sub">{m.label}</small> : null}</td>
                            <td>{m ? <code>{m.pattern}</code> : 'Aucun modèle : la référence est libre'}</td>
                            <td>{m ? MODE_LABELS[m.mode] : '—'}</td>
                            <td>{m ? m.example : '—'}</td>
                            <td><div className="table-actions">
                                <button className="btn small secondary" onClick={() => setEditing(kind)} aria-label={m ? TEXTS[kind].edit : TEXTS[kind].define}>{m ? 'Modifier' : 'Définir'}</button>
                                {m && <button className="btn small warning" onClick={() => setRemoving(kind)} aria-label={TEXTS[kind].remove}>Retirer</button>}
                            </div></td></tr>; })}</tbody></table></div>}
                    <p className="panel-footnote">Le modèle <strong>indicatif</strong> guide la saisie (proposition de la référence suivante, avertissement) sans rien refuser ; le modèle <strong>obligatoire</strong> refuse à la création une référence qui ne le respecte pas, y compris à l’import. Les références déjà enregistrées ne changent jamais.</p>
                </div>}
        {editing && institutionId && <ModelDialog kind={editing} institutionId={institutionId} model={byKind.get(editing) ?? null} onClose={() => setEditing(null)} onSaved={modelsQ.refresh} />}
        {removing && institutionId && <RemoveDialog kind={removing} institutionId={institutionId} onClose={() => setRemoving(null)} onDone={modelsQ.refresh} />}
    </>;
}

type Row = CodificationSegment & { key: number };

function ModelDialog({ kind, institutionId, model, onClose, onSaved }: { kind: CodificationKind; institutionId: string; model: CodificationModel | null; onClose: () => void; onSaved: () => void }) {
    const { codification } = useSession();
    const counter = React.useRef(0);
    const withKeys = (segments: CodificationSegment[]): Row[] => segments.map(s => ({ ...s, key: counter.current++ }));
    const [label, setLabel] = useState(model?.label ?? '');
    const [mode, setMode] = useState<CodificationMode>(model?.mode ?? 'INDICATIF');
    const [rows, setRows] = useState<Row[]>(() => withKeys(model?.segments ?? STARTERS[0]!.segments(kind)));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const change = (key: number, patch: Partial<CodificationSegment>) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
    const move = (index: number, delta: -1 | 1) => setRows(prev => { const next = [...prev]; const t = index + delta; if (t < 0 || t >= next.length) return prev; [next[index], next[t]] = [next[t]!, next[index]!]; return next; });
    // le compteur reprend son nombre de chiffres par défaut (4) : l'ancien type ne laisse rien derrière lui
    const retype = (key: number, type: SegmentType) => change(key, { type, value: type === 'TEXTE' ? '' : null, digits: null });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try {
            const segments = rows.map(({ key: _key, ...s }) => ({ type: s.type, ...(s.type === 'TEXTE' ? { value: s.value ?? '' } : {}), ...(s.type === 'COMPTEUR' ? { digits: s.digits ?? 4 } : {}) }));
            await codification!.saveModel(kind, { institutionId, label: label.trim() || null, segments, mode }, crypto.randomUUID());
            onSaved(); onClose();
        } catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title={TEXTS[kind].title} subtitle={TEXTS[kind].what} onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Libellé" hint="Facultatif : à quoi sert ce modèle." wide><input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} disabled={busy} /></Field>
                <Field label="Mode" hint="Indicatif : on guide sans refuser. Obligatoire : une référence non conforme est refusée à la création, import compris."><select value={mode} onChange={e => setMode(e.target.value as CodificationMode)} disabled={busy}>
                    <option value="INDICATIF">Indicatif</option><option value="OBLIGATOIRE">Obligatoire</option></select></Field>
                <Field label="Partir d’un exemple" hint="Remplace les pièces ci-dessous ; rien n’est enregistré avant « Enregistrer »."><select value="" onChange={e => { const s = STARTERS.find(x => x.id === e.target.value); if (s) setRows(withKeys(s.segments(kind))); }} disabled={busy}>
                    <option value="">Choisir…</option>{STARTERS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
                <div className="span2"><h4>Pièces de la référence, dans l’ordre</h4>
                    {rows.map((r, i) => { const n = i + 1; return <div key={r.key} role="group" aria-label={`Pièce ${n}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                        <div className="field" style={{ flex: '1 1 190px' }}><select aria-label={`Type de la pièce ${n}`} value={r.type} onChange={e => retype(r.key, e.target.value as SegmentType)} disabled={busy}>{TYPES.map(t => <option key={t} value={t}>{segmentLabel(t, kind)}</option>)}</select></div>
                        {r.type === 'TEXTE' && <div className="field" style={{ flex: '1 1 120px' }}><input aria-label={`Texte de la pièce ${n}`} value={r.value ?? ''} maxLength={40} onChange={e => change(r.key, { value: e.target.value })} disabled={busy} placeholder="ARC, -, /…" /></div>}
                        {r.type === 'COMPTEUR' && <div className="field" style={{ flex: '0 1 100px' }}><input aria-label={`Chiffres du compteur de la pièce ${n}`} type="number" min={1} max={9} value={r.digits ?? 4} onChange={e => change(r.key, { digits: Number(e.target.value) })} disabled={busy} /></div>}
                        <button type="button" className="btn small secondary" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Monter la pièce ${n}`}>Monter</button>
                        <button type="button" className="btn small secondary" onClick={() => move(i, 1)} disabled={busy || i === rows.length - 1} aria-label={`Descendre la pièce ${n}`}>Descendre</button>
                        <button type="button" className="btn small warning" onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))} disabled={busy} aria-label={`Retirer la pièce ${n}`}>Retirer</button>
                    </div>; })}
                    <button type="button" className="btn small secondary" onClick={() => setRows(prev => [...prev, ...withKeys([{ type: 'TEXTE', value: '' }])])} disabled={busy || rows.length >= 8}>Ajouter une pièce</button>
                </div>
                <div className="span2"><Notice>Aperçu : <code>{patternOf(rows) || '—'}</code>. Le texte fixe se met en majuscules ; l’année s’écrit sur quatre chiffres ; le compteur reprend après le plus grand numéro déjà employé (par année et par contenant quand le modèle les contient), sans combler les trous.</Notice></div>
            </div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || rows.length === 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

function RemoveDialog({ kind, institutionId, onClose, onDone }: { kind: CodificationKind; institutionId: string; onClose: () => void; onDone: () => void }) {
    const { codification } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const remove = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try { await codification!.removeModel(kind, institutionId, crypto.randomUUID()); onDone(); onClose(); }
        catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title="Retirer ce modèle ?" onClose={onClose} locked={busy}>
        <p>Objet concerné : <strong>{KIND_LABELS[kind]}</strong>.</p>
        <p>Les références redeviennent libres : plus de proposition, plus de contrôle. Les références déjà enregistrées ne changent pas.</p>
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="button" className="btn warning" onClick={remove} disabled={busy}>Retirer le modèle</button></footer>
    </Modal>;
}
