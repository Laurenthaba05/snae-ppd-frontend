import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { ReasonPrompt, saveBlob, useAction } from './ReadingRoomParts';
import { EntityName } from './names';
import { can } from '../core/policy';
import { formatBytes } from '../core/format';
import {
    MIGRATION_LINE_LABELS, MIGRATION_STATUS_LABELS, canCancelMigration, canRetryMigration, candidateText, copyText, emptyMigrationForm, lineBadge, migratedCopyFileName,
    migrationBadge, migrationBody, migrationProblems, migrationSummary, policyNotice, validationState,
    type MigratedCopy, type MigrationCampaign, type MigrationCampaignSummary, type MigrationCandidates, type MigrationConverter
} from '../core/formatMigration';

/**
 * Migration de formats : les campagnes de l'institution (préparer, valider par une autre personne, annuler, relancer) et ce que chacune a produit. Le registre des formats désigne le
 * format cible ; le convertisseur ne fait qu'exécuter. L'original n'est jamais remplacé.
 */
export function FormatMigrationPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_MIGRATION_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const converters = useResource<MigrationConverter[]>(s => preservationPlanning!.migrationConverters(institutionId, s), `migration-converters:${institutionId}:${epoch}`);
    const campaigns = useResource<MigrationCampaignSummary[]>(s => preservationPlanning!.migrationCampaigns(institutionId, s), `migration-campaigns:${institutionId}:${revision}:${epoch}`);
    const list = campaigns.data ?? [];
    const disabled = (converters.data ?? []).length > 0 && (converters.data ?? []).every(c => !c.enabled);
    return <section className="panel" aria-label="Migration des formats">
        <div className="section-heading"><h3>Migration des formats</h3>
            {mayManage && <button type="button" className="btn small primary" onClick={() => setCreating(true)} disabled={!converters.data?.length}>Préparer une migration</button>}</div>
        <div className="panel-padding">
            <Notice>Une campagne applique un convertisseur à des fichiers dont le registre des formats désigne un format cible. Elle est préparée par une personne et validée par une autre ;
                l’original est toujours conservé, la copie migrée est vérifiée puis rangée à côté et tracée dans la description PREMIS.</Notice>
            {disabled && <Notice tone="warning">L’exécution des migrations n’est pas activée sur ce serveur : une campagne se prépare, mais ne peut pas être validée tant que l’administration ne l’a pas activée.</Notice>}
        </div>
        {campaigns.loading && !campaigns.data ? <Busy /> : campaigns.error ? <ErrorNotice error={campaigns.error} onRetry={campaigns.refresh} />
            : list.length === 0 ? <Empty title="Aucune campagne de migration" description="Inscrivez d’abord le format cible au registre, puis préparez une campagne." icon="refresh" />
                : <div className="table-scroll"><table><thead><tr><th>Campagne</th><th>Format</th><th>État</th><th>Avancement</th><th>Préparée par</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(c => <tr key={c.id}>
                        <td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                        <td>{c.sourceType} → {c.targetType}<small className="cell-sub">{c.converter}</small></td>
                        <td><Badge value={migrationBadge(c.status)} label={MIGRATION_STATUS_LABELS[c.status]} /></td>
                        <td>{migrationSummary(c)}</td>
                        <td><EntityName kind="users" id={c.createdById} /><small className="cell-sub">{formatDate(c.createdAt)}</small></td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpenId(c.id)} aria-label={`Ouvrir la campagne ${c.reference}`}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <MigrationCreateDialog institutionId={institutionId} converters={converters.data ?? []} onClose={() => setCreating(false)}
            onDone={campaign => { setCreating(false); setRevision(n => n + 1); setOpenId(campaign.summary.id); }} />}
        {openId && <MigrationCampaignDialog id={openId} institutionId={institutionId} onClose={() => setOpenId(null)} onChanged={() => setRevision(n => n + 1)} />}
    </section>;
}

function MigrationCreateDialog({ institutionId, converters, onClose, onDone }: {
    institutionId: string; converters: MigrationConverter[]; onClose: () => void; onDone: (campaign: MigrationCampaign) => void;
}) {
    const { preservationPlanning } = useSession();
    const [form, setForm] = useState(emptyMigrationForm);
    const [candidates, setCandidates] = useState<MigrationCandidates | null>(null);
    const [attempted, setAttempted] = useState(false);
    const search = useAction();
    const action = useAction();
    const converter = converters.find(c => c.code === form.converter) ?? null;
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const choose = (patch: Partial<typeof form>) => { setForm(prev => ({ ...prev, ...patch, fileIds: [] })); setCandidates(null); };
    const problems = migrationProblems(form);
    const notice = candidates && form.sourceType ? policyNotice(candidates.policy, form.sourceType) : null;
    const find = async () => {
        const found = await search.run({ find: form.converter, source: form.sourceType }, () => preservationPlanning!.migrationCandidates(institutionId, form.converter, form.sourceType, 200));
        if (found) { setCandidates(found); setForm(prev => ({ ...prev, fileIds: [] })); }
    };
    const toggle = (id: string) => set('fileIds', form.fileIds.includes(id) ? form.fileIds.filter(x => x !== id) : [...form.fileIds, id]);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = migrationBody(institutionId, form);
        const created = await action.run(body, key => preservationPlanning!.createMigration(body, key));
        if (created) onDone(created);
    };
    return <Modal wide title="Préparer une migration de formats" subtitle="Le format cible est celui que le registre désigne" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Convertisseur *"><select value={form.converter} onChange={e => choose({ converter: e.target.value, sourceType: '' })} disabled={action.busy}>
                    <option value="">Choisir…</option>
                    {converters.map(c => <option key={c.code} value={c.code}>{c.label} ({c.target})</option>)}</select></Field>
                <Field label="Format à migrer *"><select value={form.sourceType} onChange={e => choose({ sourceType: e.target.value })} disabled={action.busy || !converter}>
                    <option value="">Choisir…</option>
                    {(converter?.sources ?? []).map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
            </div>
            {converter && <p><small>Format produit : <strong>{converter.target}</strong>. {converter.lossless
                ? 'La conversion ne perd aucune donnée décodée ; elle ne restaure pas ce qu’une compression avec perte a déjà détruit. Les métadonnées incorporées restent dans l’original.'
                : 'La conversion peut perdre des données.'}</small></p>}
            <div className="table-actions">
                <button type="button" className="btn small secondary" disabled={!form.converter || !form.sourceType || search.busy} onClick={find}>Chercher les fichiers éligibles</button>
            </div>
            {search.error ? <ErrorNotice error={search.error} /> : null}
            {notice && <Notice tone={notice.ok ? 'info' : 'warning'}>{notice.text}</Notice>}
            {candidates && (candidates.items.length === 0
                ? <p><small>Aucun fichier éligible : il doit être validé, sain, vérifié dans le stockage, de ce format, et ne pas être déjà migré ni prévu dans une autre campagne.</small></p>
                : <fieldset className="check-list"><legend>Fichiers à migrer ({form.fileIds.length} choisi{form.fileIds.length > 1 ? 's' : ''} sur {candidates.items.length}{candidates.hasMore ? ', liste tronquée' : ''})</legend>
                    <button type="button" className="btn small secondary" onClick={() => set('fileIds', form.fileIds.length === candidates.items.length ? [] : candidates.items.map(i => i.fileId))}>
                        {form.fileIds.length === candidates.items.length ? 'Tout décocher' : 'Tout cocher'}</button>
                    {candidates.items.map(i => <label key={i.fileId} className="check-row"><input type="checkbox" checked={form.fileIds.includes(i.fileId)} onChange={() => toggle(i.fileId)} disabled={action.busy} /> {candidateText(i)}</label>)}
                </fieldset>)}
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={form.title} onChange={e => set('title', e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Motif de la migration *" wide hint="Pourquoi migrer ce format maintenant (10 caractères au moins)."><textarea value={form.motive} onChange={e => set('motive', e.target.value)} rows={3} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || (notice !== null && !notice.ok)}>Préparer la campagne</button></footer>
        </form>
    </Modal>;
}

function MigrationCampaignDialog({ id, institutionId, onClose, onChanged }: { id: string; institutionId: string; onClose: () => void; onChanged: () => void }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_MIGRATION_MANAGE', { institutionId });
    const mayApprove = can(me, 'PRESERVATION_MIGRATION_APPROVE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [cancelling, setCancelling] = useState(false);
    const action = useAction();
    const q = useResource<MigrationCampaign>(s => preservationPlanning!.migrationCampaign(id, s), `migration-campaign:${id}:${revision}:${epoch}`);
    // le dernier état connu reste affiché pendant le rechargement : la fenêtre ne clignote pas après un geste
    const last = useRef<MigrationCampaign | null>(null);
    if (q.data) last.current = q.data;
    const c = q.data ?? last.current;
    const done = () => { setRevision(n => n + 1); onChanged(); };
    const validate = async () => { if (await action.run({ validate: id }, key => preservationPlanning!.validateMigration(id, key))) done(); };
    const retry = async (lineId: string | null) => { if (await action.run({ retry: id, lineId }, key => preservationPlanning!.retryMigration(id, lineId, key))) done(); };
    const state = c ? validationState(c.summary, me?.user.id, mayApprove) : null;
    return <Modal wide title={c ? `Campagne ${c.summary.reference}` : 'Campagne de migration'} subtitle={c?.summary.title} onClose={onClose} locked={action.busy}>
        {q.loading && !c ? <Busy /> : q.error && !c ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : c && <>
            <p><Badge value={migrationBadge(c.summary.status)} label={MIGRATION_STATUS_LABELS[c.summary.status]} /> {c.summary.sourceType} → {c.summary.targetType} — {c.summary.converter} v{c.summary.converterVersion}</p>
            <p>{migrationSummary(c.summary)}</p>
            <p><small>Préparée par <EntityName kind="users" id={c.summary.createdById} /> le {formatDate(c.summary.createdAt)}.
                {c.summary.validatedById && <> Validée par <EntityName kind="users" id={c.summary.validatedById} />{c.summary.validatedAt ? ` le ${formatDate(c.summary.validatedAt)}` : ''}.</>}
                {c.summary.completedAt && <> Terminée le {formatDate(c.summary.completedAt)}.</>}</small></p>
            <p><strong>Motif.</strong> {c.motive}</p>
            {c.cancellationReason && <Notice tone="warning">Annulée{c.cancelledById && <> par <EntityName kind="users" id={c.cancelledById} /></>} : {c.cancellationReason}</Notice>}
            {state?.reason && <Notice>{state.reason}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <div className="table-scroll"><table><thead><tr><th>Fichier</th><th>Taille</th><th>État</th><th>Détail</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{c.lines.map(l => <tr key={l.id}>
                    <td><strong>{l.documentReference}</strong><small className="cell-sub">Ligne {l.rank}</small></td>
                    <td>{formatBytes(l.size)}</td>
                    <td><Badge value={lineBadge(l.status)} label={MIGRATION_LINE_LABELS[l.status]} /></td>
                    <td>{l.status === 'ECHEC' ? (l.errorMessage ?? l.errorCode) : l.status === 'MIGRE' && l.processedAt ? `Migré le ${formatDate(l.processedAt)}` : l.attempts > 0 ? `${l.attempts} tentative${l.attempts > 1 ? 's' : ''}` : '—'}</td>
                    <td className="table-actions">{mayManage && l.status === 'ECHEC' && canRetryMigration(c.summary) &&
                        <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => retry(l.id)} aria-label={`Relancer la ligne ${l.rank}`}>Relancer</button>}</td>
                </tr>)}</tbody></table></div>
            <footer className="modal-footer">
                <button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                {mayManage && canRetryMigration(c.summary) && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => retry(null)}>Relancer les échecs</button>}
                {(mayManage || mayApprove) && canCancelMigration(c.summary.status) && <button type="button" className="btn danger" disabled={action.busy} onClick={() => setCancelling(true)}>Annuler la campagne</button>}
                {state?.allowed && <button type="button" className="btn primary" disabled={action.busy} onClick={validate}>Valider la campagne</button>}
            </footer>
        </>}
        {cancelling && c && <ReasonPrompt title="Annuler la campagne" subtitle={c.summary.reference}
            hint="Les fichiers pas encore migrés sont abandonnés ; les copies déjà produites restent, vérifiées et tracées."
            confirm="Annuler la campagne" onClose={() => setCancelling(false)}
            onSubmit={async (reason, key) => { await preservationPlanning!.cancelMigration(id, reason, key); setCancelling(false); done(); }} />}
    </Modal>;
}

/** Les copies migrées d'un document : ce que la migration a produit, avec la campagne et l'empreinte ; le contenu se télécharge avec les droits du contenu du maître. */
export function DocumentMigrationsList({ documentId }: { documentId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayDownload = can(me, 'FILE_CONTENT_DOWNLOAD', {});
    const action = useAction();
    const q = useResource<MigratedCopy[]>(s => preservationPlanning!.documentMigrations(documentId, s), `document-migrations:${documentId}:${epoch}`);
    const list = q.data ?? [];
    const download = async (copy: MigratedCopy) => {
        const blob = await action.run({ copy: copy.id }, () => preservationPlanning!.downloadMigratedCopy(copy.fileId, copy.id));
        if (blob) saveBlob(blob, migratedCopyFileName(copy));
    };
    if (q.loading && !q.data) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    return <>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {list.length === 0 ? <p><small>Aucune copie migrée : les fichiers de ce document sont conservés dans leur format d’origine.</small></p>
            : <div className="table-scroll"><table><thead><tr><th>Copie migrée</th><th>Produite par</th><th>Empreinte SHA-256</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{list.map(copy => <tr key={copy.id}>
                    <td><strong>{copy.fileName}</strong><small className="cell-sub">{copyText(copy)}</small></td>
                    <td>{copy.converter}{copy.campaignReference && <small className="cell-sub">Campagne {copy.campaignReference} — {formatDate(copy.createdAt)}</small>}</td>
                    <td><code>{copy.sha256.slice(0, 16)}…</code></td>
                    <td className="table-actions">{mayDownload && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => download(copy)}
                        aria-label={`Télécharger la copie migrée de ${copy.fileName}`}>Télécharger</button>}</td>
                </tr>)}</tbody></table></div>}
    </>;
}
