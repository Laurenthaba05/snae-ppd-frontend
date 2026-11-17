import React from 'react';
import type { EadChange } from '../api/archives';
import { NATURE_LABELS, TARGET_LABELS } from '../core/archivalFunctions';
const fields: Record<string, string> = { functionId: 'Fonction source', targetKind: 'Type de cible', targetId: 'Cible', nature: 'Nature du lien', dateStart: 'Date de début', dateEnd: 'Date de fin', description: 'Commentaire' };
const values: Record<string, string> = { ...NATURE_LABELS, ...TARGET_LABELS };
export function FunctionLinkImportDifferences({ changes }: { changes: EadChange[] }) {
    const display = (change: EadChange, value: string | null) => value == null || value === '' ? 'Non renseigné' : ['nature', 'targetKind'].includes(change.field) ? values[value] ?? value : value;
    return <dl aria-label="Différences avant confirmation">{changes.map(change => <React.Fragment key={change.field}>
        <dt><strong>{fields[change.field] ?? change.field}</strong></dt><dd style={{ whiteSpace: 'pre-wrap' }}>Avant : {display(change, change.before)}<br />Après : {display(change, change.after)}</dd>
    </React.Fragment>)}</dl>;
}
