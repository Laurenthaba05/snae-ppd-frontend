import React from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { commonName } from '../core/signatures';
import { Badge, Busy, ErrorNotice, Notice, formatDate, useResource } from './components';
import { ALGORITHM_LABELS, badge, storeLabel, usageText, validityText, type SealKeyStatus } from '../core/sealKey';

/**
 * La clé qui scelle les actes du système : où elle est gardée (module matériel ou magasin logiciel), son certificat, son expiration et les certificats déjà employés pour sceller.
 * Information d'exploitation nationale : réservée à la gestion nationale des autorités de confiance. Lecture seule : la clé se change par la configuration du serveur.
 */
export function SealKeyStatusSection() {
    const { me, records, epoch, demo } = useSession();
    const allowed = !demo && !!records && can(me, 'TRUST_ANCHOR_MANAGE', {});
    const q = useResource<SealKeyStatus | null>(s => allowed ? records!.sealKeyStatus(s) : Promise.resolve(null), `seal-key-status:${allowed}:${epoch}`);
    if (!allowed) return null;
    const s = q.data;
    return <section className="panel" aria-label="Clé de scellement des actes">
        <div className="section-heading"><h3>Clé de scellement des actes</h3>{s && <Badge value={badge(s)} label={s.enabled ? 'Active' : 'Non activée'} />}</div>
        {q.loading && !s ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : s && <div className="panel-padding">
            {!s.enabled ? <Notice>Le scellement des actes n’est pas activé sur ce serveur : aucune clé n’est configurée, les actes ne portent aucun sceau.</Notice> : <>
                {s.warnings.map(w => <Notice key={w} tone="warning">{w}</Notice>)}
                <dl className="seal-key-facts">
                    <div><dt>Garde de la clé</dt><dd>{storeLabel(s)}{s.alias && <small className="cell-sub">Alias : {s.alias}</small>}</dd></div>
                    <div><dt>Certificat</dt><dd>{commonName(s.subject ?? '')}<small className="cell-sub">Émis par {commonName(s.issuer ?? '')}</small></dd></div>
                    <div><dt>Validité</dt><dd>{s.notBefore ? formatDate(s.notBefore) : '—'} → {s.notAfter ? formatDate(s.notAfter) : '—'}<small className="cell-sub">{validityText(s)}</small></dd></div>
                    <div><dt>Algorithme</dt><dd>{(s.algorithm && ALGORITHM_LABELS[s.algorithm]) ?? s.algorithm ?? '—'}{s.keyBits ? `, ${s.keyBits} bits` : ''}</dd></div>
                    <div><dt>Empreinte SHA-256</dt><dd><code title={s.fingerprint ?? undefined}>{s.fingerprint ? s.fingerprint.slice(0, 24) + '…' : '—'}</code></dd></div>
                    <div><dt>Actes scellés avec cette clé</dt><dd>{s.sealsWithCurrentKey}</dd></div>
                </dl>
                {s.history.length > 0 && <div className="table-scroll"><table><thead><tr><th>Certificat employé</th><th>Actes</th><th>Premier</th><th>Dernier</th><th>État</th></tr></thead>
                    <tbody>{s.history.map(h => <tr key={h.fingerprint}>
                        <td>{commonName(h.subject ?? '')}<small className="cell-sub"><code>{h.fingerprint.slice(0, 16)}…</code></small></td>
                        <td>{usageText(h)}</td><td>{formatDate(h.firstSealedAt)}</td><td>{formatDate(h.lastSealedAt)}</td>
                        <td>{h.current ? <Badge value="ACTIF" label="Clé actuelle" /> : <Badge value="BROUILLON" label="Ancienne clé" />}</td>
                    </tr>)}</tbody></table></div>}
                <p><small>Les sceaux déjà posés portent leur certificat : changer de clé n’en modifie aucun. Ils restent « de confiance » tant que leur autorité est déclarée parmi les autorités de
                    confiance. La clé se change par la configuration du serveur et un redémarrage.</small></p>
            </>}
        </div>}
    </section>;
}
