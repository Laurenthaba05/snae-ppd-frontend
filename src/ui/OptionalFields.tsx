import React, { useState } from 'react';
import { Field } from './components';
import { ReferencePicker } from './ReferencePicker';
import { optionalFieldGroups, optionalPayload } from '../core/optionalFields';
/** Les champs facultatifs d'un formulaire ; `initial` préremplit les valeurs (formulaire de modification). */
export function useOptionalFields(group: string, initial?: Record<string,string>) {
 const [values,setValues] = useState<Record<string,string>>(initial ?? {});
 const fields = optionalFieldGroups[group];
 if (!fields) throw new Error('Formulaire inconnu : ' + group);
 return { fields, values, setValues, payload: () => optionalPayload(fields,values), reset: () => setValues({}) };
}
export function OptionalFields({form,disabled}: {form: ReturnType<typeof useOptionalFields>; disabled: boolean}) {
 return <>{form.fields.map(f => <Field key={f.name} label={f.label} hint={f.hint ?? 'Facultatif'} wide={f.type === 'json' || f.type === 'textarea'}>
 {f.type === 'institution' || f.type === 'user' ? <ReferencePicker kind={f.type === 'institution' ? 'institutions' : 'users'} label={'Sélectionner : ' + f.label} value={form.values[f.name] ?? ''} onChange={v => form.setValues(prev => ({...prev,[f.name]:v}))} nullable disabled={disabled}/>
 : f.type === 'json' || f.type === 'textarea' ? <textarea aria-label={f.label} value={form.values[f.name] ?? ''} onChange={e => form.setValues(prev => ({...prev,[f.name]:e.target.value}))} disabled={disabled} rows={3} maxLength={f.maxLength}/>
 : <input aria-label={f.label} type={f.type === 'uuid' ? 'text' : f.type === 'integer' ? 'number' : f.type} step={f.type === 'integer' ? 1 : f.type === 'number' ? 'any' : f.type === 'datetime-local' ? '0.001' : undefined} min={f.min} max={f.max} maxLength={f.maxLength} value={form.values[f.name] ?? ''} onChange={e => form.setValues(prev => ({...prev,[f.name]:e.target.value}))} disabled={disabled}/>}</Field>)}</>;
}
