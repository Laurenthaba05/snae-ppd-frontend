import type { Me, ScopeTarget } from './types.js';
import { platform } from './policy.js';

/** L'institution d'un compte qui n'est pas administrateur de la plateforme : tout ce qu'il crée lui est rattaché. `null` pour l'administration centrale. */
export function accountInstitution(me: Me | null): string | null {
    return me && !platform(me) && me.user.institutionId ? me.user.institutionId : null;
}

/**
 * L'institution à laquelle une création est liée : celle où l'on travaille (le sélecteur du bandeau) ; à défaut celle du compte, tant qu'il n'est pas administrateur de la plateforme.
 * `null` : le choix est libre (administration centrale sans institution de travail). Ce n'est qu'une aide de saisie : le serveur refuse de toute façon une création hors des
 * droits de la personne, et ne regarde pas l'institution de travail.
 */
export function creationInstitution(me: Me | null, workspace: ScopeTarget): string | null {
    return workspace.institutionId || accountInstitution(me);
}
