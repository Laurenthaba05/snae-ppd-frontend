import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';
import { useAction } from './ReadingRoomParts';
import { can } from '../core/policy';
import {
    PDFA_STATE_LABELS, failureLine, nonCompliantText, pdfaBadge, pdfaRunText, pdfaSummaryText, profileLabel, profileModeText,
    type FilePdfaValidation, type PdfaRun, type PdfaStatus, type PdfaSummary
} from '../core/pdfaValidation';

/**
 * Validation PDF/A : ce que le validateur (veraPDF) constate d'après le contenu de chaque PDF, par profil. Le validateur n'est pas livré avec l'application ; sans lui, le panneau le
 * dit et ne propose rien. Une déclaration PDF/A dans les métadonnées d'un fichier ne prouve rien : seul ce constat vaut.
 */
export function PdfaValidationPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_PLANNING_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [report, setReport] = useState<PdfaRun | null>(null);
    const action = useAction();
    const status = useResource<PdfaStatus>(s => preservationPlanning!.pdfaStatus(institutionId, s), `pdfa-status:${institutionId}:${revision}:${epoch}`);
    const summary = useResource<PdfaSummary>(s => preservationPlanning!.pdfaSummary(institutionId, s), `pdfa-summary:${institutionId}:${revision}:${epoch}`);
    const st = status.data;
    const sum = summary.data;
    const ready = !!st && st.enabled && st.configured;
    const run = async () => {
        const result = await action.run({ pdfa: institutionId, revision }, key => preservationPlanning!.runPdfaValidation(institutionId, key));
        if (result) { setReport(result); setRevision(n => n + 1); }
    };
    return <section className="panel" aria-label="Validation PDF/A">
        <div className="section-heading"><h3>Validation PDF/A</h3>
            {mayManage && <button type="button" className="btn small primary" disabled={!ready || action.busy || (sum?.pending ?? 0) === 0} onClick={run}>Valider les PDF restants</button>}</div>
        <div className="panel-padding">
            <Notice>Un PDF peut se dire PDF/A dans ses métadonnées sans l’être. Un validateur (veraPDF) juge le contenu ; ce qu’il ne peut pas lire est « non analysable », jamais
                présumé conforme. L’application ne modifie jamais un original pour le rendre conforme.</Notice>
            {st && !st.enabled && <Notice tone="warning">La validation PDF/A n’est pas activée sur ce serveur : le validateur (veraPDF) n’est pas livré avec l’application, l’administration
                doit l’installer et l’activer.</Notice>}
            {st && st.enabled && !st.configured && <Notice tone="warning">La validation est activée, mais le lanceur du validateur n’est pas valide sur ce serveur : vérifiez son chemin.</Notice>}
            {st && st.enabled && <p><small>{profileModeText(st)}</small></p>}
            {st?.tool && <p><small>Outil : {st.tool}{st.toolVersion ? ` ${st.toolVersion}` : ''}{st.lastRunAt ? ` — dernier passage le ${formatDate(st.lastRunAt)}` : ''}.</small></p>}
            {report && <Notice tone={report.failed ? 'warning' : 'info'}>{pdfaRunText(report)}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
        </div>
        {summary.loading && !sum ? <Busy label="Lecture du bilan…" /> : summary.error ? <ErrorNotice error={summary.error} onRetry={summary.refresh} /> : sum && <>
            <div className="panel-padding"><p>{pdfaSummaryText(sum)}</p></div>
            {sum.profiles.length === 0 ? <Empty title="Aucun PDF validé" description="Lancez un passage une fois le validateur installé et activé." icon="document" />
                : <div className="table-scroll"><table><thead><tr><th>Profil jugé</th><th>Conformes</th><th>Non conformes</th></tr></thead>
                    <tbody>{sum.profiles.map(p => <tr key={p.code}>
                        <td><strong>{profileLabel(p.code, p.name)}</strong></td>
                        <td>{p.compliant}</td>
                        <td>{p.nonCompliant > 0 ? <Badge value="ECHEC" label={String(p.nonCompliant)} /> : '0'}</td>
                    </tr>)}</tbody></table></div>}
            {sum.failures.length > 0 && <div className="panel-padding">
                <h4>Règles les plus souvent échouées</h4>
                <div className="table-scroll"><table><thead><tr><th>Article</th><th>Règle</th><th>Fichiers</th></tr></thead>
                    <tbody>{sum.failures.map(f => <tr key={`${f.specification}:${f.clause}:${f.description}`}>
                        <td><code>{f.clause}</code>{f.specification && <small className="cell-sub">{f.specification}</small>}</td>
                        <td>{f.description || '—'}</td>
                        <td>{f.files}</td>
                    </tr>)}</tbody></table></div>
            </div>}
            {sum.files.length > 0 && <div className="panel-padding">
                <h4>PDF non conformes</h4>
                <ul className="plain-list">{sum.files.map(f => <li key={`${f.fileId}:${f.profileCode}`}>{nonCompliantText(f)}</li>)}</ul>
                <p><small>Un constat de non-conformité n’est pas un défaut du fichier à corriger d’office : il éclaire le choix d’une migration vers PDF/A à partir de l’original, qui reste conservé.</small></p>
            </div>}
        </>}
    </section>;
}

/** Les constats de validation PDF/A des fichiers d'un document : profil jugé, conformité, règles échouées. */
export function DocumentPdfaList({ documentId }: { documentId: string }) {
    const { preservationPlanning, epoch } = useSession();
    const q = useResource<FilePdfaValidation[]>(s => preservationPlanning!.documentPdfaValidations(documentId, s), `document-pdfa:${documentId}:${epoch}`);
    const list = q.data ?? [];
    if (q.loading && !q.data) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (list.length === 0) return <p><small>Aucun PDF de ce document n’a encore été validé.</small></p>;
    return <div className="table-scroll"><table><thead><tr><th>Fichier</th><th>Profil jugé</th><th>Déclare</th><th>Constat</th></tr></thead>
        <tbody>{list.flatMap(file => file.findings.map(f => <tr key={`${file.fileId}:${f.profileCode}`}>
            <td><strong>{file.fileName}</strong><small className="cell-sub">{f.tool}{f.toolVersion ? ` ${f.toolVersion}` : ''} — {formatDate(f.verifiedAt)}</small></td>
            <td>{profileLabel(f.profileCode, f.profileName)}</td>
            <td>{f.declaration ?? 'Aucun profil'}</td>
            <td><Badge value={pdfaBadge(f.status)} label={PDFA_STATE_LABELS[f.status]} />
                {f.status === 'NON_CONFORME' && <small className="cell-sub">{f.failedRules} règle{f.failedRules > 1 ? 's' : ''} échouée{f.failedRules > 1 ? 's' : ''}</small>}
                {f.failures.map(r => <small className="cell-sub" key={`${r.clause}:${r.testNumber}`}><code>{failureLine(r)}</code>{r.message ? ` — ${r.message}` : ''}</small>)}
                {f.status === 'NON_ANALYSABLE' && f.exception && <small className="cell-sub">{f.exception}</small>}</td>
        </tr>))}</tbody></table></div>;
}
