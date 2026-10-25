import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { navigate } from './navigation';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, PageHead, formatDate, useResource } from './components';
import { EntityName } from './names';
import { formatBytes, formatDay } from '../core/format';
import {
    CONFIDENTIALITIES, CONFIDENTIALITY_LABELS, DIRECTION_LABELS, EMPTY_FILTERS, PIECE_STATUS_LABELS, ROLE_LABELS, STATUS_LABELS, STEP_LABELS, countByStatus, errorText, sourceProblems,
    type GecConfidentiality, type GecCourrier, type GecCourrierRow, type GecFilters, type GecSource, type GecStatus
} from '../core/gec';

const PAGE_SIZE = 25;
const STATUSES: GecStatus[] = ['RECU', 'ARCHIVE', 'ECHEC'];

/**
 * Les courriers que les gestions électroniques du courrier (GEC) versent aux archives : le journal de ce qui est arrivé (archivé, en cours, en échec, avec l'accusé et la cote du
 * document) et les sources que l'institution autorise. Le téléversement lui-même est fait par la GEC, par l'interface documentée du serveur : cet écran suit et déclare, il ne téléverse pas.
 */
export function GecPage() {
    const { me, gec, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    const canManage = !!institutionId && can(me, 'GEC_MANAGE', scope);
    const canRead = canManage || (!!institutionId && can(me, 'GEC_READ', scope));
    const [tab, setTab] = useState<'courriers' | 'sources'>('courriers');
    const sourcesQ = useResource<GecSource[]>(s => institutionId && canRead ? gec!.sources(institutionId, s) : Promise.resolve([]), `gec-sources:${institutionId}:${canRead}:${epoch}`);
    return <>
        <PageHead eyebrow="MODULE · COLLECTE" title="Courriers de la GEC" description="Les courriers clos que la gestion électronique du courrier verse aux archives : ce qui est arrivé, ce qui est archivé, ce qui s’est arrêté, et les GEC autorisées à verser." />
        {!institutionId ? <Notice tone="warning">Choisissez une institution dans le périmètre de travail : les courriers et les sources de GEC sont ceux d’une institution.</Notice>
            : !canRead ? <Notice tone="warning">Cette section exige l’habilitation de lecture des courriers de la GEC pour cette institution.</Notice>
                : <>
                    <div role="tablist" className="asset-tabs page-tabs" aria-label="Sections des courriers de la GEC">
                        <button role="tab" type="button" aria-selected={tab === 'courriers'} className={tab === 'courriers' ? 'active' : ''} onClick={() => setTab('courriers')}>Courriers reçus</button>
                        <button role="tab" type="button" aria-selected={tab === 'sources'} className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>Sources</button>
                    </div>
                    {tab === 'courriers' ? <Journal institutionId={institutionId} sources={sourcesQ.data ?? []} /> : <Sources institutionId={institutionId} canManage={canManage} q={sourcesQ} />}
                </>}
    </>;
}

// ---------------------------------------------------------------------------------------------------- le journal

function Journal({ institutionId, sources }: { institutionId: string; sources: GecSource[] }) {
    const { gec, epoch } = useSession();
    const [filters, setFilters] = useState<GecFilters>(EMPTY_FILTERS);
    const [draft, setDraft] = useState('');
    const [page, setPage] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const q = useResource(s => gec!.courriers(institutionId, filters, page, PAGE_SIZE, s), `gec-courriers:${institutionId}:${filters.source}:${filters.statut}:${filters.q}:${page}:${epoch}`);
    const rows = q.data?.items ?? [];
    const counts = countByStatus(rows);
    const apply = (next: Partial<GecFilters>) => { setFilters(prev => ({ ...prev, ...next })); setPage(0); };
    const submit = (event: React.FormEvent) => { event.preventDefault(); apply({ q: draft.trim() }); };
    return <section className="panel" aria-label="Courriers reçus">
        <form className="table-toolbar" onSubmit={submit}>
            <div className="field"><label htmlFor="gec-filter-source">Source</label>
                <select id="gec-filter-source" value={filters.source} onChange={e => apply({ source: e.target.value })}>
                    <option value="">Toutes les sources</option>{sources.map(s => <option key={s.id} value={s.code}>{s.nom} ({s.code})</option>)}
                </select></div>
            <div className="field"><label htmlFor="gec-filter-status">État</label>
                <select id="gec-filter-status" value={filters.statut} onChange={e => apply({ statut: e.target.value as GecFilters['statut'] })}>
                    <option value="">Tous les états</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select></div>
            <div className="field"><label htmlFor="gec-filter-query">Recherche</label><input id="gec-filter-query" value={draft} onChange={e => setDraft(e.target.value)} maxLength={100} placeholder="Numéro, objet, expéditeur ou accusé" /></div>
            <button type="submit" className="btn secondary">Chercher</button>
            {(filters.source || filters.statut || filters.q) && <button type="button" className="btn small secondary" onClick={() => { setFilters(EMPTY_FILTERS); setDraft(''); setPage(0); }}>Effacer les filtres</button>}
        </form>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : rows.length === 0 ? <Empty title="Aucun courrier reçu" description={filters.source || filters.statut || filters.q ? 'Aucun courrier ne correspond à ces filtres.' : 'Aucune GEC n’a encore versé de courrier dans cette institution.'} icon="inbox" />
                : <>
                    <p className="panel-footnote" role="status">Sur cette page : {counts.ARCHIVE} archivé(s), {counts.RECU} en cours, {counts.ECHEC} en échec.</p>
                    <div className="table-scroll"><table>
                        <thead><tr><th>Reçu le</th><th>Source</th><th>Courrier</th><th>État</th><th>Document archivé</th><th>Accusé</th><th>Pièces</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{rows.map(r => <Row key={r.id} row={r} onOpen={() => setOpened(r.id)} />)}</tbody>
                    </table></div>
                    <div className="pager"><button type="button" className="btn small secondary" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Précédente</button>
                        <span>Page {page + 1}</span>
                        <button type="button" className="btn small secondary" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div>
                </>}
        {opened && <CourrierDialog id={opened} onClose={() => setOpened(null)} />}
    </section>;
}

function Row({ row, onOpen }: { row: GecCourrierRow; onOpen: () => void }) {
    const advice = row.statut === 'ECHEC' ? errorText(row.codeErreur) : null;
    return <tr>
        <td>{formatDate(row.recuLe)}</td>
        <td><strong>{row.sourceNom}</strong><small className="cell-sub">{row.sourceCode}</small></td>
        <td><strong>{row.numeroEnregistrement}</strong> · {DIRECTION_LABELS[row.sens]}<small className="cell-sub">{row.objet}</small><small className="cell-sub">{row.dateCourrier ? formatDay(row.dateCourrier) : ''}</small></td>
        <td><Badge value={row.statut} label={STATUS_LABELS[row.statut]} /><small className="cell-sub">{STEP_LABELS[row.etape] ?? row.etape}</small>{advice && <small className="cell-sub">{advice}</small>}</td>
        <td>{row.documentReference ?? '—'}</td>
        <td>{row.accuseNumero ? <><code>{row.accuseNumero}</code><small className="cell-sub">{formatDate(row.accuseLe)}</small></> : '—'}</td>
        <td>{row.pieces}</td>
        <td><div className="table-actions"><button type="button" className="btn small secondary" onClick={onOpen} aria-label={'Voir le détail du courrier ' + row.numeroEnregistrement}>Détail</button></div></td>
    </tr>;
}

function CourrierDialog({ id, onClose }: { id: string; onClose: () => void }) {
    const { gec, epoch } = useSession();
    const q = useResource<GecCourrier>(s => gec!.courrier(id, s), `gec-courrier:${id}:${epoch}`);
    const c = q.data;
    return <Modal wide title={c ? 'Courrier ' + c.numeroEnregistrement : 'Courrier'} subtitle={c?.objet} onClose={onClose}>
        {q.loading && !c ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : c && <>
            <dl className="detail-list">
                <dt>État</dt><dd><Badge value={c.statut} label={STATUS_LABELS[c.statut]} /> · {STEP_LABELS[c.etape] ?? c.etape}</dd>
                {c.codeErreur && <><dt>Arrêt</dt><dd>{errorText(c.codeErreur)}</dd></>}
                <dt>Source</dt><dd>{c.source}</dd>
                <dt>Référence dans la GEC</dt><dd><code>{c.referenceGec}</code></dd>
                <dt>Sens</dt><dd>{DIRECTION_LABELS[c.sens]}</dd>
                <dt>Date du courrier</dt><dd>{formatDay(c.dateCourrier)}</dd>
                <dt>Clos dans la GEC le</dt><dd>{formatDay(c.dateCloture)}</dd>
                <dt>Expéditeur</dt><dd>{c.expediteur ?? '—'}</dd>
                <dt>Destinataires</dt><dd>{c.destinataires.length ? c.destinataires.join(' ; ') : '—'}</dd>
                <dt>Reçu le</dt><dd>{formatDate(c.recuLe)}</dd>
                <dt>Tentatives</dt><dd>{c.tentatives}</dd>
                {c.accuse && <><dt>Accusé</dt><dd><code>{c.accuse}</code> · {formatDate(c.accuseLe)}</dd></>}
                {c.document && <><dt>Document archivé</dt><dd>{c.document.reference} · {c.document.statutMetier === 'CLOS' ? 'Clos' : c.document.statutMetier}
                    <button type="button" className="btn small secondary" style={{ marginLeft: 8 }} onClick={() => { onClose(); navigate('/app/documents/' + c.document!.id); }}>Ouvrir le document</button></dd></>}
                {c.dossier && <><dt>Dossier de l’affaire</dt><dd>{c.dossier.reference}</dd></>}
                {c.version && <><dt>Version</dt><dd>{c.version.numero} · {c.version.scellee ? 'scellée' : 'non scellée'}{c.version.empreinte ? <small className="cell-sub">Empreinte du scellé (SHA-256) : <code>{c.version.empreinte}</code></small> : null}</dd></>}
            </dl>
            <h4>Pièces</h4>
            <div className="table-scroll"><table>
                <thead><tr><th>N°</th><th>Nom</th><th>Rôle</th><th>Taille</th><th>État</th><th>Empreinte (SHA-256)</th></tr></thead>
                <tbody>{c.pieces.map(p => <tr key={p.rang}>
                    <td>{p.rang}</td>
                    <td>{p.nomOrigine}{p.nomDepose !== p.nomOrigine && <small className="cell-sub">Déposée sous le nom : {p.nomDepose}</small>}</td>
                    <td>{ROLE_LABELS[p.role]}</td><td>{formatBytes(p.taille)}</td>
                    <td><Badge value={p.statut} label={PIECE_STATUS_LABELS[p.statut]} />{p.codeErreur && <small className="cell-sub">{errorText(p.codeErreur)}</small>}</td>
                    <td><code className="hash">{p.sha256}</code></td>
                </tr>)}</tbody>
            </table></div>
            {Object.keys(c.metadonnees).length > 0 && <><h4>Métadonnées de la GEC</h4><pre className="json-view" tabIndex={0}>{JSON.stringify(c.metadonnees, null, 2).slice(0, 6000)}</pre></>}
        </>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------------------------------------------------------------------------------------------------- les sources

function Sources({ institutionId, canManage, q }: { institutionId: string; canManage: boolean; q: ReturnType<typeof useResource<GecSource[]>> }) {
    const { records, epoch } = useSession();
    const [editing, setEditing] = useState<GecSource | 'new' | null>(null);
    const typesQ = useResource(s => records!.documentTypes(s), `gec-types:${epoch}`);
    const types = new Map((typesQ.data ?? []).map(t => [t.id, t.label]));
    const sources = q.data ?? [];
    return <section className="panel" aria-label="Sources de courrier">
        <div className="section-heading"><h2>GEC autorisées de <EntityName kind="institutions" id={institutionId} fallback="l’institution" /></h2>
            {canManage && <button type="button" className="btn primary" onClick={() => setEditing('new')}>Déclarer une source</button>}</div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : sources.length === 0 ? <Empty title="Aucune source déclarée" description="Une GEC ne peut verser que si l’institution l’a déclarée ici : son code, le type de document et la confidentialité de ses courriers." icon="inbox" />
                : <div className="table-scroll"><table>
                    <thead><tr><th>Code</th><th>Nom</th><th>Type de document</th><th>Confidentialité par défaut</th><th>État</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
                    <tbody>{sources.map(s => <tr key={s.id}>
                        <td><code>{s.code}</code></td><td><strong>{s.nom}</strong></td><td>{types.get(s.typeDocumentId) ?? '—'}</td>
                        <td>{CONFIDENTIALITY_LABELS[s.confidentialiteDefaut]}</td><td><Badge value={s.actif ? 'ACTIF' : 'INACTIF'} /></td>
                        {canManage && <td><div className="table-actions"><button type="button" className="btn small secondary" onClick={() => setEditing(s)} aria-label={'Modifier la source ' + s.nom}>Modifier</button></div></td>}
                    </tr>)}</tbody></table></div>}
        <p className="panel-footnote">Une GEC téléverse ses courriers par l’interface du serveur (<code>POST /api/v1/gec/courriers</code>, documentée dans <code>docs/GEC.md</code>) avec un compte qui a l’habilitation de dépôt de courrier de la GEC et les droits de créer, déposer, valider, sceller et clore des documents dans cette institution. Le code de la source est écrit dans chacun de ses envois : il ne change plus une fois déclaré.</p>
        {editing && <SourceDialog institutionId={institutionId} source={editing === 'new' ? null : editing} types={typesQ.data ?? []} onClose={() => setEditing(null)} onSaved={q.refresh} />}
    </section>;
}

function SourceDialog({ institutionId, source, types, onClose, onSaved }: { institutionId: string; source: GecSource | null; types: { id: string; label: string; code: string }[]; onClose: () => void; onSaved: () => void }) {
    const { gec, classification } = useSession();
    const [code, setCode] = useState(source?.code ?? '');
    const [nom, setNom] = useState(source?.nom ?? '');
    const [typeId, setTypeId] = useState(source?.typeDocumentId ?? '');
    const [nodeId, setNodeId] = useState(source?.noeudClassementId ?? '');
    const [confidentiality, setConfidentiality] = useState<GecConfidentiality>(source?.confidentialiteDefaut ?? 'INTERNE');
    const [active, setActive] = useState(source?.actif ?? true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const nodesQ = useResource(s => classification ? classification.nodes(institutionId, s) : Promise.resolve([]), `gec-nodes:${institutionId}`);
    const problems = sourceProblems({ code, nom, typeDocumentId: typeId }, !source);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problems.length) return;
        setBusy(true); setError(null);
        try {
            const body = { nom: nom.trim(), institutionId, departementId: source?.departementId ?? null, typeDocumentId: typeId, noeudClassementId: nodeId || null, confidentialiteDefaut: confidentiality, actif: active };
            if (source) await gec!.updateSource(source.id, { ...body, version: source.version }, crypto.randomUUID());
            else await gec!.createSource({ ...body, code: code.trim().toUpperCase() }, crypto.randomUUID());
            onSaved(); onClose();
        } catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title={source ? 'Modifier la source ' + source.nom : 'Déclarer une source de courrier'} subtitle="La GEC qui a le droit de verser dans cette institution" onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Code" hint="Court, en majuscules, chiffres et tirets : la GEC l’écrit dans chacun de ses envois. Il ne change plus ensuite."><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={30} disabled={busy || !!source} required /></Field>
                <Field label="Nom" hint="Le nom de la GEC ou du service qui l’exploite."><input value={nom} onChange={e => setNom(e.target.value)} maxLength={200} disabled={busy} required /></Field>
                <Field label="Type de document" hint="Celui des courriers archivés. Choisissez un type sans circuit de validation obligatoire : il bloquerait le scellement."><select value={typeId} onChange={e => setTypeId(e.target.value)} disabled={busy} required>
                    <option value="">Choisir…</option>{types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
                <Field label="Plan de classement" hint="Facultatif : le nœud où se rangent les courriers de cette source."><select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={busy}>
                    <option value="">Aucun</option>{(nodesQ.data ?? []).map(n => <option key={n.id} value={n.id}>{n.code ? n.code + ' · ' : ''}{n.libelle}</option>)}</select></Field>
                <Field label="Confidentialité par défaut" hint="Appliquée quand la GEC n’en précise pas pour un courrier."><select value={confidentiality} onChange={e => setConfidentiality(e.target.value as GecConfidentiality)} disabled={busy}>
                    {CONFIDENTIALITIES.map(c => <option key={c} value={c}>{CONFIDENTIALITY_LABELS[c]}</option>)}</select></Field>
                {source && <Field label="Réception" hint="Une source désactivée refuse tout nouveau courrier ; ceux déjà reçus restent."><label className="check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={busy} /> Cette source accepte de nouveaux courriers</label></Field>}
            </div>
            {problems.length > 0 && (code || nom) ? <Notice tone="warning">{problems[0]}</Notice> : null}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
