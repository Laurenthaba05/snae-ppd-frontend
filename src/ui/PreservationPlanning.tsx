import { DECISION_LABELS, COPYRIGHT_LABELS } from '../core/preservationPlanning';
import { RightEvidenceFields, RightDetailsView } from './RightEvidenceFields';
import { DocumentMigrationsList, FormatMigrationPanel } from './FormatMigration';
import { DocumentIdentificationList, FormatIdentificationPanel } from './FormatIdentification';
import { DocumentPdfaList, PdfaValidationPanel } from './PdfaValidation';
import { manifestFileName } from '../core/iiifViewer';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { ReasonPrompt, saveBlob, useAction } from './ReadingRoomParts';
import { can } from '../core/policy';
import { formatBytes, formatDay } from '../core/format';
import {
    ACT_LABELS, AGENT_LABELS, BASIS_LABELS, PERENNITY_LABELS, RELATION_LABELS, RISK_LABELS, agentBody, agentProblems, emptyAgentForm, emptyFormatForm, emptyRightForm, formatBody,
    formatProblems, premisFileName, relationProblems, riskBadge, riskSummary, riskText, rightBody, rightProblems, OAIS_STATUS_LABELS, PROFILE_LABELS, evaluationProblems, oaisBadge,
    oaisGroups, oaisSummary, packageFileName, packageText,
    type FileFormat, type FileRelation, type FormatRiskReport, type OaisDiagnostic, type OaisIndicator, type PackageExport, type PreservationAgent, type PreservationRight
} from '../core/preservationPlanning';
import type { DocumentFile, DocumentVersion } from '../core/types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Le diagnostic de risque des formats, le registre qui le fonde et les agents de conservation du périmètre : visible de qui lit ou tient la planification. */
export function PreservationPlanningSection() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    if (demo || !institutionId) return null;
    const planning = ['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE'].some(code => can(me, code, { institutionId }));
    const maturity = ['PRESERVATION_DIAGNOSTIC_READ', 'PRESERVATION_DIAGNOSTIC_MANAGE'].some(code => can(me, code, { institutionId }));
    const migration = ['PRESERVATION_MIGRATION_MANAGE', 'PRESERVATION_MIGRATION_APPROVE'].some(code => can(me, code, { institutionId }));
    if (!planning && !maturity && !migration) return null;
    return <>
        {maturity && <OaisDiagnosticPanel institutionId={institutionId} />}
        {planning && <FormatRiskPanel institutionId={institutionId} />}
        {planning && <FormatIdentificationPanel institutionId={institutionId} />}
        {planning && <PdfaValidationPanel institutionId={institutionId} />}
        {planning && <FormatRegistryPanel institutionId={institutionId} />}
        {(planning || migration) && <FormatMigrationPanel institutionId={institutionId} />}
        {planning && <PreservationAgentsPanel institutionId={institutionId} />}
    </>;
}

/** L'auto-diagnostic de maturité : ce que le système mesure, et ce qu'une personne habilitée atteste avec sa justification. Prépare l'évaluation, ne la remplace pas. */
function OaisDiagnosticPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_DIAGNOSTIC_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [evaluating, setEvaluating] = useState<OaisIndicator | null>(null);
    const q = useResource<OaisDiagnostic>(s => preservationPlanning!.oaisDiagnostic(institutionId, s), `oais-diagnostic:${institutionId}:${revision}:${epoch}`);
    const d = q.data;
    return <section className="panel" aria-label="Auto-diagnostic de conservation numérique">
        <div className="table-toolbar"><h3>Auto-diagnostic de conservation numérique</h3><button type="button" className="btn small secondary" disabled={q.loading} onClick={q.refresh}>Actualiser l’auto-diagnostic</button></div>
        {q.loading && !d ? <Busy label="Mesure des indicateurs…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : d && <>
            <div className="panel-padding">
                <Notice>{oaisSummary(d)}</Notice>
                <p><small>Les indicateurs « mesurés » viennent des registres du système ; les indicateurs « déclarés » sont attestés par une personne habilitée, avec sa justification. Cet auto-diagnostic prépare
                    une évaluation selon la norme ISO 16363 ; il ne vaut pas certification.</small></p>
            </div>
            {oaisGroups(d).map(group => <div key={group.domain} className="panel-padding">
                <h4>{group.title}</h4>
                <div className="table-scroll"><table><thead><tr><th>Indicateur</th><th>Nature</th><th>Évaluation</th><th>Constat</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{group.indicators.map(i => <tr key={i.code}>
                        <td><strong>{i.title}</strong><small className="cell-sub">{i.description}</small></td>
                        <td>{i.kind === 'AUTOMATIQUE' ? 'Mesuré' : 'Déclaré'}</td>
                        <td><Badge value={oaisBadge(i.status)} label={OAIS_STATUS_LABELS[i.status]} /></td>
                        <td>{i.kind === 'AUTOMATIQUE' ? i.measure : i.justification ?? '—'}{i.evaluatedAt && <small className="cell-sub">Évalué le {formatDate(i.evaluatedAt)}</small>}</td>
                        <td className="table-actions">{mayManage && i.kind === 'DECLARATIF' && <button type="button" className="btn small secondary" onClick={() => setEvaluating(i)}>Évaluer</button>}</td>
                    </tr>)}</tbody></table></div>
            </div>)}
            <p className="panel-padding"><small>Établi le {formatDate(d.generatedAt)}.</small></p>
        </>}
        {evaluating && <EvaluationDialog institutionId={institutionId} indicator={evaluating} onClose={() => setEvaluating(null)} onDone={() => { setEvaluating(null); setRevision(n => n + 1); }} />}
    </section>;
}

function EvaluationDialog({ institutionId, indicator, onClose, onDone }: { institutionId: string; indicator: OaisIndicator; onClose: () => void; onDone: () => void }) {
    const { preservationPlanning } = useSession();
    const [status, setStatus] = useState(indicator.status === 'A_EVALUER' ? '' : indicator.status);
    const [justification, setJustification] = useState(indicator.justification ?? '');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = evaluationProblems(status, justification);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ code: indicator.code, status, justification: justification.trim() },
            key => preservationPlanning!.evaluateOais(institutionId, indicator.code, status, justification.trim(), key))) onDone();
    };
    return <Modal title={indicator.title} subtitle={indicator.description} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Évaluation *"><select value={status} onChange={e => setStatus(e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>
                    {(['CONFORME', 'PARTIEL', 'NON_CONFORME', 'NON_APPLICABLE'] as const).map(s => <option key={s} value={s}>{OAIS_STATUS_LABELS[s]}</option>)}</select></Field>
                <Field label="Justification *" wide hint="Ce qui fonde l’évaluation : document, décision, date. Elle est conservée, jamais effacée."><textarea value={justification}
                    onChange={e => setJustification(e.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer l’évaluation</button></footer>
        </form>
    </Modal>;
}

function FormatRiskPanel({ institutionId }: { institutionId: string }) {
    const { preservationPlanning, epoch } = useSession();
    const q = useResource<FormatRiskReport>(s => preservationPlanning!.formatRisk(institutionId, s), `format-risk:${institutionId}:${epoch}`);
    const r = q.data;
    const summary = r ? riskSummary(r) : null;
    return <section className="panel" aria-label="Diagnostic des formats">
        <div className="table-toolbar"><h3>Diagnostic des formats</h3><button type="button" className="btn small secondary" disabled={q.loading} onClick={q.refresh}>Actualiser le diagnostic</button></div>
        {q.loading && !r ? <Busy label="Analyse des formats…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : r && summary && <>
            <div className="panel-padding">
                <Notice tone={summary.problem ? 'warning' : 'info'}>{summary.text}</Notice>
                <p><small>Les fichiers conservés sont comparés au registre des formats. Un format absent du registre est « non évalué » : ce n’est pas un format sans risque.</small></p>
            </div>
            {r.rows.length === 0 ? <Empty title="Aucun fichier" icon="box" />
                : <div className="table-scroll"><table><thead><tr><th>Format</th><th>Fichiers</th><th>Volume</th><th>Risque</th><th>Pérennité</th><th>Format cible</th><th>Registre</th></tr></thead>
                    <tbody>{r.rows.map(row => <tr key={row.mediaType}>
                        <td><strong>{row.name ?? row.mediaType}</strong>{row.name && <small className="cell-sub">{row.mediaType}</small>}</td>
                        <td>{row.files}</td>
                        <td>{formatBytes(row.bytes)}</td>
                        <td><Badge value={riskBadge(row.risk, row.registered)} label={riskText(row.risk, row.registered)} /></td>
                        <td>{row.perennity ? PERENNITY_LABELS[row.perennity] : '—'}</td>
                        <td>{row.targetMediaType ?? '—'}</td>
                        <td>{row.scope === 'NATIONAL' ? 'National' : row.scope === 'INSTITUTION' ? 'Institution' : '—'}</td>
                    </tr>)}</tbody></table></div>}
            <p className="panel-padding"><small>Établi le {formatDate(r.generatedAt)}.</small></p>
        </>}
    </section>;
}

function FormatRegistryPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_PLANNING_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [all, setAll] = useState(false);
    const action = useAction();
    const q = useResource<FileFormat[]>(s => preservationPlanning!.formats(institutionId, all, s), `file-formats:${institutionId}:${all}:${revision}:${epoch}`);
    const list = q.data ?? [];
    const retire = async (f: FileFormat) => { if (await action.run({ retire: f.id }, key => preservationPlanning!.retireFormat(f.id, key))) setRevision(n => n + 1); };
    return <section className="panel" aria-label="Registre des formats">
        <div className="section-heading"><h3>Registre des formats</h3>{mayManage && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Inscrire un format</button>}</div>
        <div className="panel-padding"><Notice>Le registre est une donnée de l’institution (ou du niveau national) : aucun format n’est livré tout fait. L’inscription de l’institution l’emporte sur l’inscription nationale.</Notice></div>
        <div className="table-toolbar"><label className="check-row"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Afficher aussi les inscriptions retirées</label></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun format inscrit" description="Inscrivez les formats que l’institution conserve, avec leur niveau de risque." icon="document" />
                : <div className="table-scroll"><table><thead><tr><th>Format</th><th>Risque</th><th>Pérennité</th><th>Format cible</th><th>Portée</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(f => <tr key={f.id}>
                        <td><strong>{f.name}</strong><small className="cell-sub">{f.mediaType}</small>{f.motive && <small className="cell-sub">{f.motive}</small>}</td>
                        <td><Badge value={riskBadge(f.risk, true)} label={RISK_LABELS[f.risk]} /></td>
                        <td>{PERENNITY_LABELS[f.perennity]}</td>
                        <td>{f.targetMediaType ?? '—'}</td>
                        <td>{f.institutionId ? 'Institution' : 'National'}{f.status === 'RETIRE' ? ' — retiré' : ''}</td>
                        <td className="table-actions">{mayManage && f.status === 'ACTIF' && f.institutionId !== null &&
                            <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => retire(f)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {creating && <FormatDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setRevision(n => n + 1); }} />}
    </section>;
}

function FormatDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { preservationPlanning } = useSession();
    const [form, setForm] = useState(emptyFormatForm);
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const problems = formatProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = formatBody(institutionId, { ...form, national: false });
        if (await action.run(body, key => preservationPlanning!.createFormat(body, key))) onDone();
    };
    return <Modal title="Inscrire un format" subtitle="Son niveau de risque et sa pérennité guident les migrations" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Type de média *" hint="Par exemple application/pdf ou image/tiff."><input value={form.mediaType} onChange={e => set('mediaType', e.target.value)} maxLength={150} disabled={action.busy} /></Field>
                <Field label="Nom *"><input value={form.name} onChange={e => set('name', e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Extension"><input value={form.extension} onChange={e => set('extension', e.target.value)} maxLength={20} disabled={action.busy} /></Field>
                <Field label="Niveau de risque *"><select value={form.risk} onChange={e => set('risk', e.target.value)} disabled={action.busy}>
                    {Object.entries(RISK_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Pérennité *"><select value={form.perennity} onChange={e => set('perennity', e.target.value)} disabled={action.busy}>
                    {Object.entries(PERENNITY_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Format cible d’une migration" hint="Le type de média vers lequel migrer."><input value={form.target} onChange={e => set('target', e.target.value)} maxLength={150} disabled={action.busy} /></Field>
                <Field label="Justification" wide hint="Obligatoire dès que le format est à risque, à surveiller ou obsolète."><textarea value={form.motive} onChange={e => set('motive', e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
                <Field label="Source" wide hint="Le registre ou la veille qui fonde l’évaluation."><input value={form.source} onChange={e => set('source', e.target.value)} maxLength={500} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Inscrire</button></footer>
        </form>
    </Modal>;
}

function PreservationAgentsPanel({ institutionId }: { institutionId: string }) {
    const { me, preservationPlanning, epoch } = useSession();
    const mayManage = can(me, 'PRESERVATION_PLANNING_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const action = useAction();
    const q = useResource<PreservationAgent[]>(s => preservationPlanning!.agents(institutionId, false, s), `preservation-agents:${institutionId}:${revision}:${epoch}`);
    const list = q.data ?? [];
    const retire = async (a: PreservationAgent) => { if (await action.run({ retire: a.id }, key => preservationPlanning!.retireAgent(a.id, key))) setRevision(n => n + 1); };
    return <section className="panel" aria-label="Agents de conservation">
        <div className="section-heading"><h3>Agents de conservation</h3>{mayManage && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouvel agent</button>}</div>
        <div className="panel-padding"><Notice>Un agent est une personne, une organisation, un logiciel ou un matériel qui agit sur les fichiers (PREMIS). Un événement de conservation peut le citer : l’outil et sa version s’en déduisent.</Notice></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun agent" description="Déclarez les logiciels et services qui produisent les événements de conservation." icon="wrench" />
                : <div className="table-scroll"><table><thead><tr><th>Agent</th><th>Type</th><th>Version</th><th>Portée</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(a => <tr key={a.id}>
                        <td><strong>{a.name}</strong>{a.description && <small className="cell-sub">{a.description}</small>}</td>
                        <td>{AGENT_LABELS[a.type]}</td>
                        <td>{a.version ?? '—'}</td>
                        <td>{a.institutionId ? 'Institution' : 'National'}</td>
                        <td className="table-actions">{mayManage && a.institutionId !== null && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => retire(a)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {creating && <AgentDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setRevision(n => n + 1); }} />}
    </section>;
}

function AgentDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { preservationPlanning } = useSession();
    const [form, setForm] = useState(emptyAgentForm);
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const problems = agentProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = agentBody(institutionId, { ...form, national: false });
        if (await action.run(body, key => preservationPlanning!.createAgent(body, key))) onDone();
    };
    return <Modal title="Nouvel agent de conservation" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Type *"><select value={form.type} onChange={e => set('type', e.target.value)} disabled={action.busy}>
                    {Object.entries(AGENT_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Nom *"><input value={form.name} onChange={e => set('name', e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Version"><input value={form.version} onChange={e => set('version', e.target.value)} maxLength={100} disabled={action.busy} /></Field>
                <Field label="Identifiant"><input value={form.identifier} onChange={e => set('identifier', e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Description" wide><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Créer</button></footer>
        </form>
    </Modal>;
}

/** Sur la fiche d'un document : les relations entre ses fichiers, les droits PREMIS et l'export de sa description PREMIS (XML). */
export function DocumentPremisPanel({ documentId, reference, canManage, canExport = false }: { documentId: string; reference: string; canManage: boolean; canExport?: boolean }) {
    const { preservationPlanning, records, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [relating, setRelating] = useState(false);
    const [granting, setGranting] = useState(false);
    const [retiring, setRetiring] = useState<PreservationRight | null>(null);
    const action = useAction();
    const exportManifest = async () => {
        const blob = await action.run({ manifest: documentId }, () => records!.iiifManifest(documentId));
        if (blob) saveBlob(blob, manifestFileName(reference));
    };
    const relations = useResource<FileRelation[]>(s => preservationPlanning!.relations(documentId, s), `premis-relations:${documentId}:${revision}:${epoch}`);
    const rights = useResource<PreservationRight[]>(s => preservationPlanning!.rights(documentId, s), `premis-rights:${documentId}:${revision}:${epoch}`);
    const exportPremis = async () => {
        const blob = await action.run({ premis: documentId }, () => preservationPlanning!.premis(documentId));
        if (blob) saveBlob(blob, premisFileName(reference));
    };
    const packagesQ = useResource<PackageExport[]>(s => canExport ? preservationPlanning!.packages(documentId, s) : Promise.resolve([]), `premis-packages:${documentId}:${canExport}:${revision}:${epoch}`);
    const exportPackage = async (profile: 'AIP' | 'DIP') => {
        const blob = await action.run({ package: documentId, profile }, () => preservationPlanning!.downloadPackage(documentId, profile));
        if (blob) { saveBlob(blob, packageFileName(reference, profile)); setRevision(n => n + 1); }
    };
    return <section className="panel" aria-label="Description PREMIS">
        <div className="section-heading"><h3>Description PREMIS</h3>
            <span className="heading-actions">
                <button type="button" className="btn small secondary" disabled={action.busy} onClick={exportManifest}>Manifeste IIIF</button>
                <button type="button" className="btn small secondary" disabled={action.busy} onClick={exportPremis}>Exporter en XML</button></span></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        <div className="panel-padding">
            <h4>Relations entre fichiers</h4>
            {relations.loading && !relations.data ? <Busy /> : relations.error ? <ErrorNotice error={relations.error} onRetry={relations.refresh} />
                : (relations.data ?? []).length === 0 ? <p><small>Aucune relation déclarée entre les fichiers de ce document.</small></p>
                    : <ul className="plain-list">{(relations.data ?? []).map(r => <li key={r.id}><strong>{r.sourceName}</strong> — {RELATION_LABELS[r.type].toLowerCase()} → <strong>{r.targetName}</strong></li>)}</ul>}
            {canManage && <button type="button" className="btn small secondary" onClick={() => setRelating(true)}>Relier deux fichiers</button>}
        </div>
        <div className="panel-padding">
            <h4>Identification des formats</h4>
            <DocumentIdentificationList documentId={documentId} />
        </div>
        <div className="panel-padding">
            <h4>Validation PDF/A</h4>
            <DocumentPdfaList documentId={documentId} />
        </div>
        <div className="panel-padding">
            <h4>Copies migrées</h4>
            <DocumentMigrationsList documentId={documentId} />
        </div>
        <div className="panel-padding">
            <h4>Droits</h4>
            {rights.loading && !rights.data ? <Busy /> : rights.error ? <ErrorNotice error={rights.error} onRetry={rights.refresh} />
                : (rights.data ?? []).length === 0 ? <p><small>Aucun droit inscrit pour ce document.</small></p>
                    : <div className="table-scroll"><table><thead><tr><th>Acte</th><th>Base</th><th>Titulaire</th><th>Période</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{(rights.data ?? []).map(r => <tr key={r.id}>
                            <td>{ACT_LABELS[r.act]}{' — '+(DECISION_LABELS[r.decision??(r.granted?'ALLOW':'DISALLOW')]??'Inconnu')}{r.restriction && <small className="cell-sub">{r.restriction}</small>}<RightDetailsView right={r}/></td>
                            <td>{BASIS_LABELS[r.basis]}{r.reference && <small className="cell-sub">{r.reference}</small>}</td>
                            <td>{r.holder ?? '—'}</td>
                            <td>{formatDay(r.startDate)}{r.endDate ? ` → ${formatDay(r.endDate)}` : ''}</td>
                            <td><Badge value={r.status === 'ACTIF' ? 'ACTIF' : 'RETIRE'} label={r.status === 'ACTIF' ? 'En vigueur' : 'Retiré'} />{r.retirementReason && <small className="cell-sub">{r.retirementReason}</small>}</td>
                            <td className="table-actions">{canManage && r.status === 'ACTIF' && <button type="button" className="btn small secondary" onClick={() => setRetiring(r)}>Retirer</button>}</td>
                        </tr>)}</tbody></table></div>}
            {canManage && <button type="button" className="btn small secondary" onClick={() => setGranting(true)}>Inscrire un droit</button>}
        </div>
        {canExport && <div className="panel-padding">
            <h4>Paquets exportés</h4>
            <p><small>Un paquet BagIt (ZIP) réunit les fichiers validés, leurs empreintes et la description PREMIS. L’archivage reprend tous les fichiers ; la diffusion, les seules copies de consultation.</small></p>
            {packagesQ.loading && !packagesQ.data ? <Busy /> : packagesQ.error ? <ErrorNotice error={packagesQ.error} onRetry={packagesQ.refresh} />
                : (packagesQ.data ?? []).length === 0 ? <p><small>Aucun paquet n’a été exporté pour ce document.</small></p>
                    : <div className="table-scroll"><table><thead><tr><th>Paquet</th><th>Contenu</th><th>Empreinte SHA-256</th><th>Exporté le</th></tr></thead>
                        <tbody>{(packagesQ.data ?? []).map(p => <tr key={p.id}>
                            <td><strong>{PROFILE_LABELS[p.profile]}</strong><small className="cell-sub">{p.fileName}</small></td>
                            <td>{packageText(p)}</td>
                            <td><code>{p.sha256.slice(0, 16)}…</code></td>
                            <td>{formatDate(p.exportedAt)}</td>
                        </tr>)}</tbody></table></div>}
            <span className="table-actions">
                <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => exportPackage('AIP')}>Exporter un paquet d’archivage</button>
                <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => exportPackage('DIP')}>Exporter un paquet de diffusion</button>
            </span>
        </div>}
        {relating && <RelationDialog documentId={documentId} onClose={() => setRelating(false)} onDone={() => { setRelating(false); setRevision(n => n + 1); }} />}
        {granting && <RightDialog documentId={documentId} onClose={() => setGranting(false)} onDone={() => { setGranting(false); setRevision(n => n + 1); }} />}
        {retiring && <ReasonPrompt title="Retirer le droit" subtitle={`${ACT_LABELS[retiring.act]} — ${BASIS_LABELS[retiring.basis]}`} hint="Dites pourquoi : décision remplacée, accord reçu, erreur de saisie…"
            confirm="Retirer le droit" onClose={() => setRetiring(null)}
            onSubmit={async (reason, key) => { await preservationPlanning!.retireRight(retiring.id, reason, key); setRevision(n => n + 1); }} />}
    </section>;
}

function RelationDialog({ documentId, onClose, onDone }: { documentId: string; onClose: () => void; onDone: () => void }) {
    const { records, preservationPlanning, epoch } = useSession();
    const files = useResource<Array<DocumentFile & { versionNumber: number }>>(async signal => {
        const versions: DocumentVersion[] = await records!.versions(documentId, signal);
        const lists = await Promise.all(versions.map(async v => (await records!.files(v.id, signal)).map(f => ({ ...f, versionNumber: v.number }))));
        return lists.flat();
    }, `premis-files:${documentId}:${epoch}`);
    const [source, setSource] = useState('');
    const [target, setTarget] = useState('');
    const [type, setType] = useState('MIGRATION');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = relationProblems(target, type, source);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ source, target, type }, key => preservationPlanning!.addRelation(source, target, type, null, key))) onDone();
    };
    const list = files.data ?? [];
    const options = list.map(f => <option key={f.id} value={f.id}>{f.originalFilename} (version {f.versionNumber})</option>);
    return <Modal title="Relier deux fichiers" subtitle="Le fichier d’arrivée est tiré du fichier de départ" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {files.loading && !files.data ? <Busy /> : files.error ? <ErrorNotice error={files.error} onRetry={files.refresh} /> : <div className="form-grid">
                <Field label="Fichier de départ *"><select value={source} onChange={e => setSource(e.target.value)} disabled={action.busy}><option value="">Choisir…</option>{options}</select></Field>
                <Field label="Relation *"><select value={type} onChange={e => setType(e.target.value)} disabled={action.busy}>
                    {Object.entries(RELATION_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Fichier d’arrivée *"><select value={target} onChange={e => setTarget(e.target.value)} disabled={action.busy}><option value="">Choisir…</option>{options}</select></Field>
            </div>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Relier</button></footer>
        </form>
    </Modal>;
}

function RightDialog({ documentId, onClose, onDone }: { documentId: string; onClose: () => void; onDone: () => void }) {
    const { preservationPlanning } = useSession();
    const [form, setForm] = useState(() => emptyRightForm(todayIso()));
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const problems = rightProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = rightBody(form);
        if (await action.run(body, key => preservationPlanning!.addRight(documentId, body, key))) onDone();
    };
    return <Modal title="Inscrire un droit" subtitle="Ce que la base juridique permet ou interdit de faire du document" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Base juridique *"><select value={form.basis} onChange={e => set('basis', e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>{Object.entries(BASIS_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Acte *"><select value={form.act} onChange={e => set('act', e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>{Object.entries(ACT_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Titulaire"><input value={form.holder} onChange={e => set('holder', e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Référence"><input value={form.reference} onChange={e => set('reference', e.target.value)} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Début *"><input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} disabled={action.busy} /></Field>
                <Field label="Fin"><input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} disabled={action.busy} /></Field>
                <Field label="Décision" wide><select value={form.decision??(form.granted?'ALLOW':'DISALLOW')} onChange={e=>{ set('decision',e.target.value); set('granted',e.target.value==='ALLOW'); }} disabled={action.busy}>{Object.entries(DECISION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Juridiction" hint="Code pays ISO, par exemple GN pour la Guinée."><input aria-label="Juridiction" value={form.jurisdiction??''} maxLength={2} onChange={e=>set('jurisdiction',e.target.value.toUpperCase())} disabled={action.busy}/></Field>
                <Field label="Date de détermination"><input type="date" value={form.determinedOn??''} max={todayIso()} onChange={e=>set('determinedOn',e.target.value)} disabled={action.busy}/></Field>
                <Field label="Statut du droit d’auteur"><select value={form.copyrightStatus??''} onChange={e=>set('copyrightStatus',e.target.value)} disabled={action.busy}><option value="">Non renseigné</option>{Object.entries(COPYRIGHT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
                <RightEvidenceFields value={form.evidence??[]} disabled={action.busy} onChange={v=>set('evidence',v)} />
                <Field label="Restriction" wide hint="Précisez le motif d’interdiction ou les conditions à respecter."><textarea aria-label="Restriction" value={form.restriction} onChange={e => set('restriction', e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Inscrire</button></footer>
        </form>
    </Modal>;
}
