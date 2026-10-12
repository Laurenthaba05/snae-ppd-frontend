import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { EXTENT_UNITS } from '../core/archivalDescription';
import { downloadBytes, readSpreadsheet } from '../core/spreadsheet';
import {
    FINDING_LABELS, SORTS_FINAUX, bordereauSheet, bordereauTemplate, controlProblem, emptyLineForm, formOfLine, formProblems, lineBody, parseBordereauTable, parseQuantity, plain, quantityText,
    type BordereauLine, type BordereauView, type ControlForm, type Finding, type LineForm, type ParsedBordereau
} from '../core/structuredIntake';
import type { ArchivalIntake } from '../core/types';

const PAGE = 100;
const when = (l: BordereauLine) => [l.input.dateDebut, l.input.dateFin].filter(Boolean).join(' → ') || '—';

/** Une ligne du bordereau : ajout ou modification. Les problèmes s'affichent avant l'envoi ; le serveur reste seul juge. */
function LineDialog({ intakeId, line, onClose, onSaved }: { intakeId: string; line: BordereauLine | null; onClose: () => void; onSaved: () => void }) {
    const { archivalIntake } = useSession();
    const [form, setForm] = useState<LineForm>(line ? formOfLine(line.input) : emptyLineForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = useMemo(() => formProblems(form), [form]);
    const set = (key: keyof LineForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problems.length) return;
        setBusy(true); setError(null);
        try {
            if (line) await archivalIntake!.updateLine(intakeId, line.id, lineBody(form), line.version);
            else await archivalIntake!.addLine(intakeId, lineBody(form));
            onSaved(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={line ? 'Modifier la ligne' : 'Ajouter une ligne au bordereau'} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Référence" hint="La cote ou le numéro d’ordre du producteur, unique dans le bordereau"><input value={form.reference} onChange={set('reference')} maxLength={150} disabled={busy} required /></Field>
                <Field label="Support"><input value={form.support} onChange={set('support')} maxLength={100} disabled={busy} placeholder="papier, photographie, fichiers numériques…" /></Field>
                <Field label="Intitulé" wide><input value={form.intitule} onChange={set('intitule')} maxLength={500} disabled={busy} required /></Field>
                <Field label="Date de début" hint="AAAA, AAAA-MM ou AAAA-MM-JJ"><input value={form.dateDebut} onChange={set('dateDebut')} maxLength={10} disabled={busy} placeholder="1960" /></Field>
                <Field label="Date de fin" hint="AAAA, AAAA-MM ou AAAA-MM-JJ"><input value={form.dateFin} onChange={set('dateFin')} maxLength={10} disabled={busy} placeholder="1965" /></Field>
                <Field label="Quantité"><input inputMode="decimal" value={form.quantite} onChange={set('quantite')} maxLength={15} disabled={busy} placeholder="12,5" /></Field>
                <Field label="Unité"><select value={form.unite} onChange={set('unite')} disabled={busy}><option value="">Aucune</option>{EXTENT_UNITS.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                <Field label="Durée d’utilité administrative (années)" hint="Proposée par le producteur"><input inputMode="numeric" value={form.duaAnnees} onChange={set('duaAnnees')} maxLength={3} disabled={busy} /></Field>
                <Field label="Sort final proposé"><select value={form.sortFinal} onChange={set('sortFinal')} disabled={busy}><option value="">Non précisé</option>{Object.entries(SORTS_FINAUX).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Observations" wide><textarea value={form.observations} onChange={set('observations')} rows={2} maxLength={5000} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/** Le constat d'une ligne à l'arrivée des archives : conforme, écart ou absente. */
function ControlDialog({ intakeId, line, onClose, onSaved }: { intakeId: string; line: BordereauLine; onClose: () => void; onSaved: () => void }) {
    const { archivalIntake } = useSession();
    const [form, setForm] = useState<ControlForm>({ constat: line.constat ?? 'CONFORME', quantiteConstatee: line.quantiteConstatee === null ? '' : plain(line.quantiteConstatee), motifEcart: line.motifEcart ?? '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problem = controlProblem(line.input, form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problem) return;
        const found = parseQuantity(form.quantiteConstatee);
        setBusy(true); setError(null);
        try {
            await archivalIntake!.controlLine(intakeId, line.id, { constat: form.constat, quantiteConstatee: found === 'invalid' ? null : found, motifEcart: form.motifEcart.trim() || null }, line.version);
            onSaved(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Contrôler la ligne" subtitle={`${line.input.reference} · ${line.input.intitule}`} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <p>Annoncé au bordereau : <strong>{quantityText(line.input.quantite, line.input.unite) || 'aucune quantité'}</strong></p>
            <div className="form-grid">
                <Field label="Constat"><select value={form.constat} onChange={e => setForm(f => ({ ...f, constat: e.target.value as Finding }))} disabled={busy}>{(Object.keys(FINDING_LABELS) as Finding[]).map(c => <option key={c} value={c}>{FINDING_LABELS[c]}</option>)}</select></Field>
                <Field label="Quantité constatée" hint={form.constat === 'CONFORME' ? 'Laissez vide : la quantité annoncée est retenue' : form.constat === 'ABSENT' ? 'Laissez vide ou 0' : undefined}><input inputMode="decimal" value={form.quantiteConstatee} onChange={e => setForm(f => ({ ...f, quantiteConstatee: e.target.value }))} disabled={busy || !line.input.unite} /></Field>
                <Field label="Motif de l’écart ou de l’absence" wide hint={form.constat === 'CONFORME' ? 'Facultatif' : 'Obligatoire'}><textarea value={form.motifEcart} onChange={e => setForm(f => ({ ...f, motifEcart: e.target.value }))} rows={2} maxLength={5000} disabled={busy} /></Field>
            </div>
            {problem && <ul className="relation-problems" role="alert"><li>{problem}</li></ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !!problem}>Enregistrer le constat</button></footer>
        </form>
    </Modal>;
}

/** Import d'un fichier Excel ou CSV : tout le bordereau est remplacé, et seulement si aucune ligne n'est en erreur. */
function ImportDialog({ intakeId, existing, onClose, onImported }: { intakeId: string; existing: number; onClose: () => void; onImported: () => void }) {
    const { archivalIntake } = useSession();
    const [fileName, setFileName] = useState('');
    const [parsed, setParsed] = useState<ParsedBordereau | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const input = useRef<HTMLInputElement>(null);
    const choose = async (file: File | undefined) => {
        setProblem(null); setParsed(null); setError(null);
        if (!file) return;
        setFileName(file.name);
        try { setParsed(parseBordereauTable(await readSpreadsheet(file))); } catch (e) { setProblem(e instanceof Error ? e.message : 'Fichier illisible.'); }
    };
    const rows = parsed?.rows ?? [];
    const invalid = rows.filter(r => r.errors.length);
    const ready = parsed && !parsed.fatal && rows.length > 0 && invalid.length === 0;
    const run = async () => {
        if (busy || !ready) return;
        setBusy(true); setError(null);
        try { await archivalIntake!.replaceBordereau(intakeId, rows.map(r => r.input!)); onImported(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Importer un bordereau" subtitle="Excel (.xlsx) ou CSV" onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <p>Une ligne par unité à verser. <button type="button" className="btn small secondary" onClick={() => downloadBytes(bordereauTemplate(), 'modele-bordereau-versement.xlsx')}>Télécharger le modèle Excel</button></p>
            {existing > 0 && <Notice tone="warning">L’import remplace tout le bordereau actuel ({existing} ligne{existing > 1 ? 's' : ''}).</Notice>}
            <p><input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Fichier du bordereau" disabled={busy} onChange={e => void choose(e.target.files?.[0])} /></p>
            {problem && <ErrorNotice error={new Error(problem)} />}
            {parsed?.fatal && <ErrorNotice error={new Error(parsed.fatal)} />}
            {parsed && !parsed.fatal && <>
                <p><strong>{fileName}</strong> : {rows.length} ligne{rows.length > 1 ? 's' : ''} lue{rows.length > 1 ? 's' : ''}, {invalid.length === 0 ? 'toutes valides' : `${invalid.length} en erreur`}.</p>
                {invalid.length > 0 && <>
                    <Notice tone="warning">Corrigez le fichier puis choisissez-le de nouveau : un bordereau ne se charge qu’entier.</Notice>
                    <div className="table-scroll"><table><thead><tr><th>Ligne du fichier</th><th>Ce qui ne va pas</th></tr></thead><tbody>{invalid.slice(0, 50).map(r => <tr key={r.line}><td>{r.line}</td><td>{r.errors.join(' ')}</td></tr>)}</tbody></table></div>
                    {invalid.length > 50 && <p><small>{invalid.length - 50} autres lignes en erreur ne sont pas listées.</small></p>}</>}
            </>}
            {error ? <ErrorNotice error={error} /> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="button" className="btn primary" disabled={busy || !ready} onClick={() => void run()}>{busy ? 'Import en cours…' : ready ? `Importer ${rows.length} ligne${rows.length > 1 ? 's' : ''}` : 'Importer'}</button></footer>
    </Modal>;
}

/**
 * Le bordereau d'un versement structuré : lignes, volumétrie par unité, avertissements, constat à la réception. Modifiable en préparation et en correction,
 * contrôlable une fois le versement accepté ; figé ensuite. `onLoaded` remonte la vue pour que le circuit sache ce qui bloque la soumission ou la réception.
 */
export function BordereauPanel({ intake, canManage, onLoaded, onChanged }: { intake: ArchivalIntake; canManage: boolean; onLoaded: (view: BordereauView) => void; onChanged: () => void }) {
    const { archivalIntake, epoch } = useSession();
    const q = useResource<BordereauView>(async signal => { const view = await archivalIntake!.bordereau(intake.id, signal); onLoaded(view); return view; }, `bordereau:${intake.id}:${intake.etape}:${epoch}`);
    const [editing, setEditing] = useState<{ line: BordereauLine | null } | null>(null);
    const [controlling, setControlling] = useState<BordereauLine | null>(null);
    const [importing, setImporting] = useState(false);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [shown, setShown] = useState(PAGE);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const view = q.data;
    const refresh = () => { q.refresh(); onChanged(); };
    const act = async (work: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(null); try { await work(); setConfirming(null); refresh(); } catch (e) { setError(e); } finally { setBusy(false); } };

    if (q.loading && !view) return <Busy />;
    if (q.error && !view) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!view) return null;
    const editable = canManage && view.modifiable, controllable = canManage && view.controlable;
    const showControl = view.etape === 'ACCEPTE' || view.etape === 'RECU';
    const rows = view.lignes.slice(0, shown);
    return <section className="bordereau" aria-label="Bordereau de versement">
        <div className="section-heading"><h4>Bordereau de versement</h4>
            <div className="table-actions">
                {editable && <button type="button" className="btn small primary" onClick={() => setEditing({ line: null })}>Ajouter une ligne</button>}
                {editable && <button type="button" className="btn small secondary" onClick={() => setImporting(true)}>Importer un fichier</button>}
                {controllable && <button type="button" className="btn small secondary" disabled={busy} onClick={() => void act(() => archivalIntake!.conformRemaining(intake.id))}>Déclarer conformes les lignes restantes</button>}
                {view.lignes.length > 0 && <button type="button" className="btn small secondary" onClick={() => downloadBytes(bordereauSheet(view.lignes, showControl), `bordereau-${intake.numero.replace(/[^A-Za-z0-9._-]+/g, '-')}.xlsx`)}>Exporter en Excel</button>}
            </div></div>
        {view.totaux.length > 0
            ? <p className="bordereau-totals"><strong>{view.lignes.length} ligne{view.lignes.length > 1 ? 's' : ''}</strong> · volumétrie annoncée : {view.totaux.map(t => quantityText(t.quantite, t.unite)).join(' · ')}</p>
            : <p className="bordereau-totals">{view.lignes.length ? `${view.lignes.length} ligne${view.lignes.length > 1 ? 's' : ''}, sans quantité.` : 'Le bordereau est vide.'}</p>}
        {view.avertissements.map(w => <Notice key={w} tone="warning">{w}</Notice>)}
        {view.bilan && <p className="bordereau-outcome"><strong>Contrôle :</strong> {view.bilan.conformes} conforme{view.bilan.conformes > 1 ? 's' : ''}, {view.bilan.ecarts} écart{view.bilan.ecarts > 1 ? 's' : ''}, {view.bilan.absents} absente{view.bilan.absents > 1 ? 's' : ''}
            {view.bilan.constate.length > 0 && <> · constaté : {view.bilan.constate.map(t => quantityText(t.quantite, t.unite)).join(' · ')}</>}</p>}
        {error ? <ErrorNotice error={error} /> : null}
        {view.lignes.length > 0 && <div className="table-scroll"><table className="bordereau-table"><thead><tr><th>N°</th><th>Référence et intitulé</th><th>Dates</th><th>Quantité</th><th>DUA et sort</th>{showControl && <th>Constat</th>}{(editable || controllable) && <th><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>{rows.map(line => <tr key={line.id}>
                <td>{line.rang}</td>
                <td><strong>{line.input.reference}</strong><small className="cell-sub">{line.input.intitule}{line.input.support ? ` · ${line.input.support}` : ''}</small></td>
                <td>{when(line)}</td>
                <td>{quantityText(line.input.quantite, line.input.unite) || '—'}</td>
                <td>{[line.input.duaAnnees !== null ? `${line.input.duaAnnees} ans` : '', line.input.sortFinal ? SORTS_FINAUX[line.input.sortFinal] ?? '' : ''].filter(Boolean).join(' · ') || '—'}</td>
                {showControl && <td>{line.constat ? <><span className={'finding ' + line.constat.toLowerCase()}>{FINDING_LABELS[line.constat]}</span>
                    {line.constat !== 'CONFORME' && <small className="cell-sub">{line.quantiteConstatee !== null && `${plain(line.quantiteConstatee)} constaté · `}{line.motifEcart}</small>}</> : <small>à contrôler</small>}</td>}
                {(editable || controllable) && <td className="table-actions">
                    {editable && (confirming === line.id
                        ? <><span className="relation-confirm">Supprimer cette ligne ?</span><button type="button" className="btn small danger" disabled={busy} onClick={() => void act(() => archivalIntake!.deleteLine(intake.id, line.id, line.version))}>Supprimer</button><button type="button" className="btn small secondary" disabled={busy} onClick={() => setConfirming(null)}>Garder</button></>
                        : <><button type="button" className="btn small secondary" onClick={() => setEditing({ line })}>Modifier</button><button type="button" className="btn small danger-outline" onClick={() => setConfirming(line.id)}>Supprimer</button></>)}
                    {controllable && <button type="button" className="btn small secondary" onClick={() => setControlling(line)}>{line.constat ? 'Revoir le constat' : 'Contrôler'}</button>}
                </td>}
            </tr>)}</tbody></table></div>}
        {view.lignes.length > shown && <p><button type="button" className="btn small secondary" onClick={() => setShown(n => n + PAGE)}>Afficher {Math.min(PAGE, view.lignes.length - shown)} lignes de plus ({view.lignes.length - shown} restantes)</button></p>}
        {editing && <LineDialog intakeId={intake.id} line={editing.line} onClose={() => setEditing(null)} onSaved={refresh} />}
        {controlling && <ControlDialog intakeId={intake.id} line={controlling} onClose={() => setControlling(null)} onSaved={refresh} />}
        {importing && <ImportDialog intakeId={intake.id} existing={view.lignes.length} onClose={() => setImporting(false)} onImported={refresh} />}
    </section>;
}
