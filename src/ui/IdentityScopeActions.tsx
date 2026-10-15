import React, { useState } from 'react';
import type { Assignment, Me, User } from '../core/types';
import { can, platform } from '../core/policy';
import { period, scopeCheck, text, utc, uuid } from '../core/validation';
import { useSession } from '../auth/session';
import { CommandDialog } from './CommandDialog';
import { Field, Notice } from './components';
import { ReferencePicker } from './ReferencePicker';
import { EntityName } from './names';

export function mayDelegate(me: Me | null, source: Assignment): boolean {
    return !!me && source.userId === me.user.id && source.status === 'ACTIF'
        && (!source.endsAt || Date.parse(source.endsAt) > Date.now())
        && can(me, 'IAM_DELEGATION_MANAGE', source)
        && !me.grants.some(g => g.roleId === source.roleId && g.permission.startsWith('IAM_'));
}
export function UserScopeDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
    const { me } = useSession();
    const [scope, setScope] = useState(user.scope);
    const [institutionId, setInstitution] = useState(user.institutionId ?? '');
    const [departmentId, setDepartment] = useState(user.departmentId ?? '');
    const [reason, setReason] = useState('');
    if (!platform(me) || user.id === me!.user.id || user.status === 'ARCHIVE') return <Notice>Rattachement réservé à une autre autorité centrale.</Notice>;
    const build = () => {
        const institution = institutionId ? uuid(institutionId) : null, department = departmentId ? uuid(departmentId) : null;
        scopeCheck(scope, institution, department, user.accountType);
        if (!Number.isSafeInteger(user.version) || user.version < 0) throw new Error('Relisez la version du compte.');
        return { expectedVersion: user.version, scope, institutionId: institution, departmentId: department, reason: text(reason, 2000) };
    };
    return <CommandDialog title="Changer le rattachement" description="Les attributions et délégations non échues doivent être révoquées au préalable. Le changement révoque les anciens tokens."
        path={'/users/' + uuid(user.id) + '/scope'} build={build} onClose={onClose} onSuccess={() => { onDone(); onClose(); }} danger label="Confirmer le rattachement">
        <Field label="Portée du compte"><select value={scope} onChange={e => { const next = e.target.value as User['scope']; setScope(next);
            if (next === 'NATIONAL') { setInstitution(''); setDepartment(''); } else if (next === 'INSTITUTION') setDepartment('');
        }}>{user.accountType === 'SERVICE' ? <option>SERVICE</option> : <><option>NATIONAL</option><option>INSTITUTION</option><option>DEPARTEMENT</option></>}</select></Field>
        {scope !== 'NATIONAL' && <Field label="Institution"><ReferencePicker kind="institutions" label="Institution de rattachement" value={institutionId}
            onChange={value => { setInstitution(value); setDepartment(''); }} nullable={scope === 'SERVICE'} /></Field>}
        {(scope === 'DEPARTEMENT' || scope === 'SERVICE') && <Field label="Département"><ReferencePicker kind="departments" label="Département de rattachement"
            value={departmentId} scope={{ institutionId }} onChange={setDepartment} nullable={scope === 'SERVICE'} /></Field>}
        <Field label="Motif du rattachement *" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={2000} /></Field>
    </CommandDialog>;
}
export function DelegationDialog({ source, onClose, onDone }: { source: Assignment; onClose: () => void; onDone: () => void }) {
    const { me } = useSession();
    const [recipient, setRecipient] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [reason, setReason] = useState('');
    if (!mayDelegate(me, source)) return <Notice>Seul le titulaire direct habilité peut déléguer un rôle métier actif.</Notice>;
    const build = () => {
        const delegataireId = uuid(recipient);
        if (delegataireId === me!.user.id) throw new Error('Choisissez une autre personne.');
        const dateDebut = utc(start), dateFin = utc(end);
        if (!dateFin) throw new Error('La date de fin est obligatoire.');
        const now = Date.now(), from = dateDebut ? Date.parse(dateDebut) : now, to = Date.parse(dateFin);
        period(dateDebut, dateFin, now);
        if (from < now - 60000 || to - from > 90 * 86400000) throw new Error('Délégation future ou immédiate, limitée à 90 jours.');
        if (from < Date.parse(source.startsAt) || (source.endsAt && to > Date.parse(source.endsAt))) throw new Error('La période dépasse celle de votre attribution.');
        return { sourceAssignmentId: uuid(source.id), delegataireId, dateDebut, dateFin, motif: text(reason, 2000) };
    };
    return <CommandDialog title="Créer une délégation" description="Le rôle métier est transmis dans sa portée actuelle pour 90 jours au plus. Le serveur contrôle le destinataire, les droits et la période."
        path="/delegations" build={build} onClose={onClose} onSuccess={() => { onDone(); onClose(); }} danger label="Confirmer la délégation">
        <div className="span2"><strong>Rôle détenu : </strong><EntityName kind="roles" id={source.roleId} /><p>Portée : {source.scope}. Les rôles d’administration ne sont pas délégables.</p></div>
        <Field label="Destinataire *" wide><ReferencePicker kind="users" label="Destinataire de la délégation" value={recipient} onChange={setRecipient}
            excludeId={me!.user.id} scope={{ institutionId: source.institutionId, departmentId: source.departmentId }} /></Field>
        <Field label="Début de la délégation" hint="Facultatif : immédiatement. Dates en heure locale."><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Fin de la délégation *"><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required /></Field>
        <Field label="Motif de la délégation *" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={2000} /></Field>
    </CommandDialog>;
}
