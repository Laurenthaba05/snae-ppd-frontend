import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, ErrorNotice, Field, Modal } from './components';
import { emptyCriteria } from '../core/physicalSearch';
import { foldCote, lostNoteProblem, readScan } from '../core/physicalInventory';
import { verifyBody } from '../core/placement';
import type { PhysicalArchive, StorageUnit } from '../core/types';

type Mark = { state: 'seen' | 'lost' | 'error'; message?: string };
interface Elsewhere { archiveId: string; cote: string; state: 'new' | 'registered' | 'error'; message?: string }

/**
 * Récolement d'une unité de rangement par lecture des étiquettes : chaque archive lue (douchette ou saisie) est constatée présente à l'instant ; une archive qui appartient à une autre
 * unité est signalée et se constate « trouvée ici » d'un clic ; à la fin, celles qui n'ont pas été lues sont proposées « introuvables », avec une note qui dit où l'on a cherché.
 * Chaque constat est enregistré tout de suite : une interruption ne perd rien, et un constat plus récent remplace le précédent.
 */
export function PhysicalInventoryDialog({ unit, place, archives, onClose, onDone }: { unit: StorageUnit; place: string; archives: readonly PhysicalArchive[]; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [marks, setMarks] = useState<Record<string, Mark>>({});
    const [elsewhere, setElsewhere] = useState<Elsewhere[]>([]);
    const [value, setValue] = useState('');
    const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
    const [step, setStep] = useState<'scan' | 'review'>('scan');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const input = useRef<HTMLInputElement>(null);
    const expected = useMemo(() => archives.map(a => ({ id: a.id, cote: a.cote })), [archives]);
    const byId = useMemo(() => new Map(archives.map(a => [a.id, a] as const)), [archives]);
    const seen = archives.filter(a => marks[a.id]?.state === 'seen').length;
    const unseen = archives.filter(a => marks[a.id]?.state !== 'seen');

    const verify = (archiveId: string, resultat: 'PRESENTE' | 'AUTRE_EMPLACEMENT' | 'ABSENTE', noteText = '') =>
        physicalArchives!.command('/archives/' + archiveId + '/verifications', verifyBody({ resultat, uniteConstateeId: resultat === 'AUTRE_EMPLACEMENT' ? unit.id : '', note: noteText }), crypto.randomUUID(), 'POST');
    const reason = (e: unknown) => e instanceof Error ? e.message : 'Constat impossible.';

    const scan = async (event: React.FormEvent) => {
        event.preventDefault();
        const reading = readScan(value, expected);
        setValue('');
        input.current?.focus();
        if (reading.kind === 'EMPTY') return;
        if (reading.kind === 'UNIT') { setMessage({ tone: 'bad', text: 'C’est l’étiquette d’une unité, pas celle d’une archive.' }); return; }
        if (reading.kind === 'EXPECTED') {
            const a = byId.get(reading.id)!;
            if (marks[a.id]?.state === 'seen') { setMessage({ tone: 'ok', text: a.cote + ' : déjà lue.' }); return; }
            try {
                await verify(a.id, 'PRESENTE');
                setMarks(m => ({ ...m, [a.id]: { state: 'seen' } }));
                setMessage({ tone: 'ok', text: a.cote + ' : présente.' });
            } catch (e) {
                setMarks(m => ({ ...m, [a.id]: { state: 'error', message: reason(e) } }));
                setMessage({ tone: 'bad', text: a.cote + ' : ' + reason(e) });
            }
            return;
        }
        // une archive qui n'est pas rangée dans cette unité : on retrouve laquelle, pour proposer de la constater ici
        try {
            const found = reading.kind === 'OTHER_CODE' ? [await physicalArchives!.archive(reading.id)]
                : (await physicalArchives!.findArchives({ ...emptyCriteria(), q: reading.cote }, 0)).items.filter(a => foldCote(a.cote) === foldCote(reading.cote));
            if (found.length === 0) { setMessage({ tone: 'bad', text: 'Aucune archive de cote « ' + (reading.kind === 'COTE' ? reading.cote : '') + ' » n’est enregistrée.' }); return; }
            if (found.length > 1) { setMessage({ tone: 'bad', text: 'Plusieurs archives portent cette cote : lisez le QR de l’étiquette.' }); return; }
            const a = found[0]!;
            setElsewhere(list => list.some(x => x.archiveId === a.id) ? list : [...list, { archiveId: a.id, cote: a.cote, state: 'new' }]);
            setMessage({ tone: 'bad', text: a.cote + ' n’est pas rangée dans cette unité : constatez-la ici si elle y est vraiment.' });
        } catch (e) { setMessage({ tone: 'bad', text: reason(e) }); }
    };

    const registerHere = async (item: Elsewhere) => {
        try {
            await verify(item.archiveId, 'AUTRE_EMPLACEMENT');
            setElsewhere(list => list.map(x => x.archiveId === item.archiveId ? { ...x, state: 'registered', message: undefined } : x));
        } catch (e) { setElsewhere(list => list.map(x => x.archiveId === item.archiveId ? { ...x, state: 'error', message: reason(e) } : x)); }
    };

    const declareLost = async () => {
        if (lostNoteProblem(note)) return;
        setBusy(true); setError(null);
        let failed = false;
        for (const a of unseen) {
            if (marks[a.id]?.state === 'lost') continue;
            try { await verify(a.id, 'ABSENTE', note.trim()); setMarks(m => ({ ...m, [a.id]: { state: 'lost' } })); }
            catch (e) { failed = true; setMarks(m => ({ ...m, [a.id]: { state: 'error', message: reason(e) } })); }
        }
        setBusy(false);
        if (!failed) { onDone(); onClose(); } else setError(new Error('Certaines archives n’ont pas pu être déclarées introuvables : voir la liste.'));
    };

    const finish = () => { onDone(); if (unseen.length === 0) onClose(); else setStep('review'); };
    const stateOf = (a: PhysicalArchive) => marks[a.id]?.state === 'seen' ? <Badge value="CONFORME" label="Présente" /> : marks[a.id]?.state === 'lost' ? <Badge value="INTROUVABLE" label="Introuvable" />
        : marks[a.id]?.state === 'error' ? <span className="scan-bad">{marks[a.id]!.message}</span> : <span>À vérifier</span>;

    return <Modal title="Récolement par lecture des étiquettes" subtitle={unit.cote} onClose={onClose} locked={busy} wide>
        <p className="wf-note">Unité : {place}. Lisez l’étiquette de chaque archive : elle est constatée présente tout de suite. À la fin, celles qui n’ont pas été lues vous sont proposées « introuvables ».</p>
        {step === 'scan' && <form onSubmit={e => void scan(e)} className="asset-filters" role="search" aria-label="Lire une étiquette">
            <Field label="Code ou cote lu"><input ref={input} value={value} onChange={e => setValue(e.target.value)} autoComplete="off" placeholder="Lisez une étiquette, ou saisissez une cote" /></Field>
            <button type="submit" className="btn small primary">Constater</button>
        </form>}
        <p role="status" className={message?.tone === 'bad' ? 'scan-bad' : undefined}>{message?.text ?? ''}</p>
        <p className="wf-note">{seen} archive{seen > 1 ? 's' : ''} lue{seen > 1 ? 's' : ''} sur {archives.length}.</p>
        <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Intitulé</th><th>État</th></tr></thead>
            <tbody>{archives.map(a => <tr key={a.id}><td className="nowrap">{a.cote}</td><td>{a.intitule || '—'}</td><td>{stateOf(a)}</td></tr>)}</tbody></table></div>
        {elsewhere.length > 0 && <div>
            <h4>Lues ici mais rangées ailleurs</h4>
            <ul className="asset-info">{elsewhere.map(x => <li key={x.archiveId}><strong>{x.cote}</strong>{' '}
                {x.state === 'registered' ? <Badge value="AUTRE_EMPLACEMENT" label="Constatée ici" /> : <button type="button" className="btn small secondary" onClick={() => void registerHere(x)}>Constater ici</button>}
                {x.message && <span className="scan-bad"> {x.message}</span>}</li>)}</ul>
        </div>}
        {step === 'review' && <div>
            <h4>Non lues : {unseen.length}</h4>
            <p className="wf-note">Ces archives n’ont pas été lues. Si vous les avez cherchées sans les trouver, déclarez-les introuvables en disant où vous avez cherché ; sinon laissez-les à vérifier.</p>
            <Field label="Où a-t-on cherché ?" error={note && lostNoteProblem(note) ? lostNoteProblem(note)! : undefined} wide><textarea value={note} onChange={e => setNote(e.target.value)} disabled={busy} /></Field>
        </div>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer">
            <button type="button" className="btn secondary" onClick={() => { onDone(); onClose(); }} disabled={busy}>{step === 'review' ? 'Laisser à vérifier' : 'Fermer'}</button>
            {step === 'scan' ? <button type="button" className="btn primary" onClick={finish}>Terminer le récolement</button>
                : <button type="button" className="btn warning" onClick={() => void declareLost()} disabled={busy || !!lostNoteProblem(note)}>Déclarer introuvables</button>}
        </footer>
    </Modal>;
}
