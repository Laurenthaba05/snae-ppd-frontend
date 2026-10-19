import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { ApiError } from '../core/http';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, PageHead, Pagination, useResource } from './components';
import { useWorkspace } from './workspace';
import { saveBlob, useAction } from './ReadingRoomParts';
import { navigate } from './navigation';
import { DESCRIPTION_LABELS } from '../core/heritageAssets';
import { STATUS_LABELS as NOTICE_STATUS_LABELS } from '../core/archivalDescription';
import {
    FORMS, FORM_LABELS, KIND_LABELS, TEMPLATE_CSV, VOCABULARY_ERRORS, alternativesText, attachable, csvProblems, csvRowCount, formLabel, formProblems, keywordNote, parseAlternatives, skosFileName,
    skosProblems, termProblems, termTree, vocabularyProblems,
    type DocumentForm, type Keyword, type KeywordHitPage, type KeywordKind, type KeywordReplaceResult, type TermPage, type TermsImportResult, type Vocabulary, type VocabularyTerm
} from '../core/vocabulary';

/** Le message d'une règle connue du serveur, sinon l'erreur telle quelle. */
function ruleError(error: unknown): unknown {
    if (error instanceof ApiError && error.code && VOCABULARY_ERRORS[error.code]) return new Error(VOCABULARY_ERRORS[error.code]);
    return error;
}

const STATUS_FILTERS: Array<[string, string]> = [['', 'Tous les termes'], ['ACTIF', 'Termes actifs'], ['OBSOLETE', 'Termes obsolètes']];

// ------------------------------------------------------------------------------------------------ page d'administration
/** Les vocabulaires nationaux et ceux de l'institution du périmètre : on y constitue les listes d'autorité dont se servent les mots-clés des documents et des dossiers. */
export function VocabularyPage() {
    const { me, vocabulary, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    const [revision, setRevision] = useState(0);
    const [showRetired, setShowRetired] = useState(false);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const list = useResource<Vocabulary[]>(s => vocabulary!.list(institutionId, showRetired, s), `vocabularies:${institutionId ?? 'national'}:${showRetired}:${revision}:${epoch}`);
    const mayInstitution = !!institutionId && can(me, 'VOCABULARY_MANAGE', { institutionId });
    const mayNational = can(me, 'VOCABULARY_MANAGE', {});
    // pendant une relecture, la dernière liste reste affichée : le volet d'un vocabulaire ouvert ne se referme pas et garde sa recherche
    const last = useRef<Vocabulary[]>([]);
    if (list.data) last.current = list.data;
    const items = list.data ?? last.current;
    const open = items.find(v => v.id === openId) ?? null;
    const reload = () => setRevision(n => n + 1);
    return <>
        <PageHead eyebrow="MODULE · ARCHIVES" title="Vocabulaires contrôlés" description="Thésaurus et listes d’autorité de l’institution ou du niveau national : des termes choisis, avec leurs synonymes et leur terme générique, pour indexer les documents et les dossiers de façon homogène.">
            {(mayInstitution || mayNational) && <button type="button" className="btn primary" onClick={() => setCreating(true)}>Nouveau vocabulaire</button>}
        </PageHead>
        <section className="panel" aria-label="Vocabulaires">
            <div className="table-toolbar"><label><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Afficher les vocabulaires retirés</label></div>
            {list.loading && items.length === 0 ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
                : items.length === 0 ? <Empty title="Aucun vocabulaire" description="Aucun vocabulaire n’est livré avec l’application : l’institution constitue les siens, ou reprend ceux du niveau national." icon="tag" />
                    : <div className="table-scroll"><table><thead><tr><th>Vocabulaire</th><th>Code</th><th>Périmètre</th><th>Termes</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{items.map(v => <tr key={v.id}>
                            <td><strong>{v.name}</strong>{v.description && <small className="cell-sub">{v.description}</small>}</td>
                            <td><code>{v.code}</code></td>
                            <td><Badge value={v.institutionId ? 'INSTITUTION' : 'NATIONAL'} /></td>
                            <td>{v.terms}</td>
                            <td><Badge value={v.status} /></td>
                            <td><button type="button" className="btn small secondary" onClick={() => setOpenId(openId === v.id ? null : v.id)}>{openId === v.id ? 'Fermer' : 'Ouvrir'}</button></td>
                        </tr>)}</tbody></table></div>}
        </section>
        {open && <VocabularyTerms key={open.id} vocabulary={open} canManage={open.institutionId ? can(me, 'VOCABULARY_MANAGE', { institutionId: open.institutionId }) : mayNational} onChanged={reload} />}
        {creating && <VocabularyDialog institutionId={institutionId} mayInstitution={mayInstitution} mayNational={mayNational} onClose={() => setCreating(false)}
            onDone={v => { setCreating(false); setOpenId(v.id); reload(); }} />}
    </>;
}

function VocabularyDialog({ institutionId, mayInstitution, mayNational, onClose, onDone }: {
    institutionId: string | null | undefined; mayInstitution: boolean; mayNational: boolean; onClose: () => void; onDone: (v: Vocabulary) => void;
}) {
    const { vocabulary } = useSession();
    const [national, setNational] = useState(!mayInstitution);
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [source, setSource] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = vocabularyProblems(code, name);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const input = { institutionId: national ? null : institutionId ?? null, code: code.trim().toUpperCase(), name: name.trim(), description: description.trim() || undefined, source: source.trim() || undefined };
        const created = await action.run(input, key => vocabulary!.create(input, key));
        if (created) onDone(created);
    };
    return <Modal title="Nouveau vocabulaire" subtitle="Son code ne changera plus" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {mayInstitution && mayNational && <Field label="Périmètre" wide><select value={national ? 'NATIONAL' : 'INSTITUTION'} onChange={e => setNational(e.target.value === 'NATIONAL')} disabled={action.busy}>
                    <option value="INSTITUTION">Institution du périmètre de travail</option><option value="NATIONAL">National (partagé par toutes les institutions)</option></select></Field>}
                <Field label="Code *" hint="Lettres majuscules, chiffres et souligné ; par exemple THEMES_ETAT_CIVIL."><input value={code} onChange={e => setCode(e.target.value)} maxLength={60} disabled={action.busy} /></Field>
                <Field label="Nom *"><input value={name} onChange={e => setName(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
                <Field label="Source" wide hint="Facultatif : d’où vient la liste (norme, thésaurus d’origine…)."><input value={source} onChange={e => setSource(e.target.value)} maxLength={500} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Créer le vocabulaire</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ termes d'un vocabulaire
function VocabularyTerms({ vocabulary: v, canManage, onChanged }: { vocabulary: Vocabulary; canManage: boolean; onChanged: () => void }) {
    const { vocabulary, epoch } = useSession();
    const [text, setText] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<VocabularyTerm | 'new' | null>(null);
    const [obsoleting, setObsoleting] = useState<VocabularyTerm | null>(null);
    const [replacing, setReplacing] = useState<VocabularyTerm | null>(null);
    const [searching, setSearching] = useState<VocabularyTerm | null>(null);
    const [importing, setImporting] = useState<false | 'CSV' | 'SKOS'>(false);
    const [retiring, setRetiring] = useState(false);
    const download = useAction();
    const q = useResource<TermPage>(s => vocabulary!.terms(v.id, { q: text.trim() || undefined, status: status || undefined, page }, s), `terms:${v.id}:${text.trim()}:${status}:${page}:${revision}:${epoch}`);
    const rows = termTree(q.data?.items ?? []);
    const active = v.status === 'ACTIF';
    const done = () => { setRevision(n => n + 1); onChanged(); };
    const exportSkos = async () => {
        const blob = await download.run({ skos: v.id }, () => vocabulary!.skos(v.id));
        if (blob) saveBlob(blob, skosFileName(v.code));
    };
    return <section className="panel" aria-label={`Termes de ${v.name}`}>
        <div className="section-heading"><h3>{v.name}</h3>
            <span>
                <button type="button" className="btn small secondary" disabled={download.busy} onClick={exportSkos}>Exporter en SKOS</button>
                {canManage && active && <> <button type="button" className="btn small secondary" onClick={() => setImporting('CSV')}>Importer un fichier CSV</button>
                    {' '}<button type="button" className="btn small secondary" onClick={() => setImporting('SKOS')}>Importer un thésaurus SKOS</button>
                    {' '}<button type="button" className="btn small primary" onClick={() => setEditing('new')}>Ajouter un terme</button>
                    {' '}<button type="button" className="btn small danger" onClick={() => setRetiring(true)}>Retirer le vocabulaire</button></>}
            </span></div>
        {!active && <div className="panel-padding"><Notice>Ce vocabulaire est retiré : ses termes restent lisibles et les mots-clés déjà posés demeurent, mais il n’accepte plus de terme ni de nouvelle indexation.</Notice></div>}
        {download.error ? <div className="panel-padding"><ErrorNotice error={download.error} /></div> : null}
        <div className="table-toolbar">
            <input aria-label="Chercher un terme" placeholder="Chercher un terme ou un synonyme…" value={text} onChange={e => { setText(e.target.value); setPage(0); }} />
            <select aria-label="État des termes" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>{STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : rows.length === 0 ? <Empty title="Aucun terme" description={text || status ? 'Aucun terme ne correspond à cette recherche.' : 'Ce vocabulaire ne compte encore aucun terme.'} icon="tag" />
                : <div className="table-scroll"><table><thead><tr><th>Terme</th><th>Définition</th><th>Emplois</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{rows.map(({ term: t, depth }) => <tr key={t.id}>
                        <td><span className={`term-label depth-${Math.min(depth, 4)}`}><strong>{t.label}</strong></span>
                            {t.alternativeLabels.length > 0 && <small className="cell-sub">Synonymes : {t.alternativeLabels.join(', ')}</small>}
                            {t.parentLabel && depth === 0 && <small className="cell-sub">Sous : {t.parentLabel}</small>}</td>
                        <td>{t.definition ?? '—'}</td>
                        <td>{t.usage ?? '—'}</td>
                        <td><Badge value={t.status} />{t.status === 'OBSOLETE' && <small className="cell-sub">{t.obsolescenceReason}{t.replacedByLabel ? ` — remplacé par « ${t.replacedByLabel} »` : ''}</small>}</td>
                        <td>
                            <button type="button" className="btn small secondary" aria-label={`Documents indexés par ${t.label}`} onClick={() => setSearching(t)}>Documents</button>
                            {canManage && t.status === 'ACTIF' && <>{' '}
                                <button type="button" className="btn small secondary" onClick={() => setEditing(t)}>Modifier</button>{' '}
                                <button type="button" className="btn small secondary" onClick={() => setObsoleting(t)}>Rendre obsolète</button></>}
                            {canManage && active && t.status === 'OBSOLETE' && t.replacedById && (t.usage ?? 0) > 0 && <>{' '}
                                <button type="button" className="btn small secondary" aria-label={`Remplacer « ${t.label} » partout`} onClick={() => setReplacing(t)}>Remplacer partout</button></>}
                        </td>
                    </tr>)}</tbody></table></div>}
        {q.data && <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={q.data.items.length} />}
        {editing && <TermDialog vocabulary={v} term={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); done(); }} />}
        {searching && <TermObjectsDialog term={searching} onClose={() => setSearching(null)} />}
        {obsoleting && <ObsoleteDialog vocabulary={v} term={obsoleting} onClose={() => setObsoleting(null)} onDone={() => { setObsoleting(null); done(); }} />}
        {replacing && <ReplaceUsagesDialog term={replacing} onClose={() => { setReplacing(null); done(); }} />}
        {importing && <ImportDialog vocabulary={v} format={importing} onClose={() => setImporting(false)} onDone={done} />}
        {retiring && <RetireDialog vocabulary={v} onClose={() => setRetiring(false)} onDone={() => { setRetiring(false); done(); }} />}
    </section>;
}

/** Le choix d'un terme actif d'un vocabulaire par son libellé : recherche, puis liste. Jamais par un identifiant. */
/**
 * `bare` : sans le cadre d'un champ de formulaire (le libellé est déjà posé par l'appelant). `current` : le terme déjà choisi, montré même s'il est devenu obsolète ou s'il n'est
 * pas dans les résultats de la recherche — pour qu'on ne le perde pas en ouvrant le formulaire.
 */
export function TermPicker({ vocabularyId, value, onChange, label, excludeId, disabled, bare, current }: {
    vocabularyId: string; value: string; onChange: (id: string) => void; label: string; excludeId?: string; disabled?: boolean; bare?: boolean;
    current?: { id: string; label: string; obsolete?: boolean | null } | null;
}) {
    const { vocabulary, epoch } = useSession();
    const [text, setText] = useState('');
    const q = useResource<TermPage>(s => vocabulary!.terms(vocabularyId, { q: text.trim() || undefined, status: 'ACTIF' }, s), `term-pick:${vocabularyId}:${text.trim()}:${epoch}`);
    const items = (q.data?.items ?? []).filter(t => t.id !== excludeId);
    const control = <div className="reference-picker">
        <input aria-label={`Chercher : ${label}`} placeholder="Libellé…" value={text} onChange={e => setText(e.target.value)} disabled={disabled} />
        {q.loading && !q.data ? <Busy label="Recherche…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
                <option value="">Aucun</option>
                {current && !items.some(t => t.id === current.id) && <option value={current.id}>{current.label}{current.obsolete ? ' (obsolète)' : ''}</option>}
                {items.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>}
    </div>;
    return bare ? control : <Field label={label} wide hint="Cherchez par libellé ou par synonyme.">{control}</Field>;
}

function TermDialog({ vocabulary: v, term, onClose, onDone }: { vocabulary: Vocabulary; term: VocabularyTerm | null; onClose: () => void; onDone: () => void }) {
    const { vocabulary } = useSession();
    const [label, setLabel] = useState(term?.label ?? '');
    const [definition, setDefinition] = useState(term?.definition ?? '');
    const [alternatives, setAlternatives] = useState(alternativesText(term?.alternativeLabels ?? []));
    const [parentId, setParentId] = useState(term?.parentId ?? '');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const alternativeList = parseAlternatives(alternatives, label);
    const problems = term ? termProblems(term.label, alternativeList) : termProblems(label, alternativeList);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { definition: definition.trim() || undefined, parentId: parentId || null, alternativeLabels: alternativeList };
        const result = term
            ? await action.run({ term: term.id, ...body }, key => vocabulary!.updateTerm(term.id, body, key))
            : await action.run({ vocabulary: v.id, label: label.trim(), ...body }, key => vocabulary!.createTerm(v.id, { label: label.trim(), ...body }, key));
        if (result) onDone();
    };
    return <Modal title={term ? `Modifier « ${term.label} »` : 'Ajouter un terme'} subtitle={term ? 'Le libellé préféré ne change plus : les mots-clés le citent.' : v.name} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {!term && <Field label="Libellé préféré *" wide><input value={label} onChange={e => setLabel(e.target.value)} maxLength={255} disabled={action.busy} /></Field>}
                <Field label="Définition" wide hint="Facultative : ce que le terme recouvre, ou la règle de son emploi."><textarea value={definition} onChange={e => setDefinition(e.target.value)} rows={3} maxLength={2000} disabled={action.busy} /></Field>
                <Field label="Synonymes" wide hint="Un par ligne (20 au plus). Ils servent à retrouver le terme, pas à indexer."><textarea value={alternatives} onChange={e => setAlternatives(e.target.value)} rows={3} disabled={action.busy} /></Field>
                <TermPicker vocabularyId={v.id} value={parentId} onChange={setParentId} label="Terme générique" excludeId={term?.id} disabled={action.busy} />
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>{term ? 'Enregistrer' : 'Ajouter le terme'}</button></footer>
        </form>
    </Modal>;
}

/** Les documents ou les dossiers indexés par un terme : seulement ceux que l'on a le droit de lire, par pages, sans total. */
function TermObjectsDialog({ term, onClose }: { term: VocabularyTerm; onClose: () => void }) {
    const { vocabulary, epoch } = useSession();
    const [kind, setKind] = useState<KeywordKind>('DOCUMENT');
    const [page, setPage] = useState(0);
    const q = useResource<KeywordHitPage>(s => vocabulary!.termObjects(term.id, kind, page, s), `term-objects:${term.id}:${kind}:${page}:${epoch}`);
    const items = q.data?.items ?? [];
    return <Modal title={`Indexés par « ${term.label} »`} subtitle="Seuls les objets que vous avez le droit de lire sont listés." onClose={onClose} wide>
        <div className="form-grid">
            <Field label="Objets" wide><select value={kind} onChange={e => { setKind(e.target.value as KeywordKind); setPage(0); }}>
                <option value="DOCUMENT">Documents</option><option value="DOSSIER">Dossiers</option><option value="BIEN">Biens patrimoniaux</option><option value="NOTICE">Notices de description</option></select></Field>
        </div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucun objet lisible" description="Aucun objet que vous puissiez lire n’est indexé par ce terme." icon="tag" />
                : <div className="table-scroll"><table><thead><tr><th>Titre</th><th>Référence</th><th>{kind === 'BIEN' ? 'Description' : kind === 'NOTICE' ? 'Rédaction' : 'Confidentialité'}</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(h => <tr key={h.id}>
                        <td><strong>{h.title}</strong></td><td>{h.reference}</td><td>{kind === 'BIEN' ? (h.archivalStatus ? <Badge value={h.archivalStatus} label={(DESCRIPTION_LABELS as Record<string, string>)[h.archivalStatus] ?? h.archivalStatus} /> : '—')
                            : kind === 'NOTICE' ? (h.archivalStatus ? <Badge value={h.archivalStatus} label={(NOTICE_STATUS_LABELS as Record<string, string>)[h.archivalStatus] ?? h.archivalStatus} /> : '—')
                                : h.confidentiality ? <Badge value={h.confidentiality} /> : '—'}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => navigate(kind === 'BIEN' ? `/app/patrimoine?bien=${h.id}` : kind === 'NOTICE' ? '/app/fonds' : `/app/${kind === 'DOCUMENT' ? 'documents' : 'dossiers'}/${h.id}`)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {q.data && <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={items.length} />}
        <footer className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

/** Remplacer un terme obsolète par son remplaçant partout où il est posé : une confirmation, puis des décomptes — ce qui a été posé, ce qui portait déjà le remplaçant, ce qui est laissé. */
function ReplaceUsagesDialog({ term, onClose }: { term: VocabularyTerm; onClose: () => void }) {
    const { vocabulary } = useSession();
    const [result, setResult] = useState<KeywordReplaceResult | null>(null);
    const action = useAction();
    const run = async () => {
        const done = await action.run({ replace: term.id }, key => vocabulary!.replaceUsages(term.id, key));
        if (done) setResult(done);
    };
    const left = result?.counts.reduce((sum, c) => sum + c.skipped, 0) ?? 0;
    return <Modal title={`Remplacer « ${term.label} » partout`} subtitle={`Par « ${term.replacedByLabel ?? ''} »`} onClose={onClose} locked={action.busy}>
        {!result ? <>
            <Notice>Le terme obsolète sera retiré de chaque objet qui le porte et remplacé par « {term.replacedByLabel} ». Ce que la base refuse (document détruit, description de bien fermée ou bien sorti)
                est laissé en l’état et compté. L’opération ne se défait pas en un geste.</Notice>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="button" className="btn primary" disabled={action.busy} onClick={run}>Remplacer partout</button></footer>
        </> : <>
            <div className="table-scroll"><table><thead><tr><th>Objets</th><th>Remplacés</th><th>Portaient déjà le remplaçant</th><th>Laissés en l’état</th></tr></thead>
                <tbody>{result.counts.map(c => <tr key={c.kind}><td>{KIND_LABELS[c.kind] ?? c.kind}</td><td>{c.replaced}</td><td>{c.alreadyHeld}</td><td>{c.skipped}</td></tr>)}</tbody></table></div>
            <p><small>{left === 0 ? 'Le terme obsolète n’est plus posé nulle part.' : `${left} objet${left > 1 ? 's portent' : ' porte'} encore le terme obsolète : la base refuse de les modifier (document détruit, description fermée, bien sorti).`}
                {' '}Les documents et dossiers touchés sont réindexés pour la recherche.</small></p>
            <footer className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
        </>}
    </Modal>;
}

function ObsoleteDialog({ vocabulary: v, term, onClose, onDone }: { vocabulary: Vocabulary; term: VocabularyTerm; onClose: () => void; onDone: () => void }) {
    const { vocabulary } = useSession();
    const [replacementId, setReplacementId] = useState('');
    const [reason, setReason] = useState('');
    const action = useAction();
    const valid = reason.trim().length >= 5;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        const result = await action.run({ term: term.id, reason: reason.trim(), replacementId }, key => vocabulary!.obsoleteTerm(term.id, reason.trim(), replacementId || null, key));
        if (result) onDone();
    };
    return <Modal title={`Rendre obsolète « ${term.label} »`} subtitle="Le terme reste lisible sur les documents déjà indexés ; il ne se pose plus." onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Motif *" wide hint="Au moins 5 caractères."><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} disabled={action.busy} required /></Field>
                <TermPicker vocabularyId={v.id} value={replacementId} onChange={setReplacementId} label="Terme remplaçant" excludeId={term.id} disabled={action.busy} />
            </div>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn danger" disabled={action.busy || !valid}>Rendre obsolète</button></footer>
        </form>
    </Modal>;
}

function ImportDialog({ vocabulary: v, format, onClose, onDone }: { vocabulary: Vocabulary; format: 'CSV' | 'SKOS'; onClose: () => void; onDone: () => void }) {
    const { vocabulary } = useSession();
    const [csv, setCsv] = useState('');
    const [result, setResult] = useState<TermsImportResult | null>(null);
    const [readError, setReadError] = useState<string | null>(null);
    const action = useAction();
    const skos = format === 'SKOS';
    const problems = csv.trim() ? (skos ? skosProblems(csv) : csvProblems(csv)) : [];
    const read = async (file: File | undefined) => {
        if (!file) return;
        setReadError(null);
        try { setCsv(await file.text()); } catch { setReadError('Le fichier n’a pas pu être lu.'); }
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!csv.trim() || problems.length) return;
        const imported = await action.run({ vocabulary: v.id, format, csv },
            key => skos ? vocabulary!.importSkos(v.id, csv, key) : vocabulary!.importTerms(v.id, csv, key));
        if (imported) { setResult(imported); onDone(); }
    };
    return <Modal title={skos ? 'Importer un thésaurus SKOS' : 'Importer des termes'} subtitle={v.name} onClose={onClose} locked={action.busy} wide>
        {result ? <>
            <Notice>{result.created} terme{result.created > 1 ? 's' : ''} créé{result.created > 1 ? 's' : ''}{result.skipped.length > 0 ? `, ${result.skipped.length} déjà présent${result.skipped.length > 1 ? 's' : ''} (laissé${result.skipped.length > 1 ? 's' : ''} tel${result.skipped.length > 1 ? 's' : ''} quel${result.skipped.length > 1 ? 's' : ''}).` : '.'}</Notice>
            {result.skipped.length > 0 && <p><small>Déjà présents : {result.skipped.slice(0, 20).join(', ')}{result.skipped.length > 20 ? '…' : ''}</small></p>}
            <footer className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
        </> : <form onSubmit={submit}>
            {skos
                ? <p>Un thésaurus <strong>SKOS</strong> en JSON-LD ou en RDF/XML. Sont lus : les concepts, leur libellé préféré (français d’abord), leurs libellés alternatifs, leur définition et leur générique. Un concept à plusieurs génériques, un générique absent du fichier, une boucle ou deux libellés identiques font refuser le fichier, avec le concept en cause.</p>
                : <p>Colonnes reconnues : <code>libelle</code> (obligatoire), <code>parent</code> (libellé d’un terme placé plus haut dans le fichier ou déjà présent), <code>definition</code>, <code>alternatifs</code> (séparés par « | »). Séparateur : point-virgule ou virgule.</p>}
            <div className="form-grid">
                {skos
                    ? <Field label="Fichier SKOS" wide><input type="file" accept=".json,.jsonld,.rdf,.xml,application/ld+json,application/json,application/rdf+xml,text/xml" onChange={e => read(e.target.files?.[0])} disabled={action.busy} /></Field>
                    : <Field label="Fichier CSV" wide><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e => read(e.target.files?.[0])} disabled={action.busy} /></Field>}
                <Field label="Contenu" wide hint={skos ? (csv.trim() ? `${Math.round(csv.length / 1024)} Ko à importer.` : 'Collez le thésaurus ou choisissez un fichier.')
                    : csv.trim() ? `${csvRowCount(csv)} ligne(s) à importer.` : `Modèle : ${TEMPLATE_CSV.trim()}`}>
                    <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} disabled={action.busy} placeholder={skos ? '{ "@graph": [ { "@type": "skos:Concept", … } ] }' : TEMPLATE_CSV} spellCheck={false} /></Field>
            </div>
            {readError && <Notice tone="warning">{readError}</Notice>}
            {problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            <p><small>L’import est tout ou rien : {skos ? 'un concept refusé' : 'une ligne refusée'} n’écrit rien. Un terme déjà présent est laissé tel quel.</small></p>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !csv.trim() || problems.length > 0}>Importer</button></footer>
        </form>}
    </Modal>;
}

function RetireDialog({ vocabulary: v, onClose, onDone }: { vocabulary: Vocabulary; onClose: () => void; onDone: () => void }) {
    const { vocabulary } = useSession();
    const action = useAction();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (await action.run({ retire: v.id }, key => vocabulary!.retire(v.id, key))) onDone();
    };
    return <Modal title={`Retirer « ${v.name} »`} subtitle="Ce retrait est définitif" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <p>Le vocabulaire n’acceptera plus de terme et ne servira plus à indexer. Ses termes et les mots-clés déjà posés restent lisibles.</p>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn danger" disabled={action.busy}>Retirer le vocabulaire</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ mots-clés d'un document ou d'un dossier
/** Les mots-clés d'un document ou d'un dossier : des termes de vocabulaires contrôlés. Poser ou retirer exige le droit de décrire l'objet. */
export function KeywordsPanel(props: { kind: KeywordKind; objectId: string; institutionId: string; canEdit: boolean }) {
    const { vocabulary } = useSession();
    return vocabulary ? <KeywordsSection {...props} /> : null;
}

function KeywordsSection({ kind, objectId, institutionId, canEdit }: { kind: KeywordKind; objectId: string; institutionId: string; canEdit: boolean }) {
    const { vocabulary, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [adding, setAdding] = useState(false);
    const action = useAction();
    const q = useResource<Keyword[]>(s => vocabulary!.keywords(kind, objectId, s), `keywords:${kind}:${objectId}:${revision}:${epoch}`);
    const items = q.data ?? [];
    const remove = async (k: Keyword) => { if (await action.run({ remove: k.termId, objectId }, key => vocabulary!.removeKeyword(kind, objectId, k.termId, key))) setRevision(n => n + 1); };
    return <section className="panel" aria-label="Mots-clés">
        <div className="section-heading"><h3>Mots-clés</h3>
            {canEdit && <button type="button" className="btn small secondary" onClick={() => setAdding(true)}>Ajouter des mots-clés</button>}</div>
        <div className="panel-padding">
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : items.length === 0 ? <p><small>Aucun mot-clé. Les mots-clés sont des termes des vocabulaires contrôlés de l’institution ou du niveau national.</small></p>
                    : <ul className="keyword-list">{items.map(k => <li key={k.termId} className={`keyword-item${k.status === 'OBSOLETE' ? ' obsolete' : ''}`}>
                        <span>{k.label}</span><small>{k.vocabularyName}</small>
                        {keywordNote(k) && <small>{keywordNote(k)}</small>}
                        {canEdit && <button type="button" aria-label={`Retirer le mot-clé ${k.label}`} disabled={action.busy} onClick={() => remove(k)}>×</button>}
                    </li>)}</ul>}
        </div>
        {adding && <KeywordPicker kind={kind} objectId={objectId} institutionId={institutionId} attached={new Set(items.map(k => k.termId))} onClose={() => setAdding(false)}
            onDone={() => { setAdding(false); setRevision(n => n + 1); }} />}
    </section>;
}

function KeywordPicker({ kind, objectId, institutionId, attached, onClose, onDone }: {
    kind: KeywordKind; objectId: string; institutionId: string; attached: Set<string>; onClose: () => void; onDone: () => void;
}) {
    const { vocabulary, epoch } = useSession();
    const [vocabularyId, setVocabularyId] = useState('');
    const [text, setText] = useState('');
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const action = useAction();
    const vocabularies = useResource<Vocabulary[]>(s => vocabulary!.list(institutionId, false, s), `keyword-vocabularies:${institutionId}:${epoch}`);
    const usable = (vocabularies.data ?? []).filter(v => attachable({ status: 'ACTIF' }, v));
    const terms = useResource<TermPage | null>(s => vocabularyId ? vocabulary!.terms(vocabularyId, { q: text.trim() || undefined, status: 'ACTIF' }, s) : Promise.resolve(null),
        `keyword-terms:${vocabularyId}:${text.trim()}:${epoch}`);
    const items = (terms.data?.items ?? []).filter(t => !attached.has(t.id));
    const toggle = (id: string) => setChosen(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (chosen.size === 0) return;
        const ids = [...chosen];
        if (await action.run({ kind, objectId, ids }, key => vocabulary!.addKeywords(kind, objectId, ids, key))) onDone();
    };
    return <Modal title="Ajouter des mots-clés" subtitle="Choisissez des termes actifs d’un vocabulaire" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {vocabularies.loading && !vocabularies.data ? <Busy /> : vocabularies.error ? <ErrorNotice error={vocabularies.error} onRetry={vocabularies.refresh} />
                : usable.length === 0 ? <Notice>Aucun vocabulaire actif n’est disponible : un responsable des vocabulaires doit d’abord en constituer un.</Notice>
                    : <div className="form-grid">
                        <Field label="Vocabulaire" wide><select value={vocabularyId} onChange={e => { setVocabularyId(e.target.value); setChosen(new Set()); }} disabled={action.busy}>
                            <option value="">Choisir un vocabulaire…</option>
                            {usable.map(v => <option key={v.id} value={v.id}>{v.name}{v.institutionId ? '' : ' (national)'}</option>)}
                        </select></Field>
                        {vocabularyId && <Field label="Chercher un terme" wide><input value={text} onChange={e => setText(e.target.value)} placeholder="Libellé ou synonyme…" disabled={action.busy} /></Field>}
                    </div>}
            {vocabularyId && (terms.loading && !terms.data ? <Busy label="Recherche…" /> : terms.error ? <ErrorNotice error={terms.error} onRetry={terms.refresh} />
                : items.length === 0 ? <p><small>Aucun terme actif à poser avec cette recherche.</small></p>
                    : <div className="term-picker-list" role="group" aria-label="Termes disponibles">
                        {items.map(t => <label key={t.id}><input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} disabled={action.busy} /><span>{t.label}{t.definition && <small> — {t.definition}</small>}</span></label>)}
                    </div>)}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || chosen.size === 0}>Ajouter {chosen.size > 0 ? `(${chosen.size})` : ''}</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ filtre par mot-clé
/** Le filtre par mot-clé de la recherche : les termes choisis, tous exigés d'un résultat. Sans client des vocabulaires (démonstration), rien ne s'affiche. */
export function KeywordFilter({ institutionId, selected, onChange, kind = 'keyword' }: {
    institutionId: string | null; selected: Array<{ id: string; label: string }>; onChange: (next: Array<{ id: string; label: string }>) => void;
    /** `metadata` : le même filtre, appliqué aux termes portés par les métadonnées des documents (champs de type terme) plutôt qu'à leurs mots-clés. */
    kind?: 'keyword' | 'metadata';
}) {
    const { vocabulary } = useSession();
    const [choosing, setChoosing] = useState(false);
    if (!vocabulary) return null;
    const text = kind === 'metadata' ? { group: 'Filtre par terme de métadonnée', title: 'Termes des métadonnées', button: 'Filtrer par terme de métadonnée' } : { group: 'Filtre par mot-clé', title: 'Mots-clés', button: 'Filtrer par mot-clé' };
    return <div className="keyword-filter" role="group" aria-label={text.group}>
        <strong>{text.title}</strong>
        {selected.length === 0 ? <small>aucun filtre</small> : <ul className="keyword-list">{selected.map(k => <li key={k.id} className="keyword-item"><span>{k.label}</span>
            <button type="button" aria-label={`Retirer le filtre ${k.label}`} onClick={() => onChange(selected.filter(s => s.id !== k.id))}>×</button></li>)}</ul>}
        <button type="button" className="btn small secondary" disabled={selected.length >= 10} onClick={() => setChoosing(true)}>{text.button}</button>
        {choosing && <TermChooser institutionId={institutionId} title={text.button} onClose={() => setChoosing(false)}
            onPick={t => { if (!selected.some(s => s.id === t.id)) onChange([...selected, { id: t.id, label: t.label }]); setChoosing(false); }} />}
    </div>;
}

function TermChooser({ institutionId, onPick, onClose, title = 'Filtrer par mot-clé' }: { institutionId: string | null; onPick: (term: VocabularyTerm) => void; onClose: () => void; title?: string }) {
    const { vocabulary, epoch } = useSession();
    const [vocabularyId, setVocabularyId] = useState('');
    const [text, setText] = useState('');
    const vocabularies = useResource<Vocabulary[]>(s => vocabulary!.list(institutionId, false, s), `filter-vocabularies:${institutionId ?? 'national'}:${epoch}`);
    const terms = useResource<TermPage | null>(s => vocabularyId ? vocabulary!.terms(vocabularyId, { q: text.trim() || undefined }, s) : Promise.resolve(null), `filter-terms:${vocabularyId}:${text.trim()}:${epoch}`);
    return <Modal title={title} subtitle="Choisissez un terme : seuls les résultats qui le portent restent affichés" onClose={onClose}>
        {vocabularies.loading && !vocabularies.data ? <Busy /> : vocabularies.error ? <ErrorNotice error={vocabularies.error} onRetry={vocabularies.refresh} />
            : (vocabularies.data ?? []).length === 0 ? <Notice>Aucun vocabulaire n’est disponible dans ce périmètre.</Notice>
                : <div className="form-grid">
                    <Field label="Vocabulaire" wide><select value={vocabularyId} onChange={e => setVocabularyId(e.target.value)}>
                        <option value="">Choisir un vocabulaire…</option>
                        {(vocabularies.data ?? []).map(v => <option key={v.id} value={v.id}>{v.name}{v.institutionId ? '' : ' (national)'}</option>)}</select></Field>
                    {vocabularyId && <Field label="Chercher un terme" wide><input value={text} onChange={e => setText(e.target.value)} placeholder="Libellé ou synonyme…" /></Field>}
                </div>}
        {vocabularyId && (terms.loading && !terms.data ? <Busy label="Recherche…" /> : terms.error ? <ErrorNotice error={terms.error} onRetry={terms.refresh} />
            : (terms.data?.items ?? []).length === 0 ? <p><small>Aucun terme ne correspond.</small></p>
                : <ul className="term-picker-list" aria-label="Termes disponibles">{(terms.data?.items ?? []).map(t => <li key={t.id}>
                    <button type="button" className="text-link" onClick={() => onPick(t)}>{t.label}{t.status === 'OBSOLETE' ? ' (obsolète)' : ''}</button></li>)}</ul>)}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ forme du document
/** La forme du document (original, copie, extrait…) : l'état de transmission, à part des informations d'archivage. */
export function DocumentFormPanel(props: { documentId: string; canEdit: boolean }) {
    const { vocabulary } = useSession();
    return vocabulary ? <DocumentFormSection {...props} /> : null;
}

function DocumentFormSection({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
    const { vocabulary, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState(false);
    const q = useResource<DocumentForm>(s => vocabulary!.form(documentId, s), `document-form:${documentId}:${revision}:${epoch}`);
    const f = q.data;
    return <section className="panel" aria-label="Forme du document">
        <div className="section-heading"><h3>Forme du document</h3>
            {canEdit && f && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>{f.form ? 'Modifier la forme' : 'Renseigner la forme'}</button>}</div>
        <div className="panel-padding">
            {q.loading && !f ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : f && <p><strong>{formLabel(f.form)}</strong>{f.precision ? ` — ${f.precision}` : ''}</p>}
        </div>
        {editing && f && <FormDialog documentId={documentId} current={f} onClose={() => setEditing(false)} onDone={() => { setEditing(false); setRevision(n => n + 1); }} />}
    </section>;
}

function FormDialog({ documentId, current, onClose, onDone }: { documentId: string; current: DocumentForm; onClose: () => void; onDone: () => void }) {
    const { vocabulary } = useSession();
    const [form, setForm] = useState(current.form ?? '');
    const [precision, setPrecision] = useState(current.precision ?? '');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = formProblems(form, precision);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const note = precision.trim() || null;
        if (await action.run({ documentId, form, note, version: current.version }, key => vocabulary!.setForm(documentId, form, note, current.version, key))) onDone();
    };
    return <Modal title="Forme du document" subtitle="Original, copie, extrait…" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Forme *" wide><select value={form} onChange={e => setForm(e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>
                    {FORMS.map(code => <option key={code} value={code}>{FORM_LABELS[code]}</option>)}
                </select></Field>
                <Field label={form === 'AUTRE' ? 'Précision *' : 'Précision'} wide hint="Par exemple l’autorité qui a certifié la copie."><textarea value={precision} onChange={e => setPrecision(e.target.value)} rows={2} maxLength={500} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
