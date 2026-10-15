import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivesApi, type DescriptionView } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { useAction } from './ReadingRoomParts';
import {
    DEPOSIT_CONFIDENTIALITY, LEVEL_LABELS, blockerText, depositErrorText, depositSummary, exchangeFileKind, integrationProblems, levelsAfter, reportText,
    type DepositReport, type DepositView, type IntegrationPreview, type IntegrationResult, type IntegrationView, type SedaManifest, type SedaPackageReport
} from '../core/intakeExchange';
import type { DocumentType } from '../core/types';
import type { ArchivalIntake } from '../core/types';

const isReport = (r: SedaManifest | SedaPackageReport): r is SedaPackageReport => 'verified' in r;

function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Les échanges d'un versement : bordereau de transfert SEDA (export, reprise d'un manifeste ou d'un paquet) et intégration d'un versement reçu au plan de description. */
export function IntakeExchangePanel({ intake, canManage, editable, onChanged }: { intake: ArchivalIntake; canManage: boolean; editable: boolean; onChanged: () => void }) {
    const { archivalIntake, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [integrating, setIntegrating] = useState(false);
    const [depositing, setDepositing] = useState(false);
    const [done, setDone] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const action = useAction();
    const received = intake.etape === 'RECU';
    const history = useResource<IntegrationView[]>(s => received ? archivalIntake!.integrations(intake.id, s) : Promise.resolve([]), `intake-integrations:${intake.id}:${received}:${revision}:${epoch}`);
    const deposits = useResource<DepositView[]>(s => received ? archivalIntake!.deposits(intake.id, s) : Promise.resolve([]), `intake-deposits:${intake.id}:${received}:${revision}:${epoch}`);

    const exportSeda = async () => {
        const blob = await action.run({ export: intake.id }, () => archivalIntake!.sedaExport(intake.id));
        if (blob) saveBlob(blob, `bordereau-seda-${intake.numero.replace(/[^A-Za-z0-9._-]+/g, '-')}.xml`);
    };
    const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!exchangeFileKind(file.name)) { setDone(null); return; }
        const result = await action.run({ seda: intake.id, name: file.name, size: file.size }, () => archivalIntake!.importSedaFile(intake.id, file));
        if (result) {
            setDone(isReport(result) ? `Paquet vérifié. ${reportText(result)}${result.warnings.length ? ` ${result.warnings.length} avertissement(s).` : ''}`
                : `Manifeste repris : ${result.lines.length} unité${result.lines.length > 1 ? 's' : ''} dans le bordereau.${result.warnings.length ? ` ${result.warnings.length} avertissement(s).` : ''}`);
            onChanged();
        }
    };
    return <section className="panel" aria-label="Échanges du versement">
        <div className="section-heading"><h4>Échanges</h4>
            <div className="table-actions">
                <button type="button" className="btn small secondary" disabled={action.busy} onClick={exportSeda}>Exporter le bordereau (SEDA)</button>
                {canManage && editable && <>
                    <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => input.current?.click()}>Reprendre un manifeste ou un paquet SEDA</button>
                    <input ref={input} type="file" accept=".xml,.zip,application/xml,application/zip" className="sr-only" aria-label="Fichier SEDA (XML ou ZIP)" onChange={pick} />
                </>}
                {canManage && received && <button type="button" className="btn small secondary" onClick={() => setDepositing(true)}>Déposer le contenu du paquet</button>}
                {canManage && received && <button type="button" className="btn small primary" onClick={() => setIntegrating(true)}>Intégrer au plan de description</button>}
            </div>
        </div>
        <div className="panel-padding">
            <p><small>Le bordereau s’échange au format de transfert SEDA. Un manifeste ou un paquet repris remplace tout le bordereau ; la quantité et l’unité n’ont pas d’équivalent normalisé et restent à compléter. Le contenu
                du paquet est contrôlé par empreinte ; une fois le versement reçu, « Déposer le contenu du paquet » crée un document par unité et verse ses fichiers dans le stockage.</small></p>
            {done && <Notice>{done}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {received && ((history.data ?? []).length > 0
                ? <ul className="plain-list">{(history.data ?? []).map(h => <li key={h.id}><strong>{h.lines} notice{h.lines > 1 ? 's' : ''}</strong> ({LEVEL_LABELS[h.level] ?? h.level}) sous {h.parentCode ? `${h.parentCode} — ${h.parentTitle ?? ''}` : 'une notice'},
                    le {formatDate(h.createdAt)}{h.createdById && <> par <EntityName kind="users" id={h.createdById} /></>}.</li>)}</ul>
                : !history.loading && <p><small>Ce versement n’a pas encore été intégré au plan de description.</small></p>)}
            {received && (deposits.data ?? []).length > 0 && <DepositHistory items={deposits.data ?? []} />}
        </div>
        {integrating && <IntegrationDialog intake={intake} onClose={() => setIntegrating(false)} onDone={() => { setIntegrating(false); setRevision(n => n + 1); onChanged(); }} />}
        {depositing && <DepositDialog intake={intake} onClose={() => setDepositing(false)} onDone={() => { setRevision(n => n + 1); onChanged(); }} />}
    </section>;
}

/** Ce qui a été déposé pour ce versement : un fichier par ligne, avec son document, ou la cause de l'échec. */
function DepositHistory({ items }: { items: DepositView[] }) {
    const failed = items.filter(i => i.status === 'ECHEC').length;
    return <details open={failed > 0}><summary>Contenu déposé : {items.length - failed} fichier{items.length - failed > 1 ? 's' : ''}{failed ? ` · ${failed} en échec` : ''}</summary>
        <div className="table-scroll"><table><thead><tr><th>Ligne</th><th>Fichier du paquet</th><th>Document</th><th>État</th></tr></thead>
            <tbody>{items.map(i => <tr key={i.path} className={i.status === 'ECHEC' ? 'is-blocked' : ''}><td>{i.lineRank}<small className="cell-sub">{i.lineReference}</small></td><td><code>{i.path}</code></td>
                <td>{i.documentReference ?? '—'}</td>
                <td>{i.status === 'DEPOSE' ? <Badge value="ACTIF" label="Déposé" /> : <><Badge value="REJETE" label="En échec" /> <small>{depositErrorText(i.errorCode)}{i.attempts > 1 ? ` · ${i.attempts} tentatives` : ''}</small></>}</td></tr>)}</tbody></table></div>
    </details>;
}

/** Choix du type et de la confidentialité des documents créés, puis envoi du paquet : le serveur dit ce qui est déposé, déjà déposé, écarté ou en échec. */
function DepositDialog({ intake, onClose, onDone }: { intake: ArchivalIntake; onClose: () => void; onDone: () => void }) {
    const { records, archivalIntake, epoch } = useSession();
    const types = useResource<DocumentType[]>(s => records!.documentTypes(s), `intake-deposit-types:${epoch}`);
    const [documentTypeId, setDocumentTypeId] = useState('');
    const [confidentiality, setConfidentiality] = useState('INTERNE');
    const [file, setFile] = useState<File | null>(null);
    const [report, setReport] = useState<DepositReport | null>(null);
    const action = useAction();
    const active = (types.data ?? []).filter(t => t.status === 'ACTIF');
    const valid = !!documentTypeId && !!file && exchangeFileKind(file.name) === 'zip';
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || !file) return;
        const result = await action.run({ deposit: intake.id, name: file.name, size: file.size, documentTypeId, confidentiality }, () => archivalIntake!.depositPackage(intake.id, file, { documentTypeId, confidentiality }));
        if (result) { setReport(result); onDone(); }
    };
    return <Modal wide title="Déposer le contenu du paquet" subtitle="Un document est créé pour chaque unité d’archives qui porte des objets" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice>Le paquet doit être celui dont le bordereau a été repris. Les lignes constatées absentes ne sont pas déposées. Renvoyer le même paquet ne redépose rien et retente ce qui a échoué.</Notice>
            {types.loading && !types.data ? <Busy /> : types.error ? <ErrorNotice error={types.error} onRetry={types.refresh} /> : <div className="form-grid">
                <Field label="Type des documents créés *"><select value={documentTypeId} onChange={e => setDocumentTypeId(e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>{active.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
                <Field label="Confidentialité *"><select value={confidentiality} onChange={e => setConfidentiality(e.target.value)} disabled={action.busy}>
                    {DEPOSIT_CONFIDENTIALITY.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
                <Field label="Paquet ZIP *" wide hint="Le paquet SEDA : un manifeste XML à la racine et ses objets.">
                    <input type="file" accept=".zip,application/zip" aria-label="Paquet ZIP" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={action.busy} /></Field>
            </div>}
            {file && exchangeFileKind(file.name) !== 'zip' && <Notice tone="warning">Le fichier choisi n’est pas un paquet ZIP.</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {report && <>
                <Notice tone={report.failed ? 'warning' : 'info'}>{depositSummary(report)}</Notice>
                {report.skipped.length > 0 && <ul className="plain-list">{report.skipped.slice(0, 10).map(s => <li key={s}><small>{s}</small></li>)}</ul>}
                {report.failed > 0 && <ul className="plain-list">{report.objects.filter(o => o.status === 'ECHEC').map(o => <li key={o.path}><code>{o.path}</code> : {depositErrorText(o.errorCode)}</li>)}</ul>}
            </>}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !valid}>{action.busy ? 'Dépôt en cours…' : 'Déposer'}</button></footer>
        </form>
    </Modal>;
}

function IntegrationDialog({ intake, onClose, onDone }: { intake: ArchivalIntake; onClose: () => void; onDone: () => void }) {
    const { records, archivalIntake, epoch } = useSession();
    const archiveApi = useMemo(() => new ArchivesApi(records!.transport), [records]);
    const institutionId = intake.institutionArchivesId ?? '';
    const descriptions = useResource<DescriptionView[]>(s => institutionId ? archiveApi.descriptions(institutionId, s) : Promise.resolve([]), `intake-descriptions:${institutionId}:${epoch}`);
    const [parentId, setParentId] = useState('');
    const [level, setLevel] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const list = (descriptions.data ?? []).filter(d => d.input.level !== 'PIECE').slice().sort((a, b) => a.input.code.localeCompare(b.input.code));
    const parent = list.find(d => d.id === parentId);
    const levels = levelsAfter(parent?.input.level);
    const preview = useResource<IntegrationPreview | null>(s => parentId && level ? archivalIntake!.integrationPreview(intake.id, parentId, level, s) : Promise.resolve(null),
        `intake-preview:${intake.id}:${parentId}:${level}:${epoch}`);
    const problems = integrationProblems(parentId, level, parent?.input.level);
    const p = preview.data;
    const blocked = !!p && (p.blockers.length > 0 || p.eligible.some(c => c.problems.length > 0) || p.eligible.length === 0);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const result: IntegrationResult | undefined = await action.run({ integrate: intake.id, parentId, level }, () => archivalIntake!.integrate(intake.id, parentId, level));
        if (result) onDone();
    };
    return <Modal wide title="Intégrer au plan de description" subtitle="Chaque ligne constatée conforme ou en écart devient une notice, en brouillon" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {descriptions.loading && !descriptions.data ? <Busy /> : descriptions.error ? <ErrorNotice error={descriptions.error} onRetry={descriptions.refresh} /> : <div className="form-grid">
                <Field label="Notice de rattachement *" hint="Les notices du service d’archives destinataire."><select value={parentId} onChange={e => { setParentId(e.target.value); setLevel(''); }} disabled={action.busy}>
                    <option value="">Choisir…</option>{list.map(d => <option key={d.id} value={d.id}>{d.input.code} — {d.input.title} ({LEVEL_LABELS[d.input.level]})</option>)}</select></Field>
                <Field label="Niveau des notices créées *"><select value={level} onChange={e => setLevel(e.target.value)} disabled={action.busy || !parent}>
                    <option value="">Choisir…</option>{levels.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}</select></Field>
            </div>}
            {preview.loading && parentId && level && !p ? <Busy label="Analyse du versement…" /> : preview.error ? <ErrorNotice error={preview.error} onRetry={preview.refresh} /> : p && <>
                {p.blockers.map(b => <Notice key={b} tone="warning">{blockerText(b)}</Notice>)}
                <p><strong>{p.eligible.length} ligne{p.eligible.length > 1 ? 's' : ''} à intégrer</strong>
                    {p.integrated > 0 && ` · ${p.integrated} déjà intégrée${p.integrated > 1 ? 's' : ''}`}{p.absent > 0 && ` · ${p.absent} absente${p.absent > 1 ? 's' : ''}, laissée${p.absent > 1 ? 's' : ''} de côté`}</p>
                {p.eligible.length === 0 ? <Empty title="Rien à intégrer" description="Aucune ligne constatée n’est en attente d’intégration." icon="check" />
                    : <div className="table-scroll"><table><thead><tr><th>Ligne</th><th>Référence et intitulé</th><th>Constat</th><th>Contrôle</th></tr></thead>
                        <tbody>{p.eligible.slice(0, 50).map(c => <tr key={c.lineId} className={c.problems.length ? 'is-blocked' : ''}>
                            <td>{c.rank}</td><td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                            <td><Badge value={c.finding === 'CONFORME' ? 'ACTIF' : 'EN_COURS'} label={c.finding === 'CONFORME' ? 'Conforme' : 'Écart'} /></td>
                            <td>{c.problems.length ? c.problems.join(' ') : 'Prête'}</td></tr>)}</tbody></table></div>}
                {p.eligible.length > 50 && <p><small>Les 50 premières lignes sont affichées ; toutes sont intégrées.</small></p>}
            </>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(x => <li key={x}>{x}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || blocked || !parentId || !level}>Intégrer</button></footer>
        </form>
    </Modal>;
}
