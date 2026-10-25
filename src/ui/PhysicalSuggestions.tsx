import React from 'react';
import { useSession } from '../auth/session';
import { useResource } from './components';

/** Les champs libres dont le serveur connaît les valeurs déjà employées. */
export type VocabularyField = 'TYPE_LOCALISATION' | 'TYPE_UNITE' | 'TYPE_MOUVEMENT' | 'SUPPORT' | 'ETAT_PHYSIQUE' | 'UNITE_QUANTITE';

/**
 * Les valeurs déjà employées d'un champ libre, proposées à la saisie : « Boîte » et « boite » ne se dispersent pas en deux types parce que la première a été saisie avant. Une liste qui ne
 * se charge pas n'empêche jamais de saisir. À relier à un champ par son identifiant : `<input list="…" />`.
 */
export function Suggestions({ id, field }: { id: string; field: VocabularyField }) {
    const { physicalArchives, epoch } = useSession();
    const q = useResource<string[]>(s => physicalArchives ? physicalArchives.vocabulary(field, s).catch(() => []) : Promise.resolve([]), `vocabulary:${field}:${epoch}`);
    return <datalist id={id}>{(q.data ?? []).map(value => <option key={value} value={value} />)}</datalist>;
}
