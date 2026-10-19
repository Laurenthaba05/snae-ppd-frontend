import type { MetadataValue, MetadataFieldDefinition, Json } from './types.js';
/** `label` et `obsolete` : pour un terme de vocabulaire, son libellé et son état (la valeur est l'identifiant du terme). */
export interface MetadataOccurrence { order: number; raw: string; initial: string; original?: Json; label?: string | null; obsolete?: boolean | null }
export type MetadataDraft = Record<string, MetadataOccurrence[]>;
export function metadataDraft(fields: MetadataFieldDefinition[], current: MetadataValue[]): MetadataDraft {
 return Object.fromEntries(fields.map(f => {
  const rows = current.filter(v => v.fieldCode.toUpperCase() === f.fieldCode.toUpperCase()).sort((a,b) => a.order-b.order).map(v => {
   let raw = f.type === 'BOOLEEN' ? (v.value === true ? 'oui' : 'non') : String(v.value);
   if (f.type === 'DATETIME' && typeof v.value === 'string') {
    const date = new Date(v.value);
    if (Number.isFinite(date.getTime())) raw = new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,-1);
   }
   return {order:v.order,raw,initial:raw,original:v.value,...(v.label != null ? {label:v.label,obsolete:v.termObsolete} : {})};
  });
  return [f.fieldCode, rows.length ? rows : [{order:0,raw:'',initial:''}]];
 }));
}
export function metadataPayload(fields: MetadataFieldDefinition[], current: MetadataValue[], draft: MetadataDraft) {
 const codes = new Set(fields.map(f=>f.fieldCode.toUpperCase()));
 // Keep values outside the editable definition set in a full replacement request.
 const payload: {fieldCode:string;value:Json;order:number}[] = current.filter(v=>!codes.has(v.fieldCode.toUpperCase())).map(v=>({fieldCode:v.fieldCode,value:v.value,order:v.order}));
 for (const f of fields) for (const row of draft[f.fieldCode] ?? []) {
  const raw = row.raw.trim();
  if (!raw) continue;
  let value: Json = raw;
  if (row.raw === row.initial && row.original !== undefined) value = row.original;
  else if (f.type === 'ENTIER' || f.type === 'DECIMAL') {
   const n = Number(raw);
   if (!Number.isFinite(n) || (f.type === 'ENTIER' && !Number.isSafeInteger(n))) throw new Error(f.fieldName + ' : nombre invalide.');
   value = n;
  } else if (f.type === 'BOOLEEN') value = raw === 'oui';
  else if (f.type === 'DATETIME') { const date=new Date(raw); if (!Number.isFinite(date.getTime())) throw new Error(f.fieldName + ' : date invalide.'); value=date.toISOString(); }
  payload.push({fieldCode:f.fieldCode,value,order:row.order});
 }
 return payload;
}
