import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { can } from '../core/policy';
import type { Localisation, StorageUnit } from '../core/types';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import { printHtml } from './printHtml';
import {
    EXERCISE_LABELS, MEASURE_LABELS, PROBABILITY_LABELS, RULE_TEXTS, SEVERITY_LABELS, addMonths, approvalReadiness, contactProblems, exerciseProblems, gapLabel,
    levelLabel, levelOf, measureLabel, measureProblems, planLabel, planSheetHtml, priorityProblems, riskProblems, riskStatusLabel, reviewProblems,
    type ContactDraft, type EmergencyPlan, type Exercise, type Hazard, type PlanSummary, type PriorityDraft, type Risk, type RiskLevel, type RiskMeasure, type RiskSummary, type SiteRiskSummary
} from '../core/physicalRisk';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Une règle connue du serveur se dit en toutes lettres ; le reste reste l'erreur d'origine. */
function ruleError(error: unknown): unknown {
    if (error instanceof ApiError && error.code && RULE_TEXTS[error.code]) return new Error(RULE_TEXTS[error.code]);
    return error;
}

function LevelTag({ level, score }: { level: RiskLevel; score?: number }) {
    return <span className={`tag risk-level risk-${level.toLowerCase()}`}>{levelLabel(level)}{score !== undefined ? ` · ${score}` : ''}</span>;
}

const scaleOptions = (labels: Record<number, string>) => [1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {labels[n]}</option>);

/** Descendants d'un emplacement (lui compris) : les unités de stockage du site sont celles de tous ses sous-emplacements. */
function subtree(locations: Localisation[], rootId: string): Set<string> {
    const children = new Map<string, string[]>();
    for (const l of locations) if (l.parentId) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.id]);
    const found = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length) for (const child of children.get(queue.shift()!) ?? []) if (!found.has(child)) { found.add(child); queue.push(child); }
    return found;
}

// ------------------------------------------------------------------------------------------------ section
/** Risques, plan d'urgence et exercices des emplacements de conservation : portée nationale, comme les archives physiques. */
export function PhysicalRiskSection() {
    const { me, physicalArchives, epoch, demo } = useSession();
    const canManage = can(me, 'PHYSICALARCHIVES_RISK_MANAGE', {});
    const canApprove = can(me, 'PHYSICALARCHIVES_RISK_APPROVE', {});
    const allowed = !demo && !!physicalArchives && (canManage || canApprove || can(me, 'PHYSICALARCHIVES_READ', {}));
    const [revision, setRevision] = useState(0);
    const [openSite, setOpenSite] = useState<{ id: string; label: string } | null>(null);
    const [choosing, setChoosing] = useState(false);
    const [hazards, setHazards] = useState(false);
    const sites = useResource<SiteRiskSummary[]>(s => allowed ? physicalArchives!.riskSites(s) : Promise.resolve([]), `physical-risk-sites:${allowed}:${revision}:${epoch}`);
    if (!allowed) return null;
    const items = sites.data ?? [];
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Risques et plan d’urgence">
        <div className="section-heading"><h3>Risques et plan d’urgence</h3>
            {canManage && <span><button type="button" className="btn small secondary" onClick={() => setHazards(true)}>Gérer les dangers</button>{' '}
                <button type="button" className="btn small primary" onClick={() => setChoosing(true)}>Suivre un emplacement</button></span>}</div>
        <div className="panel-padding"><p><small>Un emplacement a son <strong>registre des risques</strong> (danger, probabilité, gravité, mesures), son <strong>plan d’urgence</strong> approuvé par une autre personne que son auteur, et le journal de ses <strong>exercices</strong> et incidents. Ce qui manque est signalé en tête.</small></p></div>
        {sites.loading && !sites.data ? <Busy /> : sites.error ? <ErrorNotice error={sites.error} onRetry={sites.refresh} />
            : items.length === 0 ? <Empty title="Aucun emplacement suivi" description="Aucun risque, plan d’urgence ni exercice n’est encore enregistré." icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Emplacement</th><th>Risques ouverts</th><th>Plan d’urgence</th><th>Dernier exercice</th><th>À traiter</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(s => <tr key={s.locationId}>
                        <td><strong>{s.locationLabel}</strong></td>
                        <td>{s.openRisks === 0 ? '—' : <span className="risk-counts">
                            {s.critical > 0 && <LevelTag level="CRITIQUE" score={undefined} />}{s.critical > 0 && <small> ×{s.critical} </small>}
                            {s.high > 0 && <><LevelTag level="ELEVE" /><small> ×{s.high} </small></>}
                            {s.moderate > 0 && <><LevelTag level="MODERE" /><small> ×{s.moderate} </small></>}
                            {s.low > 0 && <><LevelTag level="FAIBLE" /><small> ×{s.low}</small></>}</span>}</td>
                        <td><Badge value={s.planStatus} label={planLabel(s.planStatus)} />{s.planVersion !== null && <small className="cell-sub">version {s.planVersion}{s.planNextReview ? ` · à revoir avant le ${formatDate(s.planNextReview)}` : ''}</small>}</td>
                        <td>{s.lastExerciseOn ? formatDate(s.lastExerciseOn) : '—'}</td>
                        <td>{s.gaps.length === 0 ? <small>Rien à signaler</small> : <ul className="gap-list">{s.gaps.map(g => <li key={g}>{gapLabel(g)}</li>)}</ul>}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenSite({ id: s.locationId, label: s.locationLabel })}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {choosing && <LocationChooser onClose={() => setChoosing(false)} onChoose={l => { setChoosing(false); setOpenSite({ id: l.id, label: l.libelle }); }} />}
        {hazards && <HazardsDialog onClose={() => setHazards(false)} />}
        {openSite && <SiteDialog site={openSite} canManage={canManage} canApprove={canApprove} onClose={() => setOpenSite(null)} onChanged={reload} />}
    </section>;
}

/** Le référentiel des dangers : les valeurs livrées sont des exemples, l'institution fixe les siennes. Un danger se retire (il ne se supprime pas) et se réactive. */
function HazardsDialog({ onClose }: { onClose: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [code, setCode] = useState('');
    const [label, setLabel] = useState('');
    const action = useAction();
    const q = useResource<Hazard[]>(s => physicalArchives!.riskHazards(true, s), `risk-hazards-all:${revision}:${epoch}`);
    // pendant une relecture, la dernière liste reste affichée : le tableau ne clignote pas après chaque geste
    const last = useRef<Hazard[]>([]);
    if (q.data) last.current = q.data;
    const items = q.data ?? last.current;
    const validCode = /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(code.trim());
    const validLabel = label.trim().length >= 2;
    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!validCode || !validLabel) return;
        if (await action.run({ code: code.trim(), label: label.trim() }, key => physicalArchives!.createHazard({ code: code.trim(), label: label.trim() }, key))) { setCode(''); setLabel(''); setRevision(n => n + 1); }
    };
    const toggle = async (h: Hazard) => {
        const done = await action.run({ toggle: h.code, active: !h.active }, key => h.active ? physicalArchives!.retireHazard(h.code, key) : physicalArchives!.reactivateHazard(h.code, key));
        if (done) setRevision(n => n + 1);
    };
    return <Modal title="Dangers" subtitle="Le référentiel des dangers des registres de risques : valeurs d’exemple, à adapter à l’institution" onClose={onClose} locked={action.busy}>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : <div className="table-scroll"><table><thead><tr><th>Danger</th><th>Code</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{items.map(h => <tr key={h.code}><td>{h.label}</td><td><code>{h.code}</code></td><td>{h.active ? 'Actif' : 'Retiré'}</td>
                    <td><button type="button" className="btn small secondary" disabled={action.busy} onClick={() => toggle(h)}>{h.active ? 'Retirer' : 'Réactiver'}</button></td></tr>)}</tbody></table></div>}
        {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
        <form onSubmit={add} aria-label="Ajouter un danger">
            <div className="form-grid">
                <Field label="Code du danger" hint="Lettres, chiffres et tirets bas, de 2 à 40 caractères."><input value={code} onChange={e => setCode(e.target.value)} maxLength={40} disabled={action.busy} /></Field>
                <Field label="Libellé du danger"><input value={label} onChange={e => setLabel(e.target.value)} maxLength={150} disabled={action.busy} /></Field>
            </div>
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !validCode || !validLabel}>Ajouter le danger</button></footer>
        </form>
    </Modal>;
}

function LocationChooser({ onChoose, onClose }: { onChoose: (location: Localisation) => void; onClose: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [text, setText] = useState('');
    const q = useResource<Localisation[]>(s => physicalArchives!.locations(s), `risk-locations:${epoch}`);
    const list = (q.data ?? []).filter(l => l.statut === 'ACTIVE' && l.libelle.toLowerCase().includes(text.trim().toLowerCase()));
    return <Modal title="Suivre un emplacement" subtitle="Choisissez l’emplacement dont vous voulez tenir les risques et le plan d’urgence" onClose={onClose}>
        <Field label="Chercher un emplacement" wide><input value={text} onChange={e => setText(e.target.value)} /></Field>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <p><small>Aucun emplacement actif ne correspond.</small></p>
                : <ul className="term-picker-list" aria-label="Emplacements">{list.slice(0, 100).map(l => <li key={l.id}>
                    <button type="button" className="text-link" onClick={() => onChoose(l)}>{l.libelle}{l.code ? ` (${l.code})` : ''}</button></li>)}</ul>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ un site
type Tab = 'risks' | 'plans' | 'exercises';

function SiteDialog({ site, canManage, canApprove, onClose, onChanged }: {
    site: { id: string; label: string }; canManage: boolean; canApprove: boolean; onClose: () => void; onChanged: () => void;
}) {
    const [tab, setTab] = useState<Tab>('risks');
    const tabs: Array<[Tab, string]> = [['risks', 'Risques'], ['plans', 'Plan d’urgence'], ['exercises', 'Exercices et incidents']];
    return <Modal title={site.label} subtitle="Risques, plan d’urgence et exercices de l’emplacement" onClose={onClose} wide>
        <div role="tablist" aria-label="Rubriques de l’emplacement" className="tab-bar">
            {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {tab === 'risks' && <RisksTab locationId={site.id} canManage={canManage} canApprove={canApprove} onChanged={onChanged} />}
        {tab === 'plans' && <PlansTab locationId={site.id} locationLabel={site.label} canManage={canManage} canApprove={canApprove} onChanged={onChanged} />}
        {tab === 'exercises' && <ExercisesTab locationId={site.id} canManage={canManage} onChanged={onChanged} />}
        <footer className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ risques
function RisksTab({ locationId, canManage, canApprove, onChanged }: { locationId: string; canManage: boolean; canApprove: boolean; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const q = useResource<RiskSummary[]>(s => physicalArchives!.risks(locationId, s), `site-risks:${locationId}:${revision}:${epoch}`);
    const items = q.data ?? [];
    const reload = () => { setRevision(n => n + 1); onChanged(); };
    return <section aria-label="Risques de l’emplacement">
        {canManage && <div className="toolbar-right"><button type="button" className="btn small primary" onClick={() => setCreating(true)}>Ajouter un risque</button></div>}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucun risque enregistré" description="Évaluez les dangers de cet emplacement : incendie, eau, humidité, nuisibles, vol…" icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Risque</th><th>Niveau</th><th>État</th><th>Mesures</th><th>Prochaine revue</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td><strong>{r.hazardLabel}</strong><small className="cell-sub">{r.reference} — {r.description}</small></td>
                        <td><LevelTag level={r.level} score={r.score} /></td>
                        <td><Badge value={r.status} label={riskStatusLabel(r.status)} /></td>
                        <td>{r.openMeasures} en cours{r.overdueMeasures > 0 && <small className="cell-sub warn">{r.overdueMeasures} en retard</small>}</td>
                        <td>{formatDate(r.nextReview)}{r.reviewOverdue && <small className="cell-sub warn">dépassée</small>}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenId(r.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <RiskFormDialog locationId={locationId} onClose={() => setCreating(false)} onDone={id => { setCreating(false); reload(); setOpenId(id); }} />}
        {openId && <RiskDialog id={openId} canManage={canManage} canApprove={canApprove} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>;
}

function HazardSelect({ value, onChange, disabled, keepCode }: { value: string; onChange: (code: string) => void; disabled?: boolean; keepCode?: string }) {
    const { physicalArchives, epoch } = useSession();
    const q = useResource<Hazard[]>(s => physicalArchives!.riskHazards(false, s), `risk-hazards:${epoch}`);
    const list = (q.data ?? []).filter(h => h.active || h.code === keepCode);
    return <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled || !q.data} aria-label="Danger">
        <option value="">Choisir un danger…</option>{list.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
    </select>;
}

function RiskFormDialog({ locationId, onClose, onDone }: { locationId: string; onClose: () => void; onDone: (id: string) => void }) {
    const { physicalArchives } = useSession();
    const [hazard, setHazard] = useState('');
    const [description, setDescription] = useState('');
    const [probability, setProbability] = useState<number | null>(null);
    const [severity, setSeverity] = useState<number | null>(null);
    const [existingMeasures, setExistingMeasures] = useState('');
    const [owner, setOwner] = useState('');
    const [nextReview, setNextReview] = useState(addMonths(todayIso(), 12));
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const input = { hazard, description, probability, severity, existingMeasures, owner, nextReview };
    const problems = riskProblems(input, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { locationId, hazard, description: description.trim(), probability: probability!, severity: severity!, existingMeasures: existingMeasures.trim() || null, owner: owner.trim() || null, nextReview };
        const created = await action.run(body, key => physicalArchives!.createRisk(body, key));
        if (created) onDone(created.id);
    };
    return <Modal title="Ajouter un risque" subtitle="Un danger, ce qu’il menace, et ce que l’on fait déjà" onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Danger *"><HazardSelect value={hazard} onChange={setHazard} disabled={action.busy} /></Field>
                <Field label="Responsable du suivi"><input value={owner} onChange={e => setOwner(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Description *" wide hint="Ce qui peut arriver, où, et ce que cela menace (10 caractères au moins)."><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>
                <Field label="Probabilité *"><select value={probability ?? ''} onChange={e => setProbability(e.target.value ? Number(e.target.value) : null)} disabled={action.busy}><option value="">Évaluer…</option>{scaleOptions(PROBABILITY_LABELS)}</select></Field>
                <Field label="Gravité *"><select value={severity ?? ''} onChange={e => setSeverity(e.target.value ? Number(e.target.value) : null)} disabled={action.busy}><option value="">Évaluer…</option>{scaleOptions(SEVERITY_LABELS)}</select></Field>
                <Field label="Mesures existantes" wide><textarea value={existingMeasures} onChange={e => setExistingMeasures(e.target.value)} rows={2} maxLength={4000} disabled={action.busy} /></Field>
                <Field label="Prochaine revue *" hint="Proposée à douze mois : choisissez l’échéance qui convient."><input type="date" value={nextReview} min={todayIso()} onChange={e => setNextReview(e.target.value)} disabled={action.busy} /></Field>
            </div>
            {probability && severity && <p><small>Niveau : <LevelTag level={levelOf(probability * severity)} score={probability * severity} /></small></p>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer le risque</button></footer>
        </form>
    </Modal>;
}

type RiskPanel = null | 'review' | 'edit' | 'measure' | 'control' | 'accept' | 'reopen' | { progress: RiskMeasure };

function RiskDialog({ id, canManage, canApprove, onClose, onChanged }: { id: string; canManage: boolean; canApprove: boolean; onClose: () => void; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [panel, setPanel] = useState<RiskPanel>(null);
    const action = useAction();
    const q = useResource<Risk>(s => physicalArchives!.risk(id, s), `risk:${id}:${revision}:${epoch}`);
    const last = useRef<Risk | null>(null);
    if (q.data) last.current = q.data;
    const r = q.data ?? last.current;
    const refresh = () => { setRevision(n => n + 1); onChanged(); };
    if (!r) return <Modal title="Risque" onClose={onClose} wide>{q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <Busy />}</Modal>;
    const open = r.status === 'OUVERT';
    return <Modal title={`${r.hazardLabel} — ${r.reference}`} subtitle={`${r.locationLabel} · ${riskStatusLabel(r.status)}`} onClose={onClose} locked={action.busy} wide>
        {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
        <dl className="preservation-summary">
            <div><dt>Niveau</dt><dd><LevelTag level={r.level} score={r.score} /> probabilité {r.probability}/5 ({PROBABILITY_LABELS[r.probability]}) × gravité {r.severity}/5 ({SEVERITY_LABELS[r.severity]})</dd></div>
            <div><dt>Description</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.description}</dd></div>
            {r.existingMeasures && <div><dt>Mesures existantes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.existingMeasures}</dd></div>}
            {r.owner && <div><dt>Responsable du suivi</dt><dd>{r.owner}</dd></div>}
            <div><dt>Revue</dt><dd>Dernière le {formatDate(r.lastReview)} · prochaine avant le {formatDate(r.nextReview)}{r.reviewOverdue ? ' — dépassée' : ''}</dd></div>
            {r.status !== 'OUVERT' && <div><dt>{r.status === 'ACCEPTE' ? 'Acceptation' : 'Maîtrise'}</dt><dd>{r.statusReason} — par {r.decidedByName ?? '—'}{r.decidedAt ? `, le ${formatDate(r.decidedAt)}` : ''}</dd></div>}
            <div><dt>Enregistré</dt><dd>{r.createdByName ?? '—'} · {formatDate(r.createdAt)}</dd></div>
        </dl>
        <h4>Mesures</h4>
        {r.measures.length === 0 ? <p><small>Aucune mesure : un risque élevé sans mesure est signalé à l’emplacement.</small></p>
            : <div className="table-scroll"><table><thead><tr><th>Mesure</th><th>Responsable</th><th>Échéance</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{r.measures.map(m => <tr key={m.id}>
                    <td><strong>{m.label}</strong>{m.description && <small className="cell-sub">{m.description}</small>}{m.note && <small className="cell-sub">Compte rendu : {m.note}</small>}</td>
                    <td>{m.owner ?? '—'}</td>
                    <td>{m.dueDate ? formatDate(m.dueDate) : '—'}{m.overdue && <small className="cell-sub warn">en retard</small>}</td>
                    <td><Badge value={m.status} label={measureLabel(m.status)} />{m.completedOn && <small className="cell-sub">le {formatDate(m.completedOn)}</small>}</td>
                    <td>{canManage && (m.status === 'A_FAIRE' || m.status === 'EN_COURS') && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setPanel({ progress: m })}>Faire avancer</button>}</td>
                </tr>)}</tbody></table></div>}
        <h4>Évaluations</h4>
        <div className="table-scroll"><table><thead><tr><th>Date</th><th>Niveau</th><th>Probabilité × gravité</th><th>Note</th><th>Par</th></tr></thead>
            <tbody>{r.evaluations.map((e, index) => <tr key={`${e.evaluatedOn}-${index}`}>
                <td>{formatDate(e.evaluatedOn)}</td><td><LevelTag level={e.level} score={e.score} /></td><td>{e.probability} × {e.severity}</td><td>{e.note ?? '—'}</td><td>{e.authorName ?? '—'}</td>
            </tr>)}</tbody></table></div>
        <footer className="modal-footer">
            {canManage && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('measure')}>Ajouter une mesure</button>}
            {canManage && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('edit')}>Modifier</button>}
            {canManage && <button type="button" className="btn primary" disabled={action.busy} onClick={() => setPanel('review')}>Réévaluer</button>}
            {canManage && open && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('control')}>Marquer maîtrisé</button>}
            {canApprove && open && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('accept')}>Accepter le risque résiduel</button>}
            {canManage && !open && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('reopen')}>Rouvrir</button>}
            <button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
        </footer>
        {panel === 'review' && <ReviewDialog risk={r} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'edit' && <EditRiskDialog risk={r} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'measure' && <MeasureDialog riskId={r.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel !== null && typeof panel === 'object' && <ProgressDialog measure={panel.progress} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'control' && <ReasonPrompt title="Marquer le risque maîtrisé" subtitle="Dites ce qui le rend maîtrisé" hint="Au moins 10 caractères." confirm="Marquer maîtrisé" danger={false}
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await physicalArchives!.setRiskStatus(r.id, { version: r.version, status: 'MAITRISE', reason }, key); refresh(); }} />}
        {panel === 'accept' && <ReasonPrompt title="Accepter le risque résiduel" subtitle="Une autre personne que celle qui l’a enregistré" hint="Pourquoi ce risque est tolérable en l’état (au moins 10 caractères)." confirm="Accepter le risque" danger={false}
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await physicalArchives!.setRiskStatus(r.id, { version: r.version, status: 'ACCEPTE', reason }, key); refresh(); }} />}
        {panel === 'reopen' && <div role="alertdialog"><ReasonPrompt title="Rouvrir le risque" subtitle="Il redevient ouvert et se réévalue" hint="Pourquoi le rouvrir (au moins 10 caractères)." confirm="Rouvrir" danger={false}
            onClose={() => setPanel(null)} onSubmit={async (_reason, key) => { await physicalArchives!.setRiskStatus(r.id, { version: r.version, status: 'OUVERT', reason: null }, key); refresh(); }} /></div>}
    </Modal>;
}

function ReviewDialog({ risk, onClose, onDone }: { risk: Risk; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [probability, setProbability] = useState<number | null>(risk.probability);
    const [severity, setSeverity] = useState<number | null>(risk.severity);
    const [note, setNote] = useState('');
    const [nextReview, setNextReview] = useState(addMonths(todayIso(), 12));
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = reviewProblems({ probability, severity, nextReview }, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { version: risk.version, probability: probability!, severity: severity!, note: note.trim() || null, nextReview };
        if (await action.run({ review: risk.id, ...body }, key => physicalArchives!.reviewRisk(risk.id, body, key))) onDone();
    };
    return <Modal title="Réévaluer le risque" subtitle="Chaque évaluation s’ajoute à l’historique" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Probabilité *"><select value={probability ?? ''} onChange={e => setProbability(e.target.value ? Number(e.target.value) : null)} disabled={action.busy}>{scaleOptions(PROBABILITY_LABELS)}</select></Field>
                <Field label="Gravité *"><select value={severity ?? ''} onChange={e => setSeverity(e.target.value ? Number(e.target.value) : null)} disabled={action.busy}>{scaleOptions(SEVERITY_LABELS)}</select></Field>
                <Field label="Note de revue" wide><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
                <Field label="Prochaine revue *"><input type="date" value={nextReview} min={todayIso()} onChange={e => setNextReview(e.target.value)} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer la revue</button></footer>
        </form>
    </Modal>;
}

function EditRiskDialog({ risk, onClose, onDone }: { risk: Risk; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [hazard, setHazard] = useState(risk.hazardCode);
    const [description, setDescription] = useState(risk.description);
    const [existingMeasures, setExistingMeasures] = useState(risk.existingMeasures ?? '');
    const [owner, setOwner] = useState(risk.owner ?? '');
    const action = useAction();
    const valid = hazard !== '' && description.trim().length >= 10;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        const body = { version: risk.version, hazard, description: description.trim(), existingMeasures: existingMeasures.trim() || null, owner: owner.trim() || null };
        if (await action.run({ update: risk.id, ...body }, key => physicalArchives!.updateRisk(risk.id, body, key))) onDone();
    };
    return <Modal title="Modifier le risque" subtitle="La probabilité et la gravité se changent par une réévaluation" onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Danger *"><HazardSelect value={hazard} onChange={setHazard} disabled={action.busy} keepCode={risk.hazardCode} /></Field>
                <Field label="Responsable du suivi"><input value={owner} onChange={e => setOwner(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Description *" wide><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>
                <Field label="Mesures existantes" wide><textarea value={existingMeasures} onChange={e => setExistingMeasures(e.target.value)} rows={2} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !valid}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

function MeasureDialog({ riskId, onClose, onDone }: { riskId: string; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [owner, setOwner] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = measureProblems({ label, dueDate }, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { label: label.trim(), description: description.trim() || null, owner: owner.trim() || null, dueDate: dueDate || null };
        if (await action.run({ measure: riskId, ...body }, key => physicalArchives!.addRiskMeasure(riskId, body, key))) onDone();
    };
    return <Modal title="Ajouter une mesure" subtitle="Ce que l’on fait pour réduire le risque" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={label} onChange={e => setLabel(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={4000} disabled={action.busy} /></Field>
                <Field label="Responsable"><input value={owner} onChange={e => setOwner(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Échéance"><input type="date" value={dueDate} min={todayIso()} onChange={e => setDueDate(e.target.value)} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Ajouter la mesure</button></footer>
        </form>
    </Modal>;
}

function ProgressDialog({ measure, onClose, onDone }: { measure: RiskMeasure; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [status, setStatus] = useState<string>(measure.status === 'A_FAIRE' ? 'EN_COURS' : 'FAITE');
    const [note, setNote] = useState('');
    const [completedOn, setCompletedOn] = useState(todayIso());
    const action = useAction();
    const closing = status === 'FAITE' || status === 'ABANDONNEE';
    const valid = !closing || (note.trim().length >= 5 && completedOn !== '' && completedOn <= todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        const body = { version: measure.version, status, note: note.trim() || null, completedOn: closing ? completedOn : null };
        if (await action.run({ progress: measure.id, ...body }, key => physicalArchives!.progressRiskMeasure(measure.id, body, key))) onDone();
    };
    return <Modal title={`Mesure : ${measure.label}`} subtitle="Une mesure faite ou abandonnée est close et ne se rouvre pas" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Nouvel état *"><select value={status} onChange={e => setStatus(e.target.value)} disabled={action.busy}>
                    {measure.status === 'A_FAIRE' && <option value="EN_COURS">{MEASURE_LABELS.EN_COURS}</option>}
                    <option value="FAITE">{MEASURE_LABELS.FAITE}</option><option value="ABANDONNEE">{MEASURE_LABELS.ABANDONNEE}</option></select></Field>
                {closing && <Field label="Date *"><input type="date" value={completedOn} max={todayIso()} onChange={e => setCompletedOn(e.target.value)} disabled={action.busy} /></Field>}
                <Field label={closing ? 'Compte rendu *' : 'Note'} wide hint={closing ? 'Ce qui a été fait, ou pourquoi on y renonce (5 caractères au moins).' : undefined}>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !valid}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ plan d'urgence
function PlansTab({ locationId, locationLabel, canManage, canApprove, onChanged }: { locationId: string; locationLabel: string; canManage: boolean; canApprove: boolean; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);
    const action = useAction();
    const q = useResource<PlanSummary[]>(s => physicalArchives!.emergencyPlans(locationId, s), `site-plans:${locationId}:${revision}:${epoch}`);
    const items = q.data ?? [];
    const reload = () => { setRevision(n => n + 1); onChanged(); };
    const hasDraft = items.some(p => p.status === 'BROUILLON');
    const create = async () => {
        const created = await action.run({ create: locationId }, key => physicalArchives!.createEmergencyPlan({ locationId, title: null, copyFromCurrent: true }, key));
        if (created) { reload(); setOpenId(created.id); }
    };
    return <section aria-label="Plans d’urgence de l’emplacement">
        {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
        {canManage && !hasDraft && <div className="toolbar-right"><button type="button" className="btn small primary" disabled={action.busy} onClick={create}>
            {items.some(p => p.status === 'APPROUVE') ? 'Préparer une nouvelle version' : 'Rédiger un plan d’urgence'}</button></div>}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucun plan d’urgence" description={`Aucun plan d’urgence n’est rédigé pour ${locationLabel}.`} icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Version</th><th>État</th><th>Approuvé le</th><th>Prochaine revue</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(p => <tr key={p.id}>
                        <td><strong>Version {p.versionNumber}</strong><small className="cell-sub">{p.title}</small></td>
                        <td><Badge value={p.status} label={planLabel(p.status)} /></td>
                        <td>{p.approvedAt ? formatDate(p.approvedAt) : '—'}</td>
                        <td>{p.nextReview ? formatDate(p.nextReview) : '—'}{p.reviewOverdue && <small className="cell-sub warn">dépassée</small>}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenId(p.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {openId && <PlanDialog id={openId} canManage={canManage} canApprove={canApprove} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>;
}

const emptyContact = (): ContactDraft => ({ role: '', name: '', phone: '', email: '', note: '' });
const emptyPriority = (): PriorityDraft => ({ label: '', storageUnitId: '', reason: '' });

function PlanDialog({ id, canManage, canApprove, onClose, onChanged }: { id: string; canManage: boolean; canApprove: boolean; onClose: () => void; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const q = useResource<EmergencyPlan>(s => physicalArchives!.emergencyPlan(id, s), `plan:${id}:${revision}:${epoch}`);
    const last = useRef<EmergencyPlan | null>(null);
    if (q.data) last.current = q.data;
    const plan = q.data ?? last.current;
    const refresh = () => { setRevision(n => n + 1); onChanged(); };
    if (!plan) return <Modal title="Plan d’urgence" onClose={onClose} wide>{q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <Busy />}</Modal>;
    return <PlanBody key={`${plan.id}:${plan.version}`} plan={plan} canManage={canManage} canApprove={canApprove} onClose={onClose} onRefresh={refresh} />;
}

function PlanBody({ plan, canManage, canApprove, onClose, onRefresh }: { plan: EmergencyPlan; canManage: boolean; canApprove: boolean; onClose: () => void; onRefresh: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const editable = plan.status === 'BROUILLON' && canManage;
    const [title, setTitle] = useState(plan.title);
    const [scope, setScope] = useState(plan.scope ?? '');
    const [alert, setAlert] = useState(plan.alert ?? '');
    const [evacuation, setEvacuation] = useState(plan.evacuation ?? '');
    const [rescue, setRescue] = useState(plan.rescue ?? '');
    const [stabilisation, setStabilisation] = useState(plan.stabilisation ?? '');
    const [resources, setResources] = useState(plan.resources ?? '');
    const [contacts, setContacts] = useState<ContactDraft[]>(plan.contacts.map(c => ({ role: c.role, name: c.name, phone: c.phone ?? '', email: c.email ?? '', note: c.note ?? '' })));
    const [priorities, setPriorities] = useState<PriorityDraft[]>(plan.priorities.map(p => ({ label: p.label, storageUnitId: p.storageUnitId ?? '', reason: p.reason })));
    const [panel, setPanel] = useState<null | 'approve' | 'abandon' | 'review'>(null);
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const locations = useResource<Localisation[]>(s => editable ? physicalArchives!.locations(s) : Promise.resolve([]), `plan-locations:${editable}:${epoch}`);
    const units = useResource<StorageUnit[]>(s => editable ? physicalArchives!.storageUnits(s) : Promise.resolve([]), `plan-units:${editable}:${epoch}`);
    const siteUnits = useMemo(() => {
        const within = subtree(locations.data ?? [], plan.locationId);
        return (units.data ?? []).filter(u => within.has(u.localisationId));
    }, [locations.data, units.data, plan.locationId]);
    const problems = [...contactProblems(contacts), ...priorityProblems(priorities)];
    const dirty = title !== plan.title || scope !== (plan.scope ?? '') || alert !== (plan.alert ?? '') || evacuation !== (plan.evacuation ?? '') || rescue !== (plan.rescue ?? '')
        || stabilisation !== (plan.stabilisation ?? '') || resources !== (plan.resources ?? '') || JSON.stringify(contacts) !== JSON.stringify(plan.contacts.map(c => ({ role: c.role, name: c.name, phone: c.phone ?? '', email: c.email ?? '', note: c.note ?? '' })))
        || JSON.stringify(priorities) !== JSON.stringify(plan.priorities.map(p => ({ label: p.label, storageUnitId: p.storageUnitId ?? '', reason: p.reason })));
    const body = () => ({
        version: plan.version, title: title.trim(), scope: scope.trim() || null, alert: alert.trim() || null, evacuation: evacuation.trim() || null, rescue: rescue.trim() || null,
        stabilisation: stabilisation.trim() || null, resources: resources.trim() || null,
        contacts: contacts.map(c => ({ role: c.role.trim(), name: c.name.trim(), phone: c.phone.trim() || null, email: c.email.trim() || null, note: c.note.trim() || null })),
        priorities: priorities.map(p => ({ label: p.label.trim(), storageUnitId: p.storageUnitId || null, archiveId: null, reason: p.reason.trim() }))
    });
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (title.trim().length < 3 || problems.length) { setAttempted(true); return; }
        const payload = body();
        if (await action.run({ save: plan.id, ...payload }, key => physicalArchives!.updateEmergencyPlan(plan.id, payload, key))) onRefresh();
    };
    const missing = approvalReadiness({ alert, evacuation, rescue, contacts: plan.contacts, priorities: plan.priorities });
    const move = <T,>(list: T[], index: number, delta: number): T[] => {
        const next = [...list]; const target = index + delta;
        if (target < 0 || target >= next.length) return next;
        [next[index], next[target]] = [next[target]!, next[index]!];
        return next;
    };
    const readOnlyText = (label: string, value: string | null) => value ? <div><dt>{label}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{value}</dd></div> : null;
    return <Modal title={`${plan.title} — version ${plan.versionNumber}`} subtitle={`${plan.locationLabel} · ${planLabel(plan.status)}`} onClose={onClose} locked={action.busy} wide>
        {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
        {plan.status === 'APPROUVE' && <p><small>Approuvé le {formatDate(plan.approvedAt)} par {plan.approvedByName ?? '—'}{plan.approvalReference ? ` (réf. ${plan.approvalReference})` : ''} · à revoir avant le {formatDate(plan.nextReview)}
            {plan.reviewOverdue ? ' — revue dépassée' : ''}{plan.reviewedOn ? ` · dernière revue le ${formatDate(plan.reviewedOn)} par ${plan.reviewedByName ?? '—'}` : ''}</small></p>}
        {plan.status === 'ABANDONNE' && plan.abandonReason && <Notice>Plan abandonné : {plan.abandonReason}</Notice>}
        {editable ? <form onSubmit={save} aria-label="Rédaction du plan">
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Portée" wide hint="Ce que couvre le plan : bâtiments, salles, fonds."><textarea value={scope} onChange={e => setScope(e.target.value)} rows={2} maxLength={20000} disabled={action.busy} /></Field>
                <Field label="Alerte *" wide hint="Qui alerter, dans quel ordre, comment."><textarea value={alert} onChange={e => setAlert(e.target.value)} rows={3} maxLength={20000} disabled={action.busy} /></Field>
                <Field label="Évacuation *" wide hint="Issues, point de rassemblement, décompte des personnes."><textarea value={evacuation} onChange={e => setEvacuation(e.target.value)} rows={3} maxLength={20000} disabled={action.busy} /></Field>
                <Field label="Sauvetage *" wide hint="Ce que l’on sauve, avec quels moyens, qui y est autorisé et à quelles conditions."><textarea value={rescue} onChange={e => setRescue(e.target.value)} rows={3} maxLength={20000} disabled={action.busy} /></Field>
                <Field label="Stabilisation et suites" wide><textarea value={stabilisation} onChange={e => setStabilisation(e.target.value)} rows={2} maxLength={20000} disabled={action.busy} /></Field>
                <Field label="Ressources et matériels" wide hint="Kit sinistre, emplacement du matériel, fournisseurs."><textarea value={resources} onChange={e => setResources(e.target.value)} rows={2} maxLength={20000} disabled={action.busy} /></Field>
            </div>
            <fieldset><legend>Personnes à prévenir</legend>
                {contacts.map((c, index) => <div key={index} className="form-grid contact-row" role="group" aria-label={`Contact ${index + 1}`}>
                    <Field label={`Fonction ${index + 1}`}><input value={c.role} onChange={e => setContacts(list => list.map((x, i) => i === index ? { ...x, role: e.target.value } : x))} maxLength={150} disabled={action.busy} /></Field>
                    <Field label={`Nom ${index + 1}`}><input value={c.name} onChange={e => setContacts(list => list.map((x, i) => i === index ? { ...x, name: e.target.value } : x))} maxLength={200} disabled={action.busy} /></Field>
                    <Field label={`Téléphone ${index + 1}`}><input value={c.phone} onChange={e => setContacts(list => list.map((x, i) => i === index ? { ...x, phone: e.target.value } : x))} maxLength={60} disabled={action.busy} /></Field>
                    <Field label={`Courriel ${index + 1}`}><input value={c.email} onChange={e => setContacts(list => list.map((x, i) => i === index ? { ...x, email: e.target.value } : x))} maxLength={200} disabled={action.busy} /></Field>
                    <div><button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setContacts(list => list.filter((_, i) => i !== index))}>Retirer le contact {index + 1}</button></div>
                </div>)}
                <button type="button" className="btn small secondary" disabled={action.busy || contacts.length >= 50} onClick={() => setContacts(list => [...list, emptyContact()])}>Ajouter un contact</button>
            </fieldset>
            <fieldset><legend>Priorités de sauvetage, dans l’ordre</legend>
                {priorities.map((p, index) => <div key={index} className="form-grid priority-row" role="group" aria-label={`Priorité ${index + 1}`}>
                    <Field label={`À sauver ${index + 1}`}><input value={p.label} onChange={e => setPriorities(list => list.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} maxLength={300} disabled={action.busy} /></Field>
                    <Field label={`Unité de stockage ${index + 1}`}><select value={p.storageUnitId} onChange={e => setPriorities(list => list.map((x, i) => i === index ? { ...x, storageUnitId: e.target.value } : x))} disabled={action.busy}>
                        <option value="">Aucune précision</option>{siteUnits.map(u => <option key={u.id} value={u.id}>{u.cote}</option>)}</select></Field>
                    <Field label={`Pourquoi ${index + 1}`} wide><input value={p.reason} onChange={e => setPriorities(list => list.map((x, i) => i === index ? { ...x, reason: e.target.value } : x))} maxLength={2000} disabled={action.busy} /></Field>
                    <div>
                        <button type="button" className="btn small secondary" disabled={action.busy || index === 0} onClick={() => setPriorities(list => move(list, index, -1))}>Monter la priorité {index + 1}</button>{' '}
                        <button type="button" className="btn small secondary" disabled={action.busy || index === priorities.length - 1} onClick={() => setPriorities(list => move(list, index, 1))}>Descendre la priorité {index + 1}</button>{' '}
                        <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setPriorities(list => list.filter((_, i) => i !== index))}>Retirer la priorité {index + 1}</button>
                    </div>
                </div>)}
                <button type="button" className="btn small secondary" disabled={action.busy || priorities.length >= 100} onClick={() => setPriorities(list => [...list, emptyPriority()])}>Ajouter une priorité</button>
            </fieldset>
            {attempted && (title.trim().length < 3 || problems.length > 0) && <Notice tone="warning"><ul>{title.trim().length < 3 && <li>Donnez un intitulé de 3 caractères au moins.</li>}{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            <footer className="modal-footer">
                <button type="submit" className="btn primary" disabled={action.busy || !dirty}>Enregistrer le brouillon</button>
                <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('abandon')}>Abandonner le brouillon</button>
                <button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
            </footer>
        </form> : <>
            <dl className="preservation-summary">
                {readOnlyText('Portée', plan.scope)}{readOnlyText('Alerte', plan.alert)}{readOnlyText('Évacuation', plan.evacuation)}{readOnlyText('Sauvetage', plan.rescue)}
                {readOnlyText('Stabilisation et suites', plan.stabilisation)}{readOnlyText('Ressources et matériels', plan.resources)}
            </dl>
            <h4>Personnes à prévenir</h4>
            {plan.contacts.length === 0 ? <p><small>Aucun contact.</small></p> : <div className="table-scroll"><table><thead><tr><th>Fonction</th><th>Nom</th><th>Téléphone</th><th>Courriel</th></tr></thead>
                <tbody>{plan.contacts.map(c => <tr key={c.rank}><td>{c.role}</td><td>{c.name}</td><td>{c.phone ?? '—'}</td><td>{c.email ?? '—'}</td></tr>)}</tbody></table></div>}
            <h4>Priorités de sauvetage</h4>
            {plan.priorities.length === 0 ? <p><small>Aucune priorité.</small></p> : <div className="table-scroll"><table><thead><tr><th>#</th><th>À sauver</th><th>Pourquoi</th></tr></thead>
                <tbody>{plan.priorities.map(p => <tr key={p.rank}><td>{p.rank}</td><td>{p.label}{p.storageUnitLabel && <small className="cell-sub">{p.storageUnitLabel}</small>}</td><td>{p.reason}</td></tr>)}</tbody></table></div>}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        </>}
        <div className="modal-actions">
            <button type="button" className="btn small secondary" onClick={() => printHtml(planSheetHtml(plan))}>Imprimer la fiche du plan</button>
            {plan.status === 'BROUILLON' && canApprove && <button type="button" className="btn small primary" disabled={action.busy || dirty || missing.length > 0} onClick={() => setPanel('approve')}>Approuver le plan</button>}
            {plan.status === 'APPROUVE' && canApprove && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setPanel('review')}>Enregistrer une revue</button>}
        </div>
        {plan.status === 'BROUILLON' && canApprove && (dirty || missing.length > 0) && <p><small>{dirty ? 'Enregistrez le brouillon avant de l’approuver. ' : ''}{missing.length > 0 ? `Pour être approuvé, le plan doit comporter : ${missing.join(', ')}.` : ''}</small></p>}
        {panel === 'approve' && <ApprovePlanDialog plan={plan} onClose={() => setPanel(null)} onDone={() => { setPanel(null); onRefresh(); }} />}
        {panel === 'review' && <ReviewPlanDialog plan={plan} onClose={() => setPanel(null)} onDone={() => { setPanel(null); onRefresh(); }} />}
        {panel === 'abandon' && <ReasonPrompt title="Abandonner le brouillon" subtitle="Le brouillon est clos ; le plan en vigueur reste en vigueur" hint="Pourquoi (au moins 10 caractères)." confirm="Abandonner le brouillon"
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await physicalArchives!.abandonEmergencyPlan(plan.id, { version: plan.version, reason }, key); onRefresh(); }} />}
    </Modal>;
}

function ApprovePlanDialog({ plan, onClose, onDone }: { plan: EmergencyPlan; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [nextReview, setNextReview] = useState(addMonths(todayIso(), 12));
    const [reference, setReference] = useState('');
    const action = useAction();
    const valid = nextReview > todayIso();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        const body = { version: plan.version, nextReview, approvalReference: reference.trim() || null };
        if (await action.run({ approve: plan.id, ...body }, key => physicalArchives!.approveEmergencyPlan(plan.id, body, key))) onDone();
    };
    return <Modal title="Approuver le plan d’urgence" subtitle="Par une autre personne que son auteur ; il remplace le plan en vigueur" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="À revoir avant le *" hint="Proposée à douze mois : choisissez l’échéance qui convient."><input type="date" value={nextReview} min={todayIso()} onChange={e => setNextReview(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Référence de l’approbation" hint="Note de service, décision…"><input value={reference} onChange={e => setReference(e.target.value)} maxLength={255} disabled={action.busy} /></Field>
            </div>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !valid}>Approuver</button></footer>
        </form>
    </Modal>;
}

function ReviewPlanDialog({ plan, onClose, onDone }: { plan: EmergencyPlan; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [nextReview, setNextReview] = useState(addMonths(todayIso(), 12));
    const action = useAction();
    const valid = nextReview > todayIso();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        const body = { version: plan.version, nextReview };
        if (await action.run({ review: plan.id, ...body }, key => physicalArchives!.reviewEmergencyPlan(plan.id, body, key))) onDone();
    };
    return <Modal title="Revue du plan d’urgence" subtitle="Le plan est relu et reste en vigueur sans changement de contenu" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid"><Field label="À revoir avant le *"><input type="date" value={nextReview} min={todayIso()} onChange={e => setNextReview(e.target.value)} disabled={action.busy} /></Field></div>
            <Notice>Si le plan doit changer, préparez plutôt une nouvelle version.</Notice>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !valid}>Enregistrer la revue</button></footer>
        </form>
    </Modal>;
}

// ------------------------------------------------------------------------------------------------ exercices et incidents
function ExercisesTab({ locationId, canManage, onChanged }: { locationId: string; canManage: boolean; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [recording, setRecording] = useState(false);
    const q = useResource<Exercise[]>(s => physicalArchives!.emergencyExercises(locationId, s), `site-exercises:${locationId}:${revision}:${epoch}`);
    const items = q.data ?? [];
    return <section aria-label="Exercices et incidents de l’emplacement">
        {canManage && <div className="toolbar-right"><button type="button" className="btn small primary" onClick={() => setRecording(true)}>Enregistrer un exercice ou un incident</button></div>}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <Empty title="Aucun exercice ni incident" description="Un plan d’urgence ne vaut que s’il a été éprouvé : enregistrez les exercices et les incidents." icon="shield" />
                : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Objet</th><th>Constats</th></tr></thead>
                    <tbody>{items.map(e => <tr key={e.id}>
                        <td>{formatDate(e.occurredOn)}</td>
                        <td><Badge value={e.type} label={EXERCISE_LABELS[e.type]} />{e.planVersion !== null && <small className="cell-sub">plan version {e.planVersion}</small>}</td>
                        <td><strong>{e.title}</strong><small className="cell-sub">{e.reference}{e.riskReference ? ` · risque ${e.riskReference}` : ''}{e.participants !== null ? ` · ${e.participants} participant${e.participants > 1 ? 's' : ''}` : ''}</small></td>
                        <td>{e.findings}{e.actions && <small className="cell-sub">Suites : {e.actions}</small>}</td>
                    </tr>)}</tbody></table></div>}
        {recording && <ExerciseDialog locationId={locationId} onClose={() => setRecording(false)} onDone={() => { setRecording(false); setRevision(n => n + 1); onChanged(); }} />}
    </section>;
}

function ExerciseDialog({ locationId, onClose, onDone }: { locationId: string; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [type, setType] = useState('EXERCICE');
    const [occurredOn, setOccurredOn] = useState(todayIso());
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [participants, setParticipants] = useState('');
    const [findings, setFindings] = useState('');
    const [actions, setActions] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = exerciseProblems({ occurredOn, title, description, findings }, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const count = participants.trim() === '' ? null : Number(participants);
        const body = { locationId, type, occurredOn, title: title.trim(), description: description.trim(), participants: count !== null && Number.isInteger(count) && count >= 0 ? count : null,
            findings: findings.trim(), actions: actions.trim() || null, riskId: null };
        if (await action.run(body, key => physicalArchives!.recordEmergencyExercise(body, key))) onDone();
    };
    return <Modal title="Enregistrer un exercice ou un incident" subtitle="Un enregistrement ne se modifie plus : un constat plus récent le complète" onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Nature *"><select value={type} onChange={e => setType(e.target.value)} disabled={action.busy}><option value="EXERCICE">{EXERCISE_LABELS.EXERCICE}</option><option value="INCIDENT">{EXERCISE_LABELS.INCIDENT}</option></select></Field>
                <Field label="Date *"><input type="date" value={occurredOn} max={todayIso()} onChange={e => setOccurredOn(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Intitulé *" wide><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Ce qui s’est passé *" wide><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={10000} disabled={action.busy} /></Field>
                <Field label="Participants"><input type="number" min={0} value={participants} onChange={e => setParticipants(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Constats *" wide hint="Ce qui a fonctionné, ce qui n’a pas fonctionné."><textarea value={findings} onChange={e => setFindings(e.target.value)} rows={3} maxLength={10000} disabled={action.busy} /></Field>
                <Field label="Suites à donner" wide><textarea value={actions} onChange={e => setActions(e.target.value)} rows={2} maxLength={10000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
