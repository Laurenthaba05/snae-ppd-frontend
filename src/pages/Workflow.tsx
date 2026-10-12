import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import React, { useRef, useState } from 'react';
import { IntentKey } from '../core/validation';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, Notice, useResource, Modal, Field, Badge, formatDate } from '../ui/components';
import { ReferencePicker } from '../ui/ReferencePicker';
import type { DocumentType, WorkflowBinding, WorkflowDefinition, WorkflowStep, WorkflowDomain, WorkflowInstance, WorkflowTask, WorkflowTaskActions } from '../core/types';
import { EntityName } from '../ui/names';
import { ApiError } from '../core/http';
import { label } from '../core/format';

const domains: WorkflowDomain[] = ['DOCUMENT', 'DOSSIER'];

function CreateDefinitionDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { workflow } = useSession();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [domain, setDomain] = useState<WorkflowDomain>('DOCUMENT');
    const { scope } = useWorkspace();
    const extra = useOptionalFields('definition');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await workflow!.command('/admin/workflow-definitions', { ...extra.payload(), institutionId: scope.institutionId ?? null, code: code.trim(), name: name.trim(), domain }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer un circuit de validation" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <p>Portée : {scope.institutionId ? <>institution <strong><EntityName kind="institutions" id={scope.institutionId} fallback="sélectionnée"/></strong></> : "nationale"}</p>
                
                <Field label="Code" hint="Identifiant technique"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
                <Field label="Nom" wide><input value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Domaine"><select value={domain} onChange={e => setDomain(e.target.value as WorkflowDomain)} disabled={busy}>{domains.map(d => <option key={d} value={d}>{d}</option>)}</select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function AddStepDialog({ definitionId, onClose, onCreated }: {
    definitionId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { workflow } = useSession();
    const [code, setCode] = useState('');
    const [label, setLabel] = useState('');
    const [order, setOrder] = useState('0');
    const [responsibleRoleId, setResponsibleRoleId] = useState('');
    const [initial, setInitial] = useState(false);
    const [final, setFinal] = useState(false);
    const extra = useOptionalFields('step');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!responsibleRoleId) { setError(new Error('Choisissez le rôle responsable de cette étape.')); return; }
        setBusy(true);
        setError(null);
        try {
            await workflow!.command(`/admin/workflow-definitions/${definitionId}/steps`, { ...extra.payload(), code: code.trim(), label: label.trim(), order: Number(order), responsibleRoleId: responsibleRoleId.trim(), initial, final }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Ajouter une étape" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Code" hint="Identifiant technique"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
                <Field label="Libellé" wide><input value={label} onChange={e => setLabel(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Ordre"><input type="number" value={order} onChange={e => setOrder(e.target.value)} required disabled={busy}/></Field>
                <Field label="Rôle responsable *" hint="Les personnes qui tiennent ce rôle traitent l’étape." wide><ReferencePicker kind="roles" label="Sélectionner un rôle" value={responsibleRoleId} onChange={setResponsibleRoleId} disabled={busy}/></Field>
                <Field label="Étape initiale ?"><select value={initial ? 'oui' : 'non'} onChange={e => setInitial(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
                <Field label="Étape finale ?"><select value={final ? 'oui' : 'non'} onChange={e => setFinal(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
        </form>
    </Modal>;
}

function AddTransitionDialog({ definitionId, steps, onClose, onCreated }: {
    definitionId: string;
    steps: WorkflowStep[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { workflow } = useSession();
    const [code, setCode] = useState('');
    const [sourceStepId, setSourceStepId] = useState('');
    const [destinationStepId, setDestinationStepId] = useState('');
    const extra = useOptionalFields('transition');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await workflow!.command(`/admin/workflow-definitions/${definitionId}/transitions`, { ...extra.payload(), code: code.trim(), sourceStepId, destinationStepId }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Ajouter une transition" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Code" wide><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
                <Field label="Étape source"><select value={sourceStepId} onChange={e => setSourceStepId(e.target.value)} required disabled={busy}><option value="">Choisir</option>{steps.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
                <Field label="Étape destination"><select value={destinationStepId} onChange={e => setDestinationStepId(e.target.value)} required disabled={busy}><option value="">Choisir</option>{steps.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
        </form>
    </Modal>;
}

function BindDefinitionDialog({ definitionId, onClose, onCreated }: {
    definitionId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { workflow, records, epoch } = useSession();
    const typesQ = useResource<DocumentType[]>(s => records!.documentTypes(s), 'workflow-document-types:' + epoch);
    const [typeDocumentId, setTypeDocumentId] = useState('');
    const [required, setRequired] = useState(false);
    const extra = useOptionalFields('workflowBinding');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!typeDocumentId) { setError(new Error('Choisissez le type de document.')); return; }
        setBusy(true);
        setError(null);
        try {
            await workflow!.command(`/admin/workflow-definitions/${definitionId}/document-types/${typeDocumentId}`, { ...extra.payload(), required }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Lier à un type de document" onClose={onClose} locked={busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                
                <Field label="Type de document *" wide>{typesQ.loading ? <Busy /> : typesQ.error ? <ErrorNotice error={typesQ.error} onRetry={typesQ.refresh}/> :
                    <select value={typeDocumentId} onChange={e => setTypeDocumentId(e.target.value)} required disabled={busy}><option value="">Choisir un type de document</option>{(typesQ.data ?? []).filter(t => t.status === 'ACTIF').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>}</Field>
                <Field label="Circuit obligatoire ?" hint="Si oui, un document de ce type ne peut pas être scellé tant que son circuit n’est pas terminé."><select value={required ? 'oui' : 'non'} onChange={e => setRequired(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Lier</button></footer>
        </form>
    </Modal>;
}

function DefinitionDetailDialog({ definition, canManage, onClose, onChanged }: {
    definition: WorkflowDefinition;
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const { workflow, records, epoch } = useSession();
    const [addingStep, setAddingStep] = useState(false);
    const [addingTransition, setAddingTransition] = useState(false);
    const [binding, setBinding] = useState(false);
    const stepsQ = useResource<WorkflowStep[]>(s => workflow!.steps(definition.id, s), 'workflow-steps:' + definition.id + ':' + epoch);
    const steps = stepsQ.data ?? [];
    const bindingsQ = useResource<WorkflowBinding[]>(s => workflow!.bindings(definition.id, s), 'workflow-bindings:' + definition.id + ':' + epoch);
    const typesQ = useResource<DocumentType[]>(s => records!.documentTypes(s), 'workflow-document-types:' + epoch);
    const typeLabel = (id: string) => typesQ.data?.find(t => t.id === id)?.label ?? (typesQ.loading ? '…' : 'Type non disponible');
    const activate = async () => {
        await workflow!.command(`/admin/workflow-definitions/${definition.id}/activate`, {}, crypto.randomUUID(), 'POST');
        onChanged();
        onClose();
    };
    return <Modal title={definition.name} subtitle={definition.code + ' · v' + definition.version} onClose={onClose} wide>
        <div className="form-grid">
            {canManage && definition.status === 'BROUILLON' && <div className="table-actions">
                <button className="btn small secondary" onClick={() => setAddingStep(true)}>Ajouter une étape</button>
                <button className="btn small secondary" onClick={() => setAddingTransition(true)}>Ajouter une transition</button>
                <button className="btn small secondary" onClick={() => setBinding(true)}>Lier à un type de document</button>
                <button className="btn small warning" onClick={activate}>Activer le circuit</button>
            </div>}
            <div>
                <h4>Étapes</h4>
                {stepsQ.loading ? <Busy /> : stepsQ.error ? <ErrorNotice error={stepsQ.error} onRetry={stepsQ.refresh}/> : steps.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Libellé</th><th>Rôle responsable</th><th>Ordre</th><th>Initiale</th><th>Finale</th></tr></thead><tbody>{steps.map(s => <tr key={s.id}><td>{s.code}</td><td>{s.label}</td><td>{s.responsibleRoleId ? <EntityName kind="roles" id={s.responsibleRoleId}/> : <span className="cell-sub">Aucun rôle</span>}</td><td>{s.order}</td><td>{s.initial ? 'Oui' : 'Non'}</td><td>{s.final ? 'Oui' : 'Non'}</td></tr>)}</tbody></table></div> : <Empty title="Aucune étape" description="Ajoutez la première étape de ce circuit."/>}
            </div>
            <div>
                <h4>Types de documents liés</h4>
                {bindingsQ.loading ? <Busy /> : bindingsQ.error ? <ErrorNotice error={bindingsQ.error} onRetry={bindingsQ.refresh}/> : (bindingsQ.data ?? []).length
                    ? <div className="table-scroll"><table><thead><tr><th>Type de document</th><th>Obligatoire</th><th>Depuis le</th></tr></thead><tbody>{(bindingsQ.data ?? []).map(b => <tr key={b.id}><td>{typeLabel(b.typeDocumentId)}</td><td>{b.required ? 'Oui' : 'Non'}</td><td>{b.from}</td></tr>)}</tbody></table></div>
                    : <Notice tone="warning">Ce circuit n’est lié à aucun type de document : il ne s’applique à aucun document.{canManage && definition.status === 'BROUILLON' ? ' Utilisez « Lier à un type de document ».' : ''}</Notice>}
            </div>
            {definition.status !== 'BROUILLON' && <p className="wf-note">Un circuit {definition.status === 'ACTIF' ? 'actif' : 'retiré'} ne se modifie plus : étapes, transitions et liens sont figés. Pour le changer, créez un nouveau circuit (brouillon) puis activez-le.</p>}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {addingStep && <AddStepDialog definitionId={definition.id} onClose={() => setAddingStep(false)} onCreated={stepsQ.refresh}/>}
        {addingTransition && <AddTransitionDialog definitionId={definition.id} steps={steps} onClose={() => setAddingTransition(false)} onCreated={() => {}}/>}
        {binding && <BindDefinitionDialog definitionId={definition.id} onClose={() => setBinding(false)} onCreated={bindingsQ.refresh}/>}
    </Modal>;
}

export function WorkflowPage() {
    const { me, workflow, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManage = can(me, 'WORKFLOW_DEFINITION_MANAGE', scope);
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const definitionsQ = useResource<WorkflowDefinition[]>(s => workflow!.definitions(scope.institutionId, s), 'workflow-definitions:' + scope.institutionId + ':' + epoch);
    const definitions = definitionsQ.data ?? [];
    const selected = definitions.find(d => d.id === selectedId) ?? null;
    return <><PageHead eyebrow="MODULE · WORKFLOW" title="Circuits de validation" description="Définir les étapes, transitions et rattachements des circuits de validation documentaire.">
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer un circuit</button>}
    </PageHead>
        <div className="panel">
            <div className="section-heading"><h3>Circuits</h3></div>
            {definitionsQ.loading ? <Busy /> : definitionsQ.error ? <ErrorNotice error={definitionsQ.error} onRetry={definitionsQ.refresh}/> : definitions.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Domaine</th><th>Version</th><th>Statut</th></tr></thead><tbody>{definitions.map(d => <tr key={d.id}><td><button className="record-name" onClick={() => setSelectedId(d.id)}><strong>{d.code}</strong></button></td><td>{d.name}</td><td>{label('workflowDomain', d.domain)}</td><td>{d.version}</td><td><Badge value={d.status}/></td></tr>)}</tbody></table></div> : <Empty title="Aucun circuit de validation" description="Créez le premier circuit."/>}
        </div>
        {creating && <CreateDefinitionDialog onClose={() => setCreating(false)} onCreated={definitionsQ.refresh}/>}
        {selected && <DefinitionDetailDialog definition={selected} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={definitionsQ.refresh}/>}
        </>;
}

function CompleteTaskDialog({ task, onClose, onDone }: {
    task: WorkflowTask;
    onClose: () => void;
    onDone: () => void;
}) {
    const { workflow, epoch } = useSession();
    const actionsQ = useResource<WorkflowTaskActions>(s => workflow!.taskActions(task.taskId, s), 'task-actions:' + task.taskId + ':' + epoch);
    const actions = actionsQ.data;
    const [transitionCode, setTransitionCode] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [touched, setTouched] = useState(false);
    // Les suites possibles viennent du serveur ; s'il ne les donne pas (droit de lecture absent, serveur plus ancien), le code se saisit comme avant.
    const manual = !actionsQ.loading && !actions;
    const needsChoice = Boolean(actions && !actions.canCompleteFinal);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setTouched(true);
        if (needsChoice && !transitionCode) return;
        setBusy(true);
        setError(null);
        try {
            await workflow!.command(`/workflow-tasks/${task.taskId}/complete`, { transitionCode: transitionCode.trim() || null, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onDone();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Terminer la tâche" subtitle={actions?.stepLabel ?? task.stepLabel ?? undefined} onClose={onClose} locked={busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                {actionsQ.loading && <Busy />}
                {actions?.canCompleteFinal && <p className="span2">Cette étape est la dernière : la terminer clôture le circuit.</p>}
                {needsChoice && <Field label="Suite à donner *" wide error={touched && !transitionCode ? 'Choisissez la suite à donner.' : undefined}>
                    <select value={transitionCode} onChange={e => setTransitionCode(e.target.value)} disabled={busy}>
                        <option value="">Choisir</option>
                        {actions!.options.map(o => <option key={o.transitionCode} value={o.transitionCode} disabled={!o.enabled}>{o.label}{o.enabled ? '' : ' (indisponible : condition non remplie)'}</option>)}
                    </select></Field>}
                {manual && <div className="span2"><Notice tone="warning">Les suites possibles de cette étape n’ont pas pu être lues : saisissez le code de la transition.</Notice></div>}
                {manual && <Field label="Code de transition" hint="Laisser vide si l’étape est finale"><input value={transitionCode} onChange={e => setTransitionCode(e.target.value)} disabled={busy}/></Field>}
                <Field label="Commentaire" wide><textarea value={comment} onChange={e => setComment(e.target.value)} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || actionsQ.loading}>Terminer</button></footer>
        </form>
    </Modal>;
}

export function WorkflowPanel({ documentId }: {
    documentId: string;
}) {
    const { me, workflow, epoch } = useSession();
    const { scope } = useWorkspace();
    const startIntent = useRef(new IntentKey());
    const canStart = can(me, 'WORKFLOW_START', scope);
    const canClaim = can(me, 'WORKFLOW_TASK_CLAIM', scope);
    const canComplete = can(me, 'WORKFLOW_TASK_COMPLETE', scope);
    const canCancel = can(me, 'WORKFLOW_CANCEL', scope);
    const [starting, setStarting] = useState(false);
    const [completing, setCompleting] = useState<WorkflowTask | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);
    const instancesQ = useResource<WorkflowInstance[]>(s => workflow!.documentWorkflows(documentId, s), 'document-workflows:' + documentId + epoch);
    const instances = instancesQ.data ?? [];
    const active = instances.find(i => i.status === 'EN_COURS' || i.status === 'SUSPENDU');
    const start = async () => {
        setStarting(true); setActionError(null);
        try {
            await workflow!.command(`/documents/${documentId}/workflow`, {}, startIntent.current.forRequest('POST', `/documents/${documentId}/workflow`, {}), 'POST');
            startIntent.current.clear();
            instancesQ.refresh();
        }
        catch (e) {
            setActionError(e);
        }
        finally {
            setStarting(false);
        }
    };
    const claim = async (task: WorkflowTask) => {
        setBusy(task.taskId); setActionError(null);
        try {
            await workflow!.command(`/workflow-tasks/${task.taskId}/claim`, {}, crypto.randomUUID(), 'POST');
            instancesQ.refresh();
        }
        catch (e) {
            setActionError(e);
        }
        finally {
            setBusy(null);
        }
    };
    const cancel = async (instance: WorkflowInstance) => {
        const reason = window.prompt('Motif d’annulation :');
        if (!reason)
            return;
        setActionError(null);
        try {
            await workflow!.command(`/workflows/${instance.instanceId}/cancel`, { reason }, crypto.randomUUID(), 'POST');
            instancesQ.refresh();
        }
        catch (e) {
            setActionError(e);
        }
    };
    return <section className="panel">
        <div className="section-heading"><h3>Circuit de validation</h3>{canStart && !active && <button className="btn small secondary" disabled={starting} onClick={start}>Démarrer un circuit</button>}</div>
        {actionError !== null && <>
            {actionError instanceof ApiError && actionError.code === 'WORKFLOW_DEFINITION_MISSING'
                ? <Notice tone="warning"><strong>Aucun circuit ne s’applique à ce type de document.</strong> Un circuit actif doit être lié au type du document (page « Circuits de validation », fiche du circuit, rubrique « Types de documents liés »).</Notice>
                : <ErrorNotice error={actionError}/>}
        </>}
        {instancesQ.loading ? <Busy /> : instancesQ.error ? <ErrorNotice error={instancesQ.error} onRetry={instancesQ.refresh}/> : instances.length ? <div className="form-grid">{instances.map(instance => <div key={instance.instanceId}>
                <div className="section-heading"><span><Badge value={instance.status}/> <small>Démarré le {formatDate(instance.startedAt)}</small></span>{canCancel && (instance.status === 'EN_COURS' || instance.status === 'SUSPENDU') && <button className="btn small danger-outline" onClick={() => cancel(instance)}>Annuler le circuit</button>}</div>
                <div className="table-scroll"><table><thead><tr><th>Étape</th><th>Statut</th><th /></tr></thead><tbody>{instance.tasks.map(t => <tr key={t.taskId}><td><strong>{t.stepLabel ?? 'Étape'}</strong>{(t.roleName || t.assignedUserName || t.assignedUserId) && <small className="cell-sub">{t.assignedUserName ?? (t.assignedUserId ? <EntityName kind="users" id={t.assignedUserId}/> : t.roleName)}{t.assignedUserName || t.assignedUserId ? (t.roleName ? ' · ' + t.roleName : '') : ''}</small>}</td><td><Badge value={t.status}/></td><td>{t.status === 'OUVERTE' && canClaim && <button className="btn small secondary" disabled={busy === t.taskId} onClick={() => claim(t)}>Prendre en charge</button>}{t.status === 'EN_COURS' && canComplete && <button className="btn small secondary" onClick={() => setCompleting(t)}>Terminer</button>}</td></tr>)}</tbody></table></div>
            </div>)}</div> : <Empty title="Aucun circuit de validation" description="Aucun circuit n’a encore été démarré pour ce document."/>}
        {completing && <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} onDone={instancesQ.refresh}/>}
    </section>;
}
