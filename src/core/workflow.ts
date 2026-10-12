import type { DigitizationElementStatus, ElementSealing, Me, TransitionOption } from './types.js';
import { can } from './policy.js';

export type Stage = DigitizationElementStatus;

/** Les sept étapes du parcours de traitement, dans l'ordre (la dernière, TERMINE, est « Prêt pour versement »). */
export const STAGES: ReadonlyArray<{ status: Stage; label: string; role: string }> = [
    { status: 'RECEPTION', label: 'Réception du lot', role: 'Agent de numérisation' },
    { status: 'NUMERISATION', label: 'Numérisation', role: 'Agent de numérisation' },
    { status: 'OCR_INDEXATION', label: 'OCR et indexation', role: 'Opérateur OCR' },
    { status: 'CONTROLE_QUALITE', label: 'Contrôle qualité', role: 'Contrôleur qualité' },
    { status: 'METADONNEES', label: 'Métadonnées', role: 'Contrôleur qualité' },
    { status: 'VALIDATION', label: 'Circuit de validation', role: 'Responsable validation' },
    { status: 'TERMINE', label: 'Prêt pour versement', role: 'Responsable validation' }
];

const NAMES: Record<Stage, string> = {
    RECEPTION: 'Réception du lot', NUMERISATION: 'Numérisation', OCR_INDEXATION: 'OCR et indexation', CONTROLE_QUALITE: 'Contrôle qualité',
    METADONNEES: 'Métadonnées', VALIDATION: 'Circuit de validation', TERMINE: 'Prêt pour versement', SUSPENDU: 'Suspendu', ANNULE: 'Annulé'
};

export const stageName = (status: Stage): string => NAMES[status] ?? status;
export const isTerminalStage = (status: Stage): boolean => status === 'TERMINE' || status === 'ANNULE';
/** Étapes de travail : ni terminé, ni annulé, ni suspendu. */
export const isWorkingStage = (status: Stage): boolean => status !== 'TERMINE' && status !== 'ANNULE' && status !== 'SUSPENDU';
/** Les pages ne s'ajoutent qu'à la réception ou pendant la numérisation. */
export const isCaptureStage = (status: Stage): boolean => status === 'RECEPTION' || status === 'NUMERISATION';
/** Position (0 à 6) dans le parcours ; -1 pour SUSPENDU et ANNULE. */
export const stageIndex = (status: Stage): number => STAGES.findIndex(s => s.status === status);

/** Permissions de saisie par étape : la gestion de la numérisation suffit aussi. La validation, elle, exige sa permission propre. */
export type EntryPermission = 'DIGITIZATION_SCAN' | 'DIGITIZATION_OCR' | 'DIGITIZATION_QC';

/** Gérer la numérisation, ou détenir la permission de l'étape concernée (enregistrer des pages, des textes OCR, des contrôles). */
export const canWith = (me: Me | null, permission: EntryPermission): boolean => can(me, 'DIGITIZATION_MANAGE', {}) || can(me, permission, {});

/** Détient au moins une permission de passage d'étape (numérisation, OCR, qualité ou validation), sans compter la gestion seule. */
export const canAdvance = (me: Me | null): boolean => ['DIGITIZATION_SCAN', 'DIGITIZATION_OCR', 'DIGITIZATION_QC', 'DIGITIZATION_VALIDATE'].some(p => can(me, p, {}));

/** Libellé du bouton d'un passage, du point de vue de la personne qui agit. */
export function transitionLabel(from: Stage, to: Stage): string {
    if (to === 'SUSPENDU') return 'Suspendre l’élément';
    if (to === 'ANNULE') return 'Annuler l’élément';
    if (from === 'SUSPENDU') return 'Reprendre : ' + stageName(to).toLowerCase();
    const forward: Record<string, string> = {
        'RECEPTION>NUMERISATION': 'Démarrer la numérisation',
        'NUMERISATION>OCR_INDEXATION': 'Terminer la numérisation',
        'NUMERISATION>CONTROLE_QUALITE': 'Passer sans OCR',
        'OCR_INDEXATION>CONTROLE_QUALITE': 'Envoyer au contrôle qualité',
        'CONTROLE_QUALITE>METADONNEES': 'Accepter la qualité',
        'METADONNEES>VALIDATION': 'Soumettre à validation',
        'VALIDATION>TERMINE': 'Valider : prêt pour versement'
    };
    const known = forward[from + '>' + to];
    if (known) return known;
    return 'Renvoyer vers « ' + stageName(to).toLowerCase() + ' »';
}

export interface SplitOptions {
    /** Le passage « normal » vers l'étape suivante, s'il existe. */
    next: TransitionOption | null;
    /** Autre passage vers l'avant (ex. passer sans OCR). */
    skips: TransitionOption[];
    renvois: TransitionOption[];
    /** Reprise d'un élément suspendu. */
    resume: TransitionOption | null;
    others: TransitionOption[];
}

/** Classe les passages offerts : suivant, sauts, renvois, reprise, suspension/annulation. */
export function splitOptions(from: Stage, options: ReadonlyArray<TransitionOption>): SplitOptions {
    const result: SplitOptions = { next: null, skips: [], renvois: [], resume: null, others: [] };
    const fromIndex = stageIndex(from);
    const forward = options.filter(o => !o.renvoi && o.vers !== 'SUSPENDU' && o.vers !== 'ANNULE' && from !== 'SUSPENDU')
        .sort((a, b) => stageIndex(a.vers) - stageIndex(b.vers));
    for (const option of options) {
        if (from === 'SUSPENDU' && option.vers !== 'ANNULE') result.resume = option;
        else if (option.vers === 'SUSPENDU' || option.vers === 'ANNULE') result.others.push(option);
        else if (option.renvoi) result.renvois.push(option);
    }
    if (from !== 'SUSPENDU' && forward.length) {
        result.next = forward.find(o => stageIndex(o.vers) === fromIndex + 1) ?? forward[0]!;
        result.skips = forward.filter(o => o !== result.next);
    }
    return result;
}

/** Ce que fait la validation finale, à montrer avant qu'on la déclenche. */
export const SEAL_NOTICE = 'Valider scelle la version du document : chaque page devient un maître de conservation, dans l’ordre des pages, et ne pourra plus être modifiée. ' +
    'Il faut détenir les habilitations « valider un fichier maître » et « sceller une version » sur le document.';

const plural = (n: number, one: string, many: string): string => n + ' ' + (n > 1 ? many : one);

/** Début de l'empreinte scellée, pour l'affichage. */
export const shortHash = (hash: string | null | undefined): string => hash ? hash.slice(0, 12) + '…' : '';

/** « Version n° 1 scellée : 12 pages, 1 fichier écarté ». */
export function sealingSummary(sealing: ElementSealing): string {
    const content = sealing.pages > 0 ? plural(sealing.pages, 'page', 'pages') : plural(sealing.fichiers, 'fichier', 'fichiers');
    const dropped = sealing.ecartes > 0 ? ', ' + plural(sealing.ecartes, 'fichier écarté', 'fichiers écartés') : '';
    return 'Version n° ' + sealing.numeroVersion + (sealing.scellee ? ' scellée' : ' à sceller') + ' : ' + content + dropped;
}

/** Texte du journal pour un passage qui a scellé la version (null si le contexte n'en parle pas). */
export function sealingContextText(context: Record<string, unknown> | null | undefined): string | null {
    const raw = context?.scellement;
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    const num = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const text = sealingSummary({ versionId: typeof s.versionId === 'string' ? s.versionId : '', numeroVersion: num(s.numeroVersion), scellee: true, empreinte: null, dateScellement: null,
        pages: num(s.pages), fichiers: num(s.fichiers), ecartes: num(s.ecartes) });
    const hash = typeof s.empreinte === 'string' ? shortHash(s.empreinte) : '';
    return hash ? text + ' (empreinte ' + hash + ')' : text;
}

/** Durée écoulée dans l'étape, en français (« depuis 3 jours »). */
export function sinceText(since: string | null | undefined, now = Date.now()): string {
    if (!since) return '';
    const time = Date.parse(since);
    if (!Number.isFinite(time)) return '';
    const minutes = Math.max(0, Math.floor((now - time) / 60000));
    if (minutes < 60) return 'depuis moins d’une heure';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'depuis ' + hours + ' h';
    const days = Math.floor(hours / 24);
    return 'depuis ' + days + (days > 1 ? ' jours' : ' jour');
}
