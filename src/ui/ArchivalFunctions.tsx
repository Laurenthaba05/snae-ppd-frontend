import { FunctionLinks } from './FunctionLinks';
import { ArchiveBrowse } from './ArchiveBrowse';
import { ArchiveImport } from './ArchiveCsvImport';
import { saveBlob } from './download';
import React, { useId, useRef, useState } from 'react';
import { type ArchivesApi, type AuthorityView, type DescriptionView, commandKey } from '../api/archives';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import {
    DETAIL_LABELS, KIND_LABELS, STATUS_LABELS, emptyFunction, functionProblems, kindsUnder, parentCandidates,
    type FunctionDetailView, type FunctionInput, type FunctionKind, type FunctionView
} from '../core/archivalFunctions';

/**
 * Description des fonctions (ISDF) : ce que les services exercent et qui produit des archives. Une fonction se range sous une fonction plus haute, se relie à une autre fonction,
 * à la notice du producteur qui l'exerce et aux fonds qui la documentent.
 */
export function ArchivalFunctionsPanel({ api, institution, descriptions, authorities, canManage, canExport = false }: {
    api: ArchivesApi; institution: string; descriptions?: DescriptionView[]; authorities?: AuthorityView[]; canManage: boolean; canExport?: boolean;
}) {
    const [revision, setRevision] = useState(0);
    const [importing, setImporting] = useState<'functions' | 'function-links' | null>(null); const [exportBusy, setExportBusy] = useState(false); const [exportError, setExportError] = useState<unknown>();
    const exportCsv = async (kind: 'functions' | 'function-links' = 'functions') => { setExportBusy(true); setExportError(undefined); try { saveBlob(await api.file(`export/${kind}?institutionId=${institution}`), kind === 'functions' ? 'fonctions.csv' : 'liens-fonctions.csv'); } catch (e) { setExportError(e); } finally { setExportBusy(false); } };
    const [editing, setEditing] = useState<FunctionView | 'new' | null>(null);
    const [done, setDone] = useState('');
    return <div className="panel archival-functions-panel">
        <div className="section-heading"><h3>Fonctions et activités (ISDF)</h3>
            <div className="page-actions">{canManage && <button type="button" className="btn small secondary" onClick={() => setImporting('functions')}>Importer un CSV</button>}
            {canExport && <button type="button" className="btn small secondary" disabled={exportBusy} onClick={() => void exportCsv()}>Exporter les fonctions (CSV)</button>}
            {canManage && <button type="button" className="btn small secondary" onClick={() => setImporting('function-links')}>Importer les liens (CSV)</button>}
            {canExport && <button type="button" className="btn small secondary" disabled={exportBusy} onClick={() => void exportCsv('function-links')}>Exporter les liens (CSV)</button>}
            {canManage && <button type="button" className="btn small primary" onClick={() => setEditing('new')}>Créer une fonction</button>}</div></div>
        <div className="panel-padding">
            <p><small>Une fonction dit <strong>pourquoi</strong> des archives sont produites : elle se range sous une fonction plus haute (fonction, sous-fonction, activité, tâche), se relie
                à la notice du producteur qui l’exerce et aux fonds qui la documentent.</small></p>
            {canExport&&<p><small>Les exports CSV portent sur le catalogue autorisé complet, indépendamment des filtres.</small></p>}{done && <Notice>{done}</Notice>}{exportError ? <ErrorNotice error={exportError} /> : null}
            <ArchiveBrowse<FunctionView> api={api} institution={institution} kind="functions" revision={revision} columns={5}
                headers={<><th>Type</th><th>État</th><th>Période</th><th>Actions</th></>}
                renderCells={({row})=><><td>{KIND_LABELS[row.input.kind]}</td><td>{STATUS_LABELS[row.input.status]}</td>
                    <td>{[row.input.dateStart,row.input.dateEnd].filter(Boolean).join(' — ')||'—'}</td>
                    <td><button type="button" className="btn small secondary" onClick={()=>setEditing(row)}>{canManage?'Consulter / modifier':'Consulter'}</button></td></>}/>

        </div>
        {importing && <ArchiveImport api={api} institution={institution} kind={importing} onClose={() => setImporting(null)} onImported={result => { setDone(importing === 'function-links' ? `Liens : ${result.created ?? result.count} créé(s), ${result.updated ?? 0} mis à jour, ${result.unchanged ?? 0} inchangé(s).` : `Fonctions : ${result.created ?? result.count} créée(s), ${result.updated ?? 0} mise(s) à jour, ${result.unchanged ?? 0} inchangée(s).`); setRevision(n => n + 1); }} />}
        {editing && <FunctionEditorLoader api={api} institution={institution} editing={editing} descriptions={descriptions} authorities={authorities}
            readOnly={!canManage} onClose={() => setEditing(null)} onSaved={message => { setDone(message); setRevision(n => n + 1); }} />}
    </div>;
}

function FunctionEditorLoader({api,institution,editing,descriptions,authorities,readOnly,onClose,onSaved}:{
    api:ArchivesApi;institution:string;editing:FunctionView|'new';descriptions?:DescriptionView[];authorities?:AuthorityView[];
    readOnly:boolean;onClose:()=>void;onSaved:(message:string)=>void;
}) {
    const q=useResource(async signal=>{
        const [all,d,a]=await Promise.all([api.functions(institution,signal),descriptions??api.descriptions(institution,signal),authorities??api.authorities(institution,signal)]);
        return {all,descriptions:d,authorities:a};
    },JSON.stringify(['function-editor-options',institution,editing==='new'?'new':editing.id]));
    if(q.loading||q.error)return <Modal title="Chargement de la fonction" onClose={onClose}>{q.loading?<Busy/>:<ErrorNotice error={q.error} onRetry={q.refresh}/>}</Modal>;
    return <FunctionEditor api={api} institution={institution} row={editing==='new'?null:editing} all={q.data!.all} descriptions={q.data!.descriptions} authorities={q.data!.authorities} readOnly={readOnly} onClose={onClose} onSaved={onSaved}/>;
}

function FunctionEditor({ api, institution, row, all, descriptions, authorities, readOnly, onClose, onSaved }: {
    api: ArchivesApi; institution: string; row: FunctionView | null; all: FunctionView[]; descriptions: DescriptionView[]; authorities: AuthorityView[];
    readOnly: boolean; onClose: () => void; onSaved: (message: string) => void;
}) {
    const formId = useId();
    const [draft, setDraft] = useState<FunctionInput>(() => row ? { ...row.input, version: row.version } : emptyFunction(institution));
    const [busy, setBusy] = useState(false);
    const [linksBusy,setLinksBusy]=useState(false);
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
        if (readOnly || busy || linksBusy) return;
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
        if (!row || busy || linksBusy || readOnly) return;
        setBusy(true); setError(undefined);
        try { await api.deleteFunction(row.id, institution, row.version, crypto.randomUUID()); onSaved('Fonction supprimée.'); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const disabled = busy || linksBusy || readOnly;
    return <Modal wide title={row ? 'Fonction' : 'Nouvelle fonction'} subtitle={current && current.ancestors.length ? current.ancestors.map(a => a.name).join(' › ') : undefined} onClose={onClose} locked={busy||linksBusy}>
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
        {row && <FunctionLinks key={institution+row.id} api={api} institution={institution} functionId={row.id} detail={current} all={all} descriptions={descriptions} authorities={authorities} readOnly={readOnly}
            loading={detail.loading} loadError={detail.error} onReload={detail.refresh} onBusyChange={setLinksBusy}
            onChanged={()=>{detail.refresh();onSaved('Liens de la fonction actualisés.');}} />}
        <footer className="modal-footer">
            {row && !readOnly && <button type="button" className="btn danger-outline" disabled={busy||linksBusy} onClick={remove}>Supprimer</button>}
            <button type="button" className="btn secondary" disabled={busy||linksBusy} onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>
            {!readOnly && <button type="submit" form={formId} className="btn primary" disabled={busy||linksBusy}>Enregistrer</button>}
        </footer>
    </Modal>;
}

