import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';
import { useAction } from './ReadingRoomParts';
import { can } from '../core/policy';
import {
    CONCORDANCE_LABELS, IDENTIFICATION_STATE_LABELS, concordanceBadge, identificationSummaryText, mismatchText, rowFormatName, rowVolume, runText, stateBadge,
    type FileIdentification, type IdentificationRun, type IdentificationStatus, type IdentificationSummary
} from '../core/formatIdentification';

/**
 * Identification des formats par signature : ce que l'outil (Siegfried, base PRONOM) reconnaît d'après le contenu, comparé au type de média déclaré. L'outil n'est pas livré avec
 * l'application ; sans lui, le panneau le dit et ne propose rien.
 */
export function FormatIdentificationPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_PLANNING_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [report, setReport] = useState<IdentificationRun | null>(null);
    const action = useAction();
    const status = useResource<IdentificationStatus>(s => preservationPlanning!.identificationStatus(institutionId, s), `identification-status:${institutionId}:${revision}:${epoch}`);
    const summary = useResource<IdentificationSummary>(s => preservationPlanning!.identificationSummary(institutionId, s), `identification-summary:${institutionId}:${revision}:${epoch}`);
    const st = status.data;
    const sum = summary.data;
    const ready = !!st && st.enabled && st.configured;
    const run = async () => {
        const result = await action.run({ identify: institutionId, revision }, key => preservationPlanning!.runIdentification(institutionId, key));
        if (result) { setReport(result); setRevision(n => n + 1); }
    };
    return <section className="panel" aria-label="Identification par signature">
        <div className="section-heading"><h3>Identification par signature</h3>
            {mayManage && <button type="button" className="btn small primary" disabled={!ready || action.busy || (sum?.pending ?? 0) === 0} onClick={run}>Identifier les fichiers restants</button>}</div>
        <div className="panel-padding">
            <Notice>Le format d’un fichier n’était jusqu’ici que son type de média déclaré. Un outil d’identification compare le contenu à la base PRONOM ; ce qu’il ne reconnaît pas est
                « inconnu », jamais présumé sûr.</Notice>
            {st && !st.enabled && <Notice tone="warning">L’identification par signature n’est pas activée sur ce serveur : l’outil (Siegfried) n’est pas livré avec l’application, l’administration doit
                l’installer et l’activer.</Notice>}
            {st && st.enabled && !st.configured && <Notice tone="warning">L’identification est activée, mais l’exécutable de l’outil n’est pas valide sur ce serveur : vérifiez son chemin.</Notice>}
            {st?.tool && <p><small>Outil : {st.tool}{st.toolVersion ? ` ${st.toolVersion}` : ''}{st.signature ? ` — ${st.signature}` : ''}{st.lastRunAt ? ` — dernier passage le ${formatDate(st.lastRunAt)}` : ''}.</small></p>}
            {report && <Notice tone={report.failed ? 'warning' : 'info'}>{runText(report)}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
        </div>
        {summary.loading && !sum ? <Busy label="Lecture du bilan…" /> : summary.error ? <ErrorNotice error={summary.error} onRetry={summary.refresh} /> : sum && <>
            <div className="panel-padding"><p>{identificationSummaryText(sum)}</p></div>
            {sum.rows.length === 0 ? <Empty title="Aucun format identifié" description="Lancez un passage une fois l’outil installé et activé." icon="document" />
                : <div className="table-scroll"><table><thead><tr><th>Format reconnu</th><th>Identifiant PRONOM</th><th>Type de média</th><th>Fichiers</th><th>Volume</th><th>Registre</th><th>Écarts</th></tr></thead>
                    <tbody>{sum.rows.map(r => <tr key={`${r.puid}:${r.mediaType}`}>
                        <td><strong>{rowFormatName(r)}</strong></td>
                        <td><code>{r.puid ?? '—'}</code></td>
                        <td>{r.mediaType ?? '—'}</td>
                        <td>{r.files}</td>
                        <td>{rowVolume(r)}</td>
                        <td>{r.registered ? <Badge value="ACTIF" label="Au registre" /> : <Badge value="BROUILLON" label="Non évalué" />}</td>
                        <td>{r.mismatches > 0 ? <Badge value="ECHEC" label={`${r.mismatches} différent${r.mismatches > 1 ? 's' : ''}`} /> : '—'}</td>
                    </tr>)}</tbody></table></div>}
            {sum.mismatches.length > 0 && <div className="panel-padding">
                <h4>Type déclaré différent du format reconnu</h4>
                <ul className="plain-list">{sum.mismatches.map(m => <li key={m.fileId}>{mismatchText(m)}</li>)}</ul>
                <p><small>Un écart n’est pas une erreur en soi : il invite à vérifier le fichier et son type déclaré avant de décider d’une migration.</small></p>
            </div>}
        </>}
    </section>;
}

/** L'identification des fichiers d'un document : format reconnu, identifiant PRONOM et comparaison au type déclaré. */
export function DocumentIdentificationList({ documentId }: { documentId: string }) {
    const { preservationPlanning, epoch } = useSession();
    const q = useResource<FileIdentification[]>(s => preservationPlanning!.documentIdentifications(documentId, s), `document-identifications:${documentId}:${epoch}`);
    const list = q.data ?? [];
    if (q.loading && !q.data) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (list.length === 0) return <p><small>Aucun fichier de ce document n’a encore été identifié par signature.</small></p>;
    return <div className="table-scroll"><table><thead><tr><th>Fichier</th><th>Format reconnu</th><th>Type déclaré</th><th>Comparaison</th></tr></thead>
        <tbody>{list.map(f => <tr key={f.fileId}>
            <td><strong>{f.fileName}</strong><small className="cell-sub">{f.tool}{f.toolVersion ? ` ${f.toolVersion}` : ''} — {formatDate(f.identifiedAt)}</small></td>
            <td>{f.status === 'INCONNU' ? <Badge value={stateBadge(f.status)} label={IDENTIFICATION_STATE_LABELS[f.status]} />
                : <>{f.name ?? f.puid}{f.version ? ` ${f.version}` : ''}<small className="cell-sub"><code>{f.puid}</code>{f.status === 'AMBIGU' ? ` — ${f.candidates} correspondances possibles` : ''}</small></>}
                {f.warning && <small className="cell-sub">{f.warning}</small>}</td>
            <td>{f.declaredMediaType ?? '—'}</td>
            <td><Badge value={concordanceBadge(f.concordance)} label={CONCORDANCE_LABELS[f.concordance]} /></td>
        </tr>)}</tbody></table></div>;
}
