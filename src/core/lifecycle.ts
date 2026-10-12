import type { DocumentLifecycle } from './types.js';

/**
 * Le chemin d'un document, de « brouillon » à « clos » puis à son échéance de conservation, présenté étape par étape avec ce qui manque et l'action qui permet d'avancer.
 * Les obstacles viennent du serveur (`DocumentLifecycle`) ; ici on les met en phrases.
 */
export type StepState = 'DONE' | 'TODO' | 'BLOCKED' | 'WAITING';
export type StepAction = 'UPLOAD' | 'INGESTIONS' | 'WORKFLOW' | 'SEAL' | 'NEW_VERSION' | 'CONSERVATION';
export interface LifecycleStep { key: 'CONTENT' | 'PENDING' | 'SEAL' | 'CLOSE' | 'RETENTION'; title: string; state: StepState; text: string; actions: Array<{ kind: StepAction; label: string }> }

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const PENDING_TEXT: Record<string, string> = {
    INGESTION_PENDING: 'Des dépôts de cette version sont encore en cours ou interrompus : terminez-les ou abandonnez ceux qui ne servent plus.',
    WORKFLOW_PENDING: 'Un circuit de validation est en cours sur ce document : terminez-le ou annulez-le.',
    MANDATORY_WORKFLOW_INCOMPLETE: 'Le circuit de validation obligatoire pour ce type de document n’est pas terminé.'
};

export function lifecycleSteps(l: DocumentLifecycle): LifecycleStep[] {
    const sealed = l.version?.sealed === true;
    const preserved = ['ARCHIVE_DEFINITIVE', 'ELIMINATION_APPROUVEE'].includes(l.archivalStatus);
    const closed = l.businessStatus === 'CLOS' || preserved;
    const has = (code: string) => l.sealBlockers.includes(code);
    const pending = ['INGESTION_PENDING', 'WORKFLOW_PENDING', 'MANDATORY_WORKFLOW_INCOMPLETE'].filter(has);
    const contentBlocked = has('VALIDATED_CONTENT_REQUIRED') || has('MASTER_KIND_CONFLICT');
    const steps: LifecycleStep[] = [];

    // 1. Le contenu : un maître de conservation validé
    if (!l.version) steps.push({ key: 'CONTENT', title: 'Une version avec son fichier maître', state: 'TODO', text: 'Le document n’a encore aucune version : créez-la, puis déposez le fichier maître.', actions: [{ kind: 'NEW_VERSION', label: 'Créer la version' }] });
    else if (sealed || (!contentBlocked && l.validatedMasters > 0)) steps.push({ key: 'CONTENT', title: 'Un fichier maître validé', state: 'DONE', text: `${plural(l.validatedFiles, 'fichier validé', 'fichiers validés')}, dont ${plural(l.validatedMasters, 'maître de conservation', 'maîtres de conservation')}.`, actions: [] });
    else if (has('MASTER_KIND_CONFLICT')) steps.push({ key: 'CONTENT', title: 'Un fichier maître validé', state: 'BLOCKED', text: 'Une version ne mélange pas un maître sans numéro de page et des maîtres paginés.', actions: [] });
    else steps.push({ key: 'CONTENT', title: 'Un fichier maître validé', state: 'TODO', actions: [{ kind: 'UPLOAD', label: 'Téléverser le maître' }],
        text: l.files === 0 ? 'Aucun fichier : déposez-le avec le rôle « Maître de conservation », puis cliquez sur « Valider comme maître ».'
            : `Il y a ${plural(l.files, 'fichier', 'fichiers')} mais aucun maître validé. Déposez le maître (rôle « Maître de conservation ») et validez-le ; les autres fichiers doivent aussi être validés.` });

    // 2. Rien en cours : dépôts, circuit
    if (sealed || !pending.length) steps.push({ key: 'PENDING', title: 'Aucun dépôt ni circuit en cours', state: 'DONE', text: sealed ? 'Plus rien n’est en cours sur cette version.' : 'Aucun dépôt interrompu, aucun circuit en cours.', actions: [] });
    else steps.push({ key: 'PENDING', title: 'Aucun dépôt ni circuit en cours', state: 'BLOCKED', text: pending.map(code => PENDING_TEXT[code]).join(' '),
        actions: [...(has('INGESTION_PENDING') ? [{ kind: 'INGESTIONS' as const, label: 'Ouvrir le suivi des dépôts' }] : []), ...(has('WORKFLOW_PENDING') || has('MANDATORY_WORKFLOW_INCOMPLETE') ? [{ kind: 'WORKFLOW' as const, label: 'Voir le circuit' }] : [])] });

    // 3. La version scellée
    if (sealed) steps.push({ key: 'SEAL', title: 'Version scellée', state: 'DONE', text: `La version ${l.version!.number} est scellée : son contenu est figé.`, actions: [] });
    else if (!l.version) steps.push({ key: 'SEAL', title: 'Version scellée', state: 'WAITING', text: 'Après la création de la version et le dépôt du maître.', actions: [] });
    else if (!l.sealBlockers.length) steps.push({ key: 'SEAL', title: 'Version scellée', state: 'TODO', text: `La version ${l.version.number} est prête : le scellement fige son contenu et son empreinte.`, actions: [{ kind: 'SEAL', label: 'Sceller la version' }] });
    else steps.push({ key: 'SEAL', title: 'Version scellée', state: 'WAITING', text: 'Après les étapes ci-dessus.', actions: [] });

    // 4. Le document clos
    if (closed) steps.push({ key: 'CLOSE', title: 'Document clos', state: 'DONE', text: 'Le document est clos : il n’accepte plus de modification.', actions: [] });
    else if (l.destroyed) steps.push({ key: 'CLOSE', title: 'Document clos', state: 'BLOCKED', text: 'Le document est détruit.', actions: [] });
    else if (!l.closeBlockers.length) steps.push({ key: 'CLOSE', title: 'Document clos', state: 'TODO', text: 'La version est scellée : le document peut être clos (onglet « Conservation »).', actions: [{ kind: 'CONSERVATION', label: 'Aller à la conservation' }] });
    else steps.push({ key: 'CLOSE', title: 'Document clos', state: 'WAITING', text: 'Après le scellement de la dernière version.', actions: [] });

    // 5. L'échéance de conservation : se planifie une fois le document clos
    if (preserved) steps.push({ key: 'RETENTION', title: 'Échéance de conservation', state: 'DONE', text: 'Le document est conservé définitivement.', actions: [] });
    else steps.push({ key: 'RETENTION', title: 'Échéance de conservation', state: closed ? 'TODO' : 'WAITING',
        text: closed ? 'Le document est clos : l’onglet « Conservation » dit quelle règle s’applique et permet de planifier l’échéance.' : 'Après la clôture du document.',
        actions: closed ? [{ kind: 'CONSERVATION', label: 'Planifier la conservation' }] : [] });
    return steps;
}

/** L'étape à faire maintenant : la première qui n'est pas terminée. */
export const currentStep = (steps: readonly LifecycleStep[]): LifecycleStep | null => steps.find(s => s.state !== 'DONE') ?? null;
