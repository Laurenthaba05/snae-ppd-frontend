import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { commonName } from '../core/signatures';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import { STATUS_LABELS, anchorProblems, expiryNote, scopeLabel, type TrustAnchor } from '../core/trustAnchors';

/** Les ancres de confiance de l'institution du périmètre (et les nationales) : déclarer, retirer. Réservé à qui détient l'habilitation de les gérer. */
export function TrustAnchorsSection() {
    const { me, records, epoch, demo } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const mayInstitution = !!institutionId && can(me, 'TRUST_ANCHOR_MANAGE', { institutionId });
    const mayNational = can(me, 'TRUST_ANCHOR_MANAGE', {});
    const allowed = !demo && !!records && (mayInstitution || mayNational);
    const [revision, setRevision] = useState(0);
    const [declaring, setDeclaring] = useState(false);
    const [retiring, setRetiring] = useState<TrustAnchor | null>(null);
    const [showRetired, setShowRetired] = useState(false);
    const list = useResource<TrustAnchor[]>(s => allowed ? records!.trustAnchors(institutionId, showRetired, s) : Promise.resolve([]), `trust-anchors:${institutionId ?? 'national'}:${showRetired}:${revision}:${epoch}`);
    if (!allowed) return null;
    const items = list.data ?? [];
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Autorités de confiance">
        <div className="section-heading"><h3>Autorités de confiance des signatures</h3>
            <button type="button" className="btn small primary" onClick={() => setDeclaring(true)}>Déclarer une autorité de confiance</button></div>
        <div className="panel-padding">
            <p><small>Les signatures électroniques ne sont « de confiance » que si le certificat du signataire remonte à une autorité que vous avez déclarée ici. Aucune n’est livrée avec l’application : déclarer une autorité est une décision qui engage la valeur de toutes les vérifications. La révocation des certificats se juge à part, sur les listes de révocation déposées ci-dessous.</small></p>
            <label><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Afficher les autorités retirées</label>
        </div>
        {list.loading && !list.data ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
            : items.length === 0 ? <Empty title="Aucune autorité de confiance" description="Tant qu'aucune n'est déclarée, la chaîne des signatures n'est pas évaluée." icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Autorité</th><th>Certificat</th><th>Valide</th><th>Périmètre</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(a => <tr key={a.id}>
                        <td><strong>{a.label}</strong></td>
                        <td>{commonName(a.subject)}<small className="cell-sub">{a.selfSigned ? 'Racine (auto-signé)' : `Émis par ${commonName(a.issuer)}`}</small><small className="cell-sub">SHA-256 : <code title={a.fingerprint}>{a.fingerprint.slice(0, 8)}…{a.fingerprint.slice(-8)}</code></small></td>
                        <td>{formatDate(a.validFrom)} → {formatDate(a.validTo)}{expiryNote(a) && <small className="cell-sub">{expiryNote(a)}</small>}</td>
                        <td>{scopeLabel(a)}</td>
                        <td><Badge value={a.status} label={STATUS_LABELS[a.status]} />{a.retireReason && <small className="cell-sub">{a.retireReason}</small>}</td>
                        <td>{a.status === 'ACTIF' && (a.institutionId ? mayInstitution : mayNational) && <button type="button" className="btn small secondary" onClick={() => setRetiring(a)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {declaring && <DeclareDialog institutionId={institutionId} mayInstitution={mayInstitution} mayNational={mayNational} onClose={() => setDeclaring(false)} onDone={() => { setDeclaring(false); reload(); }} />}
        {retiring && <ReasonPrompt title={`Retirer « ${retiring.label} »`} subtitle="Les vérifications suivantes ne s'appuieront plus sur ce certificat." confirm="Retirer l’autorité" onClose={() => setRetiring(null)}
            onSubmit={async (reason, key) => { await records!.retireTrustAnchor(retiring.id, reason, key); reload(); }} />}
    </section>;
}

function DeclareDialog({ institutionId, mayInstitution, mayNational, onClose, onDone }: { institutionId: string | null; mayInstitution: boolean; mayNational: boolean; onClose: () => void; onDone: () => void }) {
    const { records } = useSession();
    const [national, setNational] = useState(!mayInstitution);
    const [label, setLabel] = useState('');
    const [pem, setPem] = useState('');
    const [attempted, setAttempted] = useState(false);
    const [readError, setReadError] = useState<string | null>(null);
    const action = useAction();
    const problems = anchorProblems(label, pem);
    const read = async (file: File | undefined) => {
        if (!file) return;
        setReadError(null);
        try { setPem((await file.text()).trim()); } catch { setReadError('Le fichier n’a pas pu être lu.'); }
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const owner = national ? null : institutionId;
        if (await action.run({ owner, label: label.trim(), pem }, key => records!.addTrustAnchor(owner, label.trim(), pem.trim() + '\n', key))) onDone();
    };
    return <Modal wide title="Déclarer une autorité de confiance" subtitle="Seul le certificat est déposé, jamais une clé privée" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Une autorité déclarée ici fait de ses certificats des chaînes « de confiance » pour toutes les vérifications de signatures du périmètre. Vérifiez l’empreinte du certificat auprès de son émetteur avant de le déclarer.</Notice>
            <div className="form-grid">
                {mayInstitution && mayNational && <Field label="Périmètre" wide><select value={national ? 'NATIONAL' : 'INSTITUTION'} onChange={e => setNational(e.target.value === 'NATIONAL')} disabled={action.busy}>
                    <option value="INSTITUTION">Institution du périmètre de travail</option><option value="NATIONAL">Nationale (toutes les institutions)</option></select></Field>}
                <Field label="Libellé *" wide hint="Le nom de l'autorité, tel que vos agents le reconnaîtront."><input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Fichier du certificat (PEM)" wide><input type="file" accept=".pem,.crt,.cer,.txt" onChange={e => read(e.target.files?.[0])} disabled={action.busy} /></Field>
                <Field label="Certificat *" wide hint="Au format PEM : -----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----"><textarea value={pem} onChange={e => setPem(e.target.value)} rows={8} spellCheck={false} disabled={action.busy} /></Field>
            </div>
            {readError && <Notice tone="warning">{readError}</Notice>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Déclarer l’autorité</button></footer>
        </form>
    </Modal>;
}
