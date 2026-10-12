import React, { useMemo, useRef, useState } from 'react';
import { Busy, ErrorNotice, Field, Modal, Notice } from './components';
import { ArchivesApi, commandKey } from '../api/archives';
import { candidates, choicesFor, emptyRelationForm, formOf, lineage, linesOf, relationBody, relationProblems, tutelleChain, type AuthorityRef, type RelationForm, type RelationLine, type RelationView } from '../core/authorityRelations';

const KIND: Record<AuthorityRef['kind'], string> = { COLLECTIVITE: 'Collectivité', PERSONNE: 'Personne', FAMILLE: 'Famille' };

/**
 * Les relations d'une notice d'autorité (ISAAR 5.3) : tutelle, succession, parenté, association, avec leurs dates. Elles se lisent toujours depuis la notice,
 * avec le nom de l'autre notice. La filiation et la tutelle actuelle se déduisent des relations enregistrées.
 */
export function AuthorityRelationsDialog({ api, institution, authority, authorities, relations, canManage, onClose, onChanged }: {
    api: ArchivesApi; institution: string; authority: AuthorityRef; authorities: ReadonlyArray<AuthorityRef>; relations: ReadonlyArray<RelationView>; canManage: boolean; onClose: () => void; onChanged: () => void;
}) {
    const { lines, unreadable } = useMemo(() => linesOf(authority.id, relations, authorities), [authority.id, relations, authorities]);
    const family = useMemo(() => lineage(authority.id, relations, authorities), [authority.id, relations, authorities]);
    const chain = useMemo(() => tutelleChain(authority.id, relations, authorities), [authority.id, relations, authorities]);
    const [editing, setEditing] = useState<{ view?: RelationView } | null>(null);
    const [form, setForm] = useState<RelationForm>(emptyRelationForm());
    const [confirming, setConfirming] = useState<RelationLine | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [notice, setNotice] = useState('');
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const choices = choicesFor(authority.kind);
    const choice = choices.find(c => c.key === form.choiceKey) ?? choices[0];
    const others = choice ? candidates(choice, authority, authorities) : [];
    const problems = editing ? relationProblems(form, authority, authorities) : [];

    const open = (view?: RelationView) => {
        setNotice(''); setError(null); setConfirming(null); intention.current = null;
        setForm(view ? formOf(view, authority) : { ...emptyRelationForm(), choiceKey: choices[0]?.key ?? 'ASSOCIATIVE' });
        setEditing({ view });
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !editing || problems.length) return;
        setBusy(true); setError(null);
        const body = relationBody(form, authority, institution, editing.view?.version);
        intention.current = commandKey(intention.current, { id: editing.view?.id, body });
        try {
            await api.saveRelation(editing.view?.id, body, intention.current.key);
            setNotice(editing.view ? 'Relation modifiée.' : 'Relation enregistrée.'); setEditing(null); onChanged();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const remove = async (line: RelationLine) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { remove: line.id, version: line.version });
        try { await api.deleteRelation(line.id, institution, line.version, intention.current.key); setNotice('Relation supprimée.'); setConfirming(null); onChanged(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const viewOf = (line: RelationLine) => relations.find(r => r.id === line.id);

    return <Modal wide title="Relations de la notice" subtitle={`${authority.name} · ${KIND[authority.kind]}`} onClose={onClose} locked={busy}>
        <div className="panel-padding authority-relations">
            {notice && <Notice>{notice}</Notice>}
            {(family.earlier.length > 0 || family.later.length > 0) && <section className="relation-lineage" aria-label="Filiation">
                <h4>Filiation</h4>
                <ol>{family.earlier.map(step => <li key={step.id} className="before"><strong>{step.name}</strong>{step.period && <small>{step.period}</small>}</li>)}
                    <li className="current" aria-current="true"><strong>{authority.name}</strong><small>cette notice</small></li>
                    {family.later.map(step => <li key={step.id} className="after"><strong>{step.name}</strong>{step.period && <small>{step.period}</small>}</li>)}</ol>
            </section>}
            {chain.length > 0 && <p className="relation-chain"><strong>Tutelle actuelle :</strong> {chain.join(' › ')}</p>}
            {lines.length === 0 && !editing && <p className="relation-empty">Aucune relation enregistrée pour cette notice. {canManage ? 'Ajoutez sa tutelle, la notice qu’elle remplace ou celle qui la remplace.' : ''}</p>}
            {lines.length > 0 && <div className="table-scroll"><table className="relation-table"><thead><tr><th>Nature</th><th>Notice liée</th><th>Période</th><th>Commentaire</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>{lines.map(line => <tr key={line.id} className={line.ended ? 'ended' : ''}>
                    <td>{line.label}</td>
                    <td><strong>{line.otherName}</strong><small className="cell-sub">{line.otherCode}</small></td>
                    <td>{line.period || <small>non datée</small>}{line.ended && <small className="cell-sub">terminée</small>}</td>
                    <td>{line.description ?? <small>—</small>}</td>
                    {canManage && <td className="table-actions">
                        {confirming?.id === line.id
                            ? <><span className="relation-confirm">Supprimer cette relation ?</span><button type="button" className="btn small danger" disabled={busy} onClick={() => void remove(line)}>Supprimer</button><button type="button" className="btn small secondary" disabled={busy} onClick={() => setConfirming(null)}>Garder</button></>
                            : <><button type="button" className="btn small secondary" onClick={() => { const v = viewOf(line); if (v) open(v); }}>Modifier</button><button type="button" className="btn small danger-outline" onClick={() => { setConfirming(line); setEditing(null); }}>Supprimer</button></>}
                    </td>}
                </tr>)}</tbody></table></div>}
            {unreadable > 0 && <Notice tone="warning">{unreadable === 1 ? 'Une relation concerne une notice qui n’est plus lisible pour vous.' : `${unreadable} relations concernent des notices qui ne sont plus lisibles pour vous.`}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}

            {editing && <form className="relation-form" onSubmit={submit} aria-label={editing.view ? 'Modifier la relation' : 'Nouvelle relation'}>
                <h4>{editing.view ? 'Modifier la relation' : 'Nouvelle relation'}</h4>
                <div className="form-grid">
                    <Field label="Nature de la relation *"><select value={choice?.key ?? ''} disabled={busy || !!editing.view} onChange={e => setForm({ ...form, choiceKey: e.target.value, otherId: '' })}>
                        {choices.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
                    <Field label="Notice liée *" hint={others.length ? undefined : 'Aucune autre notice de ce type n’existe encore dans cette institution.'}>
                        <select value={form.otherId} disabled={busy || !!editing.view} onChange={e => setForm({ ...form, otherId: e.target.value })}>
                            <option value="">Choisir une notice</option>{others.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}</select></Field>
                    <Field label="Depuis" hint="AAAA, AAAA-MM ou AAAA-MM-JJ ; facultatif"><input value={form.dateStart} disabled={busy} maxLength={10} placeholder="2018" onChange={e => setForm({ ...form, dateStart: e.target.value })} /></Field>
                    <Field label="Jusqu’à" hint="Laisser vide si la relation continue"><input value={form.dateEnd} disabled={busy} maxLength={10} placeholder="2021-09" onChange={e => setForm({ ...form, dateEnd: e.target.value })} /></Field>
                    <Field label="Commentaire" wide><textarea rows={3} maxLength={10000} value={form.description} disabled={busy} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Texte qui fonde la relation (décret, arrêté), motif, précision" /></Field>
                </div>
                {problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
                <div className="relation-form-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => setEditing(null)}>Annuler</button><button className="btn primary" disabled={busy || problems.length > 0}>{busy ? 'Enregistrement…' : 'Enregistrer la relation'}</button></div>
            </form>}
            {busy && !editing && !confirming && <Busy label="Mise à jour…" />}
        </div>
        <footer className="modal-footer">
            {canManage && !editing && choices.length > 0 && <button type="button" className="btn primary" disabled={busy} onClick={() => open()}>Ajouter une relation</button>}
            <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Fermer</button>
        </footer>
    </Modal>;
}
