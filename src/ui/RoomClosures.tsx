import React from 'react';
import type { RoomClosure } from '../core/readingRoom';
import { formatDay } from '../core/format';
import { Field } from './components';

export const closureLabel = (row: RoomClosure): string => `${row.kind === 'FERIE' ? 'Jour férié' : 'Fermeture exceptionnelle'} : ${row.reason} — ${row.startsOn === row.endsOn ? formatDay(row.startsOn) : `du ${formatDay(row.startsOn)} au ${formatDay(row.endsOn)} inclus`}`;
const validDate = (value: string): boolean => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && value.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function closureProblems(value: RoomClosure[]): string[] {
    if (value.length > 200) return ['Limitez le calendrier à 200 périodes.'];
    if (value.some(row => !validDate(row.startsOn) || !validDate(row.endsOn) || row.startsOn > row.endsOn || !['FERIE', 'EXCEPTIONNELLE'].includes(row.kind) || row.reason.trim().length < 3 || row.reason.trim().length > 200))
        return ['Pour chaque fermeture, indiquez des dates valides (fin au moins égale au début), un type et un motif de 3 à 200 caractères.'];
    const sorted = [...value].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    if (sorted.some((row, index) => { const previous = sorted[index - 1]; return previous !== undefined && row.startsOn <= previous.endsOn; })) return ['Les périodes de fermeture ne doivent pas se chevaucher.'];
    return [];
}
export function RoomClosureList({ value }: { value: RoomClosure[] | undefined }) {
    if (!value?.length) return <small>Aucun jour férié ni fermeture exceptionnelle configuré.</small>;
    return <details><summary>Jours fériés et fermetures exceptionnelles ({value.length})</summary><ul>{value.map((row, index) => <li key={index}>{closureLabel(row)}</li>)}</ul></details>;
}
export function RoomClosureEditor({ value, onChange, disabled }: { value: RoomClosure[]; onChange: (value: RoomClosure[]) => void; disabled: boolean }) {
    const update = (index: number, changes: Partial<RoomClosure>) => onChange(value.map((row, i) => i === index ? { ...row, ...changes } : row));
    return <fieldset disabled={disabled}><legend>Jours fériés et fermetures exceptionnelles</legend>
        <p>Les dates de début et de fin sont incluses, en heure de Conakry. Ces fermetures bloquent tous les créneaux et les arrivées, même avec une réservation. Saisissez les dates validées par la direction pour chaque année.</p>
        <p>Les réservations existantes sont conservées : une alerte par e-mail est programmée pour chaque réservation concernée. Suivez son état dans l’accueil et complétez les coordonnées manquantes. L’envoi nécessite un serveur de courrier activé. Annulez les réservations concernées depuis l’accueil. Les départs et restitutions restent possibles.</p>
        {value.map((row, index) => <fieldset key={index}><legend>Fermeture {index + 1}</legend><div className="form-grid">
            <Field label={`Type de fermeture ${index + 1}`}><select value={row.kind} onChange={e => update(index, { kind: e.target.value as RoomClosure['kind'] })}><option value="FERIE">Jour férié</option><option value="EXCEPTIONNELLE">Fermeture exceptionnelle</option></select></Field>
            <Field label={`Début de fermeture ${index + 1}`}><input type="date" value={row.startsOn} onChange={e => update(index, { startsOn: e.target.value, endsOn: row.endsOn || e.target.value })} /></Field>
            <Field label={`Fin de fermeture ${index + 1}`}><input type="date" value={row.endsOn} onChange={e => update(index, { endsOn: e.target.value })} /></Field>
            <Field label={`Motif de fermeture ${index + 1}`} wide><input value={row.reason} maxLength={200} onChange={e => update(index, { reason: e.target.value })} /></Field>
        </div><button type="button" className="btn small secondary" onClick={() => onChange(value.filter((_, i) => i !== index))}>Retirer la fermeture {index + 1}</button></fieldset>)}
        <button type="button" className="btn small secondary" disabled={value.length >= 200} onClick={() => onChange([...value, { startsOn: '', endsOn: '', kind: 'EXCEPTIONNELLE', reason: '' }])}>Ajouter une fermeture</button>
    </fieldset>;
}
