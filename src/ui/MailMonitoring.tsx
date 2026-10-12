import React from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';
import { categoryLabel, errorText, failureTitle, summaryText, type MailStatus } from '../core/mail';

/** L'envoi de courrier du portail : ce qui attend, ce qui est parti, ce qui a échoué (destinataire masqué, jamais le contenu). */
export function MailStatusPanel() {
    const { portalAdmin, epoch } = useSession();
    const q = useResource<MailStatus>(signal => portalAdmin!.mailStatus(signal), `mail-status:${epoch}`);
    const data = q.data;
    const summary = data ? summaryText(data, Date.now()) : null;
    return <section className="panel" aria-label="Courriers sortants">
        <div className="table-toolbar"><h3>Courriers sortants</h3><button className="btn secondary small" disabled={q.loading} onClick={q.refresh}>Actualiser les courriers</button></div>
        {q.loading && !data ? <Busy label="Chargement des courriers…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : data && summary && <>
            <div className="panel-padding">
                <p>Les messages du portail (vérification de l’adresse, réinitialisation du mot de passe, accès accordé) sont déposés dans une boîte d’envoi, puis envoyés par le serveur de courrier
                    de l’institution. Un lien de vérification ou de réinitialisation n’est jamais montré ici.</p>
                <Notice tone={summary.problem ? 'warning' : 'info'}>{summary.text}</Notice>
                <dl className="preservation-summary">
                    <div><dt>En attente</dt><dd>{data.pending}</dd></div>
                    <div><dt>Envoyés</dt><dd>{data.sent}</dd></div>
                    <div><dt>En échec</dt><dd>{data.failed}</dd></div>
                    <div><dt>Dernier envoi</dt><dd>{formatDate(data.lastSentAt)}</dd></div>
                    {data.oldestPendingAt && <div><dt>Plus ancien en attente</dt><dd>{formatDate(data.oldestPendingAt)}</dd></div>}
                </dl>
                {data.configured && data.security && <p><small>Connexion {data.security === 'TLS' ? 'chiffrée (TLS)' : data.security === 'STARTTLS' ? 'chiffrée (STARTTLS)' : 'locale, sans chiffrement (développement)'}.</small></p>}
            </div>
            {data.failures.length === 0 ? <Empty title="Aucun courrier en échec" icon="check" />
                : <div className="table-scroll"><table><thead><tr><th>Courrier</th><th>Origine</th><th>Cause</th><th>Essais</th><th>Déposé le</th></tr></thead>
                    <tbody>{data.failures.map((f, i) => <tr key={i}>
                        <td>{failureTitle(f)}</td>
                        <td><Badge value={f.category} label={categoryLabel(f.category)} /></td>
                        <td>{errorText(f.errorCode)}</td>
                        <td>{f.attempts}</td>
                        <td>{formatDate(f.createdAt)}</td>
                    </tr>)}</tbody></table></div>}
        </>}
    </section>;
}
