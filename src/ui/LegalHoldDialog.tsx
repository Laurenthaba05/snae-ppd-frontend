import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { text, uuid } from '../core/validation';
import { CommandDialog } from './CommandDialog';
import { Field, Busy, ErrorNotice, useResource, Notice } from './components';
import { ReferencePicker } from './ReferencePicker';
type TargetKind = 'documents' | 'dossiers' | 'nodes';
type Selected = { id: string; label: string; kind: TargetKind };
export function LegalHoldDialog({ institutionId, departmentId: initialDepartment, documentId, onClose, onSuccess }: {
    institutionId: string; departmentId?: string | null; documentId?: string; onClose: () => void; onSuccess: () => void;
}) {
    const { me, retention, records, classification } = useSession();
    const [departmentId, setDepartmentId] = useState(initialDepartment ?? '');
    const [reference, setReference] = useState('');
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [authority, setAuthority] = useState('');
    const [kind, setKind] = useState<TargetKind>('documents');
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('');
    const [selected, setSelected] = useState<Selected[]>(documentId ? [{ id: documentId, label: 'Document courant', kind: 'documents' }] : []);
    const institutionPermission = can(me, 'LEGAL_HOLD_MANAGE', { institutionId });
    const scope = { institutionId, departmentId: departmentId || null };
    const q = useResource(async signal => {
        if (!can(me, 'LEGAL_HOLD_MANAGE', scope)) return { items: [] as { id: string; label: string }[], hasMore: false };
        if (kind === 'nodes') {
            const nodes = await classification!.nodes(institutionId, signal);
            const all = nodes.filter(n => (!n.institutionId || n.institutionId === institutionId) && (n.code + ' ' + n.libelle).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
            return { items: all.slice(page * 20, (page + 1) * 20).map(n => ({ id: n.id, label: [n.code, n.libelle].filter(Boolean).join(' · ') })), hasMore: all.length > (page + 1) * 20 };
        }
        const result = await records![kind]({ ...scope, page, size: 20, q: filter || undefined }, signal);
        return { ...result, items: result.items.filter(x => !('destroyed' in x) || !x.destroyed).map(x => ({ id: x.id, label: x.reference + ' · ' + x.title })) };
    }, JSON.stringify(['hold-targets', scope, kind, page, filter]));
    const switchKind = (value: TargetKind) => { setKind(value); setPage(0); setFilter(''); };
    const changeDepartment = (value: string) => { setDepartmentId(value); setSelected([]); switchKind('documents'); };
    const build = () => {
        if (!can(me, 'LEGAL_HOLD_MANAGE', scope)) throw new Error('Habilitation de gestion des gels requise dans cette portée.');
        if (selected.length < 1 || selected.length > 500) throw new Error('Sélectionnez entre 1 et 500 cibles.');
        if (selected.some(x => x.kind !== 'documents') && (departmentId || !institutionPermission)) throw new Error('Les dossiers et branches exigent la portée institutionnelle.');
        return { reference: text(reference, 150), reason: text(reason, 4000), description: text(description, 4000, false), authority: text(authority, 255, false),
            institutionId: uuid(institutionId), departmentId: departmentId ? uuid(departmentId) : null,
            documentIds: selected.filter(x => x.kind === 'documents').map(x => uuid(x.id)),
            dossierIds: selected.filter(x => x.kind === 'dossiers').map(x => uuid(x.id)),
            classificationNodeIds: selected.filter(x => x.kind === 'nodes').map(x => uuid(x.id)) };
    };
    return <CommandDialog title="Ouvrir un gel légal" description="Le gel empêche l’élimination des cibles et reste actif jusqu’à sa levée." api={retention!} path="/legal-holds" build={build} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }} label="Ouvrir le gel" danger>
        <Field label="Référence"><input aria-label="Référence du gel" value={reference} onChange={e => setReference(e.target.value)} required maxLength={150} /></Field>
        <Field label="Autorité"><input aria-label="Autorité du gel" value={authority} onChange={e => setAuthority(e.target.value)} maxLength={255} /></Field>
        <Field label="Motif" wide><textarea aria-label="Motif du gel" value={reason} onChange={e => setReason(e.target.value)} required maxLength={4000} /></Field>
        <Field label="Description" wide><textarea aria-label="Description du gel" value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} /></Field>
        <Field label="Département" hint="Vide : portée institutionnelle. Changer de portée efface les cibles sélectionnées."><ReferencePicker kind="departments" label="Département du gel" value={departmentId} onChange={changeDepartment} scope={{ institutionId }} nullable={institutionPermission} disabled={!institutionPermission} /></Field>
        <Field label="Type de cible"><select aria-label="Type de cible du gel" value={kind} onChange={e => switchKind(e.target.value as TargetKind)}>
            <option value="documents">Documents</option><option value="dossiers" disabled={!!departmentId || !institutionPermission}>Dossiers</option><option value="nodes" disabled={!!departmentId || !institutionPermission}>Branches du classement</option>
        </select></Field>
        <div className="span2"><Notice>Le gel d’un dossier ou d’une branche couvre aussi les documents qui lui sont rattachés. Le serveur vérifie les cibles et vos droits.</Notice>
            <input aria-label="Rechercher les cibles du gel" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} placeholder="Titre, cote ou référence" />
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <fieldset><legend>Cibles disponibles</legend>{q.data?.items.map(x => <label key={x.id} className="field check-field"><input type="checkbox" checked={selected.some(t => t.id === x.id && t.kind === kind)} onChange={e => setSelected(old => e.target.checked ? old.some(t => t.id === x.id && t.kind === kind) ? old : [...old, { ...x, kind }] : old.filter(t => !(t.id === x.id && t.kind === kind)))} disabled={selected.length >= 500 && !selected.some(t => t.id === x.id && t.kind === kind)} />{x.label}</label>)}
                {!q.data?.items.length && <p>Aucune cible sur cette page.</p>}</fieldset>}
            <div className="table-actions"><button type="button" disabled={!page} onClick={() => setPage(p => p - 1)}>Précédente</button><span>Page {page + 1}</span><button type="button" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div>
            <strong>{selected.length} cible(s) sélectionnée(s)</strong><ul>{selected.map(t => <li key={t.kind + t.id}>{t.label} <button type="button" aria-label={'Retirer ' + t.label} onClick={() => setSelected(old => old.filter(x => !(x.id === t.id && x.kind === t.kind)))}>Retirer</button></li>)}</ul>
        </div>
    </CommandDialog>;
}
