import { ArchiveEnrichmentFields } from '../ui/ArchiveEnrichmentFields';
import { enrichmentProblems, enrichedDetails } from '../core/archiveEnrichment';
import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { ArchiveRecordPicker } from '../ui/ArchiveRecordPicker';
import { can } from '../core/policy';
import { PageHead, Field, Modal, ErrorNotice, Busy, Empty, Notice, useResource, formatDate } from '../ui/components';
import { AuthorityRelationsDialog } from '../ui/AuthorityRelations';
import { KeywordsPanel } from '../ui/Vocabularies';
import { ApiError } from '../core/http';
import type { RelationView } from '../core/authorityRelations';
import { DATE_KIND_LABELS, DESCRIPTION_GROUPS, EXTENT_UNITS, STATUS_LABELS, descriptionProblems, isadCompleteness, producerKnown } from '../core/archivalDescription';
import { ArchivesApi, archiveLevels, commandKey, flattenDescriptions, type ArchiveKind, type DescriptionView, type DescriptionInput, type AuthorityView, type AuthorityInput, type CsvPreview } from '../api/archives';
import { label } from '../core/format';

const levelLabels: Record<string, string> = { FONDS: 'Fonds', SOUS_FONDS: 'Sous-fonds', SERIE: 'Série', SOUS_SERIE: 'Sous-série', DOSSIER: 'Dossier', PIECE: 'Pièce' };
const authorityLabels: Record<string, string> = {
    otherNames: 'Autres formes du nom (une par ligne)', parallelNames: 'Formes parallèles du nom (une par ligne)', standardizedNames: 'Formes normalisées selon d’autres règles (une par ligne)',
    identifiers: 'Identifiants officiels (un par ligne, « SCHÉMA : valeur »)', dateStart: 'Date de naissance ou de création', dateEnd: 'Date de décès ou de dissolution', places: 'Lieux (un par ligne)',
    legalStatus: 'Statut juridique (un par ligne)', functions: 'Fonctions et activités', mandates: 'Textes et mandats (un par ligne)', structure: 'Structure interne ou généalogie', context: 'Contexte général',
    history: 'Histoire administrative ou biographie', status: 'État de rédaction', detailLevel: 'Niveau de détail', rules: 'Règles ou conventions appliquées', languages: 'Langues et écritures de la notice',
    sources: 'Sources de la notice', maintenanceNotes: 'Notes de mise à jour'
};
const authorityHints: Record<string, string> = {
    identifiers: 'Numéro d’identification fiscale, registre du commerce, code officiel de l’organisme', mandates: 'Décret, loi ou arrêté qui crée ou régit la collectivité',
    structure: 'Organigramme, services rattachés, branches d’une famille', context: 'Cadre social, culturel, économique ou politique dans lequel la notice s’inscrit'
};
const authorityGroups: { title: string; keys: string[] }[] = [
    { title: 'Identification', keys: ['otherNames', 'parallelNames', 'standardizedNames', 'identifiers'] },
    { title: 'Description', keys: ['dateStart', 'dateEnd', 'places', 'legalStatus', 'functions', 'mandates', 'structure', 'context', 'history'] },
    { title: 'Contrôle de la notice', keys: ['status', 'detailLevel', 'rules', 'languages', 'sources', 'maintenanceNotes'] }
];
const authorityStatusLabels: Record<string, string> = { BROUILLON: 'Brouillon', A_RELIRE: 'À relire', VALIDEE: 'Validée' };
const detailLevelLabels: Record<string, string> = { MINIMAL: 'Minimal', PARTIEL: 'Partiel', COMPLET: 'Complet' };
function AuthorityFields({ details, disabled, onChange }: { details: Record<string, string>; disabled: boolean; onChange: (details: Record<string, string>) => void }) {
    const set = (key: string, value: string) => onChange({ ...details, [key]: value });
    return <>{authorityGroups.map(group => <React.Fragment key={group.title}><h4 className="form-section span2">{group.title}</h4>
        {group.keys.map(key => <Field key={key} label={authorityLabels[key]!} hint={authorityHints[key]} wide={!key.startsWith('date')}>
            {key === 'dateStart' || key === 'dateEnd' ? <input type="date" value={details[key] ?? ''} disabled={disabled} onChange={e => set(key, e.target.value)} />
                : key === 'status' ? <select value={details[key] || 'BROUILLON'} disabled={disabled} onChange={e => set(key, e.target.value)}>{Object.entries(authorityStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                : key === 'detailLevel' ? <select value={details[key] ?? ''} disabled={disabled} onChange={e => set(key, e.target.value)}><option value="">Non précisé</option>{Object.entries(detailLevelLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                : <textarea maxLength={10000} rows={key === 'history' || key === 'context' || key === 'structure' ? 4 : 2} value={details[key] ?? ''} disabled={disabled} onChange={e => set(key, e.target.value)} />}
        </Field>)}</React.Fragment>)}</>;
}
const relationCountLabel = (n: number) => n === 0 ? 'Relations' : n === 1 ? '1 relation' : n + ' relations';
function useAbort() { const ref = useRef(new AbortController()); useEffect(() => { const controller = new AbortController(); ref.current = controller; return () => controller.abort(); }, []); return ref; }
function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ArchivalDescriptionPage() {
    const { scope } = useWorkspace(); const { epoch, me, demo } = useSession();
    if (demo) return <Notice>Le module Fonds et producteurs nécessite une connexion au serveur.</Notice>;
    if (!scope.institutionId) return <Notice>Sélectionnez une institution dans le filtre de l’espace de travail pour consulter ses fonds et ses producteurs.</Notice>;
    if (!can(me, 'ARCHIVAL_DESCRIPTION_READ', { institutionId: scope.institutionId })) return <Notice tone="warning">Une habilitation de lecture des fonds de cette institution est nécessaire.</Notice>;
    return <ArchiveWorkspace key={`${epoch}:${scope.institutionId}`} institution={scope.institutionId} />;
}
function ArchiveWorkspace({ institution }: { institution: string }) {
    const { records, me } = useSession(); const api = useMemo(() => new ArchivesApi(records!.transport), [records]); const cancellation = useAbort();
    const [kind, setKind] = useState<ArchiveKind>('descriptions'); const [editor, setEditor] = useState<{ kind: ArchiveKind; row?: DescriptionView | AuthorityView } | null>(null);
    const [importing, setImporting] = useState(false); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState('');
    const q = useResource(async s => ({ descriptions: await api.descriptions(institution, s), authorities: await api.authorities(institution, s),
        relations: await api.relations(institution, s).catch((e: unknown): RelationView[] => { if (e instanceof ApiError && e.status === 404) return []; throw e; }) }), institution);
    const [relationsFor, setRelationsFor] = useState<AuthorityView | null>(null);
    const manage = can(me, 'ARCHIVAL_DESCRIPTION_MANAGE', { institutionId: institution }); const exporting = can(me, 'ARCHIVAL_DESCRIPTION_EXPORT', { institutionId: institution });
    const download = async (path: string, name: string) => { const signal = cancellation.current.signal; setBusy(true); setError(undefined); try { const blob = await api.file(path, signal); if (!signal.aborted) saveBlob(blob, name); } catch (e) { if (!signal.aborted) setError(e); } finally { if (!signal.aborted) setBusy(false); } };
    return <><PageHead eyebrow="ARCHIVES · DESCRIPTION" title="Fonds et producteurs" description="Décrire les archives dans leur contexte et échanger des notices contrôlées.">
        {manage && <><button className="btn secondary" disabled={busy} onClick={() => setImporting(true)}>Importer un CSV</button><button className="btn primary" onClick={() => setEditor({ kind })}>{kind === 'descriptions' ? 'Créer une description' : 'Créer un producteur'}</button></>}
    </PageHead>
        <div className="page-actions" aria-label="Type de notices"><button className={'btn ' + (kind === 'descriptions' ? 'primary' : 'secondary')} aria-pressed={kind === 'descriptions'} onClick={() => setKind('descriptions')}>Fonds et descriptions</button><button className={'btn ' + (kind === 'authorities' ? 'primary' : 'secondary')} aria-pressed={kind === 'authorities'} onClick={() => setKind('authorities')}>Producteurs et autorités</button>{exporting && <button className="btn secondary" disabled={busy} onClick={() => download(`export/${kind}?institutionId=${institution}`, `${kind}.csv`)}>Exporter les notices visibles (CSV)</button>}</div>
        {error ? <ErrorNotice error={error} /> : null}{success && <Notice>{success}</Notice>}
        <Notice>Les descriptions restent internes à l’espace professionnel. Les exports incluent uniquement les notices auxquelles vous avez accès ; ils n’autorisent pas leur publication.</Notice>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <div className="panel table-scroll">
            {kind === 'descriptions' ? q.data?.descriptions.length ? <table><thead><tr><th>Référence et intitulé</th><th>Niveau</th><th>État</th><th>ISAD(G)</th><th>Confidentialité</th><th>Actions</th></tr></thead><tbody>{flattenDescriptions(q.data.descriptions).map(({ row, depth }) => <tr key={row.id}><td style={{ paddingLeft: 16 + depth * 22 }}><strong>{row.input.code}</strong> · {row.input.title}</td><td>{levelLabels[row.input.level]}</td><td>{STATUS_LABELS[row.input.details.status ?? ''] ?? 'Brouillon'}</td><td>{(c => <span title="Éléments de la norme ISAD(G) renseignés ; un niveau n’a pas à tous les remplir">{c.done} / {c.total}</span>)(isadCompleteness(row.input.details, producerKnown(row.input.producerId, row.input.parentId, q.data!.descriptions.map(x => ({ id: x.id, parentId: x.input.parentId, producerId: x.input.producerId })))))}</td><td>{label('confidentiality', row.input.confidentiality)}</td><td><button className="btn small secondary" onClick={() => setEditor({ kind, row })}>{manage ? 'Consulter / modifier' : 'Consulter'}</button>{exporting && <button className="btn small secondary" disabled={busy} onClick={() => download(`descriptions/${row.id}/ead`, `fonds-${row.id}.ead.xml`)}>Exporter EAD</button>}</td></tr>)}</tbody></table> : <Empty title="Aucune description" description="Commencez par décrire un fonds, puis ses séries, dossiers et pièces." />
                : q.data?.authorities.length ? <table><thead><tr><th>Référence</th><th>Nom retenu</th><th>Type</th><th>État</th><th>Relations</th><th>Actions</th></tr></thead><tbody>{q.data.authorities.map(row => <tr key={row.id}><td>{row.input.code}</td><td>{row.input.name}</td><td>{{ PERSONNE: 'Personne', COLLECTIVITE: 'Collectivité', FAMILLE: 'Famille' }[row.input.kind]}</td><td>{authorityStatusLabels[row.input.details.status ?? ''] ?? 'Brouillon'}</td><td><button className="btn small secondary" onClick={() => setRelationsFor(row)}>{relationCountLabel(q.data!.relations.filter(r => r.input.sourceId === row.id || r.input.targetId === row.id).length)}</button></td><td><button className="btn small secondary" onClick={() => setEditor({ kind, row })}>{manage ? 'Consulter / modifier' : 'Consulter'}</button>{exporting && <button className="btn small secondary" disabled={busy} onClick={() => download(`authorities/${row.id}/eac`, `producteur-${row.id}.eac.xml`)}>Exporter EAC-CPF</button>}</td></tr>)}</tbody></table> : <Empty title="Aucun producteur" description="Ajoutez une personne, une collectivité ou une famille, puis reliez-la aux fonds qu’elle a produits." />}
        </div>}
        {editor && q.data && <ArchiveEditor api={api} institution={institution} kind={editor.kind} row={editor.row} descriptions={q.data.descriptions} authorities={q.data.authorities} readOnly={!manage} onClose={() => setEditor(null)} onSaved={() => { q.refresh(); setSuccess('Notice enregistrée.'); }} />}
        {relationsFor && q.data && <AuthorityRelationsDialog api={api} institution={institution} authority={{ id: relationsFor.id, code: relationsFor.input.code, name: relationsFor.input.name, kind: relationsFor.input.kind }}
            authorities={q.data.authorities.map(a => ({ id: a.id, code: a.input.code, name: a.input.name, kind: a.input.kind }))} relations={q.data.relations} canManage={manage}
            onClose={() => setRelationsFor(null)} onChanged={() => q.refresh()} />}
        {importing && <ArchiveImport api={api} institution={institution} kind={kind} onClose={() => setImporting(false)} onImported={count => { q.refresh(); setSuccess(`${count} notice(s) importée(s).`); }} />}
    </>;
}

function DescriptionFields({ details, disabled, onChange }: { details: Record<string, string>; disabled: boolean; onChange: (details: Record<string, string>) => void }) {
    const set = (key: string, value: string) => onChange({ ...details, [key]: value });
    const options: Record<string, ReadonlyArray<[string, string]>> = {
        dateKind: [['', 'Non précisée'], ...Object.entries(DATE_KIND_LABELS)], extentUnit: [['', 'Aucune'], ...EXTENT_UNITS.map(u => [u.code, u.label] as [string, string])], status: Object.entries(STATUS_LABELS)
    };
    return <>{DESCRIPTION_GROUPS.map(group => <React.Fragment key={group.title}><h4 className="form-section span2">{group.title}</h4>
        {group.fields.map(f => <Field key={f.key} label={f.label} hint={f.hint} wide={f.kind === 'area'}>
            {f.kind === 'date' ? <input type="date" value={details[f.key] ?? ''} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
                : f.kind === 'select' ? <select value={details[f.key] || (f.key === 'status' ? 'BROUILLON' : '')} disabled={disabled} onChange={e => set(f.key, e.target.value)}>{options[f.key]!.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                : f.kind === 'quantity' ? <input inputMode="decimal" maxLength={13} placeholder="12,5" value={details[f.key] ?? ''} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
                : f.kind === 'text' ? <input maxLength={200} value={details[f.key] ?? ''} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
                : <textarea maxLength={10000} rows={2} value={details[f.key] ?? ''} disabled={disabled} onChange={e => set(f.key, e.target.value)} />}
        </Field>)}</React.Fragment>)}</>;
}
function ArchiveEditor({ api, institution, kind, row, descriptions, authorities, readOnly, onClose, onSaved }: {
    api: ArchivesApi; institution: string; kind: ArchiveKind; row?: DescriptionView | AuthorityView; descriptions: DescriptionView[]; authorities: AuthorityView[]; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
    const isDescription = kind === 'descriptions'; const cancellation = useAbort(); const formId = useId();
    const [draft, setDraft] = useState<DescriptionInput | AuthorityInput>(() => row ? { ...row.input, version: row.version } : isDescription ? { institutionId: institution, code: '', title: '', level: 'FONDS', parentId: null, producerId: null, confidentiality: 'INTERNE', documentId: null, dossierId: null, details: { status: 'BROUILLON' } as Record<string, string> } : { institutionId: institution, code: '', name: '', kind: 'COLLECTIVITE', actorId: null, details: { status: 'BROUILLON' } as Record<string, string> });
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const disabled = busy || readOnly; const d = draft as DescriptionInput; const a = draft as AuthorityInput;
    const problems = isDescription ? [...enrichmentProblems(d.enrichment), ...descriptionProblems(enrichedDetails(d), producerKnown(d.producerId || d.enrichment?.producers[0]?.authorityId || null, d.parentId, descriptions.map(x => ({ id: x.id, parentId: x.input.parentId, producerId: x.input.producerId || x.input.enrichment?.producers[0]?.authorityId || null }))))] : [];
    const change = (key: string, value: unknown) => setDraft(v => ({ ...v, [key]: value }));
    const submit = async (e: React.FormEvent) => { const signal = cancellation.current.signal; e.preventDefault(); if (readOnly) return; setBusy(true); setError(undefined); intention.current = commandKey(intention.current, draft); try { await api.save(kind, row?.id, draft, intention.current.key, signal); if (!signal.aborted) { onSaved(); onClose(); } } catch (e) { if (!signal.aborted) setError(e); } finally { if (!signal.aborted) setBusy(false); } };
    return <Modal wide title={isDescription ? 'Description archivistique' : 'Notice de producteur'} onClose={onClose} locked={busy}><form id={formId} onSubmit={submit}><div className="form-grid">
        <Field label="Référence"><input required maxLength={100} value={draft.code} disabled={disabled} onChange={e => change('code', e.target.value)} /></Field>
        <Field label={isDescription ? 'Intitulé' : 'Nom retenu'}><input required maxLength={500} value={isDescription ? d.title : a.name} disabled={disabled} onChange={e => change(isDescription ? 'title' : 'name', e.target.value)} /></Field>
        {isDescription ? <>
            <Field label="Niveau de description"><select value={d.level} disabled={disabled} onChange={e => { change('level', e.target.value); change('parentId', null); change('documentId', null); change('dossierId', null); }}>{archiveLevels.map(level => <option key={level} value={level}>{levelLabels[level]}</option>)}</select></Field>
            <Field label="Parent"><select required={d.level !== 'FONDS'} value={d.parentId ?? ''} disabled={disabled || d.level === 'FONDS'} onChange={e => change('parentId', e.target.value || null)}><option value="">{d.level === 'FONDS' ? 'Racine du fonds' : 'Choisir un parent'}</option>{descriptions.filter(p => p.id !== row?.id && archiveLevels.indexOf(p.input.level) < archiveLevels.indexOf(d.level)).map(p => <option key={p.id} value={p.id}>{p.input.code} · {p.input.title}</option>)}</select></Field>
            <Field label="Producteur"><select value={d.producerId ?? ''} disabled={disabled} onChange={e => change('producerId', e.target.value || null)}><option value="">Non renseigné</option>{authorities.map(p => <option key={p.id} value={p.id}>{p.input.code} · {p.input.name}</option>)}</select></Field>
            <Field label="Confidentialité"><select value={d.confidentiality} disabled={disabled} onChange={e => change('confidentiality', e.target.value)}>{['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'].map(value => <option key={value}>{value}</option>)}</select></Field>
            {d.level === 'PIECE' && <ArchiveRecordPicker kind="documents" institution={institution} value={d.documentId} disabled={disabled} onChange={id => change('documentId', id)} />}
            {d.level === 'DOSSIER' && <ArchiveRecordPicker kind="dossiers" institution={institution} value={d.dossierId} disabled={disabled} onChange={id => change('dossierId', id)} />}
        </> : <><Field label="Type d’autorité"><select value={a.kind} disabled={disabled} onChange={e => change('kind', e.target.value)}><option value="COLLECTIVITE">Collectivité</option><option value="PERSONNE">Personne</option><option value="FAMILLE">Famille</option></select></Field><ArchiveRecordPicker kind="actors" institution={institution} value={a.actorId} disabled={disabled} onChange={id => change('actorId', id)} /></>}
        {!isDescription && row && 'createdAt' in row && row.createdAt && <p className="span2 authority-dates">Notice créée le {formatDate(row.createdAt)} · dernière révision le {formatDate(row.updatedAt)}</p>}
        {!isDescription && <AuthorityFields details={draft.details} disabled={disabled} onChange={details => change('details', details)} />}
        {isDescription && row && 'createdAt' in row && row.createdAt && <p className="span2 authority-dates">Description créée le {formatDate(row.createdAt)} · dernière révision le {formatDate(row.updatedAt)}</p>}
        {isDescription && <DescriptionFields details={draft.details} disabled={disabled} onChange={details => change('details', details)} />}
        {isDescription && <ArchiveEnrichmentFields value={d.enrichment} authorities={authorities} institution={institution} disabled={disabled} onChange={v=>change('enrichment',v)} />}
    </div>{problems.length > 0 && !readOnly && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}{error ? <ErrorNotice error={error} /> : null}</form>
        {isDescription && row && <KeywordsPanel kind="NOTICE" objectId={row.id} institutionId={institution} canEdit={!readOnly} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>{!readOnly && <button type="submit" form={formId} className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button>}</footer></Modal>;
}

export function ArchiveImport({ api, institution, kind, onClose, onImported }: { api: ArchivesApi; institution: string; kind: ArchiveKind; onClose: () => void; onImported: (count: number) => void }) {
    const cancellation = useAbort(); const [csv, setCsv] = useState(''); const [filename, setFilename] = useState(''); const [preview, setPreview] = useState<CsvPreview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const load = async (file?: File) => { const signal = cancellation.current.signal; setPreview(null); setCsv(''); setError(undefined); setFilename(file?.name ?? ''); if (!file) return; if (file.size > 2_000_000) { setError(new Error('Le fichier dépasse 2 Mo.')); return; } setBusy(true); try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (!signal.aborted) setCsv(text); } catch { setError(new Error('Le fichier doit être encodé en UTF-8.')); } finally { setBusy(false); } };
    const check = async () => { const signal = cancellation.current.signal; setBusy(true); setError(undefined); setPreview(null); try { const p = await api.preview(institution, kind, csv, signal); if (!signal.aborted) setPreview(p); } catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); } };
    const confirm = async () => { const signal = cancellation.current.signal; if (!preview || preview.issues.length) return; setBusy(true); setError(undefined); intention.current = commandKey(intention.current, { institution, kind, csv, hash: preview.hash }); try { const r = await api.import(institution, kind, csv, preview.hash, intention.current.key, signal); if (!signal.aborted) { onImported(r.count); onClose(); } } catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); } };
    const template = async () => { const signal = cancellation.current.signal; setBusy(true); setError(undefined); try { const blob = await api.file(`template/${kind}?institutionId=${institution}`, signal); if (!signal.aborted) saveBlob(blob, `modele-${kind}.csv`); } catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); } };
    return <Modal wide title={`Importer ${kind === 'descriptions' ? 'des descriptions' : 'des producteurs'}`} onClose={onClose} locked={busy}><div className="panel-padding">
        <p>Utilisez le modèle UTF-8 avec séparateur virgule. Maximum 1 000 notices et 2 Mo. L’import crée de nouvelles notices ; les références existantes sont refusées. Importez les producteurs avant les descriptions qui les citent.</p>
        <button type="button" className="btn secondary" disabled={busy} onClick={template}>Télécharger le modèle CSV</button>
        <Field label="Fichier CSV"><input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => load(e.target.files?.[0])} /></Field>{filename && <p>{filename}</p>}
        {error ? <ErrorNotice error={error} /> : null}{preview && <><p role="status">{preview.rows} notice(s) contrôlée(s), {preview.issues.length} erreur(s).</p>{preview.issues.length > 0 ? <ul>{preview.issues.map((issue, i) => <li key={i}>Ligne {issue.row} : {issue.message}</li>)}</ul> : <Notice>Le contrôle est réussi. Toutes les notices seront enregistrées ensemble. Le serveur vérifiera à nouveau les données lors de la confirmation.</Notice>}</>}
    </div><footer className="modal-footer"><button className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="btn secondary" disabled={busy || !csv} onClick={check}>Contrôler le fichier</button><button className="btn primary" disabled={busy || !preview || preview.issues.length > 0} onClick={confirm}>Confirmer l’import</button></footer></Modal>;
}
