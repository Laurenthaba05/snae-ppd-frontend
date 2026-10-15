import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { metadataDraft, metadataPayload, type MetadataDraft } from '../core/metadataEditor';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, Notice, useResource, Modal, Field, Badge } from '../ui/components';
import type { MetadataSchema, MetadataField, MetadataValueType, MetadataValue, MetadataFieldDefinition, MetadataBinding, DocumentType } from '../core/types';
import { EntityName } from '../ui/names';
import { label } from '../core/format';
import { IntentKey } from '../core/validation';

const valueTypes: MetadataValueType[] = ['TEXTE', 'TEXTE_LONG', 'ENTIER', 'DECIMAL', 'BOOLEEN', 'DATE', 'DATETIME', 'UUID', 'ENUM'];

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

function AddFieldDialog({ schemaId, onClose, onCreated }: {
    schemaId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { metadata } = useSession();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [type, setType] = useState<MetadataValueType>('TEXTE');
    const [required, setRequired] = useState(false);
    const [allowedValues, setAllowedValues] = useState('');
    const [repeatable, setRepeatable] = useState(false);
    const extra = useOptionalFields('metadataField');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const options = [...new Set(allowedValues.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
            if (type === 'ENUM' && !options.length) throw new Error('Renseignez au moins une valeur autorisée.');
            const additional = extra.payload();
            const configuration = type === 'ENUM' ? {...(additional.configuration as Record<string,unknown> ?? {}), allowedValues: options} : additional.configuration;

            await metadata!.command(`/admin/metadata-schemas/${schemaId}/fields`, { ...additional, configuration, code: code.trim(), name: name.trim(), type, required, repeatable }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Ajouter un champ" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Code" hint="Identifiant technique"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
                <Field label="Nom" wide><input value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Type"><select value={type} onChange={e => setType(e.target.value as MetadataValueType)} disabled={busy}>{valueTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
                {type === 'ENUM' && <Field label="Valeurs autorisées" hint="Une valeur par ligne." wide><textarea value={allowedValues} onChange={e => setAllowedValues(e.target.value)} required disabled={busy}/></Field>}
                <Field label="Obligatoire ?"><select value={required ? 'oui' : 'non'} onChange={e => setRequired(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
                <Field label="Répétable ?"><select value={repeatable ? 'oui' : 'non'} onChange={e => setRepeatable(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
        </form>
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

export function SchemaDetailDialog({ schema, canManage, onClose, onChanged }: {
    schema: MetadataSchema;
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const { metadata, records, epoch } = useSession();
    const [addingField, setAddingField] = useState(false);
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
    return <Modal title={schema.name} subtitle={schema.code + ' · v' + schema.version} onClose={onClose} locked={busy} wide><ResourceDetailsButton resource="metadataSchema" id={schema.id} title={schema.name} />
        <div className="form-grid">
            {canManage && schema.status === 'BROUILLON' && <div className="table-actions"><button className="btn small secondary" onClick={() => setAddingField(true)}>Ajouter un champ</button><button className="btn small secondary" onClick={() => setBinding(true)}>Lier à un type de document</button><button className="btn small warning" disabled={busy || fieldsQ.loading || bindingsQ.loading || !!fieldsQ.error || !!bindingsQ.error || !fieldsQ.data?.length || !bindingsQ.data?.length} onClick={activate}>Activer le schéma</button></div>}
            <div>
                <h4>Champs</h4>
                {fieldsQ.loading ? <Busy /> : fieldsQ.error ? <ErrorNotice error={fieldsQ.error} onRetry={fieldsQ.refresh}/> : fieldsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Obligatoire</th><th>Répétable</th><th>Ordre</th><th>Description et contraintes</th></tr></thead><tbody>{fieldsQ.data.map(f => <tr key={f.id}><td>{f.code}</td><td>{f.name}</td><td>{label('metadataType', f.type)}</td><td>{f.required ? 'Oui' : 'Non'}</td><td>{f.repeatable ? 'Oui' : 'Non'}</td><td>{f.order ?? '—'}</td><td><p>{f.description || 'Aucune description'}</p>{f.vocabulary && <p>Vocabulaire : {f.vocabulary}</p>}{f.configuration && typeof f.configuration === 'object' && Object.keys(f.configuration).length > 0 && <details><summary>Contraintes de {f.name}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(f.configuration, null, 2)}</pre></details>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun champ" description="Ajoutez le premier champ de ce schéma."/>}
            </div>
            <div className="span2"><h4>Types de documents liés</h4>
                {bindingsQ.loading ? <Busy/> : bindingsQ.error ? <ErrorNotice error={bindingsQ.error} onRetry={bindingsQ.refresh}/> : bindingsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Type de document</th><th>Schéma obligatoire</th><th>Début de validité</th><th>Fin de validité</th></tr></thead><tbody>{bindingsQ.data.map(binding => <tr key={binding.typeDocumentId}><td>{typesQ.data?.find(type => type.id === binding.typeDocumentId)?.label ?? binding.typeDocumentId}</td><td>{binding.required ? 'Oui' : 'Non'}</td><td>{binding.from}</td><td>{binding.to ?? 'Sans date de fin'}</td></tr>)}</tbody></table></div> : <Notice>Ce schéma n’est lié à aucun type de document.</Notice>}
                {typesQ.error ? <ErrorNotice error={typesQ.error} onRetry={typesQ.refresh}/> : null}
            </div>
            {error ? <ErrorNotice error={error}/> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {addingField && <AddFieldDialog schemaId={schema.id} onClose={() => setAddingField(false)} onCreated={fieldsQ.refresh}/>}
        {binding && <BindSchemaDialog schemaId={schema.id} onClose={() => setBinding(false)} onCreated={bindingsQ.refresh}/>}
    </Modal>;
}

export function MetadataPage() {
    const { me, metadata, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManage = can(me, 'METADATA_SCHEMA_MANAGE', scope);
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const schemasQ = useResource<MetadataSchema[]>(s => metadata!.schemas(scope.institutionId, s), 'metadata-schemas:' + scope.institutionId + ':' + epoch);
    const schemas = schemasQ.data ?? [];
    const selected = schemas.find(s => s.id === selectedId) ?? null;
    return <><PageHead eyebrow="MODULE · MÉTADONNÉES" title="Schémas de métadonnées" description="Définir les champs de description documentaire et leur rattachement aux types de documents.">
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer un schéma</button>}
    </PageHead>
        <div className="panel">
            <div className="section-heading"><h3>Schémas</h3></div>
            {schemasQ.loading ? <Busy /> : schemasQ.error ? <ErrorNotice error={schemasQ.error} onRetry={schemasQ.refresh}/> : schemas.length ? <div className="table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Version</th><th>Statut</th></tr></thead><tbody>{schemas.map(s => <tr key={s.id}><td><button className="record-name" onClick={() => setSelectedId(s.id)}><strong>{s.code}</strong></button></td><td>{s.name}</td><td>{s.version}</td><td><Badge value={s.status}/></td></tr>)}</tbody></table></div> : <Empty title="Aucun schéma de métadonnées" description="Créez le premier schéma."/>}
        </div>
        {creating && <CreateSchemaDialog onClose={() => setCreating(false)} onCreated={schemasQ.refresh}/>}
        {selected && <SchemaDetailDialog schema={selected} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={schemasQ.refresh}/>}
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

function FieldInput({ field, value, onChange, disabled }: {
    field: MetadataFieldDefinition;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    switch (field.type) {
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
                    {(values[field.fieldCode] ?? []).map((row,index) => <Field key={row.order} label={field.fieldName + (field.repeatable ? ' · occurrence ' + (index + 1) : '') + (field.required && field.schemaRequired ? ' *' : '')} hint={[field.description, field.vocabulary ? 'Vocabulaire : ' + field.vocabulary : null].filter(Boolean).join(' · ') || undefined}>
                        <FieldInput field={field} value={row.raw} onChange={raw => setValues(prev => ({...prev,[field.fieldCode]:(prev[field.fieldCode] ?? []).map(item => item.order === row.order ? {...item,raw} : item)}))} disabled={busy}/>
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
    const valuesQ = useResource<MetadataValue[]>(s => metadata!.documentMetadata(documentId, s), 'document-metadata:' + documentId + epoch);
    const fieldsQ = useResource<MetadataFieldDefinition[]>(s => metadata!.applicableFields(documentId, s), 'document-metadata-fields:' + documentId + epoch);
    const values = valuesQ.data ?? [];
    return <section className="panel">
        <div className="section-heading"><h3>Métadonnées</h3>{canWrite && <button className="btn small secondary" disabled={valuesQ.loading || fieldsQ.loading || !!valuesQ.error || !!fieldsQ.error} onClick={() => setEditing(true)}>Modifier les métadonnées</button>}</div>
        {valuesQ.loading ? <Busy /> : valuesQ.error ? <ErrorNotice error={valuesQ.error} onRetry={valuesQ.refresh}/> : values.length ? <div className="table-scroll"><table><thead><tr><th>Schéma</th><th>Champ</th><th>Valeur</th></tr></thead><tbody>{values.map((v, i) => <tr key={v.fieldCode + ':' + v.order + ':' + i}><td>{v.schemaCode} v{v.schemaVersion}</td><td>{v.fieldName}</td><td>{typeof v.value === 'string' ? v.value : JSON.stringify(v.value)}</td></tr>)}</tbody></table></div> : <Empty title="Aucune métadonnée renseignée" description="Aucun schéma de métadonnées n’a encore été appliqué à ce document."/>}
        {fieldsQ.error ? <ErrorNotice error={fieldsQ.error} onRetry={fieldsQ.refresh}/> : null}
        {editing && <EditMetadataDialog documentId={documentId} fields={fieldsQ.data ?? []} currentValues={values} onClose={() => setEditing(false)} onSaved={() => { valuesQ.refresh(); fieldsQ.refresh(); }}/>}
    </section>;
}
