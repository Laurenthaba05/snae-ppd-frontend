import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivesApi, type DescriptionView } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { useAction } from './ReadingRoomParts';
import {
    LEVEL_LABELS, blockerText, exchangeFileKind, integrationProblems, levelsAfter, reportText,
    type IntegrationPreview, type IntegrationResult, type IntegrationView, type SedaManifest, type SedaPackageReport
} from '../core/intakeExchange';
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
    const [done, setDone] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const action = useAction();
    const received = intake.etape === 'RECU';
    const history = useResource<IntegrationView[]>(s => received ? archivalIntake!.integrations(intake.id, s) : Promise.resolve([]), `intake-integrations:${intake.id}:${received}:${revision}:${epoch}`);

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
                {canManage && received && <button type="button" className="btn small primary" onClick={() => setIntegrating(true)}>Intégrer au plan de description</button>}
            </div>
        </div>
        <div className="panel-padding">
            <p><small>Le bordereau s’échange au format de transfert SEDA. Un manifeste ou un paquet repris remplace tout le bordereau ; la quantité et l’unité n’ont pas d’équivalent normalisé et restent à compléter. Le contenu
                du paquet est contrôlé par empreinte ; il se dépose ensuite par les parcours habituels.</small></p>
            {done && <Notice>{done}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {received && ((history.data ?? []).length > 0
                ? <ul className="plain-list">{(history.data ?? []).map(h => <li key={h.id}><strong>{h.lines} notice{h.lines > 1 ? 's' : ''}</strong> ({LEVEL_LABELS[h.level] ?? h.level}) sous {h.parentCode ? `${h.parentCode} — ${h.parentTitle ?? ''}` : 'une notice'},
                    le {formatDate(h.createdAt)}{h.createdById && <> par <EntityName kind="users" id={h.createdById} /></>}.</li>)}</ul>
                : !history.loading && <p><small>Ce versement n’a pas encore été intégré au plan de description.</small></p>)}
        </div>
        {integrating && <IntegrationDialog intake={intake} onClose={() => setIntegrating(false)} onDone={() => { setIntegrating(false); setRevision(n => n + 1); onChanged(); }} />}
    </section>;
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
