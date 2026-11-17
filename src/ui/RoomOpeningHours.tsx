import React, { useEffect, useState } from 'react';
import type { RoomOpening } from '../core/readingRoom';
import { Field } from './components';

export const WEEK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const defaultRoomOpening = (): RoomOpening[] => [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, opensAt: '08:00', closesAt: '17:00' }));
export function openingProblems(value: RoomOpening[]): string[] {
    if (value.some(row => !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(row.opensAt) || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(row.closesAt) || row.opensAt >= row.closesAt))
        return ['Pour chaque jour ouvert, indiquez une heure d’ouverture antérieure à la fermeture.'];
    return [];
}
export function useRoomClockTick(): number {
    const [tick, setTick] = useState(0);
    useEffect(() => { const timer = window.setInterval(() => setTick(n => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
    return tick;
}
export function RoomOpeningSummary({ value }: { value: RoomOpening[] | undefined }) {
    if (!value?.length) return <span>Horaires à configurer : réservations et arrivées bloquées.</span>;
    return <span>{value.map(row => `${WEEK_DAYS[row.dayOfWeek - 1]} ${row.opensAt}–${row.closesAt}`).join(' · ')} (heure de Conakry)</span>;
}
export function RoomOpeningEditor({ value, onChange, disabled }: { value: RoomOpening[]; onChange: (value: RoomOpening[]) => void; disabled: boolean }) {
    const update = (day: number, change: Partial<RoomOpening>) => onChange(value.map(row => row.dayOfWeek === day ? { ...row, ...change } : row));
    return <fieldset disabled={disabled}><legend>Jours et heures d’ouverture</legend>
        <p>Heure de Conakry. Les jours décochés sont fermés. La fermeture est exclue des heures d’arrivée.</p>
        {WEEK_DAYS.map((name, index) => {
            const day = index + 1;
            const row = value.find(item => item.dayOfWeek === day);
            return <div className="form-grid" key={day}>
                <label><input type="checkbox" checked={!!row} onChange={event => onChange(event.target.checked
                    ? [...value, { dayOfWeek: day, opensAt: '08:00', closesAt: '17:00' }].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                    : value.filter(item => item.dayOfWeek !== day))} /> {name} ouvert</label>
                {row && <><Field label={`Ouverture ${name.toLowerCase()}`}><input type="time" step="60" value={row.opensAt} onChange={event => update(day, { opensAt: event.target.value })} /></Field>
                    <Field label={`Fermeture ${name.toLowerCase()}`}><input type="time" step="60" value={row.closesAt} onChange={event => update(day, { closesAt: event.target.value })} /></Field></>}
            </div>;
        })}
    </fieldset>;
}
