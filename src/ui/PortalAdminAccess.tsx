import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { ACCESS_FILTERS, ACCESS_MAX_DAYS, accessJournalText, accessStateLabel, accessUntilText, emptyGrantForm, grantBody, grantProblems, messageBody, messageProblems, type GrantForm } from '../core/portal';
import type { AccessJournalEntry, AccessRequestRow, AdminAccessRequest, PortalPage } from '../core/types';
import { useCommand } from './PortalAdmin';

const today = () => new Date().toISOString().slice(0, 10);

/** L'accord : jusqu'à quel jour le lecteur peut lire, avec un mot facultatif. L'accès est borné par le serveur à la fin de ce jour. */
function GrantDialog({ request, onClose, onDone }: { request: AdminAccessRequest; onClose: () => void; onDone: () => void }) {
    const [form, setForm] = useState<GrantForm>(() => emptyGrantForm(today()));
    const [touched, setTouched] = useState(false);
    const command = useCommand();
    const problems = grantProblems(form, today());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setTouched(true);
        if (problems.length) return;
        if (await command.send(`/access-requests/${request.id}/grant`, grantBody(form)) !== null) { onDone(); onClose(); }
    };
    return <Modal title="Accorder l’accès" subtitle={`${request.lecteur.nom} · ${request.documentTitre}`} onClose={onClose} locked={command.busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                <Field label="Accès accordé jusqu’au (inclus)" hint={`Au plus ${ACCESS_MAX_DAYS} jours : au-delà, une nouvelle demande est déposée.`} error={touched && problems.length ? problems[0] : undefined}>
                    <input type="date" value={form.jusquAu} min={today()} onChange={e => setForm({ ...form, jusquAu: e.target.value })} disabled={command.busy} required /></Field>
                <Field label="Message au lecteur (facultatif)" hint="Envoyé avec la décision." wide><textarea value={form.message} rows={3} maxLength={2000} onChange={e => setForm({ ...form, message: e.target.value })} disabled={command.busy} /></Field>
            </div>
            {!request.lecteurAbonne && <Notice tone="warning">Ce lecteur n’a pas d’abonnement en cours : l’accès accordé ne s’ouvrira que lorsqu’il en aura un.</Notice>}
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={command.busy}>Annuler</button><button type="submit" className="btn primary" disabled={command.busy}>{command.busy ? 'Envoi…' : 'Accorder l’accès'}</button></footer>
        </form>
    </Modal>;
}

/** Refuser ou révoquer : le message écrit part au lecteur, il dit pourquoi. */
function MessageDialog({ title, subtitle, path, label, confirm, onClose, onDone }: { title: string; subtitle: string; path: string; label: string; confirm: string; onClose: () => void; onDone: () => void }) {
    const [message, setMessage] = useState('');
    const [touched, setTouched] = useState(false);
    const command = useCommand();
    const problems = messageProblems(message);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setTouched(true);
        if (problems.length) return;
        if (await command.send(path, messageBody(message)) !== null) { onDone(); onClose(); }
    };
    return <Modal title={title} subtitle={subtitle} onClose={onClose} locked={command.busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                <Field label={label} hint="Écrit au dossier, conservé au journal et communiqué au lecteur." error={touched && problems.length ? problems[0] : undefined} wide><textarea value={message} rows={4} maxLength={2000} onChange={e => setMessage(e.target.value)} disabled={command.busy} required /></Field>
            </div>
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={command.busy}>Annuler</button><button type="submit" className="btn danger" disabled={command.busy}>{command.busy ? 'Envoi…' : confirm}</button></footer>
        </form>
    </Modal>;
}

function RequestDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { portalAdmin } = useSession();
    const q = useResource<AdminAccessRequest>(s => portalAdmin!.accessRequest(id, s), 'portal-access:' + id);
    const journal = useResource<AccessJournalEntry[]>(s => portalAdmin!.accessRequestJournal(id, s), 'portal-access-journal:' + id);
    const [action, setAction] = useState<'grant' | 'refuse' | 'revoke' | null>(null);
    const claim = useCommand();
    const r = q.data;
    const done = () => { q.refresh(); journal.refresh(); onChanged(); };
    return <Modal title={r ? 'Demande ' + r.numero : 'Demande d’accès'} subtitle={r ? `${r.lecteur.nom} (${r.lecteur.numero})` : undefined} onClose={onClose} wide>
        <div className="asset-tab">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : r && <>
                <p><Badge value={r.etat} label={accessStateLabel(r.etat)} /></p>
                <dl className="asset-fields">
                    <div><dt>Lecteur</dt><dd>{r.lecteur.nom}<small className="cell-sub">{r.lecteur.email}{r.lecteurOrganisme ? ' · ' + r.lecteurOrganisme : ''}{r.lecteur.suspendu && ' · compte suspendu'}</small></dd></div>
                    <div><dt>Abonnement</dt><dd>{r.lecteurAbonne ? 'En cours' : 'Aucun abonnement en cours'}</dd></div>
                    <div><dt>Document</dt><dd>{r.documentTitre}<small className="cell-sub mono">{r.documentIdentifiant}</small></dd></div>
                    <div><dt>Notice</dt><dd>{r.noticeIntitule ?? '—'}</dd></div>
                    <div><dt>Déposée le</dt><dd>{formatDate(r.deposeLe)}</dd></div>
                    <div><dt>Instruction</dt><dd>{r.instructeur ? `${r.instructeur} le ${formatDate(r.prisEnChargeLe)}` : '—'}</dd></div>
                    <div className="wide"><dt>Motif du lecteur</dt><dd className="portal-quote">{r.motif}</dd></div>
                    {r.decidePar && <div><dt>Décision</dt><dd>{r.decidePar} le {formatDate(r.decideLe)}</dd></div>}
                    {r.accordeJusquAu && <div><dt>Accès accordé jusqu’au</dt><dd>{accessUntilText(r)}</dd></div>}
                    {r.message && <div className="wide"><dt>Message au lecteur</dt><dd>{r.message}</dd></div>}
                    {r.revoqueLe && <div className="wide"><dt>Révocation</dt><dd>{r.revoquePar ?? '—'} le {formatDate(r.revoqueLe)}{r.revoqueMotif ? ' — ' + r.revoqueMotif : ''}</dd></div>}
                </dl>
                <div className="panel"><h4>Historique</h4>
                    {journal.loading ? <Busy /> : journal.error ? <ErrorNotice error={journal.error} onRetry={journal.refresh} /> : <ul className="portal-journal">{(journal.data ?? []).map(e => <li key={e.id}>
                        <strong>{accessJournalText(e.genre)}</strong> — {e.auteur ?? 'Système'}{e.auteurLecteur && ' (lecteur)'} · {formatDate(e.createdAt)}{e.motif && <small className="cell-sub">{e.motif}</small>}</li>)}</ul>}
                </div>
                {claim.error !== null && <ErrorNotice error={claim.error} />}
                <div className="asset-transitions">
                    {r.peutPrendreEnCharge && <button className="btn primary" disabled={claim.busy} onClick={() => void claim.send(`/access-requests/${r.id}/claim`, {}).then(result => { if (result !== null) done(); })}>{claim.busy ? 'Envoi…' : 'Prendre en charge'}</button>}
                    {r.peutAccorder && <button className="btn primary" onClick={() => setAction('grant')}>Accorder l’accès</button>}
                    {r.peutRefuser && <button className="btn secondary" onClick={() => setAction('refuse')}>Refuser</button>}
                    {r.peutRevoquer && <button className="btn secondary" onClick={() => setAction('revoke')}>Révoquer l’accès</button>}
                    {!r.peutPrendreEnCharge && !r.peutAccorder && !r.peutRefuser && !r.peutRevoquer && <p className="wf-note">Aucune action n’est possible pour votre profil sur cette demande dans son état actuel.</p>}
                </div>
            </>}
        </div>
        {r && action === 'grant' && <GrantDialog request={r} onClose={() => setAction(null)} onDone={done} />}
        {r && action === 'refuse' && <MessageDialog title="Refuser la demande" subtitle={`${r.lecteur.nom} · ${r.documentTitre}`} path={`/access-requests/${r.id}/refuse`} label="Message au lecteur" confirm="Refuser la demande" onClose={() => setAction(null)} onDone={done} />}
        {r && action === 'revoke' && <MessageDialog title="Révoquer l’accès" subtitle={`${r.lecteur.nom} · ${r.documentTitre}`} path={`/access-requests/${r.id}/revoke`} label="Motif de la révocation" confirm="Révoquer l’accès" onClose={() => setAction(null)} onDone={done} />}
    </Modal>;
}

/**
 * Les demandes d'accès des lecteurs du portail aux documents que le public ne lit pas librement. Chaque demande est jugée par une personne qui détient la revue des consultations
 * pour l'institution du document : les actions proposées viennent du serveur, qui reste seul juge.
 */
export function AccessRequestsPanel() {
    const { portalAdmin, epoch } = useSession();
    const [form, setForm] = useState({ statut: 'OUVERTES', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const list = useResource<PortalPage<AccessRequestRow>>(s => portalAdmin!.accessRequests({ statut: applied.statut, q: applied.q, page, size: 20 }, s), JSON.stringify(['portal-access-requests', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = list.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Demandes des lecteurs du portail</h3></div>
            <p className="wf-note">Un lecteur abonné peut demander l’accès à un document qui n’est pas en lecture libre. L’accord est limité dans le temps ; le lecteur est prévenu de la décision.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une demande d’accès">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, lecteur ou document" /></Field>
                <Field label="État"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{ACCESS_FILTERS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{list.data!.total} demande{list.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Demande</th><th>Lecteur</th><th>Document</th><th>Instruction</th><th>État</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.id)}>{r.numero}</button><small className="cell-sub">{formatDate(r.deposeLe)}</small></td>
                        <td>{r.lecteurNom}<small className="cell-sub">{r.lecteurNumero}</small></td>
                        <td>{r.documentTitre}{r.noticeIntitule && <small className="cell-sub">{r.noticeIntitule}</small>}</td>
                        <td>{r.instructeur ?? '—'}</td>
                        <td><Badge value={r.etat} label={accessStateLabel(r.etat)} />{r.etat === 'ACCORDEE' && r.accordeJusquAu && <small className="cell-sub">jusqu’au {accessUntilText(r)}</small>}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={list.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune demande" description="Aucune demande d’accès ne correspond à ces critères dans ce périmètre." icon="document" />}
        </div>
        {opened && <RequestDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(n => n + 1)} />}
    </>;
}
