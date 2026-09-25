import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { CommandDialog } from '../ui/CommandDialog';
import { Field } from '../ui/components';
import { ReferencePicker } from '../ui/ReferencePicker';
import { entityCommand, type Draft } from '../core/commands';
import { platform } from '../core/policy';
import type { Catalog, RecordEntity } from '../core/types';
export function EntityForm({ kind, entity, onClose, onSuccess }: {
    kind: Catalog;
    entity?: RecordEntity;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { me } = useSession();
    const { scope } = useWorkspace();
    const e = (entity ?? {}) as Record<string, any>;
    const central = platform(me);
    const [d, setD] = useState<Draft>({ code: e.code ?? '', nom: e.nom ?? '', prenom: e.prenom ?? '', sigle: e.sigle ?? '', typeInstitution: e.typeInstitution ?? 'MINISTERE', typeUnite: e.typeUnite ?? 'DIRECTION', description: e.description ?? '', email: e.email ?? '', ssoId: e.ssoId ?? '', scope: e.scope ?? (scope.departmentId ? 'DEPARTEMENT' : scope.institutionId ? 'INSTITUTION' : 'NATIONAL'), typeCompte: e.accountType ?? 'USER', institutionId: e.institutionId ?? scope.institutionId ?? '', departmentId: e.departmentId ?? scope.departmentId ?? '', parentId: e.parentId ?? '', reason: '' });
    const update = (k: string, v: string) => setD(old => ({ ...old, [k]: v, ...(k === 'institutionId' ? { departmentId: '', parentId: '' } : {}), ...(k === 'scope' && v === 'NATIONAL' ? { institutionId: '', departmentId: '' } : {}), ...(k === 'scope' && v === 'INSTITUTION' ? { departmentId: '' } : {}) }));
    const input = (k: string, label: string, max: number, required = true, type = 'text') => <Field label={label}><input type={type} value={d[k] ?? ''} onChange={ev => update(k, ev.target.value)} required={required} maxLength={max}/></Field>;
    const title = ({ institutions: 'une institution', departments: 'un département', users: 'une identité', roles: 'un rôle' })[kind];
    return <CommandDialog title={(entity ? 'Modifier ' : 'Créer ') + title} description={entity ? `Version lue : ${e.version}. Toute modification exige un motif.` : 'Création dans le périmètre autorisé, sans droit implicite.'} path={'/' + kind + (entity ? '/' + entity.id : '')} method={entity ? 'PUT' : 'POST'} build={() => entityCommand(kind, d, entity?.version)} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }}>
 {(kind !== 'users' && !entity) && input('code', 'Code *', kind === 'roles' ? 80 : 50)}
 {input('nom', kind === 'users' ? 'Nom' : 'Intitulé *', kind === 'roles' || kind === 'users' ? 150 : 255, kind !== 'users')}
 {kind === 'institutions' && <>{input('sigle', 'Sigle', 50, false)}{!entity && <Field label="Type d’institution *"><select value={d.typeInstitution} onChange={ev => update('typeInstitution', ev.target.value)}><option>MINISTERE</option><option>DIRECTION_GENERALE</option><option>ETABLISSEMENT_PUBLIC</option><option>COLLECTIVITE</option><option>AUTRE</option></select></Field>}</>}
 {kind === 'departments' && <>{!entity && <Field label="Institution *"><ReferencePicker kind="institutions" label="Sélectionner une institution" value={d.institutionId!} onChange={v => update('institutionId', v)} scope={central ? {} : { institutionId: me!.user.institutionId }}/></Field>}<Field label="Département parent" hint="Le serveur interdit les cycles et les rattachements incompatibles."><ReferencePicker kind="departments" label="Sélectionner un parent" value={d.parentId!} scope={{ institutionId: d.institutionId }} onChange={v => update('parentId', v)} excludeId={entity?.id} nullable/></Field>{input('typeUnite', 'Type d’unité', 50, false)}</>}
 {kind === 'roles' && <>{!entity && <Field label="Portée *"><select value={d.scope === 'SERVICE' ? 'NATIONAL' : d.scope} onChange={ev => update('scope', ev.target.value)}><option>NATIONAL</option><option>INSTITUTION</option><option>DEPARTEMENT</option></select></Field>}<Field label="Description" wide><textarea value={d.description} onChange={ev => update('description', ev.target.value)} maxLength={5000}/></Field></>}
 {kind === 'users' && <>{input('prenom', 'Prénom', 150, false)}{input('email', 'Adresse professionnelle', 320, false, 'email')}{!entity && <><Field label="Identifiant SSO (sub) *" hint="Identité vérifiée auprès du fournisseur. Aucun compte SSO ni mot de passe n’est créé par cette action." wide><input value={d.ssoId} onChange={ev => update('ssoId', ev.target.value)} maxLength={255} required autoComplete="off"/></Field><Field label="Type de compte"><select value={d.typeCompte} onChange={ev => {
                    update('typeCompte', ev.target.value);
                    if (ev.target.value === 'SERVICE')
                        update('scope', 'SERVICE');
                    else
                        update('scope', 'NATIONAL');
                }} disabled={!central}><option value="USER">Utilisateur humain</option><option value="SERVICE">Compte technique</option></select></Field><Field label="Portée *"><select value={d.scope} onChange={ev => update('scope', ev.target.value)}>{d.typeCompte === 'SERVICE' ? <option>SERVICE</option> : <>{central && <option>NATIONAL</option>}{me!.user.scope !== 'DEPARTEMENT' && <option>INSTITUTION</option>}<option>DEPARTEMENT</option></>}</select></Field>{d.scope !== 'NATIONAL' && <Field label="Institution"><ReferencePicker kind="institutions" label="Sélectionner une institution" value={d.institutionId!} onChange={v => update('institutionId', v)} scope={central ? {} : { institutionId: me!.user.institutionId }} nullable={d.scope === 'SERVICE'}/></Field>}{['DEPARTEMENT', 'SERVICE'].includes(d.scope!) && <Field label="Département"><ReferencePicker kind="departments" label="Sélectionner un département" value={d.departmentId!} onChange={v => update('departmentId', v)} scope={{ institutionId: d.institutionId, departmentId: !central ? me!.user.departmentId : undefined }} nullable={d.scope === 'SERVICE'}/></Field>}</>}</>}
 {entity && <Field label="Motif de modification *" wide><textarea required maxLength={2000} value={d.reason} onChange={ev => update('reason', ev.target.value)}/></Field>}
 </CommandDialog>;
}
