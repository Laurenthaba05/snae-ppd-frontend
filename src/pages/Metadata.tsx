import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { metadataDraft, metadataPayload, type MetadataDraft } from '../core/metadataEditor';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import { MetadataTemplatesDialog } from '../ui/MetadataTemplates';
import { TermPicker } from '../ui/Vocabularies';
import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, Notice, useResource, Modal, Field, Badge, formatDate } from '../ui/components';
import type { MetadataSchema, MetadataField, MetadataValueType, MetadataValue, MetadataFieldDefinition, MetadataBinding, MetadataHistoryPage, DocumentType } from '../core/types';
import type { Vocabulary } from '../core/vocabulary';
import { EntityName } from '../ui/names';
import { label } from '../core/format';
import { IntentKey } from '../core/validation';

const valueTypes: MetadataValueType[] = ['TEXTE', 'TEXTE_LONG', 'ENTIER', 'DECIMAL', 'BOOLEEN', 'DATE', 'DATETIME', 'UUID', 'ENUM', 'TERME'];

function CreateSchemaDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { metadata } = useSession();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const { scope } = useWorkspace();
    const extra = useOptionalFields('schema');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await metadata!.command('/admin/metadata-schemas', { ...extra.payload(), institutionId: scope.institutionId ?? null, code: code.trim(), name: name.trim() }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer un schéma de métadonnées" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <p>Portée : {scope.institutionId ? <>institution <strong><EntityName kind="institutions" id={scope.institutionId} fallback="sélectionnée"/></strong></> : "nationale"}</p>
                
                <Field label="Code" hint="Identifiant technique"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
                <Field label="Nom" wide><input value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

/** Les contraintes avancées d'un champ, sans la liste de valeurs (qui a son propre champ de saisie). */
function advancedConstraints(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
    const { allowedValues: _list, ...rest } = config as Record<string, unknown>;
    return rest;
}

/** Ajoute un champ à un brouillon, ou (avec `field`) corrige un champ existant : son code ne change pas. */
function FieldDialog({ schemaId, institutionId, field, onClose, onSaved }: {
    schemaId: string;
    /** L'institution du schéma (vide : schéma national) : elle borne les vocabulaires qu'un champ peut désigner. */
    institutionId: string | null;
    field?: MetadataField;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { metadata, vocabulary, epoch } = useSession();
    const editing = !!field;
    const [code, setCode] = useState(field?.code ?? '');
    const [name, setName] = useState(field?.name ?? '');
    const [type, setType] = useState<MetadataValueType>(field?.type ?? 'TEXTE');
    const [required, setRequired] = useState(field?.required ?? false);
    const [allowedValues, setAllowedValues] = useState(allowedValuesOf(field?.configuration).join('\n'));
    const [repeatable, setRepeatable] = useState(field?.repeatable ?? false);
    const [vocabularyId, setVocabularyId] = useState(field?.vocabularyId ?? '');
    const vocabulariesQ = useResource<Vocabulary[]>(s => type === 'TERME' ? vocabulary!.list(institutionId, false, s) : Promise.resolve([]), 'metadata-field-vocabularies:' + institutionId + ':' + (type === 'TERME') + ':' + epoch);
    const advanced = advancedConstraints(field?.configuration);
    const extra = useOptionalFields('metadataField', field ? {
        description: field.description ?? '', vocabulary: field.vocabulary ?? '', order: field.order == null ? '' : String(field.order),
        configuration: Object.keys(advanced).length ? JSON.stringify(advanced, null, 2) : ''
    } : undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const options = [...new Set(allowedValues.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
            if (type === 'ENUM' && !options.length) throw new Error('Renseignez au moins une valeur autorisée.');
            if (type === 'TERME' && !vocabularyId) throw new Error('Choisissez un vocabulaire contrôlé.');
            const additional = extra.payload();
            const configuration = type === 'ENUM' ? {...(additional.configuration as Record<string,unknown> ?? {}), allowedValues: options} : additional.configuration;
            const linked = type === 'TERME' ? { vocabularyId } : {};
            if (field) await metadata!.command(`/admin/metadata-schemas/${schemaId}/fields/${field.id}`, { ...additional, ...linked, configuration, name: name.trim(), type, required, repeatable }, crypto.randomUUID(), 'PUT');
            else await metadata!.command(`/admin/metadata-schemas/${schemaId}/fields`, { ...additional, ...linked, configuration, code: code.trim(), name: name.trim(), type, required, repeatable }, crypto.randomUUID(), 'POST');
            onSaved();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={editing ? 'Modifier le champ' : 'Ajouter un champ'} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">

                <Field label="Code" hint={editing ? 'Le code d’un champ ne change pas : les valeurs sont enregistrées sous ce nom.' : 'Identifiant technique'}><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy || editing}/></Field>
                <Field label="Nom" wide><input value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Type"><select value={type} onChange={e => setType(e.target.value as MetadataValueType)} disabled={busy}>{valueTypes.map(t => <option key={t} value={t}>{label('metadataType', t)}</option>)}</select></Field>
                {type === 'TERME' && <Field label="Vocabulaire contrôlé" hint="Les termes actifs de ce vocabulaire sont proposés à la saisie ; la valeur enregistrée est le terme." wide>
                    <select value={vocabularyId} onChange={e => setVocabularyId(e.target.value)} required disabled={busy || vocabulariesQ.loading || !!vocabulariesQ.error}>
                        <option value="">Choisir un vocabulaire…</option>
                        {(vocabulariesQ.data ?? []).map(v => <option key={v.id} value={v.id}>{v.name}{v.institutionId ? '' : ' (national)'}</option>)}
                    </select></Field>}
                {type === 'TERME' && vocabulariesQ.error ? <ErrorNotice error={vocabulariesQ.error} onRetry={vocabulariesQ.refresh}/> : null}
                {type === 'TERME' && !vocabulariesQ.loading && !vocabulariesQ.error && !(vocabulariesQ.data ?? []).length && <Notice>Aucun vocabulaire actif n’est disponible pour ce schéma : constituez-en un dans le module des vocabulaires.</Notice>}
                {type === 'ENUM' && <Field label="Valeurs autorisées" hint="Une valeur par ligne." wide><textarea value={allowedValues} onChange={e => setAllowedValues(e.target.value)} required disabled={busy}/></Field>}
                <Field label="Obligatoire ?"><select value={required ? 'oui' : 'non'} onChange={e => setRequired(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
                <Field label="Répétable ?"><select value={repeatable ? 'oui' : 'non'} onChange={e => setRepeatable(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{editing ? 'Enregistrer' : 'Ajouter'}</button></footer>
        </form>
    </Modal>;
}

/** Corrige le nom et la date d'effet d'un schéma en brouillon. */
function EditSchemaDialog({ schema, onClose, onSaved }: {
    schema: MetadataSchema;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { metadata } = useSession();
    const [name, setName] = useState(schema.name);
    const [effectiveFrom, setEffectiveFrom] = useState(schema.effectiveFrom);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            await metadata!.command(`/admin/metadata-schemas/${schema.id}`, { name: name.trim(), effectiveFrom }, crypto.randomUUID(), 'PUT');
            onSaved();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Modifier le schéma" subtitle={schema.code + ' · v' + schema.version} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Nom" wide><input value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Date d’effet" hint="Le schéma n’est attribué aux documents qu’à partir de cette date."><input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !name.trim() || !effectiveFrom}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/** Demande une confirmation avant une action qu'on ne défait pas d'un clic (supprimer un champ, retirer un schéma). */
function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose }: {
    title: string;
    children: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={title} onClose={onClose} locked={busy}>
        <div className="form-grid"><div className="span2">{children}</div></div>
        {error ? <ErrorNotice error={error}/> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="button" className="btn warning" onClick={confirm} disabled={busy}>{confirmLabel}</button></footer>
    </Modal>;
}

export function BindSchemaDialog({ schemaId, onClose, onCreated }: {
    schemaId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { metadata, records, epoch } = useSession();
    const typesQ = useResource<DocumentType[]>(signal => records!.documentTypes(signal), 'metadata-binding-types:' + epoch);
    const bindingsQ = useResource<MetadataBinding[]>(signal => metadata!.bindings(schemaId, signal), 'metadata-binding-existing:' + schemaId + ':' + epoch);
    const choices = (typesQ.data ?? []).filter(type => type.status === 'ACTIF' && !(bindingsQ.data ?? []).some(b => b.typeDocumentId === type.id));
    const intent = useRef(new IntentKey());
    const [typeDocumentId, setTypeDocumentId] = useState('');
    const [required, setRequired] = useState(false);
    const extra = useOptionalFields('binding');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!choices.some(type => type.id === typeDocumentId) || bindingsQ.loading || bindingsQ.error) { setError(new Error('Choisissez un type de document disponible.')); return; }
        setBusy(true);
        setError(null);
        try {
            const path = `/admin/metadata-schemas/${schemaId}/document-types/${typeDocumentId}`;
            const body = { ...extra.payload(), required };
            await metadata!.command(path, body, intent.current.forRequest('POST', path, body), 'POST');
            intent.current.clear();
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
    return <Modal title="Lier le schéma à un type de document" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Type de document" wide><select value={typeDocumentId} onChange={e => setTypeDocumentId(e.target.value)} required disabled={busy || typesQ.loading || bindingsQ.loading || !!typesQ.error || !!bindingsQ.error}><option value="">Choisir un type de document</option>{choices.map(type => <option key={type.id} value={type.id}>{type.code} · {type.label}</option>)}</select></Field>
                {typesQ.error ? <ErrorNotice error={typesQ.error} onRetry={typesQ.refresh}/> : null}
                {bindingsQ.error ? <ErrorNotice error={bindingsQ.error} onRetry={bindingsQ.refresh}/> : null}
                {!typesQ.loading && !bindingsQ.loading && !typesQ.error && !bindingsQ.error && !choices.length && <Notice>Aucun type actif restant à rattacher.</Notice>}
                <Field label="Obligatoire ?"><select value={required ? 'oui' : 'non'} onChange={e => setRequired(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !typeDocumentId || typesQ.loading || bindingsQ.loading || !!typesQ.error || !!bindingsQ.error}>Lier</button></footer>
        </form>
    </Modal>;
}

export function SchemaDetailDialog({ schema, canManage, onClose, onChanged, onOpen }: {
    schema: MetadataSchema;
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
    /** Ouvre un autre schéma (le brouillon créé par « nouvelle version »). */
    onOpen?: (schemaId: string) => void;
}) {
    const { metadata, records, epoch } = useSession();
    const [addingField, setAddingField] = useState(false);
    const [editingField, setEditingField] = useState<MetadataField | null>(null);
    const [editingHeader, setEditingHeader] = useState(false);
    const [confirming, setConfirming] = useState<{ kind: 'deleteField'; field: MetadataField } | { kind: 'retire' } | null>(null);
    const [binding, setBinding] = useState(false);
    const fieldsQ = useResource<MetadataField[]>(s => metadata!.fields(schema.id, s), 'metadata-fields:' + schema.id + ':' + epoch);
    const bindingsQ = useResource<MetadataBinding[]>(signal => metadata!.bindings(schema.id, signal), 'metadata-bindings:' + schema.id + ':' + epoch);
    const typesQ = useResource<DocumentType[]>(signal => records!.documentTypes(signal), 'metadata-types:' + epoch);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const activationKey = useRef(crypto.randomUUID());
    const activate = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try {
        await metadata!.command(`/admin/metadata-schemas/${schema.id}/activate`, {}, activationKey.current, 'POST');
        onChanged();
        onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    /** Une correction du brouillon : une commande, puis la relecture de ce qu'elle a changé ; l'erreur du serveur est dite dans la fenêtre. */
    const correct = async (work: () => Promise<unknown>, after: () => void) => {
        if (busy) return;
        setBusy(true); setError(null);
        try { await work(); after(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const move = (index: number, delta: -1 | 1) => {
        const ids = (fieldsQ.data ?? []).map(f => f.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target]!, ids[index]!];
        void correct(() => metadata!.command(`/admin/metadata-schemas/${schema.id}/field-order`, { fieldIds: ids }, crypto.randomUUID(), 'PUT'), fieldsQ.refresh);
    };
    const unbind = (typeDocumentId: string) => correct(() => metadata!.command(`/admin/metadata-schemas/${schema.id}/document-types/${typeDocumentId}/unbind`, {}, crypto.randomUUID(), 'POST'), bindingsQ.refresh);
    const newVersion = () => {
        const result: { schema?: MetadataSchema } = {};
        return correct(async () => { result.schema = await metadata!.command<MetadataSchema>(`/admin/metadata-schemas/${schema.id}/new-version`, {}, crypto.randomUUID(), 'POST'); },
            () => { onChanged(); onClose(); if (result.schema) onOpen?.(result.schema.id); });
    };
    const draft = canManage && schema.status === 'BROUILLON';
    return <Modal title={schema.name} subtitle={schema.code + ' · v' + schema.version} onClose={onClose} locked={busy} wide><ResourceDetailsButton resource="metadataSchema" id={schema.id} title={schema.name} />
        <div className="form-grid">
            {draft && <div className="table-actions"><button className="btn small secondary" disabled={busy} onClick={() => setEditingHeader(true)}>Modifier le nom et la date d’effet</button><button className="btn small secondary" onClick={() => setAddingField(true)}>Ajouter un champ</button><button className="btn small secondary" onClick={() => setBinding(true)}>Lier à un type de document</button><button className="btn small warning" disabled={busy || fieldsQ.loading || bindingsQ.loading || !!fieldsQ.error || !!bindingsQ.error || !fieldsQ.data?.length || !bindingsQ.data?.length} onClick={activate}>Activer le schéma</button></div>}
            {canManage && schema.status !== 'BROUILLON' && <div className="span2"><Notice>{schema.status === 'ACTIF' ? 'Ce schéma est actif : ses champs ne se modifient pas, des documents en dépendent. Pour le faire évoluer, créez une nouvelle version, corrigez-la, puis activez-la : l’ancienne version est alors retirée, et les documents qui l’ont reçue la gardent.' : 'Ce schéma est retiré : il n’est plus attribué aux nouveaux documents. Pour le reprendre, créez une nouvelle version.'}</Notice>
                <div className="table-actions"><button className="btn small secondary" disabled={busy} onClick={newVersion}>Créer une nouvelle version</button>{schema.status === 'ACTIF' && <button className="btn small warning" disabled={busy} onClick={() => setConfirming({ kind: 'retire' })}>Retirer ce schéma</button>}</div></div>}
            <div>
                <h4>Champs</h4>
                {fieldsQ.loading ? <Busy /> : fieldsQ.error ? <ErrorNotice error={fieldsQ.error} onRetry={fieldsQ.refresh}/> : fieldsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Obligatoire</th><th>Répétable</th><th>Ordre</th><th>Description et contraintes</th>{draft && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{fieldsQ.data.map((f, index) => <tr key={f.id}><td>{f.code}</td><td>{f.name}</td><td>{label('metadataType', f.type)}</td><td>{f.required ? 'Oui' : 'Non'}</td><td>{f.repeatable ? 'Oui' : 'Non'}</td><td>{f.order ?? '—'}</td><td><p>{f.description || 'Aucune description'}</p>{f.vocabularyName && <p>Vocabulaire contrôlé : {f.vocabularyName}</p>}{f.vocabulary && <p>Vocabulaire : {f.vocabulary}</p>}{f.configuration && typeof f.configuration === 'object' && Object.keys(f.configuration).length > 0 && <details><summary>Contraintes de {f.name}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(f.configuration, null, 2)}</pre></details>}</td>{draft && <td><div className="table-actions">
                    <button className="btn small secondary" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={'Monter ' + f.name}>Monter</button>
                    <button className="btn small secondary" disabled={busy || index === (fieldsQ.data?.length ?? 0) - 1} onClick={() => move(index, 1)} aria-label={'Descendre ' + f.name}>Descendre</button>
                    <button className="btn small secondary" disabled={busy} onClick={() => setEditingField(f)} aria-label={'Modifier ' + f.name}>Modifier</button>
                    <button className="btn small warning" disabled={busy} onClick={() => setConfirming({ kind: 'deleteField', field: f })} aria-label={'Supprimer ' + f.name}>Supprimer</button></div></td>}</tr>)}</tbody></table></div> : <Empty title="Aucun champ" description="Ajoutez le premier champ de ce schéma."/>}
            </div>
            <div className="span2"><h4>Types de documents liés</h4>
                {bindingsQ.loading ? <Busy/> : bindingsQ.error ? <ErrorNotice error={bindingsQ.error} onRetry={bindingsQ.refresh}/> : bindingsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Type de document</th><th>Schéma obligatoire</th><th>Début de validité</th><th>Fin de validité</th>{draft && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{bindingsQ.data.map(binding => { const typeName = typesQ.data?.find(type => type.id === binding.typeDocumentId)?.label ?? (typesQ.loading ? '…' : 'Type de document non retrouvé'); return <tr key={binding.typeDocumentId}><td>{typeName}</td><td>{binding.required ? 'Oui' : 'Non'}</td><td>{binding.from}</td><td>{binding.to ?? 'Sans date de fin'}</td>{draft && <td><button className="btn small secondary" disabled={busy} onClick={() => unbind(binding.typeDocumentId)} aria-label={'Retirer le rattachement à ' + typeName}>Retirer</button></td>}</tr>; })}</tbody></table></div> : <Notice>Ce schéma n’est lié à aucun type de document.</Notice>}
                {typesQ.error ? <ErrorNotice error={typesQ.error} onRetry={typesQ.refresh}/> : null}
            </div>
            {error ? <ErrorNotice error={error}/> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {addingField && <FieldDialog schemaId={schema.id} institutionId={schema.institutionId} onClose={() => setAddingField(false)} onSaved={fieldsQ.refresh}/>}
        {editingField && <FieldDialog schemaId={schema.id} institutionId={schema.institutionId} field={editingField} onClose={() => setEditingField(null)} onSaved={fieldsQ.refresh}/>}
        {editingHeader && <EditSchemaDialog schema={schema} onClose={() => setEditingHeader(false)} onSaved={onChanged}/>}
        {binding && <BindSchemaDialog schemaId={schema.id} onClose={() => setBinding(false)} onCreated={bindingsQ.refresh}/>}
        {confirming?.kind === 'deleteField' && <ConfirmDialog title="Supprimer ce champ ?" confirmLabel="Supprimer le champ" onClose={() => setConfirming(null)}
            onConfirm={() => metadata!.command(`/admin/metadata-schemas/${schema.id}/fields/${confirming.field.id}/delete`, {}, crypto.randomUUID(), 'POST').then(() => fieldsQ.refresh())}>
            <p>Le champ <strong>{confirming.field.name}</strong> ({confirming.field.code}) sera retiré de ce brouillon. Aucun document n’y a encore de valeur : rien d’enregistré n’est perdu.</p></ConfirmDialog>}
        {confirming?.kind === 'retire' && <ConfirmDialog title="Retirer ce schéma ?" confirmLabel="Retirer le schéma" onClose={() => setConfirming(null)}
            onConfirm={() => metadata!.command(`/admin/metadata-schemas/${schema.id}/retire`, {}, crypto.randomUUID(), 'POST').then(() => { onChanged(); onClose(); })}>
            <p>Le schéma <strong>{schema.code}</strong> (version {schema.version}) ne sera plus attribué aux nouveaux documents. Les documents qui l’ont déjà reçu le gardent et leurs valeurs ne changent pas.</p></ConfirmDialog>}
    </Modal>;
}

export function MetadataPage() {
    const { me, metadata, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManage = can(me, 'METADATA_SCHEMA_MANAGE', scope);
    const [creating, setCreating] = useState(false);
    const [fromTemplate, setFromTemplate] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const schemasQ = useResource<MetadataSchema[]>(s => metadata!.schemas(scope.institutionId, s), 'metadata-schemas:' + scope.institutionId + ':' + epoch);
    const schemas = schemasQ.data ?? [];
    const selected = schemas.find(s => s.id === selectedId) ?? null;
    return <><PageHead eyebrow="MODULE · MÉTADONNÉES" title="Schémas de métadonnées" description="Définir les champs de description documentaire et leur rattachement aux types de documents.">
        {canManage && <button className="btn secondary" onClick={() => setFromTemplate(true)}>Créer depuis un gabarit</button>}
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer un schéma</button>}
    </PageHead>
        <div className="panel">
            <div className="section-heading"><h3>Schémas</h3></div>
            {schemasQ.loading ? <Busy /> : schemasQ.error ? <ErrorNotice error={schemasQ.error} onRetry={schemasQ.refresh}/> : schemas.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Version</th><th>Statut</th><th>Période d’effet</th></tr></thead><tbody>{schemas.map(s => <tr key={s.id}><td><button className="record-name" onClick={() => setSelectedId(s.id)}><strong>{s.code}</strong></button></td><td>{s.name}</td><td>{s.version}</td><td><Badge value={s.status}/></td><td>{s.effectiveTo ? 'Du ' + s.effectiveFrom + ' au ' + s.effectiveTo : 'Depuis le ' + s.effectiveFrom}</td></tr>)}</tbody></table></div> : <Empty title="Aucun schéma de métadonnées" description="Créez le premier schéma."/>}
        </div>
        {creating && <CreateSchemaDialog onClose={() => setCreating(false)} onCreated={schemasQ.refresh}/>}
        {fromTemplate && <MetadataTemplatesDialog institutionId={scope.institutionId} onClose={() => setFromTemplate(false)} onCreated={instance => { schemasQ.refresh(); setSelectedId(instance.schema.id); }}/>}
        {selected &&<SchemaDetailDialog schema={selected} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={schemasQ.refresh} onOpen={id => setSelectedId(id)}/>}
        </>;
}

function allowedValuesOf(config: unknown): string[] {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
        const allowed = (config as Record<string, unknown>).allowedValues;
        if (Array.isArray(allowed))
            return allowed.filter((x): x is string => typeof x === 'string');
    }
    return [];
}

function FieldInput({ field, value, onChange, disabled, current }: {
    field: MetadataFieldDefinition;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    /** Pour un champ de type TERME : le terme déjà porté par le document (libellé et état), montré même s'il est obsolète. */
    current?: { id: string; label: string; obsolete?: boolean | null } | null;
}) {
    switch (field.type) {
        case 'TERME': return field.vocabularyId
            ? <TermPicker bare vocabularyId={field.vocabularyId} value={value} onChange={onChange} label={field.fieldName} disabled={disabled} current={current}/>
            : <Notice tone="warning">Ce champ n’est relié à aucun vocabulaire : signalez-le à l’administrateur du schéma.</Notice>;
        case 'TEXTE_LONG': return <textarea value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        case 'ENTIER': return <input type="number" step="1" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        case 'DECIMAL': return <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        case 'BOOLEEN': return <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}><option value="">—</option><option value="oui">Oui</option><option value="non">Non</option></select>;
        case 'DATE': return <input type="date" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        case 'DATETIME': return <input type="datetime-local" step="0.001" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        case 'ENUM': {
            const options = allowedValuesOf(field.configuration);
            if (options.length)
                return <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}><option value="">—</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
            return <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
        }
        default: return <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>;
    }
}

export function EditMetadataDialog({ documentId, fields, currentValues, onClose, onSaved }: {
    documentId: string;
    fields: MetadataFieldDefinition[];
    currentValues: MetadataValue[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const { metadata } = useSession();
    const initial = useMemo(() => metadataDraft(fields, currentValues), [fields, currentValues]);
    const [values, setValues] = useState<MetadataDraft>(initial);
    const [requireComplete, setRequireComplete] = useState(false);
    const intent = useRef(new IntentKey());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const payload = metadataPayload(fields, currentValues, values);
            const path = `/documents/${documentId}/metadata`;
            const body = { values: payload, requireComplete };
            await metadata!.command(path, body, intent.current.forRequest('PUT', path, body), 'PUT');
            intent.current.clear();
            onSaved();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Modifier les métadonnées" onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                {fields.length ? fields.map(field => <div key={field.fieldId} className="field span2">
                    {(values[field.fieldCode] ?? []).map((row,index) => <Field key={row.order} label={field.fieldName + (field.repeatable ? ' · occurrence ' + (index + 1) : '') + (field.required && field.schemaRequired ? ' *' : '')} hint={[field.description, (field.vocabularyName ?? field.vocabulary) ? 'Vocabulaire : ' + (field.vocabularyName ?? field.vocabulary) : null].filter(Boolean).join(' · ') || undefined}>
                        <FieldInput field={field} value={row.raw} onChange={raw => setValues(prev => ({...prev,[field.fieldCode]:(prev[field.fieldCode] ?? []).map(item => item.order === row.order ? {...item,raw} : item)}))} disabled={busy}
                            current={row.label ? { id: row.initial, label: row.label, obsolete: row.obsolete } : null}/>
                        {field.repeatable && <button type="button" className="btn small secondary" disabled={busy} onClick={() => setValues(prev => ({...prev,[field.fieldCode]:(prev[field.fieldCode] ?? []).filter(item => item.order !== row.order)}))}>Retirer cette occurrence</button>}
                    </Field>)}
                    {field.repeatable && <button type="button" className="btn small secondary" disabled={busy} onClick={() => setValues(prev => ({...prev,[field.fieldCode]:[...(prev[field.fieldCode] ?? []),{order:Math.max(-1,...(prev[field.fieldCode] ?? []).map(row=>row.order))+1,raw:'',initial:''}]}))}>Ajouter une occurrence · {field.fieldName}</button>}
                </div>) : <p>Aucun schéma de métadonnées n’est applicable à ce document.</p>}
            </div>
            <Field label="Vérifier tous les champs obligatoires avant l’enregistrement" hint="Si cette option est décochée, vous pouvez enregistrer une saisie partielle."><input type="checkbox" checked={requireComplete} onChange={event => setRequireComplete(event.target.checked)} disabled={busy}/></Field>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !fields.length}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

export function MetadataPanel({ documentId }: {
    documentId: string;
}) {
    const { me, metadata, epoch } = useSession();
    const { scope } = useWorkspace();
    const canWrite = can(me, 'DOCUMENT_METADATA_WRITE', scope);
    const [editing, setEditing] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const valuesQ = useResource<MetadataValue[]>(s => metadata!.documentMetadata(documentId, s), 'document-metadata:' + documentId + epoch);
    const fieldsQ = useResource<MetadataFieldDefinition[]>(s => metadata!.applicableFields(documentId, s), 'document-metadata-fields:' + documentId + epoch);
    const values = valuesQ.data ?? [];
    return <section className="panel">
        <div className="section-heading"><h3>Métadonnées</h3><div className="table-actions"><button className="btn small secondary" disabled={valuesQ.loading || !!valuesQ.error} onClick={() => setShowHistory(true)}>Historique des modifications</button>{canWrite && <button className="btn small secondary" disabled={valuesQ.loading || fieldsQ.loading || !!valuesQ.error || !!fieldsQ.error} onClick={() => setEditing(true)}>Modifier les métadonnées</button>}</div></div>
        {valuesQ.loading ? <Busy /> : valuesQ.error ? <ErrorNotice error={valuesQ.error} onRetry={valuesQ.refresh}/> : values.length ? <div className="table-scroll"><table><thead><tr><th>Schéma</th><th>Champ</th><th>Valeur</th></tr></thead><tbody>{values.map((v, i) => <tr key={v.fieldCode + ':' + v.order + ':' + i}><td>{v.schemaCode} v{v.schemaVersion}</td><td>{v.fieldName}</td><td>{v.type === 'TERME' ? <>{v.label ?? 'Terme non retrouvé'}{v.termObsolete ? <small> (terme obsolète)</small> : null}</> : typeof v.value === 'string' ? v.value : JSON.stringify(v.value)}</td></tr>)}</tbody></table></div> : <Empty title="Aucune métadonnée renseignée" description="Aucun schéma de métadonnées n’a encore été appliqué à ce document."/>}
        {fieldsQ.error ? <ErrorNotice error={fieldsQ.error} onRetry={fieldsQ.refresh}/> : null}
        {editing && <EditMetadataDialog documentId={documentId} fields={fieldsQ.data ?? []} currentValues={values} onClose={() => setEditing(false)} onSaved={() => { valuesQ.refresh(); fieldsQ.refresh(); }}/>}
        {showHistory && <MetadataHistoryDialog documentId={documentId} onClose={() => setShowHistory(false)}/>}
    </section>;
}

/** La valeur d'une métadonnée telle qu'on la lit : le libellé du terme (jamais son identifiant), sinon le texte, sinon le JSON. */
function valueText(v: { type: MetadataValueType; value: unknown; label?: string | null }): string {
    if (v.type === 'TERME') return v.label ?? 'Terme non retrouvé';
    if (typeof v.value === 'string') return v.value;
    return JSON.stringify(v.value);
}

/** L'historique des valeurs d'un document : ce qui a changé, quand, et par qui ; une valeur est en vigueur, remplacée par une autre, ou retirée. */
function MetadataHistoryDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
    const { metadata, epoch } = useSession();
    const historyQ = useResource<MetadataHistoryPage>(s => metadata!.history(documentId, undefined, s), 'document-metadata-history:' + documentId + ':' + epoch);
    const items = historyQ.data?.items ?? [];
    return <Modal title="Historique des métadonnées" subtitle="Les valeurs en vigueur, remplacées ou retirées, des plus récentes aux plus anciennes" onClose={onClose} wide>
        {historyQ.loading ? <Busy /> : historyQ.error ? <ErrorNotice error={historyQ.error} onRetry={historyQ.refresh}/> : items.length
            ? <div className="table-scroll"><table><thead><tr><th>Entrée en vigueur</th><th>Champ</th><th>Valeur</th><th>État</th><th>Saisie par</th></tr></thead><tbody>{items.map((h, i) => <tr key={h.fieldCode + ':' + h.order + ':' + h.valueVersion + ':' + i}>
                <td>{formatDate(h.validFrom)}</td>
                <td>{h.fieldName}{h.order > 0 ? ' · occurrence ' + (h.order + 1) : ''}<small className="cell-sub">{h.schemaCode} v{h.schemaVersion}</small></td>
                <td>{valueText(h)}{h.type === 'TERME' && h.termObsolete ? <small> (terme obsolète)</small> : null}</td>
                <td>{h.validTo === null ? 'En vigueur' : h.superseded ? 'Remplacée le ' + formatDate(h.validTo) : 'Retirée le ' + formatDate(h.validTo)}</td>
                <td>{h.enteredById ? <EntityName kind="users" id={h.enteredById} fallback="Personne non disponible"/> : '—'}</td></tr>)}</tbody></table></div>
            : <Empty title="Aucun historique" description="Aucune valeur n’a encore été enregistrée pour ce document."/>}
        {historyQ.data?.hasMore && <Notice>L’historique est plus long que la page affichée : les modifications les plus anciennes ne sont pas montrées.</Notice>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}
