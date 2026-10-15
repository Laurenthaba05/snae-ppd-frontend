import React, { useId, useRef, useState } from 'react';
import { type ArchivesApi, type AuthorityView, type DescriptionView, commandKey } from '../api/archives';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import {
    DETAIL_LABELS, KIND_LABELS, NATURE_LABELS, STATUS_LABELS, TARGET_LABELS, emptyFunction, flattenFunctions, functionProblems, kindsUnder, naturesFor, parentCandidates,
    type FunctionDetailView, type FunctionInput, type FunctionKind, type FunctionLinkNature, type FunctionLinkTarget, type FunctionView
} from '../core/archivalFunctions';

/**
 * Description des fonctions (ISDF) : ce que les services exercent et qui produit des archives. Une fonction se range sous une fonction plus haute, se relie à une autre fonction,
 * à la notice du producteur qui l'exerce et aux fonds qui la documentent.
 */
export function ArchivalFunctionsPanel({ api, institution, descriptions, authorities, canManage }: {
    api: ArchivesApi; institution: string; descriptions: DescriptionView[]; authorities: AuthorityView[]; canManage: boolean;
}) {
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<FunctionView | 'new' | null>(null);
    const [done, setDone] = useState('');
    const q = useResource<FunctionView[]>(s => api.functions(institution, s), `functions:${institution}:${revision}`);
    const rows = q.data ?? [];
    return <div className="panel">
        <div className="section-heading"><h3>Fonctions et activités (ISDF)</h3>
            {canManage && <button type="button" className="btn small primary" onClick={() => setEditing('new')}>Créer une fonction</button>}</div>
        <div className="panel-padding">
            <p><small>Une fonction dit <strong>pourquoi</strong> des archives sont produites : elle se range sous une fonction plus haute (fonction, sous-fonction, activité, tâche), se relie
                à la notice du producteur qui l’exerce et aux fonds qui la documentent.</small></p>
            {done && <Notice>{done}</Notice>}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : rows.length === 0
                ? <Empty title="Aucune fonction décrite" description="Commencez par les grandes fonctions du service, puis leurs activités." />
                : <div className="table-scroll"><table><thead><tr><th>Code et nom</th><th>Type</th><th>État</th><th>Période</th><th>Actions</th></tr></thead>
                    <tbody>{flattenFunctions(rows).map(({ row, depth }) => <tr key={row.id}>
                        <td style={{ paddingLeft: 16 + depth * 22 }}><strong>{row.input.code}</strong> · {row.input.name}</td>
                        <td>{KIND_LABELS[row.input.kind]}</td><td>{STATUS_LABELS[row.input.status]}</td>
                        <td>{[row.input.dateStart, row.input.dateEnd].filter(Boolean).join(' — ') || '—'}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setEditing(row)}>{canManage ? 'Consulter / modifier' : 'Consulter'}</button></td>
                    </tr>)}</tbody></table></div>}
        </div>
        {editing && <FunctionEditor api={api} institution={institution} row={editing === 'new' ? null : editing} all={rows} descriptions={descriptions} authorities={authorities}
            readOnly={!canManage} onClose={() => setEditing(null)} onSaved={message => { setDone(message); setRevision(n => n + 1); }} />}
    </div>;
}

function FunctionEditor({ api, institution, row, all, descriptions, authorities, readOnly, onClose, onSaved }: {
    api: ArchivesApi; institution: string; row: FunctionView | null; all: FunctionView[]; descriptions: DescriptionView[]; authorities: AuthorityView[];
    readOnly: boolean; onClose: () => void; onSaved: (message: string) => void;
}) {
    const formId = useId();
    const [draft, setDraft] = useState<FunctionInput>(() => row ? { ...row.input, version: row.version } : emptyFunction(institution));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const [attempted, setAttempted] = useState(false);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const detail = useResource<FunctionDetailView | null>(s => row ? api.functionDetail(row.id, s) : Promise.resolve(null), `function:${row?.id ?? 'new'}`);
    const last = useRef<FunctionDetailView | null>(null);
    if (detail.data) last.current = detail.data;
    const current = detail.data ?? last.current;
    const parentKind = draft.parentId ? all.find(f => f.id === draft.parentId)?.input.kind ?? null : null;
    const kinds = kindsUnder(parentKind);
    // toute fonction qui n'est ni elle-même ni sa descendante peut être mère ; c'est le niveau qui s'ajuste à la mère choisie
    const parents = parentCandidates(all, 'AUTRE', row?.id ?? null);
    const chooseParent = (parentId: string | null) => setDraft(d => {
        const allowed = kindsUnder(parentId ? all.find(f => f.id === parentId)?.input.kind ?? null : null);
        return { ...d, parentId, kind: allowed.includes(d.kind) ? d.kind : allowed[0]! };
    });
    const problems = functionProblems(draft);
    const change = <K extends keyof FunctionInput>(key: K, value: FunctionInput[K]) => setDraft(d => ({ ...d, [key]: value }));
    const text = (key: keyof FunctionInput) => (draft[key] as string | null) ?? '';
    const setText = (key: keyof FunctionInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => change(key, (e.target.value || null) as never);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (readOnly || busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(undefined);
        intention.current = commandKey(intention.current, draft);
        try {
            await api.saveFunction(row?.id, draft, intention.current.key);
            onSaved(row ? 'Fonction enregistrée.' : 'Fonction créée.');
            onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!row || busy) return;
        setBusy(true); setError(undefined);
        try { await api.deleteFunction(row.id, institution, row.version, crypto.randomUUID()); onSaved('Fonction supprimée.'); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const disabled = busy || readOnly;
    return <Modal wide title={row ? 'Fonction' : 'Nouvelle fonction'} subtitle={current && current.ancestors.length ? current.ancestors.map(a => a.name).join(' › ') : undefined} onClose={onClose} locked={busy}>
        <form id={formId} onSubmit={submit}><div className="form-grid">
            <h4 className="form-section span2">Identification</h4>
            <Field label="Code *"><input maxLength={100} value={draft.code} disabled={disabled} onChange={e => change('code', e.target.value)} /></Field>
            <Field label="Forme autorisée du nom *"><input maxLength={500} value={draft.name} disabled={disabled} onChange={e => change('name', e.target.value)} /></Field>
            <Field label="Type"><select value={draft.kind} disabled={disabled} onChange={e => change('kind', e.target.value as FunctionKind)}>
                {kinds.concat(kinds.includes(draft.kind) ? [] : [draft.kind]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></Field>
            <Field label="Fonction mère" hint="Un niveau se place sous un niveau plus haut."><select value={draft.parentId ?? ''} disabled={disabled} onChange={e => chooseParent(e.target.value || null)}>
                <option value="">Aucune (fonction de premier niveau)</option>{parents.map(p => <option key={p.id} value={p.id}>{p.input.code} · {p.input.name}</option>)}</select></Field>
            <Field label="Formes parallèles du nom" wide hint="Une par ligne : le nom dans une autre langue."><textarea rows={2} maxLength={10000} value={text('parallelNames')} disabled={disabled} onChange={setText('parallelNames')} /></Field>
            <Field label="Autres formes du nom" wide hint="Une par ligne."><textarea rows={2} maxLength={10000} value={text('otherNames')} disabled={disabled} onChange={setText('otherNames')} /></Field>
            <Field label="Classification" wide hint="La place de la fonction dans un plan de classement ou un cadre de référence."><input maxLength={500} value={text('classification')} disabled={disabled} onChange={setText('classification')} /></Field>
            <h4 className="form-section span2">Contexte</h4>
            <Field label="Date de début" hint="AAAA, AAAA-MM ou AAAA-MM-JJ."><input value={text('dateStart')} maxLength={10} disabled={disabled} onChange={setText('dateStart')} /></Field>
            <Field label="Date de fin"><input value={text('dateEnd')} maxLength={10} disabled={disabled} onChange={setText('dateEnd')} /></Field>
            <Field label="Description" wide><textarea rows={3} maxLength={10000} value={text('description')} disabled={disabled} onChange={setText('description')} /></Field>
            <Field label="Historique" wide><textarea rows={3} maxLength={10000} value={text('history')} disabled={disabled} onChange={setText('history')} /></Field>
            <Field label="Textes qui l’instituent" wide hint="Lois, décrets, arrêtés."><textarea rows={2} maxLength={10000} value={text('legislation')} disabled={disabled} onChange={setText('legislation')} /></Field>
            <h4 className="form-section span2">Contrôle de la description</h4>
            <Field label="État de rédaction"><select value={draft.status} disabled={disabled} onChange={e => change('status', e.target.value as FunctionInput['status'])}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Niveau de détail"><select value={draft.detailLevel ?? ''} disabled={disabled} onChange={e => change('detailLevel', (e.target.value || null) as FunctionInput['detailLevel'])}>
                <option value="">Non précisé</option>{Object.entries(DETAIL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Règles ou conventions appliquées" wide><textarea rows={2} maxLength={10000} value={text('rules')} disabled={disabled} onChange={setText('rules')} /></Field>
            <Field label="Langue" hint="Codes : fr, fr+en."><input maxLength={40} value={text('language')} disabled={disabled} onChange={setText('language')} /></Field>
            <Field label="Sources" wide hint="Exigées pour une description validée."><textarea rows={2} maxLength={10000} value={text('sources')} disabled={disabled} onChange={setText('sources')} /></Field>
            <Field label="Notes de mise à jour" wide><textarea rows={2} maxLength={10000} value={text('maintenanceNotes')} disabled={disabled} onChange={setText('maintenanceNotes')} /></Field>
        </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {error ? <ErrorNotice error={error} /> : null}
        </form>
        {row && <FunctionLinks api={api} institution={institution} functionId={row.id} detail={current} all={all} descriptions={descriptions} authorities={authorities} readOnly={readOnly}
            onChanged={detail.refresh} />}
        <footer className="modal-footer">
            {row && !readOnly && <button type="button" className="btn danger-outline" disabled={busy} onClick={remove}>Supprimer</button>}
            <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>
            {!readOnly && <button type="submit" form={formId} className="btn primary" disabled={busy}>Enregistrer</button>}
        </footer>
    </Modal>;
}

function FunctionLinks({ api, institution, functionId, detail, all, descriptions, authorities, readOnly, onChanged }: {
    api: ArchivesApi; institution: string; functionId: string; detail: FunctionDetailView | null; all: FunctionView[]; descriptions: DescriptionView[]; authorities: AuthorityView[];
    readOnly: boolean; onChanged: () => void;
}) {
    const [target, setTarget] = useState<FunctionLinkTarget>('AUTHORITY');
    const [targetId, setTargetId] = useState('');
    const [nature, setNature] = useState<FunctionLinkNature>('EXERCEE_PAR');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const options: Array<{ id: string; label: string }> = target === 'FUNCTION' ? all.filter(f => f.id !== functionId).map(f => ({ id: f.id, label: `${f.input.code} · ${f.input.name}` }))
        : target === 'AUTHORITY' ? authorities.map(a => ({ id: a.id, label: `${a.input.code} · ${a.input.name}` }))
            : descriptions.map(d => ({ id: d.id, label: `${d.input.code} · ${d.input.title}` }));
    const chooseTarget = (value: FunctionLinkTarget) => { setTarget(value); setTargetId(''); setNature(naturesFor(value)[0]!); };
    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !targetId) return;
        setBusy(true); setError(undefined);
        try {
            await api.addFunctionLink({ institutionId: institution, functionId, targetKind: target, targetId, nature, dateStart: dateStart.trim() || null, dateEnd: dateEnd.trim() || null, description: null }, crypto.randomUUID());
            setTargetId(''); setDateStart(''); setDateEnd('');
            onChanged();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const remove = async (id: string, version: number) => {
        setBusy(true); setError(undefined);
        try { await api.removeFunctionLink(id, institution, version, crypto.randomUUID()); onChanged(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const links = detail?.links ?? [];
    return <section aria-label="Liens de la fonction" className="panel-padding">
        <h4 className="form-section">Liens</h4>
        {links.length === 0 ? <p><small>Cette fonction n’est reliée à aucune autre fonction, aucun producteur ni aucun fonds.</small></p>
            : <ul className="plain-list">{links.map(l => <li key={l.id}>
                <strong>{NATURE_LABELS[l.input.nature]}</strong> · {l.targetLabel ?? '—'} <small>({TARGET_LABELS[l.input.targetKind]}{l.input.dateStart ? `, depuis ${l.input.dateStart}` : ''}{l.input.dateEnd ? ` jusqu’à ${l.input.dateEnd}` : ''})</small>
                {!readOnly && <> <button type="button" className="btn small danger-outline" disabled={busy} onClick={() => void remove(l.id, l.version)}>Retirer</button></>}
            </li>)}</ul>}
        {detail && detail.children.length > 0 && <p><small>Contient : {detail.children.map(c => `${c.code} · ${c.name}`).join(' ; ')}.</small></p>}
        {!readOnly && <form onSubmit={add} aria-label="Ajouter un lien"><div className="form-grid">
            <Field label="Relier à"><select value={target} disabled={busy} onChange={e => chooseTarget(e.target.value as FunctionLinkTarget)}>
                {Object.entries(TARGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Nature du lien"><select value={nature} disabled={busy} onChange={e => setNature(e.target.value as FunctionLinkNature)}>
                {naturesFor(target).map(n => <option key={n} value={n}>{NATURE_LABELS[n]}</option>)}</select></Field>
            <Field label="Cible" wide><select value={targetId} disabled={busy} onChange={e => setTargetId(e.target.value)}>
                <option value="">Choisir…</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
            <Field label="Depuis" hint="AAAA, AAAA-MM ou AAAA-MM-JJ."><input maxLength={10} value={dateStart} disabled={busy} onChange={e => setDateStart(e.target.value)} /></Field>
            <Field label="Jusqu’à"><input maxLength={10} value={dateEnd} disabled={busy} onChange={e => setDateEnd(e.target.value)} /></Field>
        </div>
            {error ? <ErrorNotice error={error} /> : null}
            <button type="submit" className="btn small secondary" disabled={busy || !targetId}>Ajouter le lien</button>
        </form>}
    </section>;
}
