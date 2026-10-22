/**
 * La mise en forme commune de ce que l'écran montre : codes en toutes lettres, tailles et nombres à la française, apostrophes typographiques.
 * Un code technique (EN_COURS, ETABLISSEMENT_PUBLIC) ne s'affiche jamais tel quel : `label` donne le libellé d'un domaine connu, `display` rend lisible tout le reste.
 */

// ---------- codes -> texte lisible

/** Mots courants des codes, avec leurs accents : « DIRECTION_GENERALE » se lit « Direction générale ». */
const WORDS: Record<string, string> = {
    a: 'à', etat: 'état', etats: 'états', etape: 'étape', etablissement: 'établissement', ministere: 'ministère', generale: 'générale', general: 'général', collectivite: 'collectivité', numerisation: 'numérisation', numerise: 'numérisé',
    controle: 'contrôle', reception: 'réception', receptionnee: 'réceptionnée', recue: 'reçue', recu: 'reçu', cloture: 'clôture', clos: 'clos', definitive: 'définitive', definitivement: 'définitivement', definitif: 'définitif',
    elimination: 'élimination', eliminer: 'éliminer', reexaminer: 'réexaminer', reexamen: 'réexamen', transferer: 'transférer', transfert: 'transfert', verifier: 'vérifier', verifie: 'vérifié', verification: 'vérification',
    planifier: 'planifier', planifiee: 'planifiée', planifie: 'planifié', prevu: 'prévu', prevue: 'prévue', terminee: 'terminée', termine: 'terminé', annulee: 'annulée', annule: 'annulé', refusee: 'refusée', refuse: 'refusé',
    acceptee: 'acceptée', accepte: 'accepté', rejetee: 'rejetée', rejete: 'rejeté', validee: 'validée', valide: 'validé', creee: 'créée', cree: 'créé', ouverte: 'ouverte', fermee: 'fermée', ferme: 'fermé',
    revoque: 'révoqué', revoquee: 'révoquée', expiree: 'expirée', expire: 'expiré', retire: 'retiré', retiree: 'retirée', publiee: 'publiée', publie: 'publié', restitue: 'restitué', restituee: 'restituée', retournee: 'retournée',
    deposee: 'déposée', depot: 'dépôt', depose: 'déposé', demandee: 'demandée', accordee: 'accordée', formalisee: 'formalisée', complement: 'complément', requis: 'requis', clarifier: 'clarifier', situation: 'situation',
    metadonnees: 'métadonnées', metadonnee: 'métadonnée', donnees: 'données', reference: 'référence', references: 'références', categorie: 'catégorie', categories: 'catégories', priorite: 'priorité', periodique: 'périodique',
    recolement: 'récolement', restauration: 'restauration', reliure: 'reliure', desacidification: 'désacidification', consolidation: 'consolidation', nettoyage: 'nettoyage', conditionnement: 'conditionnement',
    mouvement: 'mouvement', original: 'original', exposition: 'exposition', pret: 'prêt', entrant: 'entrant', sortie: 'sortie', retour: 'retour', remettre: 'remettre', rendre: 'rendre', prendre: 'prendre', charge: 'charge',
    echec: 'échec', succes: 'succès', erreur: 'erreur', partiel: 'partiel', ancien: 'ancien', ancienne: 'ancienne', constat: 'constat', avant: 'avant', apres: 'après', intervention: 'intervention', requise: 'requise',
    habituel: 'habituel', autre: 'autre', emplacement: 'emplacement', introuvable: 'introuvable', verifiee: 'vérifiée', libre: 'libre', precautions: 'précautions', interdite: 'interdite', aucune: 'aucune', urgente: 'urgente',
    noir: 'noir', blanc: 'blanc', gris: 'gris', couleur: 'couleur', plat: 'plat', alimentateur: 'alimentateur', planetaire: 'planétaire', film: 'film', recto: 'recto', verso: 'verso', especes: 'espèces', virement: 'virement',
    mobile: 'mobile', money: 'money', texte: 'texte', long: 'long', entier: 'entier', decimal: 'décimal', booleen: 'booléen', liste: 'liste', collecte: 'collecte', versement: 'versement', don: 'don', achat: 'achat',
    restitution: 'restitution', attente: 'attente', paiement: 'paiement', venir: 'venir', annee: 'année', annees: 'années', jours: 'jours', mois: 'mois', serie: 'série', fonds: 'fonds', rubrique: 'rubrique', dossier: 'dossier',
    document: 'document', national: 'national', interne: 'interne', confidentiel: 'confidentiel', secret: 'secret', public: 'public', restreint: 'restreint', publication: 'publication', gel: 'gel', juridique: 'juridique',
    levee: 'levée', leve: 'levé', evenement: 'événement', evenements: 'événements', echeance: 'échéance', decision: 'décision', validation: 'validation', soumission: 'soumission', brouillon: 'brouillon', actif: 'actif', active: 'active',
    inactif: 'inactif', inactive: 'inactive', suspendu: 'suspendu', archive: 'archivé', semi: 'semi', stable: 'stable', fragile: 'fragile', traitement: 'traitement', demarrer: 'démarrer', valider: 'valider',
    constate: 'constaté', ailleurs: 'ailleurs', sorti: 'sorti', retard: 'retard', non: 'non', oui: 'oui'
};

/** Vrai pour un code technique : MAJUSCULES, chiffres et soulignés. */
export const isCodeLike = (value: string): boolean => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value);

/** « A_VERIFIER » → « À vérifier », « ETABLISSEMENT_PUBLIC » → « Établissement public » : le premier mot prend la majuscule, les accents courants sont rétablis. */
export function humanize(code: string): string {
    const words = code.toLowerCase().split('_').filter(Boolean).map(word => WORDS[word] ?? word);
    if (!words.length) return code;
    const first = words[0]!;
    words[0] = first.charAt(0).toLocaleUpperCase('fr-FR') + first.slice(1);
    return words.join(' ');
}

/** Un texte à montrer : un code technique est rendu lisible, un texte saisi par une personne reste tel quel. */
export const display = (value: string | null | undefined, fallback = '—'): string => value === null || value === undefined || value === '' ? fallback : isCodeLike(value) ? humanize(value) : value;

// ---------- libellés par domaine

export const LABELS = {
    institutionType: { MINISTERE: 'Ministère', DIRECTION_GENERALE: 'Direction générale', ETABLISSEMENT_PUBLIC: 'Établissement public', COLLECTIVITE: 'Collectivité', AUTRE: 'Autre' },
    metadataType: { TEXTE: 'Texte', TEXTE_LONG: 'Texte long', ENTIER: 'Nombre entier', DECIMAL: 'Nombre décimal', BOOLEEN: 'Oui / non', DATE: 'Date', DATETIME: 'Date et heure', UUID: 'Identifiant', ENUM: 'Liste de choix', TERME: 'Terme d’un vocabulaire' },
    /** Les types d'unité d'une institution (les codes de la base) : un code ne s'affiche jamais tel quel. */
    unitType: { DIRECTION: 'Direction', DIRECTION_GENERALE: 'Direction générale', DIRECTION_NATIONALE: 'Direction nationale', DIVISION: 'Division', INSPECTION_GENERALE: 'Inspection générale', ORGANE_SPECIALISE: 'Organe spécialisé', SECRETARIAT: 'Secrétariat', SERVICE: 'Service', SERVICE_APPUI: 'Service d’appui', SERVICE_RATTACHE: 'Service rattaché', DEPARTEMENT: 'Département', BUREAU: 'Bureau', CABINET: 'Cabinet' },
    confidentiality: { PUBLIC: 'Public', INTERNE: 'Interne', CONFIDENTIEL: 'Confidentiel', SECRET: 'Secret' },
    workflowDomain: { DOCUMENT: 'Document', DOSSIER: 'Dossier' },
    outcome: { SUCCES: 'Succès', ECHEC: 'Échec', SUCCESS: 'Succès', FAILED: 'Échec', DENIED: 'Refusé' }
} as const satisfies Record<string, Record<string, string>>;
export type LabelDomain = keyof typeof LABELS;

/** Le libellé d'un code dans un domaine connu ; hors domaine, le code est rendu lisible. */
export function label(domain: LabelDomain, code: string | null | undefined, fallback = '—'): string {
    if (code === null || code === undefined || code === '') return fallback;
    return (LABELS[domain] as Record<string, string>)[code] ?? display(code, fallback);
}

// ---------- dates

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Une date sans heure : « 9 oct. 2026 » ; accepte aussi une année (« 1960 ») ou un mois (« 1960-05 ») tels qu'ils se saisissent dans un inventaire. */
export function formatDay(value: string | null | undefined, fallback = '—'): string {
    if (!value) return fallback;
    if (/^[0-9]{4}$/.test(value)) return value;
    if (/^[0-9]{4}-[0-9]{2}$/.test(value)) { const d = new Date(value + '-01T00:00:00Z'); return Number.isNaN(d.valueOf()) ? 'Date invalide' : MONTH.format(d); }
    const d = new Date(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ? value + 'T00:00:00Z' : value);
    return Number.isNaN(d.valueOf()) ? 'Date invalide' : DAY.format(d);
}

// ---------- nombres et tailles

const NUMBER = new Intl.NumberFormat('fr-FR');
/** « 1 234 567 » (espaces insécables entre milliers). */
export const formatNumber = (n: number): string => Number.isFinite(n) ? NUMBER.format(n) : '—';

/** Une taille de fichier à la française : « 842 o », « 1,6 Ko », « 12,4 Mo ». */
export function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${NUMBER.format(bytes)} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let value = bytes / 1024, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

// ---------- typographie

/** Apostrophes droites entre deux lettres → apostrophes typographiques (les messages du serveur en portent encore) ; « ... » → « … ». */
export function typo(text: string): string {
    return text.replace(/([A-Za-zÀ-ÿ])'(?=[A-Za-zÀ-ÿ])/g, '$1’').replace(/\.\.\./g, '…');
}

// ---------- noms de remplacement (jamais un bout d'identifiant)

/** Un élément de numérisation se nomme par sa description, sinon par son numéro d'ordre. */
export const elementName = (description: string | null | undefined, order?: number | null): string =>
    description?.trim() || (order !== null && order !== undefined ? `Élément n° ${order}` : 'Élément sans description');

/** Une page de fichier se nomme par son numéro, sinon c'est « le fichier ». */
export const fileName = (page: number | null | undefined): string => page ? `Page ${page}` : 'Fichier sans numéro de page';
