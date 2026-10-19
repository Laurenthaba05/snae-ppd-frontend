import React, { useEffect } from 'react';
import { useSession } from '../auth/session';
import { accountInstitution, creationInstitution } from '../core/creationScope';
import { ReferencePicker } from './ReferencePicker';
import { useWorkspace } from './workspace';

/**
 * Le choix de l'institution dans un formulaire de création. Quand on travaille dans une institution (sélecteur du bandeau) ou que le compte n'est pas central, la création lui est
 * rattachée et le choix est figé : pour en prendre une autre, on change d'institution dans le bandeau. Un champ déjà verrouillé par le formulaire (`disabled`, par exemple un
 * sous-dossier qui suit son parent) garde sa valeur.
 *
 * `followWorkspace={false}` : seul le compte compte (une origine d'archives peut venir d'une autre institution que celle où travaille l'administration centrale).
 */
export function InstitutionChoice({ value, onChange, label = 'Sélectionner une institution', nullable = false, disabled = false, followWorkspace = true }: {
    value: string;
    onChange: (institutionId: string) => void;
    label?: string;
    nullable?: boolean;
    disabled?: boolean;
    followWorkspace?: boolean;
}) {
    const { me } = useSession();
    const { scope } = useWorkspace();
    const bound = followWorkspace ? creationInstitution(me, scope) : accountInstitution(me);
    const forced = bound !== null && !disabled;
    useEffect(() => { if (forced && value !== bound) onChange(bound); }, [forced, bound, value, onChange]);
    if (!forced) return <ReferencePicker kind="institutions" label={label} value={value} disabled={disabled} nullable={nullable} onChange={onChange} />;
    return <>
        <ReferencePicker kind="institutions" label={label} value={bound} disabled onChange={onChange} scope={{ institutionId: bound }} />
        <small>{followWorkspace ? 'Vous travaillez dans cette institution : la création lui est rattachée. Pour en choisir une autre, changez d’institution dans le bandeau.' : 'Votre compte est rattaché à cette institution : l’origine ne peut être qu’elle.'}</small>
    </>;
}
