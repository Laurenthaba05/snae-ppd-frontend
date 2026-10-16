import React, {  useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { formatDay } from '../core/format';
import { PERSONAL_LABELS, type PersonalData } from '../core/recordInfo';
import {
    LEVEL_LABELS, STATE_LABELS, TRIGGER_LABELS, applyBody, applyProblems, categoryBody, categoryProblems, delayText, emptyApply, emptyCategory, pendingBlockerText, remainingText, restrictionText,
    stateText, type ApplyForm, type CategoryForm, type Communicability, type CommunicabilityCategory, type DelayUnit, type DocumentCommunicability, type PendingItem, type PersonalDataGap,
    type RestrictionLevel, type UpcomingItem
} from '../core/communicability';
import type { DocumentType } from '../core/types';

const day = (iso: string) => formatDay(iso);
const STATE_BADGE: Record<string, string> = { LIBRE: 'ACTIF', EN_ATTENTE: 'SUSPENDU', INCOMMUNICABLE: 'REJETE' };

/** La communicabilité d'un document : le délai appliqué, la date de libre communicabilité, ce qu'il faut faire s'il n'y en a pas. */
export function DocumentCommunicabilityPanel({ documentId, institutionId, canManage, destroyed = false }: { documentId: string; institutionId: string; canManage: boolean; destroyed?: boolean }) {
    const { rights, epoch } = useSession();
    const q = useResource<DocumentCommunicability>(signal => rights!.documentCommunicability(documentId, signal), `document-communicability:${documentId}:${epoch}`);
    const [applying, setApplying] = useState(false);
    const [removing, setRemoving] = useState(false);
    const view = q.data;
    const current = view?.current ?? null;
    const personal = (view?.personalData ?? 'A_EVALUER') as PersonalData;
    return <div className="communicability-panel" role="region" aria-label="Communicabilité">
        <div className="section-heading"><h4>Délai de communicabilité</h4>{canManage && !destroyed && <div className="table-actions">
            <button type="button" className="btn small secondary" onClick={() => setApplying(true)}>{current ? 'Remplacer par une autre catégorie' : 'Appliquer un délai'}</button>
            {current && <button type="button" className="btn small danger-outline" onClick={() => setRemoving(true)}>Retirer le délai</button>}</div>}</div>
        {q.loading && !view ? <Busy /> : q.error && !view ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : view && <>
            <p className="communicability-personal">Données personnelles : <strong>{PERSONAL_LABELS[personal] ?? personal}</strong>{view.sensitiveData ? ' · sensibles' : ''}.</p>
            {current ? <div className={'communicability-current state-' + current.state.toLowerCase()}>
                <p><strong>{current.label}</strong> <Badge value={STATE_BADGE[current.state] ?? 'ACTIF'} label={STATE_LABELS[current.state]} /></p>
                <p>{stateText(current, day)}</p>
                <small className="cell-sub">Délai de {current.perpetual ? 'durée perpétuelle' : delayText({ perpetual: current.perpetual, duration: current.duration, unit: current.unit, trigger: current.trigger, eventLabel: null })}
                    {' · '}départ le {day(current.baseDate)}{current.eventDate ? ' (date saisie)' : ''} · appliqué par <EntityName kind="users" id={current.appliedById} /> le {formatDate(current.appliedAt)}</small>
                {restrictionText(current) && <small className="cell-sub">{restrictionText(current)}</small>}
                {current.reason && <small className="cell-sub">Motif : {current.reason}</small>}
            </div> : <>
                <Notice tone={personal === 'PRESENTES' ? 'warning' : 'info'}>{personal === 'PRESENTES'
                    ? 'Ce document porte des données personnelles et n’a aucun délai de communicabilité : il n’est donc soumis à aucune restriction calculée.'
                    : 'Aucun délai de communicabilité n’est appliqué à ce document.'}</Notice>
                {view.suggestions.length > 0 && <p>Catégories qui visent ce type de document : {view.suggestions.map(s => <span key={s.id} className="finding">{s.label} · {delayText(s)}</span>)}</p>}
            </>}
        </>}
        {applying && <ApplyDialog documentId={documentId} institutionId={institutionId} suggestions={view?.suggestions ?? []} replacing={current} onClose={() => setApplying(false)} onDone={q.refresh} />}
        {removing && current && <RemoveDialog documentId={documentId} current={current} onClose={() => setRemoving(false)} onDone={q.refresh} />}
    </div>;
}

function ApplyDialog({ documentId, institutionId, suggestions, replacing, onClose, onDone }: {
    documentId: string; institutionId: string; suggestions: CommunicabilityCategory[]; replacing: Communicability | null; onClose: () => void; onDone: () => void;
}) {
    const { rights, epoch } = useSession();
    const q = useResource<CommunicabilityCategory[]>(signal => rights!.communicabilityCategories(institutionId, signal), `communicability-categories:${institutionId}:${epoch}`);
    const categories = useMemo(() => (q.data ?? []).filter(c => c.status === 'ACTIVE'), [q.data]);
    const [form, setForm] = useState<ApplyForm>(emptyApply(suggestions.length === 1 ? suggestions[0]!.id : ''));
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const category = categories.find(c => c.id === form.categoryId) ?? suggestions.find(c => c.id === form.categoryId) ?? null;
    const problems = applyProblems(form, category);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = applyBody(form, category!);
        intention.current = commandKey(intention.current, { documentId, body });
        try { await rights!.applyCommunicability(documentId, body, intention.current.key); onDone(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Appliquer un délai de communicabilité" subtitle="La date de libre communicabilité se calcule ; la restriction d’accès est posée jusque-là" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {replacing && <Notice tone="warning">La catégorie « {replacing.label} » est remplacée : sa restriction est annulée et remplacée par celle de la nouvelle catégorie.</Notice>}
            <div className="form-grid">
                <Field label="Catégorie *" wide hint={category ? `${delayText(category)} · niveau ${LEVEL_LABELS[category.level].toLowerCase()} · ${category.legalBasis}` : 'Les catégories qui visent le type du document sont proposées en premier.'}>
                    <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} disabled={busy || q.loading}>
                        <option value="">Choisir une catégorie</option>
                        {suggestions.length > 0 && <optgroup label="Visent ce type de document">{suggestions.map(c => <option key={c.id} value={c.id}>{c.label} — {delayText(c)}</option>)}</optgroup>}
                        <optgroup label="Autres catégories">{categories.filter(c => !suggestions.some(s => s.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.label} — {delayText(c)}</option>)}</optgroup>
                    </select></Field>
                {category?.trigger === 'DATE_EVENEMENT' && <Field label={`${category.eventLabel ?? 'Date de l’événement'} *`} hint="Le délai court de cette date."><input type="date" value={form.eventDate}
                    onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} disabled={busy} /></Field>}
                <Field label="Motif" wide hint="Facultatif : pourquoi cette catégorie s'applique à ce document."><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} maxLength={4000} disabled={busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Appliquer</button></footer>
        </form>
    </Modal>;
}

function RemoveDialog({ documentId, current, onClose, onDone }: { documentId: string; current: Communicability; onClose: () => void; onDone: () => void }) {
    const { rights } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !reason.trim()) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { documentId, reason });
        try { await rights!.removeCommunicability(documentId, reason.trim(), intention.current.key); onDone(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Retirer le délai de communicabilité" subtitle={current.label} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">La restriction posée par cette catégorie est annulée : le document n’est plus soumis à ce délai. Une restriction posée à la main reste en vigueur.</Notice>
            <Field label="Motif *" wide hint="Conservé au journal."><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={4000} disabled={busy} required /></Field>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Garder</button>
                <button type="submit" className="btn danger" disabled={busy || !reason.trim()}>Retirer le délai</button></footer>
        </form>
    </Modal>;
}

/** Le catalogue des catégories de l'institution, ce qui reste à classer, ce qui devient libre bientôt, et les données personnelles sans délai. */
export function CommunicabilityCatalogPanel({ institutionId, canCatalog, canApply }: { institutionId: string; canCatalog: boolean; canApply: boolean }) {
    const { rights, epoch } = useSession();
    const categoriesQ = useResource<CommunicabilityCategory[]>(signal => rights!.communicabilityCategories(institutionId, signal), `communicability-categories:${institutionId}:${epoch}`);
    const [days, setDays] = useState(365);
    const upcomingQ = useResource<UpcomingItem[]>(signal => rights!.upcomingCommunicability(institutionId, days, signal), `communicability-upcoming:${institutionId}:${days}:${epoch}`);
    const gapsQ = useResource<PersonalDataGap[]>(signal => rights!.personalDataGaps(institutionId, signal), `communicability-gaps:${institutionId}:${epoch}`);
    const [creating, setCreating] = useState(false);
    const [pending, setPending] = useState<CommunicabilityCategory | null>(null);
    const [retiring, setRetiring] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const categories = categoriesQ.data ?? [];
    const retire = async (c: CommunicabilityCategory) => {
        if (retiring) return;
        setRetiring(c.id); setError(null);
        try { await rights!.retireCommunicabilityCategory(c.id, crypto.randomUUID()); categoriesQ.refresh(); } catch (e) { setError(e); } finally { setRetiring(null); }
    };
    return <div className="panel communicability-catalog" role="region" aria-label="Délais de communicabilité">
        <div className="section-heading"><h3>Délais de communicabilité</h3>{canCatalog && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouvelle catégorie</button>}</div>
        <div className="panel-padding"><Notice>Une catégorie fixe un délai et sa base légale. L’appliquer à un document calcule la date de libre communicabilité et pose la restriction d’accès jusque-là ;
            elle s’éteint d’elle-même. Les délais sont des données de référence : aucun n’est fixé par le logiciel.</Notice></div>
        {categoriesQ.loading && !categoriesQ.data ? <Busy /> : categoriesQ.error ? <ErrorNotice error={categoriesQ.error} onRetry={categoriesQ.refresh} />
            : categories.length === 0 ? <Empty title="Aucune catégorie" description="Créez les catégories de délais prévues par les textes applicables (vie privée, secret médical, défense…)." icon="clock" />
                : <div className="table-scroll"><table><thead><tr><th>Catégorie</th><th>Délai</th><th>Niveau</th><th>Base légale</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{categories.map(c => <tr key={c.id}>
                        <td><strong>{c.code}</strong><small className="cell-sub">{c.label}</small>{c.personalData && <small className="cell-sub">Données personnelles</small>}</td>
                        <td>{delayText(c)}</td>
                        <td>{LEVEL_LABELS[c.level]}</td>
                        <td>{c.legalBasis}</td>
                        <td><Badge value={c.status === 'ACTIVE' ? 'ACTIF' : 'INACTIF'} label={c.status === 'ACTIVE' ? 'Active' : 'Retirée'} /><small className="cell-sub">{c.scope === 'NATIONAL' ? 'Nationale' : 'Institution'}</small></td>
                        <td className="table-actions">
                            {canApply && c.status === 'ACTIVE' && <button type="button" className="btn small secondary" aria-label={`À classer pour ${c.code}`} onClick={() => setPending(c)}>À classer</button>}
                            {canCatalog && c.status === 'ACTIVE' && c.scope === 'INSTITUTION' && <button type="button" className="btn small danger-outline" aria-label={`Retirer ${c.code}`} disabled={retiring === c.id} onClick={() => void retire(c)}>Retirer</button>}
                        </td>
                    </tr>)}</tbody></table></div>}
        {error ? <ErrorNotice error={error} /> : null}

        <div className="section-heading"><h4>Bientôt librement communicables</h4>
            <select aria-label="Horizon" value={days} onChange={e => setDays(Number(e.target.value))}><option value={90}>90 jours</option><option value={365}>1 an</option><option value={1095}>3 ans</option></select></div>
        {upcomingQ.loading && !upcomingQ.data ? <Busy /> : upcomingQ.error ? <ErrorNotice error={upcomingQ.error} onRetry={upcomingQ.refresh} />
            : (upcomingQ.data ?? []).length === 0 ? <p className="relation-empty panel-padding">Aucun document ne devient librement communicable dans cette période.</p>
                : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Catégorie</th><th>Libre le</th></tr></thead>
                    <tbody>{(upcomingQ.data ?? []).map(u => <tr key={u.documentId}><td><strong>{u.reference}</strong><small className="cell-sub">{u.title}</small></td><td>{u.label}</td>
                        <td>{day(u.freeDate)}<small className="cell-sub">{remainingText(u.daysRemaining)}</small></td></tr>)}</tbody></table></div>}

        <div className="section-heading"><h4>Données personnelles sans délai</h4></div>
        {gapsQ.loading && !gapsQ.data ? <Busy /> : gapsQ.error ? <ErrorNotice error={gapsQ.error} onRetry={gapsQ.refresh} />
            : (gapsQ.data ?? []).length === 0 ? <p className="relation-empty panel-padding">Aucun document clos ne porte de données personnelles sans délai de communicabilité.</p>
                : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Nature des données</th></tr></thead>
                    <tbody>{(gapsQ.data ?? []).map(g => <tr key={g.documentId}><td><strong>{g.reference}</strong><small className="cell-sub">{g.title}</small></td>
                        <td>{g.nature ?? '—'}{g.sensitive && <small className="cell-sub">Données sensibles</small>}</td></tr>)}</tbody></table></div>}
        {creating && <CategoryDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={categoriesQ.refresh} />}
        {pending && <PendingDialog category={pending} institutionId={institutionId} onClose={() => setPending(null)} onDone={() => { categoriesQ.refresh(); upcomingQ.refresh(); gapsQ.refresh(); }} />}
    </div>;
}

function CategoryDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { rights, records, epoch } = useSession();
    const typesQ = useResource<DocumentType[]>(signal => records!.documentTypes(signal), `communicability-types:${epoch}`);
    const [form, setForm] = useState<CategoryForm>(emptyCategory());
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => categoryProblems(form), [form]);
    const set = (patch: Partial<CategoryForm>) => setForm(f => ({ ...f, ...patch }));
    const types = (typesQ.data ?? []).filter(t => t.status === 'ACTIF');
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = categoryBody(form, institutionId);
        intention.current = commandKey(intention.current, body);
        try { await rights!.createCommunicabilityCategory(body, intention.current.key); onDone(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Nouvelle catégorie de communicabilité" subtitle="Un délai, sa base légale, ce qu'il vise" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Code *" hint="Majuscules ; unique."><input value={form.code} onChange={e => set({ code: e.target.value })} maxLength={60} disabled={busy} placeholder="VIE-PRIVEE-50" /></Field>
                <Field label="Intitulé *"><input value={form.label} onChange={e => set({ label: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Base légale *" wide hint="Le texte qui fixe le délai : loi, article."><input value={form.legalBasis} onChange={e => set({ legalBasis: e.target.value })} maxLength={1000} disabled={busy} /></Field>
                <Field label="Le délai court depuis"><select value={form.trigger} onChange={e => set({ trigger: e.target.value as CategoryForm['trigger'] })} disabled={busy}>
                    {(Object.keys(TRIGGER_LABELS) as CategoryForm['trigger'][]).map(k => <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>)}</select></Field>
                {form.trigger === 'DATE_EVENEMENT' && <Field label="Quel événement *" hint="Date de naissance de la personne, de décès, fin du marché…"><input value={form.eventLabel} onChange={e => set({ eventLabel: e.target.value })} maxLength={150} disabled={busy} /></Field>}
                <label className="field check-field"><span><input type="checkbox" checked={form.perpetual} onChange={e => set({ perpetual: e.target.checked })} disabled={busy} /> Délai perpétuel</span><small>Le document ne devient jamais librement communicable.</small></label>
                {!form.perpetual && <Field label="Durée *"><input inputMode="numeric" value={form.duration} onChange={e => set({ duration: e.target.value })} maxLength={4} disabled={busy} placeholder="50" /></Field>}
                {!form.perpetual && <Field label="Unité"><select value={form.unit} onChange={e => set({ unit: e.target.value as DelayUnit })} disabled={busy}><option value="JOURS">Jours</option><option value="MOIS">Mois</option><option value="ANNEES">Années</option></select></Field>}
                <Field label="Niveau de la restriction"><select value={form.level} onChange={e => set({ level: e.target.value as RestrictionLevel })} disabled={busy}>
                    {(Object.keys(LEVEL_LABELS) as RestrictionLevel[]).map(k => <option key={k} value={k}>{LEVEL_LABELS[k]}</option>)}</select></Field>
                <label className="field check-field"><span><input type="checkbox" checked={form.personalData} onChange={e => set({ personalData: e.target.checked })} disabled={busy} /> Concerne des données personnelles</span></label>
                <Field label="Description" wide><textarea value={form.description} onChange={e => set({ description: e.target.value })} rows={2} maxLength={4000} disabled={busy} /></Field>
                <fieldset className="span2 checklist"><legend>Types de documents visés</legend>
                    {typesQ.loading ? <Busy /> : <div style={{ maxHeight: 160, overflowY: 'auto', display: 'grid', gap: 6, padding: '4px 2px' }}>{types.map(t => <label key={t.id} className="field asset-flag">
                        <input type="checkbox" checked={form.typeDocumentIds.includes(t.id)} disabled={busy}
                            onChange={e => set({ typeDocumentIds: e.target.checked ? [...form.typeDocumentIds, t.id] : form.typeDocumentIds.filter(x => x !== t.id) })} /><span>{t.label}</span></label>)}</div>}
                </fieldset>
            </div>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer la catégorie</button></footer>
        </form>
    </Modal>;
}

/** Les documents clos du type visé qui n'ont encore aucun délai : on les classe en lot, ou on les laisse. */
function PendingDialog({ category, institutionId, onClose, onDone }: { category: CommunicabilityCategory; institutionId: string; onClose: () => void; onDone: () => void }) {
    const { rights, epoch } = useSession();
    const q = useResource<PendingItem[]>(signal => rights!.pendingCommunicability(category.id, institutionId, signal), `communicability-pending:${category.id}:${epoch}`);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [done, setDone] = useState<number | null>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const items = q.data ?? [];
    const selectable = items.filter(i => i.blockers.length === 0);
    const allSelected = selectable.length > 0 && selectable.every(i => selected.has(i.documentId));
    const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const apply = async () => {
        if (busy || selected.size === 0) return;
        setBusy(true); setError(null);
        const ids = [...selected].sort();
        intention.current = commandKey(intention.current, { category: category.id, ids, reason });
        try { const result = await rights!.applyCommunicabilityBatch(category.id, ids, reason.trim() || null, intention.current.key); setDone(result.length); setSelected(new Set()); q.refresh(); onDone(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Documents à classer" subtitle={`${category.label} — ${delayText(category)}`} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : items.length === 0 ? <Empty title="Rien à classer" description="Tous les documents clos de ce type ont déjà un délai de communicabilité." icon="check" />
                    : <div className="table-scroll"><table><thead><tr>
                        <th><input type="checkbox" aria-label="Tout choisir" checked={allSelected} disabled={busy || selectable.length === 0} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(i => i.documentId)))} /></th>
                        <th>Document</th><th>Départ du délai</th><th>Libre le</th><th>État</th></tr></thead>
                        <tbody>{items.map(i => <tr key={i.documentId}>
                            <td><input type="checkbox" aria-label={`Choisir ${i.reference}`} checked={selected.has(i.documentId)} disabled={busy || i.blockers.length > 0} onChange={() => toggle(i.documentId)} /></td>
                            <td><strong>{i.reference}</strong><small className="cell-sub">{i.title}</small></td>
                            <td>{i.baseDate ? day(i.baseDate) : '—'}</td>
                            <td>{i.freeDate ? day(i.freeDate) : category.perpetual ? 'Jamais' : '—'}</td>
                            <td>{i.blockers.length === 0 ? <span className="finding">Prêt</span> : <ul className="relation-problems">{i.blockers.map(b => <li key={b}>{pendingBlockerText(b)}</li>)}</ul>}</td>
                        </tr>)}</tbody></table></div>}
            <Field label="Motif du classement" wide hint="Facultatif : repris dans chaque application."><input value={reason} onChange={e => setReason(e.target.value)} maxLength={4000} disabled={busy} /></Field>
            {done !== null && <Notice>{done} document{done > 1 ? 's' : ''} classé{done > 1 ? 's' : ''} : la date de libre communicabilité est calculée et la restriction posée.</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
            <button type="button" className="btn primary" disabled={busy || selected.size === 0} onClick={() => void apply()}>Appliquer à {selected.size} document{selected.size > 1 ? 's' : ''}</button></footer>
    </Modal>;
}
