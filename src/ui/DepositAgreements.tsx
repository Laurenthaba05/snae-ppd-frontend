import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivesApi, type AuthorityView } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, useResource } from './components';
import { EntityName } from './names';
import { ReferencePicker } from './ReferencePicker';
import {
    AGREEMENT_STATUS, AGREEMENT_UNITS, PERIODICITES, agreementBody, agreementFormProblems, emptyAgreementForm, formOfAgreement, nextStatuses, volumeText,
    type AgreementForm, type AgreementStatus, type AgreementView
} from '../core/depositAgreements';

/** Les notices d'autorité d'un service d'archives : ce sont elles qui désignent les producteurs. Vide tant qu'aucune institution n'est choisie. */
export function useAuthorities(institutionId: string | null | undefined) {
    const { records, epoch } = useSession();
    const api = useMemo(() => records ? new ArchivesApi(records.transport) : null, [records]);
    return useResource<AuthorityView[]>(signal => institutionId && api ? api.authorities(institutionId, signal) : Promise.resolve([]), `intake-authorities:${institutionId ?? ''}:${epoch}`);
}

/**
 * Nom d'un producteur, lu dans les notices du service d'archives ; jamais son identifiant. `nameOf` rend « … » le temps du chargement, puis un libellé neutre si la notice
 * n'est pas lisible par cette personne.
 */
export function useProducerNames(institutionIds: ReadonlyArray<string | null | undefined>): { nameOf: (id: string | null | undefined) => string | null; loading: boolean } {
    const { records, epoch } = useSession();
    const api = useMemo(() => records ? new ArchivesApi(records.transport) : null, [records]);
    const ids = [...new Set(institutionIds.filter((id): id is string => !!id))].sort();
    const q = useResource<Array<[string, string]>>(async signal => {
        if (!api) return [];
        const lists = await Promise.all(ids.map(id => api.authorities(id, signal).catch(() => [] as AuthorityView[])));
        return lists.flat().map(a => [a.id, a.input.name] as [string, string]);
    }, `intake-producers:${ids.join(',')}:${epoch}`);
    const names = useMemo(() => new Map(q.data ?? []), [q.data]);
    return { loading: q.loading && !q.data, nameOf: (id) => id ? names.get(id) ?? (q.loading && !q.data ? '…' : 'Producteur (notice non lisible)') : null };
}

function AgreementDialog({ view, readOnly, onClose, onSaved }: { view: AgreementView | null; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
    const { archivalIntake } = useSession();
    const [form, setForm] = useState<AgreementForm>(view ? formOfAgreement(view) : emptyAgreementForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const producers = useAuthorities(form.institutionArchivesId);
    const problems = agreementFormProblems(form);
    const locked = !!view && view.versements > 0;                                   // des versements s'y appuient : les parties ne changent plus
    const closed = view?.input.statut === 'CLOS';
    const frozen = closed || readOnly;
    const set = (key: keyof AgreementForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problems.length || frozen) return;
        setBusy(true); setError(null);
        try { await archivalIntake!.saveAgreement(view?.id, agreementBody(form, view?.version ?? 0)); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const disabled = busy || frozen;
    const statuses: AgreementStatus[] = view ? nextStatuses(view.input.statut) : ['PROJET'];
    return <Modal wide title={view ? 'Accord de versement' : 'Nouvel accord de versement'} subtitle={view?.input.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Référence de l’accord"><input value={form.reference} onChange={set('reference')} maxLength={150} disabled={disabled} required /></Field>
                <Field label="Statut" hint={view ? undefined : 'Un accord commence en projet ; activez-le ensuite'}><select value={form.statut} onChange={set('statut')} disabled={disabled || statuses.length < 2}>{statuses.map(s => <option key={s} value={s}>{AGREEMENT_STATUS[s]}</option>)}</select></Field>
                <Field label="Intitulé" wide><input value={form.intitule} onChange={set('intitule')} maxLength={300} disabled={disabled} required /></Field>
                <div className="field"><span>Service d’archives destinataire</span><ReferencePicker kind="institutions" label="Service d’archives destinataire" value={form.institutionArchivesId} disabled={disabled || locked} onChange={id => setForm(f => ({ ...f, institutionArchivesId: id, producteurId: '' }))} /></div>
                <Field label="Producteur" hint={form.institutionArchivesId ? 'Une notice d’autorité du service d’archives' : 'Choisissez d’abord le service d’archives'}>
                    <select value={form.producteurId} onChange={set('producteurId')} disabled={disabled || locked || !form.institutionArchivesId || producers.loading}>
                        <option value="">Choisir…</option>{(producers.data ?? []).map(a => <option key={a.id} value={a.id}>{a.input.name}</option>)}</select></Field>
                <div className="field"><span>Service versant <small>(facultatif)</small></span><ReferencePicker kind="institutions" label="Service versant" nullable value={form.serviceVersantId} disabled={disabled} onChange={id => setForm(f => ({ ...f, serviceVersantId: id }))} /></div>
                <Field label="Périodicité"><select value={form.periodicite} onChange={set('periodicite')} disabled={disabled}>{Object.entries(PERIODICITES).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Date de début"><input type="date" value={form.dateDebut} onChange={set('dateDebut')} disabled={disabled} required /></Field>
                <Field label="Date de fin" hint="Vide : sans échéance"><input type="date" value={form.dateFin} onChange={set('dateFin')} disabled={disabled} /></Field>
                <Field label="Volume prévu" hint="Par versement ou par période, selon la périodicité"><input inputMode="decimal" value={form.volumePrevu} onChange={set('volumePrevu')} maxLength={15} disabled={disabled} placeholder="12,5" /></Field>
                <Field label="Unité du volume"><select value={form.uniteVolume} onChange={set('uniteVolume')} disabled={disabled}><option value="">Aucune</option>{AGREEMENT_UNITS.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                <Field label="Formats acceptés" wide hint="Pour les versements numériques : PDF/A, TIFF, XML…"><textarea value={form.formatsAcceptes} onChange={set('formatsAcceptes')} rows={2} maxLength={10000} disabled={disabled} /></Field>
                <Field label="Conditions et engagements" wide hint="Modalités de transfert, délais, restrictions d’accès demandées par le producteur…"><textarea value={form.conditions} onChange={set('conditions')} rows={3} maxLength={10000} disabled={disabled} /></Field>
            </div>
            {locked && <p><small>Des versements s’appuient sur cet accord : le producteur et le service d’archives ne peuvent plus changer.</small></p>}
            {closed && <p><small>Un accord clos ne peut plus changer.</small></p>}
            {problems.length > 0 && !frozen && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>{!frozen && <button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button>}</footer>
        </form>
    </Modal>;
}

/** Les accords de versement (contrats d'entrée) : liste, création, modification, changement de statut. */
export function DepositAgreementsPanel({ canManage }: { canManage: boolean }) {
    const { archivalIntake, epoch } = useSession();
    const q = useResource<AgreementView[]>(signal => archivalIntake!.agreements(signal), 'deposit-agreements:' + epoch);
    const [editing, setEditing] = useState<{ view: AgreementView | null } | null>(null);
    const agreements = q.data ?? [];
    const producers = useProducerNames(agreements.map(a => a.input.institutionArchivesId));
    return <div className="panel">
        <div className="section-heading"><h3>Accords de versement</h3>{canManage && <button className="btn small primary" onClick={() => setEditing({ view: null })}>Nouvel accord</button>}</div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : agreements.length === 0 ? <Empty title="Aucun accord de versement" description="Un accord fixe ce qu’un producteur s’engage à verser, sur quelle période et pour quel volume. Les versements s’y rattachent." />
                : <div className="table-scroll"><table><thead><tr><th>Accord</th><th>Producteur</th><th>Service d’archives</th><th>Période</th><th>Volume prévu</th><th>Statut</th><th>Versements</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{agreements.map(a => <tr key={a.id}>
                        <td><strong>{a.input.reference}</strong><small className="cell-sub">{a.input.intitule}</small></td>
                        <td>{producers.nameOf(a.input.producteurId)}</td>
                        <td><EntityName kind="institutions" id={a.input.institutionArchivesId} /></td>
                        <td>{a.input.dateDebut} → {a.input.dateFin ?? 'sans échéance'}<small className="cell-sub">{PERIODICITES[a.input.periodicite] ?? a.input.periodicite}</small></td>
                        <td>{volumeText(a) || '—'}</td>
                        <td><Badge value={a.input.statut} label={AGREEMENT_STATUS[a.input.statut]} /></td>
                        <td>{a.versements}</td>
                        <td className="table-actions"><button className="btn small secondary" onClick={() => setEditing({ view: a })}>{canManage && a.input.statut !== 'CLOS' ? 'Modifier' : 'Consulter'}</button></td>
                    </tr>)}</tbody></table></div>}
        {editing && <AgreementDialog view={editing.view} readOnly={!canManage} onClose={() => setEditing(null)} onSaved={q.refresh} />}
    </div>;
}
