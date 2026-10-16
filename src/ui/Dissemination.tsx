import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { can } from '../core/policy';
import {  Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { useAction } from './ReadingRoomParts';
import { FindingAidsPanel } from './FindingAids';
import {
    OBJECT_LABELS, authorityProblems, oaiProblemText, oaiSummary,
    type ArkAuthority, type ArkIdentifier, type ArkObjectType, type OaiStatus
} from '../core/dissemination';

/** L'état du dépôt OAI-PMH, l'autorité ARK et les identifiants attribués : pour qui lit ou tient la diffusion de l'institution du périmètre. */
export function DisseminationSection() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    if (demo || !institutionId) return null;
    const dissemination = ['DISSEMINATION_READ', 'DISSEMINATION_MANAGE'].some(code => can(me, code, { institutionId }));
    const publishing = can(me, 'FINDING_AID_PUBLISH', { institutionId });
    if (!dissemination && !publishing) return null;
    return <>
        {dissemination && <OaiStatusPanel institutionId={institutionId} />}
        {dissemination && <ArkRegistryPanel institutionId={institutionId} />}
        {publishing && <FindingAidsPanel institutionId={institutionId} />}
    </>;
}

function OaiStatusPanel({ institutionId }: { institutionId: string }) {
    const { dissemination, epoch } = useSession();
    const q = useResource<OaiStatus>(s => dissemination!.oaiStatus(s), `oai-status:${institutionId}:${epoch}`);
    const s = q.data;
    const summary = s ? oaiSummary(s) : null;
    return <section className="panel" aria-label="Dépôt OAI-PMH">
        <div className="table-toolbar"><h3>Dépôt OAI-PMH</h3><button type="button" className="btn small secondary" disabled={q.loading} onClick={q.refresh}>Actualiser le dépôt</button></div>
        {q.loading && !s ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : s && summary && <div className="panel-padding">
            <Notice tone={summary.problem ? 'warning' : 'info'}>{summary.text}</Notice>
            {s.enabled && s.problems.length > 0 && <ul>{s.problems.map(p => <li key={p}>{oaiProblemText(p)}</li>)}</ul>}
            {s.configured && <dl className="preservation-summary">
                <div><dt>Dépôt</dt><dd>{s.repositoryName}</dd></div>
                <div><dt>Identifiant</dt><dd>{s.repositoryIdentifier}</dd></div>
                <div><dt>Adresse du protocole</dt><dd>{s.endpoint}</dd></div>
                <div><dt>Notices par page</dt><dd>{s.pageSize}</dd></div>
            </dl>}
            <p className="table-actions">{s.enabled && s.configured && <a className="btn small secondary" href="/api/v1/portal/oai?verb=Identify" target="_blank" rel="noopener noreferrer">Consulter la réponse OAI-PMH</a>}<a href="/api/v1/portal/sitemap.xml" target="_blank" rel="noopener noreferrer">Plan XML du catalogue public</a><a href="/api/v1/portal/robots.txt" target="_blank" rel="noopener noreferrer">Règles d’indexation publique</a></p>
            <p><small>Le dépôt ne présente que les notices du catalogue public, en Dublin Core simple, avec leur identifiant ARK quand il existe. Sa configuration est celle de l’exploitant.</small></p>
        </div>}
    </section>;
}

function ArkRegistryPanel({ institutionId }: { institutionId: string }) {
    const { me, dissemination, epoch } = useSession();
    const mayManage = can(me, 'DISSEMINATION_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [declaring, setDeclaring] = useState(false);
    const authority = useResource<ArkAuthority | null>(s => dissemination!.authority(institutionId, s), `ark-authority:${institutionId}:${revision}:${epoch}`);
    const list = useResource<ArkIdentifier[]>(s => dissemination!.identifiers(institutionId, null, s), `ark-identifiers:${institutionId}:${revision}:${epoch}`);
    const a = authority.data;
    return <section className="panel" aria-label="Identifiants pérennes">
        <div className="section-heading"><h3>Identifiants pérennes (ARK)</h3>
            {mayManage && !a && !authority.loading && <button type="button" className="btn small primary" onClick={() => setDeclaring(true)}>Déclarer l’autorité ARK</button>}</div>
        <div className="panel-padding">
            {authority.loading && !authority.data ? <Busy /> : authority.error ? <ErrorNotice error={authority.error} onRetry={authority.refresh} />
                : a ? <p>Autorité ARK de l’institution : <strong>NAAN {a.naan}</strong>{a.prefix ? `, préfixe « ${a.prefix} »` : ''}. Elle ne change plus : son NAAN figure dans chaque identifiant.</p>
                    : <Notice>L’institution n’a pas déclaré son autorité ARK. Le NAAN lui est donné par l’organisme qui les attribue ; tant qu’il n’est pas déclaré, aucun identifiant ne s’attribue.</Notice>}
        </div>
        {list.loading && !list.data ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
            : (list.data ?? []).length === 0 ? <Empty title="Aucun identifiant attribué" description="Attribuez un identifiant depuis la fiche d’un document ou d’un bien patrimonial." icon="key" />
                : <div className="table-scroll"><table><thead><tr><th>Identifiant</th><th>Objet</th><th>Attribué le</th></tr></thead>
                    <tbody>{(list.data ?? []).map(i => <tr key={i.id}>
                        <td><code>{i.ark}</code> <ArkPublicLink identifier={i} /></td>
                        <td><strong>{i.objectTitle ?? 'Objet sans titre'}</strong><small className="cell-sub">{OBJECT_LABELS[i.objectType]}</small></td>
                        <td>{formatDate(i.createdAt)}</td>
                    </tr>)}</tbody></table></div>}
        {declaring && <AuthorityDialog institutionId={institutionId} onClose={() => setDeclaring(false)} onDone={() => { setDeclaring(false); setRevision(n => n + 1); }} />}
    </section>;
}

function AuthorityDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { dissemination } = useSession();
    const [naan, setNaan] = useState('');
    const [prefix, setPrefix] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = authorityProblems(naan, prefix);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ naan: naan.trim(), prefix: prefix.trim() }, key => dissemination!.declareAuthority(institutionId, naan.trim(), prefix.trim().toLowerCase(), key))) onDone();
    };
    return <Modal title="Déclarer l’autorité ARK" subtitle="Cette déclaration est définitive" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="NAAN *" hint="Le numéro donné à l’institution par l’organisme qui attribue les NAAN (5 à 9 chiffres)."><input inputMode="numeric" value={naan} onChange={e => setNaan(e.target.value)} maxLength={9} disabled={action.busy} /></Field>
                <Field label="Préfixe" hint="Facultatif : 8 caractères au plus, chiffres et consonnes."><input value={prefix} onChange={e => setPrefix(e.target.value)} maxLength={8} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Déclarer</button></footer>
        </form>
    </Modal>;
}

/** Sur la fiche d'un objet : son identifiant pérenne, ou la possibilité d'en attribuer un (une fois : il ne change plus). */
export function ArkPanel({ objectType, objectId, institutionId, canManage }: { objectType: ArkObjectType; objectId: string; institutionId: string; canManage: boolean }) {
    const { dissemination, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const action = useAction();
    const q = useResource<ArkIdentifier | null>(async signal => {
        try { return await dissemination!.ofObject(objectType, objectId, signal); }
        catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
    }, `ark-object:${objectType}:${objectId}:${revision}:${epoch}`);
    const authority = useResource<ArkAuthority | null>(s => canManage ? dissemination!.authority(institutionId, s) : Promise.resolve(null), `ark-authority-of:${institutionId}:${canManage}:${epoch}`);
    const mint = async () => { if (await action.run({ mint: objectId, objectType }, key => dissemination!.mint(objectType, objectId, key))) setRevision(n => n + 1); };
    return <section className="panel" aria-label="Identifiant pérenne">
        <div className="section-heading"><h3>Identifiant pérenne (ARK)</h3></div>
        <div className="panel-padding">
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : q.data ? <p><code>{q.data.ark}</code> <ArkPublicLink identifier={q.data} /> <small>Attribué le {formatDate(q.data.createdAt)}. Il ne change plus.</small></p>
                    : <>
                        <p><small>Aucun identifiant pérenne n’est attribué à cet objet.</small></p>
                        {canManage && (authority.data
                            ? <button type="button" className="btn small secondary" disabled={action.busy} onClick={mint}>Attribuer un identifiant pérenne</button>
                            : !authority.loading && <Notice>L’autorité ARK de l’institution doit d’abord être déclarée (page Conservation).</Notice>)}
                    </>}
        </div>
    </section>;
}

function ArkPublicLink({ identifier }: { identifier: ArkIdentifier }) {
    const href = '/api/v1/portal/ark/' + encodeURIComponent(identifier.naan) + '/' + encodeURIComponent(identifier.name);
    return <a href={href} className="text-link" target="_blank" rel="noopener noreferrer">Résoudre l’identifiant public</a>;
}
