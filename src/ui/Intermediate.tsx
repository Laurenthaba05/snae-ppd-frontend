import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName, useEntityName } from './names';
import { can } from '../core/policy';
import { formatBytes, formatDay } from '../core/format';
import {
    blockerText, documentInfoText, emptyPassage, isSelectable, passageBody, passageHtml, passageProblems, phaseStateText, selectionText, volumeText,
    type IntermediateCandidate, type IntermediateDocumentInfo, type IntermediatePassage, type IntermediatePassageSummary
} from '../core/intermediate';

/** Sur la fiche d'un document semi-actif : où il est, depuis quand, sous la garde de qui. Rien tant que le document est en phase courante. */
export function DocumentIntermediateNotice({ documentId }: { documentId: string }) {
    const { retention, epoch } = useSession();
    const q = useResource<IntermediateDocumentInfo | null>(signal => retention!.documentIntermediate(documentId, signal), `document-intermediate:${documentId}:${epoch}`);
    const info = q.data;
    if (!info) return null;
    return <Notice><strong>Archives intermédiaires.</strong> {documentInfoText(info, d => formatDay(d))} <small>Passage {info.reference}, constaté le {formatDate(info.passedAt)}.</small></Notice>;
}

/** Les documents dont la phase courante est terminée et les passages déjà constatés, pour une institution. */
export function IntermediatePanel({ institutionId, departmentId = null }: { institutionId: string; departmentId?: string | null }) {
    const { retention, me, epoch } = useSession();
    const scope = { institutionId, departmentId };
    const mayPass = can(me, 'RETENTION_REVIEW', scope) && can(me, 'DISPOSITION_PROPOSE', scope);
    const candidatesQ = useResource<IntermediateCandidate[]>(signal => retention!.intermediateCandidates(institutionId, departmentId, signal), `intermediate-candidates:${institutionId}:${departmentId ?? ''}:${epoch}`);
    const passagesQ = useResource<IntermediatePassageSummary[]>(signal => retention!.intermediatePassages(institutionId, signal), `intermediate-passages:${institutionId}:${epoch}`);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [passing, setPassing] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const candidates = candidatesQ.data ?? [];
    const selectable = candidates.filter(isSelectable);
    const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.eventId));
    const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const done = (p: IntermediatePassage) => { setPassing(false); setSelected(new Set()); candidatesQ.refresh(); passagesQ.refresh(); setOpened(p.summary.id); };
    return <div className="panel intermediate-panel" role="region" aria-label="Archives intermédiaires">
        <div className="section-heading"><h3>Archives intermédiaires</h3>
            {mayPass && <button type="button" className="btn small primary" disabled={selected.size === 0} onClick={() => setPassing(true)}>Faire passer en archives intermédiaires</button>}</div>
        <div className="panel-padding"><Notice>Quand la phase courante d’un document est terminée, on constate son passage en archives intermédiaires, avec le lieu et le responsable. Le document devient semi-actif ;
            il reste conservé jusqu’à son échéance, où le sort final s’applique.</Notice></div>
        <h4 className="panel-padding">Phase courante terminée ou à venir</h4>
        {candidatesQ.loading && !candidatesQ.data ? <Busy /> : candidatesQ.error ? <ErrorNotice error={candidatesQ.error} onRetry={candidatesQ.refresh} />
            : candidates.length === 0 ? <Empty title="Aucun document concerné" description="Aucun document planifié n’a de phase intermédiaire à venir ou à constater." icon="clock" />
                : <div className="table-scroll"><table><thead><tr>
                    <th><input type="checkbox" aria-label="Tout choisir" checked={allSelected} disabled={!mayPass || selectable.length === 0}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(c => c.eventId)))} /></th>
                    <th>Document</th><th>Phase courante</th><th>Échéance</th><th>Contenu</th><th>État</th></tr></thead>
                    <tbody>{candidates.map(c => <tr key={c.eventId}>
                        <td><input type="checkbox" aria-label={`Choisir ${c.reference}`} checked={selected.has(c.eventId)} disabled={!mayPass || !isSelectable(c)} onChange={() => toggle(c.eventId)} /></td>
                        <td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                        <td>{phaseStateText(c, d => formatDay(d), c.phaseDate)}</td>
                        <td>{formatDay(c.dueDate)}</td>
                        <td>{c.fileCount} fichier{c.fileCount > 1 ? 's' : ''} · {formatBytes(c.totalBytes)}</td>
                        <td>{c.blockers.length === 0 ? <span className="finding">Peut passer</span> : <ul className="relation-problems">{c.blockers.map(b => <li key={b}>{blockerText(b)}</li>)}</ul>}</td>
                    </tr>)}</tbody></table></div>}
        <p role="status" className="bordereau-selection panel-padding">{selectionText(candidates, selected)}</p>
        <h4 className="panel-padding">Passages constatés</h4>
        {passagesQ.loading && !passagesQ.data ? <Busy /> : passagesQ.error ? <ErrorNotice error={passagesQ.error} onRetry={passagesQ.refresh} />
            : (passagesQ.data ?? []).length === 0 ? <Empty title="Aucun passage" description="Les passages constatés apparaissent ici, avec leur lieu et leur responsable." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Passage</th><th>Lieu</th><th>Responsable</th><th>Contenu</th><th>Constaté</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{(passagesQ.data ?? []).map(p => <tr key={p.id}>
                        <td><strong>{p.reference}</strong>{p.versementReference && <small className="cell-sub">Versement {p.versementReference}</small>}</td>
                        <td>{p.place}</td><td>{p.manager}</td>
                        <td>{volumeText(p.documentCount, p.totalBytes)}</td>
                        <td>{formatDate(p.createdAt)}<small className="cell-sub"><EntityName kind="users" id={p.createdById} /></small></td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(p.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {passing && <PassageDialog institutionId={institutionId} candidates={candidates.filter(c => selected.has(c.eventId))} onClose={() => setPassing(false)} onDone={done} />}
        {opened && <PassageDetail id={opened} institutionId={institutionId} onClose={() => setOpened(null)} />}
    </div>;
}

function PassageDialog({ institutionId, candidates, onClose, onDone }: { institutionId: string; candidates: IntermediateCandidate[]; onClose: () => void; onDone: (p: IntermediatePassage) => void }) {
    const { retention } = useSession();
    const [form, setForm] = useState(emptyPassage());
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const ids = candidates.map(c => c.eventId);
    const problems = useMemo(() => passageProblems(form, ids.length), [form, ids.length]);
    const text = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = passageBody(form, institutionId, ids);
        intention.current = commandKey(intention.current, body);
        try { onDone(await retention!.createIntermediatePassage(body, intention.current.key)); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Passage en archives intermédiaires" subtitle={volumeText(candidates.length, candidates.reduce((s, c) => s + c.totalBytes, 0))} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Les documents deviennent semi-actifs et ne reviennent plus en phase courante. Le passage est enregistré avec son lieu et son responsable, et ne se modifie plus.</Notice>
            <div className="form-grid">
                <Field label="Lieu des archives intermédiaires *" wide hint="Le dépôt, le magasin, la salle ou le serveur où les documents sont gardés."><input value={form.place} onChange={text('place')} maxLength={300} disabled={busy} /></Field>
                <Field label="Responsable *" hint="Nom et fonction de la personne qui en a la garde."><input value={form.manager} onChange={text('manager')} maxLength={300} disabled={busy} /></Field>
                <Field label="Référence du versement" hint="Le bordereau ou la décision interne qui l’accompagne."><input value={form.versementReference} onChange={text('versementReference')} maxLength={255} disabled={busy} /></Field>
                <Field label="Observations" wide><textarea value={form.observations} onChange={text('observations')} rows={2} maxLength={4000} disabled={busy} /></Field>
            </div>
            <ul className="intermediate-docs">{candidates.slice(0, 10).map(c => <li key={c.eventId}><strong>{c.reference}</strong> · {c.title}</li>)}{candidates.length > 10 && <li>… et {candidates.length - 10} autres</li>}</ul>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>Constater le passage</button></footer>
        </form>
    </Modal>;
}

function PassageDetail({ id, institutionId, onClose }: { id: string; institutionId: string; onClose: () => void }) {
    const { retention, epoch } = useSession();
    const q = useResource<IntermediatePassage>(signal => retention!.intermediatePassage(id, signal), `intermediate-passage:${id}:${epoch}`);
    const institution = useEntityName('institutions', institutionId);
    const creator = useEntityName('users', q.data?.summary.createdById);
    const [error, setError] = useState<unknown>(null);
    const p = q.data;
    const print = () => {
        if (!p) return;
        const html = passageHtml(p, { institution: institution.name ?? 'Institution', createdBy: creator.name ?? 'Agent', date: formatDate, day: d => formatDay(d) });
        const w = window.open('', '_blank');
        if (!w) { setError(new Error('Autorisez les fenêtres de ce site pour afficher le passage.')); return; }
        w.document.write(html); w.document.close(); w.focus(); w.print();
    };
    return <Modal wide title="Passage en archives intermédiaires" subtitle={p?.summary.reference ?? ''} onClose={onClose}>
        <div className="panel-padding">
            {q.loading && !p ? <Busy /> : q.error && !p ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : p && <>
                <dl className="detail-card">
                    <div><dt>Lieu</dt><dd>{p.summary.place}</dd></div>
                    <div><dt>Responsable</dt><dd>{p.summary.manager}</dd></div>
                    {p.summary.versementReference && <div><dt>Référence du versement</dt><dd>{p.summary.versementReference}</dd></div>}
                    <div><dt>Constaté par</dt><dd><EntityName kind="users" id={p.summary.createdById} /> le {formatDate(p.summary.createdAt)}</dd></div>
                    <div><dt>Contenu</dt><dd>{volumeText(p.summary.documentCount, p.summary.totalBytes)}</dd></div>
                    {p.observations && <div><dt>Observations</dt><dd>{p.observations}</dd></div>}
                </dl>
                <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Fin de phase courante</th><th>Échéance</th><th>Contenu</th></tr></thead>
                    <tbody>{p.lines.map(l => <tr key={l.rank}><td>{l.rank}</td><td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                        <td>{formatDay(l.phaseDate)}</td><td>{formatDay(l.dueDate)}</td><td>{l.fileCount} fichier{l.fileCount > 1 ? 's' : ''} · {formatBytes(l.totalBytes)}</td></tr>)}</tbody></table></div>
                {error ? <ErrorNotice error={error} /> : null}
            </>}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button>{p && <button type="button" className="btn secondary" onClick={print}>Afficher et imprimer</button>}</footer>
    </Modal>;
}
