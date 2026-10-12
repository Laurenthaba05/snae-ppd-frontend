import { EXTENT_UNITS } from './archivalDescription.js';
import { parseQuantity, plain, unitLabel, type AgreementFacts } from './structuredIntake.js';

/**
 * Accord de versement (contrat d'entrée) : ce qu'un producteur s'engage à verser à un service d'archives, sur quelle période, à quel rythme, pour quel volume.
 * Les règles reprennent celles du serveur pour guider la saisie ; le serveur reste seul juge.
 */
export type AgreementStatus = 'PROJET' | 'ACTIF' | 'SUSPENDU' | 'CLOS';
export const AGREEMENT_STATUS: Record<AgreementStatus, string> = { PROJET: 'En projet', ACTIF: 'Actif', SUSPENDU: 'Suspendu', CLOS: 'Clos' };
export const PERIODICITES: Record<string, string> = { PONCTUEL: 'Ponctuel', ANNUEL: 'Annuel', SEMESTRIEL: 'Semestriel', TRIMESTRIEL: 'Trimestriel', MENSUEL: 'Mensuel' };
const NEXT: Record<AgreementStatus, ReadonlyArray<AgreementStatus>> = { PROJET: ['ACTIF', 'CLOS'], ACTIF: ['SUSPENDU', 'CLOS'], SUSPENDU: ['ACTIF', 'CLOS'], CLOS: [] };
/** Les statuts que l'on peut choisir depuis `from`, le statut actuel compris (on peut modifier sans changer d'état). */
export const nextStatuses = (from: AgreementStatus): AgreementStatus[] => [from, ...NEXT[from]];

export interface AgreementBody {
    reference: string; intitule: string; producteurId: string; serviceVersantId: string | null; institutionArchivesId: string; statut: AgreementStatus;
    dateDebut: string; dateFin: string | null; periodicite: string; volumePrevu: number | null; uniteVolume: string | null;
    formatsAcceptes: string | null; conditions: string | null; version: number;
}
export interface AgreementView {
    id: string; input: Omit<AgreementBody, 'version'>; version: number; createdAt: string; updatedAt: string;
    /** Nombre de versements qui s'appuient sur cet accord. */
    versements: number;
}

export interface AgreementForm {
    reference: string; intitule: string; producteurId: string; serviceVersantId: string; institutionArchivesId: string; statut: AgreementStatus;
    dateDebut: string; dateFin: string; periodicite: string; volumePrevu: string; uniteVolume: string; formatsAcceptes: string; conditions: string;
}
export const emptyAgreementForm = (institutionArchivesId = ''): AgreementForm => ({ reference: '', intitule: '', producteurId: '', serviceVersantId: '', institutionArchivesId, statut: 'PROJET',
    dateDebut: '', dateFin: '', periodicite: 'PONCTUEL', volumePrevu: '', uniteVolume: '', formatsAcceptes: '', conditions: '' });
export const formOfAgreement = (v: AgreementView): AgreementForm => ({ reference: v.input.reference, intitule: v.input.intitule, producteurId: v.input.producteurId,
    serviceVersantId: v.input.serviceVersantId ?? '', institutionArchivesId: v.input.institutionArchivesId, statut: v.input.statut, dateDebut: v.input.dateDebut, dateFin: v.input.dateFin ?? '',
    periodicite: v.input.periodicite, volumePrevu: v.input.volumePrevu === null ? '' : plain(v.input.volumePrevu), uniteVolume: v.input.uniteVolume ?? '',
    formatsAcceptes: v.input.formatsAcceptes ?? '', conditions: v.input.conditions ?? '' });

const blank = (s: string) => s.trim() === '' ? null : s.trim();
export function agreementBody(form: AgreementForm, version: number): AgreementBody {
    const volume = parseQuantity(form.volumePrevu);
    return { reference: form.reference.trim(), intitule: form.intitule.trim(), producteurId: form.producteurId, serviceVersantId: blank(form.serviceVersantId),
        institutionArchivesId: form.institutionArchivesId, statut: form.statut, dateDebut: form.dateDebut, dateFin: blank(form.dateFin), periodicite: form.periodicite,
        volumePrevu: volume === 'invalid' ? Number.NaN : volume, uniteVolume: blank(form.uniteVolume), formatsAcceptes: blank(form.formatsAcceptes), conditions: blank(form.conditions), version };
}

/** Ce que le serveur refuserait, dans l'ordre où l'on corrige. */
export function agreementFormProblems(form: AgreementForm): string[] {
    const problems: string[] = [];
    if (!form.reference.trim()) problems.push('La référence de l’accord est obligatoire.');
    if (!form.intitule.trim()) problems.push('L’intitulé de l’accord est obligatoire.');
    if (!form.institutionArchivesId) problems.push('Choisissez le service d’archives destinataire.');
    if (!form.producteurId) problems.push('Choisissez le producteur.');
    if (!form.dateDebut) problems.push('La date de début est obligatoire.');
    else if (form.dateFin && form.dateFin < form.dateDebut) problems.push('La date de fin précède la date de début.');
    const volume = parseQuantity(form.volumePrevu);
    if (volume === 'invalid' || (volume !== null && volume < 0)) problems.push('Le volume prévu est un nombre positif (12 ou 12,5).');
    else if ((volume === null) !== !form.uniteVolume) problems.push('Indiquez le volume prévu ET son unité, ou aucun des deux.');
    if (form.reference.trim().length > 150) problems.push('La référence est limitée à 150 caractères.');
    if (form.intitule.trim().length > 300) problems.push('L’intitulé est limité à 300 caractères.');
    return problems;
}

export const factsOf = (v: AgreementView): AgreementFacts => ({ statut: v.input.statut, producteurId: v.input.producteurId, institutionArchivesId: v.input.institutionArchivesId,
    dateDebut: v.input.dateDebut, dateFin: v.input.dateFin, volumePrevu: v.input.volumePrevu, uniteVolume: v.input.uniteVolume, reference: v.input.reference });

/** Un accord « en vigueur » aujourd'hui : actif et dans sa période. `today` : AAAA-MM-JJ. */
export const inForce = (v: AgreementView, today: string): boolean => v.input.statut === 'ACTIF' && v.input.dateDebut <= today && (!v.input.dateFin || today <= v.input.dateFin);

/** « ACC-2026-01 · Versements annuels du ministère (actif) » : de quoi choisir un accord dans une liste. */
export const agreementTitle = (v: AgreementView): string => `${v.input.reference} · ${v.input.intitule}`;
/** « 10 mètres linéaires par an » ; '' sans volume. */
export function volumeText(v: AgreementView): string {
    if (v.input.volumePrevu === null || !v.input.uniteVolume) return '';
    const every = v.input.periodicite === 'PONCTUEL' ? '' : ` ${({ ANNUEL: 'par an', SEMESTRIEL: 'par semestre', TRIMESTRIEL: 'par trimestre', MENSUEL: 'par mois' } as Record<string, string>)[v.input.periodicite] ?? ''}`;
    return `${plain(v.input.volumePrevu)} ${unitLabel(v.input.uniteVolume)}${every}`;
}
export const AGREEMENT_UNITS = EXTENT_UNITS;
