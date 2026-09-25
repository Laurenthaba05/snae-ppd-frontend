import React, { useState } from 'react';
import { Field } from '../ui/components';
import { CommandDialog } from '../ui/CommandDialog';
import { ReferencePicker } from '../ui/ReferencePicker';
import { text } from '../core/validation';
import { assignmentCommand, type Draft } from '../core/commands';
import type { Catalog, RecordEntity, User } from '../core/types';
export function StatusDialog({ kind, entity, onClose, onSuccess, tokens = false }: {
    kind: Catalog;
    entity: RecordEntity;
    onClose: () => void;
    onSuccess: () => void;
    tokens?: boolean;
}) {
    const [status, setStatus] = useState(entity.status === 'ACTIF' ? 'SUSPENDU' : 'ACTIF');
    const [reason, setReason] = useState('');
    return <CommandDialog title={tokens ? 'Révoquer les anciens tokens' : 'Modifier le statut'} description={tokens ? 'Les anciens tokens seront refusés après le seuil enregistré par le serveur.' : 'L’archivage est terminal. Une suspension peut être levée par une autorité habilitée.'} path={`/${kind}/${entity.id}/${tokens ? 'revoke-tokens' : 'status'}`} build={() => ({ expectedVersion: entity.version, ...(tokens ? {} : { status }), reason: text(reason, 2000) })} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }} danger label="Confirmer la décision">{!tokens && <Field label="Nouveau statut"><select value={status} onChange={e => setStatus(e.target.value)}>{['ACTIF', 'INACTIF', 'SUSPENDU', 'ARCHIVE'].filter(s => s !== entity.status).map(s => <option key={s}>{s}</option>)}</select></Field>}<Field label="Motif *" wide><textarea required value={reason} onChange={e => setReason(e.target.value)} maxLength={2000}/></Field></CommandDialog>;
}
export function AssignmentDialog({ user, onClose, onSuccess }: {
    user: User;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [d, setD] = useState<Draft>({ roleId: '', scope: user.scope === 'NATIONAL' ? 'NATIONAL' : user.scope === 'DEPARTEMENT' ? 'DEPARTEMENT' : 'INSTITUTION', institutionId: user.institutionId ?? '', departmentId: user.departmentId ?? '', dateDebut: '', dateFin: '', motif: '' });
    const upd = (k: string, v: string) => setD(x => ({ ...x, [k]: v, ...(k === 'scope' && v === 'NATIONAL' ? { institutionId: '', departmentId: '' } : {}), ...(k === 'scope' && v === 'INSTITUTION' ? { departmentId: '' } : {}) }));
    return <CommandDialog title="Attribuer un rôle" description="Le serveur vérifie le périmètre, les périodes, les doublons et l’absence d’élévation de privilèges." path="/role-assignments" build={() => assignmentCommand(user.id, d)} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }}>
 <Field label="Rôle *" wide><ReferencePicker kind="roles" label="Sélectionner un rôle" value={d.roleId!} onChange={v => upd('roleId', v)}/></Field><Field label="Portée de l’attribution"><select value={d.scope} onChange={e => upd('scope', e.target.value)}>{user.scope === 'NATIONAL' && <option>NATIONAL</option>}{user.scope !== 'DEPARTEMENT' && <option>INSTITUTION</option>}<option>DEPARTEMENT</option></select></Field>
 {d.scope !== 'NATIONAL' && <Field label="Institution *"><ReferencePicker kind="institutions" label="Sélectionner une institution" value={d.institutionId!} scope={user.institutionId ? { institutionId: user.institutionId } : {}} onChange={v => { upd('institutionId', v); upd('departmentId', ''); }}/></Field>}{d.scope === 'DEPARTEMENT' && <Field label="Département *"><ReferencePicker kind="departments" label="Sélectionner un département" value={d.departmentId!} scope={{ institutionId: d.institutionId, departmentId: user.departmentId }} onChange={v => upd('departmentId', v)}/></Field>}
 <Field label="Début" hint="Vide : heure du serveur. Saisie dans votre fuseau, envoyée en UTC."><input type="datetime-local" value={d.dateDebut} onChange={e => upd('dateDebut', e.target.value)}/></Field><Field label="Fin" hint="Vide : attribution permanente, si votre autorité le permet."><input type="datetime-local" value={d.dateFin} onChange={e => upd('dateFin', e.target.value)}/></Field><Field label="Motif *" wide><textarea value={d.motif} onChange={e => upd('motif', e.target.value)} required maxLength={2000}/></Field>
 </CommandDialog>;
}
export function RevokeDialog({ path, version, onClose, onSuccess }: {
    path: string;
    version: number;
    onClose: () => void;
    onSuccess: () => void;
}) { const [reason, setReason] = useState(''); return <CommandDialog title="Révoquer cette habilitation" description="La décision reste conservée dans l’historique. Les droits seront revérifiés par le backend." path={path} build={() => ({ expectedVersion: version, reason: text(reason, 2000) })} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }} danger><Field label="Motif de révocation *" wide><textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)}/></Field></CommandDialog>; }
