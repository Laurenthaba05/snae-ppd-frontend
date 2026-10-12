import React from 'react';
import { OTHER_BLOCKERS, blockerText, ruleSentence } from '../core/retentionPlanning';
import { dayText } from '../core/placement';
import type { RetentionPlanning } from '../core/types';
import { Icon } from './icons';

/**
 * Pourquoi un document n'a pas (encore) d'échéance de conservation : trois conditions se lisent d'un coup d'œil — le document est clos, une règle active s'applique à lui,
 * la date de départ du délai existe — avec ce qui manque, en toutes lettres.
 */
export function RetentionPlanningBox({ planning, onDeclareEvent }: { planning: RetentionPlanning; onDeclareEvent?: () => void }) {
    const has = (code: string) => planning.blockers.includes(code);
    const rule = planning.rule;
    const eventWaiting = has('EVENT_NOT_DECLARED');
    const dateBlocked = has('BASE_DATE_MISSING') || has('BASE_DATE_FUTURE') || eventWaiting;
    const rows: Array<{ ok: boolean; key: string; content: React.ReactNode }> = [
        { ok: planning.documentClosed, key: 'closed', content: planning.documentClosed ? 'Le document est clos.' : blockerText('DOCUMENT_NOT_CLOSED') },
        { ok: Boolean(rule), key: 'rule', content: rule
            ? <>Règle applicable : <strong>{rule.code}</strong> — {rule.label} (version {rule.versionNumber}) : {ruleSentence(rule)}.</>
            : blockerText(has('RULES_AMBIGUOUS') ? 'RULES_AMBIGUOUS' : 'NO_APPLICABLE_RULE') }
    ];
    if (rule) rows.push({ ok: !dateBlocked && Boolean(planning.baseDate), key: 'date', content: dateBlocked
        ? blockerText(eventWaiting ? 'EVENT_NOT_DECLARED' : has('BASE_DATE_MISSING') ? 'BASE_DATE_MISSING' : 'BASE_DATE_FUTURE', rule)
        : planning.baseDate ? <>Le délai part du {dayText(planning.baseDate)} ; l’échéance serait le <strong>{dayText(planning.dueDate)}</strong>.{planning.intermediatePhaseDate && <> Le document passerait en archives intermédiaires le <strong>{dayText(planning.intermediatePhaseDate)}</strong>.</>}</> : 'La date de départ du délai n’est pas connue.' });
    for (const code of OTHER_BLOCKERS) if (has(code)) rows.push({ ok: false, key: code, content: blockerText(code) });
    return <div className="retention-planning" role="status" aria-label="Situation de la conservation">
        <p><strong>Aucune échéance n’est encore planifiée pour ce document.</strong> Une échéance se crée quand le document est clos et qu’une règle active s’applique à lui.</p>
        <ul className="retention-checks" style={{ listStyle: 'none', margin: '8px 0', padding: 0, display: 'grid', gap: 6 }}>
            {rows.map(row => <li key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: row.ok ? '#1d6b4a' : '#b3402a', flex: 'none' }}><Icon name={row.ok ? 'check' : 'alert'} size={16} /></span><span>{row.content}</span></li>)}
        </ul>
        {eventWaiting && onDeclareEvent && <p><button type="button" className="btn small secondary" onClick={onDeclareEvent}>Constater l’événement</button></p>}
        {planning.blockers.length === 0 && <p className="wf-note">Tout est prêt : vous pouvez planifier la conservation.</p>}
    </div>;
}
