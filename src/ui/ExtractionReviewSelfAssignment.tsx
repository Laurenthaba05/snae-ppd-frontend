import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { activeGrant, can, platform } from '../core/policy';
import { assignmentCommand } from '../core/commands';
import type { Me } from '../core/types';
import { CommandDialog } from './CommandDialog';
import { Field, Notice } from './components';

export function extractionReviewSelfOption(me: Me | null, userId: string) {
    const option = me?.extractionReviewSelfAssignment;
    if (!option || me?.user.id !== userId || !platform(me) || option.roleCode !== 'RELECTEUR_EXTRACTION'
        || !can(me, 'IAM_ASSIGNMENT_MANAGE', { institutionId: option.institutionId })) return null;
    if (me.grants.some(g => g.roleId === option.roleId && g.scope === 'INSTITUTION' && g.institutionId === option.institutionId
        && g.delegationId === null && activeGrant(g))) return null;
    return option;
}

export function ExtractionReviewSelfAssignmentDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const { me } = useSession();
    const option = extractionReviewSelfOption(me, me?.user.id ?? '');
    const [start, setStart] = useState(''), [end, setEnd] = useState(''), [reason, setReason] = useState('');
    if (!option) return <Notice>Cette auto-attribution n’est pas disponible. Revérifiez vos droits.</Notice>;
    return <CommandDialog title="M’attribuer le rôle de relecture"
        description={option.roleName + ' — ' + option.institutionName + ' — ' + (me!.user.email ?? me!.user.nom ?? '')}
        path="/role-assignments" label="Confirmer mon attribution" onClose={onClose} onSuccess={onSuccess}
        build={() => assignmentCommand(me!.user.id, { roleId: option.roleId, scope: 'INSTITUTION', institutionId: option.institutionId,
            departmentId: '', dateDebut: start, dateFin: end, motif: reason })}>
        <Notice>Cette autorisation concerne uniquement ce rôle et cette institution. Le motif sera conservé dans le journal.</Notice>
        <div><strong>{option.roleName}</strong><p>{option.institutionName}</p><p>{me!.user.email}</p>
            <ul><li>Examiner, accepter ou rejeter les résultats d’extraction : ACQUISITION_REVIEW.</li></ul>
            <p>Les droits de lecture des fichiers, de modification des notices et d’enregistrement du texte OCR restent contrôlés séparément.</p></div>
        <Field label="Début" hint="Vide : attribution immédiate."><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Fin" hint="Vide : sans date de fin."><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field>
        <Field label="Motif de mon attribution *" wide><textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
    </CommandDialog>;
}
