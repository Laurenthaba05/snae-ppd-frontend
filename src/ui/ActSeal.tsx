import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { Badge, Busy, ErrorNotice, Notice, formatDate, useResource } from './components';
import { saveBlob, useAction } from './ReadingRoomParts';
import { ACT_LABELS, CHAIN_LABELS, sealFileName, sealHeadline, shortHash, verifyCommand, type ActSeal, type ActType } from '../core/actSeals';

/**
 * Le sceau d'un acte (certificat de destruction, accusé de réception d'un versement ou d'un transfert) : état, vérification, fichiers à télécharger pour vérifier hors du système, et
 * scellement à la demande d'un acte que le scellement automatique n'a pas couvert. Rien ne s'affiche en démonstration ni sans client de la conservation.
 */
export function ActSealPanel({ type, id }: { type: ActType; id: string }) {
    const { retention, epoch, demo } = useSession();
    const [revision, setRevision] = useState(0);
    const action = useAction();
    const last = useRef<ActSeal | null>(null);
    const q = useResource<ActSeal | null>(async s => (!demo && retention ? await retention.actSeal(type, id, s) : null), `act-seal:${type}:${id}:${revision}:${epoch}`);
    if (q.data) last.current = q.data;
    if (demo || !retention) return null;
    const seal = q.data ?? last.current;
    if (!seal && q.loading) return <Busy />;
    // un acte que l'on ne peut pas lire ici, ou un serveur qui ne connaît pas encore le sceau, ne s'affiche pas comme une panne
    if (!seal && q.error) return q.error instanceof ApiError && q.error.status === 404 ? null : <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!seal) return null;
    const headline = sealHeadline(seal);
    const download = async (kind: 'content' | 'signature') => {
        const blob = await action.run({ download: kind, type, id }, () => kind === 'content' ? retention.actSealContent(type, id) : retention.actSealSignature(type, id));
        if (blob) saveBlob(blob, sealFileName(seal.reference, kind));
    };
    const sealNow = async () => {
        if (await action.run({ seal: type, id }, key => retention.sealAct(type, id, key))) setRevision(n => n + 1);
    };
    const v = seal.verification;
    return <section className="act-seal" aria-label={`Sceau du ${ACT_LABELS[type]}`}>
        <h4>Sceau électronique</h4>
        <Notice tone={headline.tone === 'warning' ? 'warning' : 'info'}>{headline.text}</Notice>
        {seal.status === 'SEALED' && <dl className="detail-card">
            <div><dt>Scellé le</dt><dd>{seal.sealedAt ? formatDate(seal.sealedAt) : '—'}</dd></div>
            <div><dt>Signataire</dt><dd>{seal.signer ?? '—'}</dd></div>
            <div><dt>Signature</dt><dd>{v ? <Badge value={v.integrity} label={v.integrity === 'INTEGRITE_VALIDE' ? 'Valide' : v.integrity === 'INTEGRITE_INVALIDE' ? 'Contenu modifié' : 'Indéterminée'} /> : '—'}</dd></div>
            {v && <div><dt>Certificat du sceau</dt><dd>{CHAIN_LABELS[v.chain]}{v.chainAnchor ? ` — ${v.chainAnchor}` : ''}{v.chainMessage ? <small className="cell-sub">{v.chainMessage}</small> : null}</dd></div>}
            <div><dt>Empreinte du contenu signé</dt><dd><code title={seal.contentFingerprint ?? undefined}>{shortHash(seal.contentFingerprint)}</code></dd></div>
            <div><dt>Empreinte du certificat</dt><dd><code title={seal.certificateFingerprint ?? undefined}>{shortHash(seal.certificateFingerprint)}</code></dd></div>
        </dl>}
        {seal.status === 'SEALED' && <>
            <p><button type="button" className="btn small secondary" onClick={() => void download('content')} disabled={action.busy}>Télécharger le contenu signé</button>{' '}
                <button type="button" className="btn small secondary" onClick={() => void download('signature')} disabled={action.busy}>Télécharger la signature (.p7s)</button></p>
            <details><summary>Vérifier hors du système</summary>
                <p><small>Avec les deux fichiers téléchargés (le contenu et la signature détachée, au format CMS/CAdES), n’importe quel outil de vérification CMS peut contrôler le sceau. Par exemple avec OpenSSL :</small></p>
                <pre className="code-block"><code>{verifyCommand(seal.reference)}</code></pre>
                <p><small>OpenSSL contrôle la signature ; la confiance accordée au certificat du sceau se juge auprès de l’institution. La révocation du certificat n’est pas vérifiée par ce système.</small></p>
            </details>
        </>}
        {seal.status === 'UNSEALED' && seal.signingEnabled && <p><button type="button" className="btn small primary" onClick={() => void sealNow()} disabled={action.busy}>Sceller maintenant</button></p>}
        {action.error ? <ErrorNotice error={action.error} /> : null}
    </section>;
}
