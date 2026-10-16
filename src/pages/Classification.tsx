import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, Badge } from '../ui/components';
import type { ClassificationNode } from '../core/types';
import { display } from '../core/format';

export function CreateNodeDialog({ nodes, onClose, onCreated }: {
    nodes: ClassificationNode[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { classification } = useSession();
    const { scope } = useWorkspace();
    const [libelle, setLibelle] = useState('');
    const [code, setCode] = useState('');
    const [typeNoeud, setTypeNoeud] = useState('');
    const [description, setDescription] = useState('');
    const [parentId, setParentId] = useState('');
    const extra = useOptionalFields('classificationDetails');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const details = extra.payload();
            if (details.dateDebutValidite && details.dateFinValidite && String(details.dateFinValidite) < String(details.dateDebutValidite)) throw new Error('La fin de validité doit suivre le début.');
            await classification!.command('/nodes', { ...details, parentId: parentId || null, institutionId: scope.institutionId ?? null, code: code.trim() || null, libelle: libelle.trim(), description: description.trim() || null, typeNoeud: typeNoeud.trim() }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un nœud de classement" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Libellé" wide><input value={libelle} onChange={e => setLibelle(e.target.value)} required maxLength={500} disabled={busy}/></Field>
                <Field label="Type de nœud" hint="Ex. FONDS, SERIE, SOUS-SERIE"><input value={typeNoeud} onChange={e => setTypeNoeud(e.target.value)} required maxLength={40} disabled={busy}/></Field>
                <Field label="Code" hint="Optionnel"><input value={code} onChange={e => setCode(e.target.value)} maxLength={100} disabled={busy}/></Field>
                <Field label="Nœud parent" wide><select value={parentId} onChange={e => setParentId(e.target.value)} disabled={busy}><option value="">Aucun (racine)</option>{nodes.map(n => <option key={n.id} value={n.id}>{n.code ? n.code + ' · ' : ''}{n.libelle}</option>)}</select></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
                <OptionalFields form={extra} disabled={busy} />
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function NodeRow({ node, depth, children, canManage, onToggle, pending }: {
    node: ClassificationNode;
    depth: number;
    children: React.ReactNode;
    canManage: boolean;
    onToggle: (node: ClassificationNode) => void;
    pending: boolean;
}) {
    return <><tr>
        <td style={{ paddingLeft: 12 + depth * 20 }}><strong>{node.libelle}</strong><ResourceDetailsButton resource="classificationNode" id={node.id} title={node.libelle} /></td>
        <td>{display(node.typeNoeud)}</td>
        <td>{node.code ?? '—'}</td>
        <td><Badge value={node.statut}/></td>
        <td>{canManage && <button className="btn small secondary" disabled={pending} onClick={() => onToggle(node)}>{node.statut === 'ACTIF' ? 'Désactiver' : 'Activer'}</button>}</td>
    </tr>{children}</>;
}

export function ClassificationPage() {
    const { me, classification, epoch } = useSession();
    const { scope } = useWorkspace();
    const [creating, setCreating] = useState(false);
    const q = useResource(s => classification!.nodes(scope.institutionId, s), JSON.stringify(['classification-nodes', scope.institutionId, epoch]));
    const nodes = useMemo(() => (q.data ?? []).slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.libelle.localeCompare(b.libelle)), [q.data]);
    const byParent = useMemo(() => {
        const map = new Map<string, ClassificationNode[]>();
        for (const n of nodes) {
            const key = n.parentId ?? '';
            const list = map.get(key) ?? [];
            list.push(n);
            map.set(key, list);
        }
        return map;
    }, [nodes]);
    const canManage = can(me, 'CLASSIFICATION_MANAGE', scope);
    const [pending, setPending] = useState<string | null>(null);
    const toggle = async (node: ClassificationNode) => {
        setPending(node.id);
        try {
            await classification!.command(`/nodes/${node.id}/${node.statut === 'ACTIF' ? 'deactivate' : 'activate'}`, {}, crypto.randomUUID(), 'POST');
            q.refresh();
        }
        finally {
            setPending(null);
        }
    };
    const renderChildren = (parentId: string, depth: number): React.ReactNode => {
        const list = byParent.get(parentId) ?? [];
        return list.map(n => <NodeRow key={n.id} node={n} depth={depth} canManage={canManage} onToggle={toggle} pending={pending === n.id}>{renderChildren(n.id, depth + 1)}</NodeRow>);
    };
    return <><PageHead eyebrow="MODULE · CLASSEMENT" title="Plan de classement" description="Organiser les séries et catégories documentaires du périmètre courant.">
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer un nœud</button>}
    </PageHead>
        <div className="panel">
        {q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : nodes.length ? <div className="table-scroll"><table><thead><tr><th>Libellé</th><th>Type</th><th>Code</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{renderChildren('', 0)}</tbody></table></div> : <Empty title="Aucun nœud de classement" description="Créez le premier nœud pour ce périmètre."/>}
        </div>
        {creating && <CreateNodeDialog nodes={nodes} onClose={() => setCreating(false)} onCreated={q.refresh}/>}
        </>;
}
