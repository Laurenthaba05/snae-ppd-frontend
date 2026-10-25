import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Pagination, useResource } from './components';
import { dayText, placeText } from '../core/placement';
import {
    FILLING_LABELS, MEASURE_LABELS, MEASURE_UNITS, STATE_LABELS, decimal, emptyReading, filling, occupationText, readingBody, readingProblem, readingText, settingsBody, settingsForm, settingsProblems
} from '../core/physicalConditions';
import type { ConditionAlert, Measure, Reading, ReadingForm, SettingsForm } from '../core/physicalConditions';
import type { StorageUnit } from '../core/types';

const STATE_BADGE: Record<string, string> = { TROP_BAS: 'AUTRE_EMPLACEMENT', TROP_HAUT: 'INTROUVABLE', CONFORME: 'CONFORME' };
const FILLING_BADGE: Record<string, string> = { PRESQUE_PLEINE: 'AUTRE_EMPLACEMENT', PLEINE: 'AUTRE_EMPLACEMENT', DEPASSEE: 'INTROUVABLE' };

/** Ce qui est rangé dans l'unité par rapport à sa capacité : « 12 / 40 boîtes (30 %) », et un badge quand elle est presque pleine, pleine ou dépassée. */
export function OccupationCell({ unit }: { unit: StorageUnit }) {
    const state = filling(unit.occupation);
    const missing = unit.occupation?.nonCompte ?? 0;
    return <>{occupationText(unit.occupation, unit.capacite)}
        {FILLING_BADGE[state] && <> <Badge value={FILLING_BADGE[state]!} label={FILLING_LABELS[state]} /></>}
        {missing > 0 && <small className="cell-sub">{missing} archive{missing > 1 ? 's' : ''} sans quantité dans cette unité : non comptée{missing > 1 ? 's' : ''}.</small>}</>;
}

/** Le dernier relevé de chaque mesure, avec un badge quand il sort des seuils de l'unité. */
export function ReadingsCell({ unit }: { unit: StorageUnit }) {
    const readings = unit.releves ?? [];
    if (!readings.length) return <>—</>;
    return <>{readings.map(r => <small key={r.mesure} className="cell-sub">{MEASURE_LABELS[r.mesure]} : {readingText(r, dayText)}{r.etat !== 'CONFORME' && <> <Badge value={STATE_BADGE[r.etat]!} label={STATE_LABELS[r.etat]} /></>}</small>)}</>;
}

/**
 * La capacité d'une unité, l'unité dans laquelle elle se mesure et les seuils de conservation du local. Rien n'est livré : sans seuil, un relevé se consigne mais ne déclenche aucune alerte ;
 * la capacité signale, elle ne bloque pas. Si quelqu'un a réglé l'unité entre-temps, le serveur refuse : on rouvre pour voir les réglages à jour.
 */
export function UnitSettingsDialog({ unit, onClose, onSaved }: { unit: StorageUnit; onClose: () => void; onSaved: () => void }) {
    const { physicalArchives } = useSession();
    const [form, setForm] = useState<SettingsForm>(() => settingsForm(unit));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = settingsProblems(form);
    const set = (patch: Partial<SettingsForm>) => setForm(current => ({ ...current, ...patch }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            await physicalArchives!.command('/storage-units/' + unit.id + '/settings', settingsBody(form, unit.versionLock, unit.conditionsConservation), crypto.randomUUID(), 'POST');
            onSaved(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Capacité et conditions de conservation" subtitle={unit.cote} onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Capacité" hint="Un nombre. Elle signale quand l’unité est pleine ; elle ne refuse jamais une archive."><input inputMode="decimal" value={form.capacite} onChange={e => set({ capacite: e.target.value })} disabled={busy} /></Field>
                <Field label="Unité de la capacité" hint="Mètres linéaires, boîtes… Vide : la capacité se compte en archives."><input value={form.uniteCapacite} onChange={e => set({ uniteCapacite: e.target.value })} maxLength={30} disabled={busy} /></Field>
                <Field label="Température minimale (°C)"><input inputMode="decimal" value={form.temperatureMin} onChange={e => set({ temperatureMin: e.target.value })} disabled={busy} /></Field>
                <Field label="Température maximale (°C)"><input inputMode="decimal" value={form.temperatureMax} onChange={e => set({ temperatureMax: e.target.value })} disabled={busy} /></Field>
                <Field label="Humidité minimale (%)"><input inputMode="decimal" value={form.humiditeMin} onChange={e => set({ humiditeMin: e.target.value })} disabled={busy} /></Field>
                <Field label="Humidité maximale (%)"><input inputMode="decimal" value={form.humiditeMax} onChange={e => set({ humiditeMax: e.target.value })} disabled={busy} /></Field>
            </div>
            <p className="wf-note">Les seuils sont ceux que l’institution fixe pour son local. Une alerte n’apparaît que si le dernier relevé sort d’un seuil renseigné.</p>
            {problems.length > 0 && <ul className="field-error" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/** Les relevés de température et d'humidité d'une unité, le plus récent d'abord ; un relevé se consigne, il ne se corrige pas (le suivant le remplace). */
export function ReadingsDialog({ unit, canRecord, onClose, onChanged }: { unit: StorageUnit; canRecord: boolean; onClose: () => void; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [form, setForm] = useState<ReadingForm>(emptyReading);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const q = useResource(s => physicalArchives!.readings(unit.id, page, s), JSON.stringify(['readings', unit.id, page, revision, epoch]));
    const items: Reading[] = q.data?.items ?? [];
    const problem = form.valeur.trim() ? readingProblem(form) : null;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (readingProblem(form)) return;
        setBusy(true); setError(null);
        try {
            await physicalArchives!.command('/storage-units/' + unit.id + '/readings', readingBody(form), crypto.randomUUID(), 'POST');
            setForm(emptyReading()); setPage(0); setRevision(r => r + 1); onChanged();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Relevés de conservation" subtitle={unit.cote} onClose={onClose} wide>
        {canRecord && <form onSubmit={submit} className="asset-filters" aria-label="Consigner un relevé">
            <Field label="Mesure"><select value={form.mesure} onChange={e => setForm({ ...form, mesure: e.target.value as Measure })} disabled={busy}>{(Object.keys(MEASURE_LABELS) as Measure[]).map(m => <option key={m} value={m}>{MEASURE_LABELS[m]} ({MEASURE_UNITS[m]})</option>)}</select></Field>
            <Field label="Valeur relevée" error={problem ?? undefined}><input inputMode="decimal" value={form.valeur} onChange={e => setForm({ ...form, valeur: e.target.value })} disabled={busy} /></Field>
            <Field label="Note"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} maxLength={2000} disabled={busy} placeholder="Facultatif : appareil, circonstances" /></Field>
            <button type="submit" className="btn small primary" disabled={busy || !form.valeur.trim() || !!readingProblem(form)}>Consigner</button>
        </form>}
        {error ? <ErrorNotice error={error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : items.length ? <>
            <div className="table-scroll"><table><thead><tr><th>Relevé le</th><th>Mesure</th><th>Valeur</th><th>État</th><th>Par</th><th>Note</th></tr></thead>
                <tbody>{items.map(r => <tr key={r.id}><td className="nowrap">{dayText(r.releveLe)}</td><td>{MEASURE_LABELS[r.mesure]}</td><td>{decimal(r.valeur)} {MEASURE_UNITS[r.mesure]}</td>
                    <td>{r.etat === 'CONFORME' ? '—' : <Badge value={STATE_BADGE[r.etat]!} label={STATE_LABELS[r.etat]} />}</td><td>{r.relevePar ?? '—'}</td><td>{r.note ?? '—'}</td></tr>)}</tbody></table></div>
            <Pagination page={page} hasMore={q.data?.hasMore ?? false} onChange={setPage} count={items.length} />
        </> : <Empty title="Aucun relevé" description="Aucune température ni humidité n’a encore été relevée pour cette unité." />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

/** Les unités dont le dernier relevé sort des seuils qu'elles se sont fixés, les plus récents d'abord. */
export function ConditionAlertsSection() {
    const { physicalArchives, epoch } = useSession();
    const [page, setPage] = useState(0);
    const q = useResource(s => physicalArchives!.conditionAlerts(page, s), JSON.stringify(['condition-alerts', page, epoch]));
    const items: ConditionAlert[] = q.data?.items ?? [];
    if (q.loading && !q.data) return <div className="panel"><Busy /></div>;
    if (q.error) return <div className="panel"><ErrorNotice error={q.error} onRetry={q.refresh} /></div>;
    if (!items.length && page === 0) return null;
    return <div className="panel">
        <div className="section-heading"><h3>Alertes de conservation</h3></div>
        <p className="wf-note">Les unités dont le dernier relevé de température ou d’humidité sort des seuils fixés pour leur local.</p>
        <div className="table-scroll"><table><thead><tr><th>Unité</th><th>Mesure</th><th>Dernier relevé</th><th>Seuil</th><th>État</th></tr></thead>
            <tbody>{items.map(a => <tr key={a.unite.unitId + a.mesure}><td>{placeText(a.unite)}</td><td>{MEASURE_LABELS[a.mesure]}</td><td>{readingText(a, dayText)}</td>
                <td>{a.min !== null ? `min ${decimal(a.min)}` : ''}{a.min !== null && a.max !== null ? ' · ' : ''}{a.max !== null ? `max ${decimal(a.max)}` : ''} {MEASURE_UNITS[a.mesure]}</td>
                <td><Badge value={STATE_BADGE[a.etat]!} label={STATE_LABELS[a.etat]} /></td></tr>)}</tbody></table></div>
        <Pagination page={page} hasMore={q.data?.hasMore ?? false} onChange={setPage} count={items.length} />
    </div>;
}
