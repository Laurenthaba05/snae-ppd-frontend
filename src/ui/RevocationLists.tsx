import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { commonName } from '../core/signatures';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import { LIST_STATUS_LABELS, freshnessNote, listContent, listProblems, listScopeLabel, type RevocationList } from '../core/revocationLists';

/**
 * Les listes de révocation déposées pour l'institution du périmètre (et les nationales) : déposer, retirer. Elles servent à juger, hors ligne, si un certificat de signature était
 * révoqué. Même habilitation que les autorités de confiance.
 */
export function RevocationListsSection() {
    const { me, records, epoch, demo } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const mayInstitution = !!institutionId && can(me, 'TRUST_ANCHOR_MANAGE', { institutionId });
    const mayNational = can(me, 'TRUST_ANCHOR_MANAGE', {});
    const allowed = !demo && !!records && (mayInstitution || mayNational);
    const [revision, setRevision] = useState(0);
    const [depositing, setDepositing] = useState(false);
    const [retiring, setRetiring] = useState<RevocationList | null>(null);
    const [showRetired, setShowRetired] = useState(false);
    const q = useResource<RevocationList[]>(s => allowed ? records!.revocationLists(institutionId, showRetired, s) : Promise.resolve([]), `revocation-lists:${institutionId ?? 'national'}:${showRetired}:${revision}:${epoch}`);
    if (!allowed) return null;
    const items = q.data ?? [];
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Listes de révocation">
        <div className="section-heading"><h3>Listes de révocation des certificats</h3>
            <button type="button" className="btn small primary" onClick={() => setDepositing(true)}>Déposer une liste de révocation</button></div>
        <div className="panel-padding">
            <p><small>La révocation d’un certificat de signature se juge <strong>hors ligne</strong>, sur les listes déposées ici et sur celles que la signature embarque : le serveur n’ouvre aucune adresse
                du certificat. Sans liste, la révocation est dite indéterminée. Une liste n’est prise en compte que si elle est signée par l’émetteur du certificat jugé.</small></p>
            <label><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Afficher les listes retirées</label>
        </div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucune liste de révocation" description="Sans liste, la révocation des certificats reste indéterminée." icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Liste</th><th>Émetteur</th><th>Émise le</th><th>Entrées</th><th>Périmètre</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(l => <tr key={l.id}>
                        <td><strong>{l.label}</strong>{l.number && <small className="cell-sub">Numéro {l.number}</small>}<small className="cell-sub">SHA-256 : <code title={l.fingerprint}>{l.fingerprint.slice(0, 8)}…{l.fingerprint.slice(-8)}</code></small></td>
                        <td>{commonName(l.issuer)}</td>
                        <td>{formatDate(l.thisUpdate)}{l.nextUpdate && <small className="cell-sub">Prochaine mise à jour : {formatDate(l.nextUpdate)}</small>}{freshnessNote(l) && <small className="cell-sub">{freshnessNote(l)}</small>}</td>
                        <td>{l.entries}</td>
                        <td>{listScopeLabel(l)}</td>
                        <td><Badge value={l.status} label={LIST_STATUS_LABELS[l.status]} />{l.retireReason && <small className="cell-sub">{l.retireReason}</small>}</td>
                        <td>{l.status === 'ACTIF' && (l.institutionId ? mayInstitution : mayNational) && <button type="button" className="btn small secondary" onClick={() => setRetiring(l)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {depositing && <DepositDialog institutionId={institutionId} mayInstitution={mayInstitution} mayNational={mayNational} onClose={() => setDepositing(false)} onDone={() => { setDepositing(false); reload(); }} />}
        {retiring && <ReasonPrompt title={`Retirer « ${retiring.label} »`} subtitle="Les vérifications suivantes ne s'appuieront plus sur cette liste." confirm="Retirer la liste" onClose={() => setRetiring(null)}
            onSubmit={async (reason, key) => { await records!.retireRevocationList(retiring.id, reason, key); reload(); }} />}
    </section>;
}

function DepositDialog({ institutionId, mayInstitution, mayNational, onClose, onDone }: { institutionId: string | null; mayInstitution: boolean; mayNational: boolean; onClose: () => void; onDone: () => void }) {
    const { records } = useSession();
    const [national, setNational] = useState(!mayInstitution);
    const [label, setLabel] = useState('');
    const [content, setContent] = useState('');
    const [attempted, setAttempted] = useState(false);
    const [readError, setReadError] = useState<string | null>(null);
    const action = useAction();
    const problems = listProblems(label, content);
    const read = async (file: File | undefined) => {
        if (!file) return;
        setReadError(null);
        try { setContent(listContent(new Uint8Array(await file.arrayBuffer()))); } catch { setReadError('Le fichier n’a pas pu être lu.'); }
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const owner = national ? null : institutionId;
        if (await action.run({ owner, label: label.trim(), content }, key => records!.addRevocationList(owner, label.trim(), content.trim(), key))) onDone();
    };
    return <Modal wide title="Déposer une liste de révocation" subtitle="Seule la liste est déposée, jamais une clé privée" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice>Déposez la liste publiée par l’autorité qui a émis les certificats (fichier .crl, au format DER ou PEM). Une liste signée par une autre clé que celle de l’émetteur est ignorée.</Notice>
            <div className="form-grid">
                {mayInstitution && mayNational && <Field label="Périmètre" wide><select value={national ? 'NATIONAL' : 'INSTITUTION'} onChange={e => setNational(e.target.value === 'NATIONAL')} disabled={action.busy}>
                    <option value="INSTITUTION">Institution du périmètre de travail</option><option value="NATIONAL">Nationale (toutes les institutions)</option></select></Field>}
                <Field label="Libellé *" wide hint="L'autorité et la date d'émission, par exemple."><input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Fichier de la liste (.crl)" wide><input type="file" accept=".crl,.pem,.txt" onChange={e => read(e.target.files?.[0])} disabled={action.busy} /></Field>
                <Field label="Liste (PEM ou base64) *" wide hint="Au format PEM : -----BEGIN X509 CRL----- … -----END X509 CRL-----"><textarea value={content} onChange={e => setContent(e.target.value)} rows={6} spellCheck={false} disabled={action.busy} /></Field>
            </div>
            {readError && <Notice tone="warning">{readError}</Notice>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Déposer la liste</button></footer>
        </form>
    </Modal>;
}
