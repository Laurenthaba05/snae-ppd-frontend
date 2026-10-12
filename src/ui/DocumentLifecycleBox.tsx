import React from 'react';
import { currentStep, lifecycleSteps, type StepAction, type StepState } from '../core/lifecycle';
import type { DocumentLifecycle } from '../core/types';
import { Icon } from './icons';

const MARK: Record<StepState, { icon: string; color: string; word: string }> = {
    DONE: { icon: 'check', color: '#1d6b4a', word: 'Fait' },
    TODO: { icon: 'arrow', color: '#a6823c', word: 'À faire' },
    BLOCKED: { icon: 'alert', color: '#b3402a', word: 'Bloqué' },
    WAITING: { icon: 'clock', color: '#7a8795', word: 'En attente' }
};

/**
 * Le chemin du document, de « brouillon » à son échéance de conservation : chaque étape dit où l'on en est, ce qui manque et propose l'action qui permet d'avancer.
 * `can` : les actions que la personne a le droit de faire (le serveur revérifie tout).
 */
export function DocumentLifecycleBox({ lifecycle, can, onAction, busy = false }: { lifecycle: DocumentLifecycle; can: Partial<Record<StepAction, boolean>>; onAction: (action: StepAction) => void; busy?: boolean }) {
    const steps = lifecycleSteps(lifecycle);
    const now = currentStep(steps);
    return <div className="lifecycle" role="region" aria-label="Du brouillon à la conservation">
        <div className="section-heading"><h4>Du brouillon à la conservation</h4>{now ? <span className="wf-note">Prochaine étape : <strong>{now.title}</strong></span> : <span className="wf-note">Toutes les étapes sont faites.</span>}</div>
        <ol className="lifecycle-steps" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 10 }}>
            {steps.map(step => {
                const mark = MARK[step.state];
                const actions = step.actions.filter(a => can[a.kind] !== false);
                return <li key={step.key} className={'lifecycle-step ' + step.state.toLowerCase()} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #e1e7ee', borderLeft: `4px solid ${mark.color}`, borderRadius: 8, background: step === now ? '#fffaee' : '#fff' }}>
                    <span style={{ color: mark.color, flex: 'none', marginTop: 2 }} aria-hidden="true"><Icon name={mark.icon} size={18} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{step.title}</strong> <small className="cell-sub" style={{ display: 'inline', marginLeft: 6 }}>{mark.word}</small>
                        <p style={{ margin: '4px 0 0' }}>{step.text}</p>
                        {actions.length > 0 && <div className="table-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                            {actions.map(a => <button key={a.kind + a.label} type="button" className={'btn small ' + (step.state === 'TODO' ? 'primary' : 'secondary')} disabled={busy} onClick={() => onAction(a.kind)}>{a.label}</button>)}
                        </div>}
                    </div>
                </li>;
            })}
        </ol>
    </div>;
}
