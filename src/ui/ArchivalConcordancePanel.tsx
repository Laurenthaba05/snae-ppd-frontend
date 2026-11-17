import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivalConcordanceApi, concordanceBlockers, type ConcordanceInput } from '../api/archivalConcordance';
import { Busy, ErrorNotice, Field, Notice, useResource } from './components';
import { navigate } from './navigation';

const checks = [
    ['identity', 'Identité : cote, titre, numéro et dates correspondent à l’original.'],
    ['context', 'Contexte : institution, producteur, type et classement sont corrects.'],
    ['completeness', 'Intégralité : toutes les pages, leur ordre, les annexes, signatures et cachets sont présents.'],
    ['legibility', 'Lisibilité : la reproduction est fidèle et les informations sont lisibles.']
] as const;

export function ArchivalConcordancePanel({ documentId, onChanged }: { documentId: string; onChanged?: () => void }) {
    const { records, epoch } = useSession();
    const api = useMemo(() => new ArchivalConcordanceApi(records!.transport), [records]);
    const q = useResource(signal => api.state(documentId, signal), 'concordance:' + documentId + epoch);
    const [origin, setOrigin] = useState<ConcordanceInput['origin']>('PAPIER');
    const [archiveId, setArchiveId] = useState('');
    const [cote, setCote] = useState('');
    const [note, setNote] = useState('');
    const [confirmed, setConfirmed] = useState({ identity: false, context: false, completeness: false, legibility: false });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [message, setMessage] = useState('');
    const [page, setPage] = useState(0);
    const h = useResource(signal => page ? api.history(documentId, page, signal) : Promise.resolve(null), 'concordance-history:' + documentId + epoch + ':' + page);
    const reset = () => { setConfirmed({ identity: false, context: false, completeness: false, legibility: false }); setMessage(''); setCote(''); setNote(''); };
    if (q.loading && !q.data) return <Busy label="Chargement du contrôle papier/numérique…" />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!q.data) return null;
    const data = q.data;
    const selected = origin === 'NATIF_NUMERIQUE' ? data.nativeChoice : data.choices.find(c => c.archiveId === archiveId);
    const history = page ? h.data : data.history;
    const ready = !!selected && !selected.blockers.length && Object.values(confirmed).every(Boolean) && note.trim().length >= 10
        && (origin === 'NATIF_NUMERIQUE' || cote.trim() === selected.cote);
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || busy || !selected) return;
        setBusy(true); setError(null); setMessage('');
        try {
            await api.validate(documentId, { origin, archiveId: selected.archiveId, observedCote: origin === 'PAPIER' ? cote.trim() : null,
                fingerprint: selected.fingerprint, checks: confirmed, note: note.trim() }, crypto.randomUUID());
            reset(); setPage(0); q.refresh(); onChanged?.(); setMessage('Contrôle enregistré. Les validations précédentes restent dans l’historique.');
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <section className="panel" aria-label="Contrôle papier/numérique">
        <div className="section-heading"><h3>Contrôle papier/numérique</h3><button className="btn small secondary" disabled={busy} onClick={() => { reset(); q.refresh(); h.refresh(); }}>Actualiser</button></div>
        <Notice>{data.valid ? 'Contrôle conforme aux données actuelles. Les autres validations du cycle d’archivage restent obligatoires.' : data.status === 'A_REVALIDER'
            ? 'Archivage définitif bloqué : les informations contrôlées ont changé ou la présence physique doit être revérifiée.'
            : 'Archivage définitif bloqué : aucun contrôle papier/numérique valide n’est enregistré.'}</Notice>
        <p>Comparez le document archivé à son original, page par page. Le texte OCR aide à la recherche ; il ne remplace pas ce contrôle.</p>
        {data.canValidate ? <form onSubmit={save}>
            <Field label="Origine de l’original"><select value={origin} disabled={busy} onChange={e => { setOrigin(e.target.value as ConcordanceInput['origin']); reset(); }}>
                <option value="PAPIER">Original papier</option><option value="NATIF_NUMERIQUE">Nativement numérique — sans original papier</option>
            </select></Field>
            {origin === 'PAPIER' ? <>
                {!data.physicalReadable ? <Notice>La permission de lecture des archives physiques est nécessaire pour contrôler une copie papier.</Notice>
                    : <><Field label="Cote et fiche physique liée"><select value={archiveId} disabled={busy} onChange={e => { setArchiveId(e.target.value); reset(); }}>
                        <option value="">Choisir l’original lié</option>{data.choices.map(c => <option key={c.archiveId!} value={c.archiveId!}>{c.cote}{c.title ? ' — ' + c.title : ''}</option>)}
                    </select></Field>{data.choices.length === 0 && <p>Aucune fiche physique liée. Créez ou reliez la fiche de l’original dans les archives physiques avant de poursuivre.</p>}
                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => navigate('/app/archives-physiques' + (archiveId ? '?archive=' + archiveId : ''))}>Ouvrir les archives physiques</button></>}
                {selected && <><p><strong>Emplacement physique : </strong>{selected.location.join(' › ') || 'À compléter'}</p>
                    <Field label="Cote relevée sur l’original"><input value={cote} maxLength={150} disabled={busy} onChange={e => setCote(e.target.value)} /></Field>
                    {cote && cote.trim() !== selected.cote && <p role="alert">La cote relevée ne correspond pas à la fiche physique.</p>}</>}
            </> : <p>Réservé aux documents créés sous forme numérique, sans original papier. Justifiez cette origine dans le constat.</p>}
            {!!selected?.blockers.length && <ul>{selected.blockers.map(code => <li key={code}>{concordanceBlockers[code] ?? code}</li>)}</ul>}
            <fieldset disabled={busy || !selected || !!selected.blockers.length}><legend>Attestation de l’agent</legend>
                {checks.map(([key, label]) => <label key={key} style={{ display: 'block', marginBottom: '.75rem' }}><input type="checkbox" checked={confirmed[key]}
                    onChange={e => setConfirmed({ ...confirmed, [key]: e.target.checked })} /> {label}</label>)}
                <Field label="Constat de concordance ou justification de l’origine numérique"><textarea value={note} maxLength={4000} minLength={10} required onChange={e => setNote(e.target.value)} /></Field>
            </fieldset>
            <button className="btn primary" type="submit" disabled={busy || !ready}>{busy ? 'Enregistrement…' : 'Valider la concordance'}</button>
        </form> : <><p>La validation nécessite un agent habilité à clôturer les documents dans cette institution. Les documents détruits ne peuvent plus être contrôlés.</p>
            {data.choices.map(c => <p key={c.archiveId!}><strong>Cote : {c.cote}</strong><br/>Emplacement physique : {c.location.join(' › ') || 'À compléter'}</p>)}</>}
        {error ? <ErrorNotice error={error} /> : null}{message && <p role="status">{message}</p>}
        <h4>Historique des contrôles</h4>
        {h.error ? <ErrorNotice error={h.error} onRetry={h.refresh} /> : null}
        {history?.items.length ? <ul>{history.items.map(c => <li key={c.id}><strong>{c.current ? 'Valide' : 'Contrôle antérieur'}</strong> — {new Date(c.validatedAt).toLocaleString('fr-FR')} — {c.origin === 'PAPIER' ? 'Cote ' + c.cote : 'Nativement numérique'}
            {c.location.length > 0 && <p>{c.location.join(' › ')}</p>}<p>{c.note}</p><small>Agent : {c.validatedBy}</small></li>)}</ul>
            : <p>Aucun contrôle consultable.</p>}
        {(page > 0 || history?.hasMore) && <div><button disabled={page === 0 || h.loading} onClick={() => setPage(page - 1)}>Plus récents</button><button disabled={!history?.hasMore || h.loading} onClick={() => setPage(page + 1)}>Plus anciens</button></div>}
    </section>;
}
