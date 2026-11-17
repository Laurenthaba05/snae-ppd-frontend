import React, { useEffect, useMemo } from 'react';
import { useSession } from '../auth/session';
import { Field, useResource } from './components';
import { groupsForNewAccount } from '../core/userGroups';
import type { UserGroup } from '../core/userGroups';

/**
 * Le groupe où entre un compte dès sa création. Sans choix, le compte entre dans le groupe par défaut de son institution, sinon dans le groupe national par défaut : aucun compte
 * ne reste sans groupe. Un groupe ne donne aucun droit ; les rôles s'attribuent à part. Seuls les groupes actifs de l'institution du compte sont proposés.
 */
export function GroupChoice({ institutionId, value, onChange }: { institutionId: string | null | undefined; value: string; onChange: (groupId: string) => void }) {
    const { api, epoch } = useSession();
    const q = useResource(signal => institutionId ? api!.allGroups(institutionId, signal) : Promise.resolve([] as UserGroup[]), JSON.stringify(['new-account-groups', institutionId ?? null, epoch]));
    const options = useMemo(() => groupsForNewAccount(q.data ?? [], institutionId), [q.data, institutionId]);
    // le choix suit l'institution : un groupe qui n'est plus proposé laisse la place au groupe par défaut
    useEffect(() => { if (value && q.data && !options.some(g => g.id === value)) onChange(''); }, [value, q.data, options, onChange]);
    return <Field label="Groupe" hint="À défaut de choix, le compte entre dans le groupe par défaut de son institution, sinon dans le groupe national par défaut. Un groupe n’accorde aucun droit : les rôles s’attribuent à part.">
        <select aria-label="Groupe du compte" value={value} disabled={!institutionId || q.loading} onChange={ev => onChange(ev.target.value)}>
            <option value="">Groupe par défaut</option>
            {options.map(g => <option key={g.id} value={g.id}>{g.nom}{g.defaultGroup ? ' (par défaut)' : ''}</option>)}
        </select>
        {!!q.error && <small>Les groupes de l’institution sont indisponibles : le compte entrera dans le groupe par défaut.</small>}
    </Field>;
}
