/**
 * Interface bilingue : le français est la langue source, l'anglais une traduction **partielle**. Les textes de l'application sont écrits en français ; le catalogue associe à un texte
 * français sa traduction anglaise. Un texte absent du catalogue reste en français : on ne devine jamais une traduction, et rien ne casse quand un écran n'est pas traduit.
 *
 * Deux catalogues : `EN` ci-dessous (la coque, les composants communs, la connexion, les notifications, lus par `tr`) et `EN_SCREENS` (`i18nScreens.ts`, **généré** par
 * `scripts/i18n-build.mjs`, les écrans métier), chargé à la demande et appliqué à l'affichage par `ui/domTranslator.ts` : les écrans n'appellent pas `tr`.
 * **Non couvert** : les textes envoyés par le serveur (messages d'erreur, titres de notifications), les données (titres, noms), les documents imprimables et les dates (toujours en
 * français, UTC). Aucune relecture par un traducteur. Voir `docs/INTERFACE-BILINGUE.md` du serveur. Pour un nouvel écran : écrire le texte en français, puis
 * `node scripts/i18n-build.mjs freeze`, traduire le lot, `build`.
 */
export type Locale = 'fr' | 'en';

export const LOCALES: Array<{ code: Locale; label: string; tag: string }> = [
    { code: 'fr', label: 'Français', tag: 'fr' },
    { code: 'en', label: 'English', tag: 'en' }
];
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_STORAGE_KEY = 'snae-locale-v1';

/** Une valeur lue d'un stockage ou d'un réglage devient une langue connue, ou le français. */
export function parseLocale(value: unknown): Locale {
    return value === 'en' ? 'en' : DEFAULT_LOCALE;
}

export const EN: Readonly<Record<string, string>> = {
    // ---- coque : accès, navigation, groupes
    'Aller au contenu': 'Skip to content',
    'Aller à la connexion': 'Skip to sign-in',
    'Fermer le menu': 'Close the menu',
    'Fermer la navigation': 'Close navigation',
    'Ouvrir le menu': 'Open the menu',
    'Navigation principale': 'Main navigation',
    'Tableau de bord': 'Dashboard',
    'Armoiries de la République de Guinée': 'Coat of arms of the Republic of Guinea',
    'Système National d’Archivage Électronique et du Patrimoine Documentaire': 'National System for Electronic Archiving and Documentary Heritage',
    'République de Guinée': 'Republic of Guinea',
    'République de Guinée — retour au tableau de bord': 'Republic of Guinea — back to the dashboard',
    'Travail – Justice – Solidarité': 'Work – Justice – Solidarity',
    'Bêta': 'Beta',
    'Maquette': 'Mockup',
    'Démonstration': 'Demonstration',
    'Identité & organisation': 'Identity & organization',
    'Collecte': 'Collection',
    'Archives': 'Archives',
    'Accès': 'Access',
    'Traitements': 'Processing',
    'Conservation': 'Preservation',
    'Patrimoine': 'Heritage',
    'Pilotage': 'Steering',
    'Accompagnement': 'Support',
    // ---- coque : entrées de menu
    'Institutions': 'Institutions',
    'Départements': 'Departments',
    'Utilisateurs': 'Users',
    'Rôles et habilitations': 'Roles and permissions',
    'Permissions': 'Permissions',
    'Gouvernance': 'Governance',
    'Acquisition & imports': 'Acquisition & imports',
    'Fonds et producteurs': 'Fonds and producers',
    'Motifs et sources juridiques': 'Grounds and legal sources',
    'Circuits de validation': 'Validation workflows',
    'Scanners': 'Scanners',
    'Suivi du traitement': 'Processing tracking',
    'Archives physiques': 'Physical archives',
    'Mes notifications': 'My notifications',
    'Mon profil': 'My profile',
    'Guide & assistance': 'Guide & support',
    'Parcours utilisateurs': 'User journeys',
    'Versements': 'Accessions',
    'Documents': 'Documents',
    'Dossiers': 'Files',
    'Plan de classement': 'Classification scheme',
    'Métadonnées': 'Metadata',
    'Vocabulaires contrôlés': 'Controlled vocabularies',
    'Codification des références': 'Reference codification',
    'Recherche': 'Search',
    'Consultations': 'Consultations',
    'Communications': 'Communications',
    'Numérisation': 'Digitization',
    'OCR et indexation': 'OCR and indexing',
    'Contrôle qualité': 'Quality control',
    'Durées et sort final': 'Retention periods and final disposition',
    'Gel et restrictions': 'Holds and restrictions',
    'Éliminations': 'Destructions',
    'Salle de lecture': 'Reading room',
    'Portail des lecteurs': 'Readers portal',
    'Patrimoine historique': 'Historical heritage',
    'Restauration': 'Restoration',
    'Indicateurs': 'Indicators',
    'Journal et traçabilité': 'Log and traceability',
    // ---- coque : en-tête, menu utilisateur, périmètre, pied de page
    'Rechercher un document, un dossier, une référence': 'Search for a document, a file, a reference',
    'Rechercher un document, un dossier, une référence…': 'Search for a document, a file, a reference…',
    'Accès rapides aux espaces': 'Quick access to spaces',
    'Accès rapides': 'Quick access',
    'Menu de': 'Menu of',
    'Utilisateur': 'User',
    'Administrateur': 'Administrator',
    'Périmètre départemental': 'Department scope',
    'Périmètre institutionnel': 'Institution scope',
    'Changer de périmètre': 'Change scope',
    'Se déconnecter': 'Sign out',
    'Périmètre de travail': 'Working scope',
    'Choisir une institution': 'Choose an institution',
    'Choisir un département': 'Choose a department',
    'Fermer': 'Close',
    'SNAE-PPD · Archives et patrimoine documentaire': 'SNAE-PPD · Archives and documentary heritage',
    'Proposition institutionnelle · F3 · Recette': 'Institutional proposal · F3 · Acceptance testing',
    'Cet espace n’est pas disponible dans vos habilitations pour le périmètre choisi. Consultez votre profil ou changez de périmètre.':
        'This space is not available with your permissions for the chosen scope. Check your profile or change scope.',
    'Cette section exige une habilitation nationale de lecture de la numérisation.': 'This section requires a national permission to read digitization.',
    'Identifiant de ressource invalide.': 'Invalid resource identifier.',
    'Langue': 'Language',
    // ---- composants communs
    'Chargement des données…': 'Loading data…',
    'Aucun résultat': 'No results',
    'Aucune donnée dans ce périmètre.': 'No data in this scope.',
    'Une erreur est survenue.': 'An error occurred.',
    'Accès refusé': 'Access denied',
    'Conflit de données': 'Data conflict',
    'Opération non aboutie': 'Operation failed',
    'Ne créez pas une nouvelle intention à l’aveugle. Consultez l’état courant avant de répéter.': 'Do not create a new request blindly. Check the current state before repeating.',
    'Référence :': 'Reference:',
    'Réessayer la lecture': 'Retry reading',
    'Précédente': 'Previous',
    'Suivante': 'Next',
    'Copier l’identifiant': 'Copy the identifier',
    'Date invalide': 'Invalid date',
    // ---- états (pastilles)
    'Actif': 'Active', 'Inactif': 'Inactive', 'Suspendu': 'Suspended', 'Archivé': 'Archived', 'National': 'National', 'Département': 'Department', 'Technique': 'Technical',
    'À examiner': 'To review', 'Appliquée': 'Applied', 'Rejetée': 'Rejected', 'Annulée': 'Cancelled', 'Révoqué': 'Revoked', 'Expiré': 'Expired', 'Brouillon': 'Draft',
    'Semi-actif': 'Semi-active', 'Archive définitive': 'Permanent archive', 'Élimination approuvée': 'Destruction approved', 'Détruit': 'Destroyed', 'Non publié': 'Unpublished',
    'Restreint': 'Restricted', 'Public': 'Public', 'Confidentiel': 'Confidential', 'Secret': 'Secret', 'Validée': 'Validated', 'Obsolète': 'Obsolete', 'Sain': 'Clean',
    'Infecté': 'Infected', 'En quarantaine': 'In quarantine', 'Échec': 'Failed', 'Analyse en attente': 'Scan pending', 'Validé': 'Validated', 'Rejeté': 'Rejected',
    'Planifiée': 'Scheduled', 'À échéance': 'Due', 'En décision': 'Awaiting decision', 'Clôturée': 'Closed', 'Proposée': 'Proposed', 'Exécutée': 'Executed',
    'Conserver définitivement': 'Keep permanently', 'Éliminer': 'Destroy', 'Transférer': 'Transfer', 'Réexaminer': 'Re-examine', 'Clos': 'Closed', 'En cours': 'In progress',
    'Terminé': 'Finished', 'Soumise': 'Submitted', 'Approuvée': 'Approved', 'Non validé': 'Not validated', 'Levée': 'Lifted', 'Expirée': 'Expired', 'Retiré': 'Withdrawn',
    'Ouverte': 'Open', 'Terminée': 'Finished', 'Déposée': 'Submitted', 'En instruction': 'Under review', 'Autorisée': 'Authorised', 'Refusée': 'Refused', 'Demandée': 'Requested',
    'Remise': 'Handed over', 'Restituée': 'Returned', 'Succès': 'Success', 'Partiel': 'Partial', 'À valider': 'To validate', 'En maintenance': 'Under maintenance', 'Ouvert': 'Open',
    // ---- connexion
    'Assistance': 'Help',
    'ARCHIVES ADMINISTRATIVES & PATRIMOINE': 'ADMINISTRATIVE ARCHIVES & HERITAGE',
    'Un espace de travail commun pour organiser les documents publics et préserver notre patrimoine documentaire.': 'A shared workspace to organise public records and preserve our documentary heritage.',
    'Organiser les documents': 'Organise documents',
    'Des dossiers structurés et des responsabilités claires.': 'Structured files and clear responsibilities.',
    'Maîtriser les accès': 'Control access',
    'Des habilitations nominatives, vérifiées par le serveur.': 'Named permissions, checked by the server.',
    'Préserver la mémoire': 'Preserve memory',
    'Une continuité entre administration et patrimoine.': 'Continuity between administration and heritage.',
    'Conserver aujourd’hui. Transmettre demain.': 'Preserve today. Hand down tomorrow.',
    'ESPACE PROFESSIONNEL': 'PROFESSIONAL SPACE',
    'Accès réservé aux utilisateurs habilités': 'Access restricted to authorised users',
    'Connexion à votre espace': 'Sign in to your space',
    'Retrouvez les services et les informations autorisés dans votre périmètre.': 'Find the services and information available within your scope.',
    'Environnement de démonstration': 'Demonstration environment',
    'Ouvrir la démonstration': 'Open the demonstration',
    'Ouverture…': 'Opening…',
    'Adresse e-mail professionnelle': 'Professional e-mail address',
    'Mot de passe': 'Password',
    'Un problème de connexion ?': 'Trouble signing in?',
    'Connexion en cours…': 'Signing in…',
    'Se connecter': 'Sign in',
    'Redirection…': 'Redirecting…',
    'Utilisez votre compte nominatif. Ne partagez jamais vos identifiants ni votre mot de passe.': 'Use your personal account. Never share your credentials or your password.',
    'Besoin d’un accès ?': 'Need access?',
    'Adressez-vous à l’administrateur de votre institution.': 'Contact your institution’s administrator.',
    'Pour une demande d’accès ou en cas de problème de connexion, écrivez à l’adresse suivante :': 'For an access request or a sign-in problem, write to the following address:',
    'Demande d’accès SNAE-PPD': 'SNAE-PPD access request',
    'Travail · Justice · Solidarité': 'Work · Justice · Solidarity',
    'Interface française': 'English interface',
    // ---- notifications
    'Notifications': 'Notifications',
    'Aucune notification disponible pour le moment': 'No notification available for now',
    'Tout marquer comme lu': 'Mark all as read',
    'Aucune notification pour le moment.': 'No notifications for now.',
    'Voir toutes les notifications': 'See all notifications',
    'MON ESPACE': 'MY SPACE',
    'Ce qui attend votre action : tâches de validation, versements à contrôler, décisions sur vos versements.': 'What is waiting for your action: validation tasks, accessions to check, decisions on your accessions.',
    'Les notifications ne sont pas disponibles en démonstration.': 'Notifications are not available in demonstration mode.',
    'Filtre des notifications': 'Notification filter',
    'Non lues': 'Unread', 'Toutes': 'All', 'Archivées': 'Archived',
    'Rien ne vous attend': 'Nothing is waiting for you',
    'Aucune notification archivée': 'No archived notifications',
    'Aucune notification': 'No notifications',
    'Toutes vos notifications sont lues.': 'All your notifications are read.',
    'La boîte est vide.': 'The inbox is empty.',
    'Ouvrir': 'Open',
    'Marquer comme lue': 'Mark as read',
    'Archiver': 'Archive',
    'Préférences de notification': 'Notification preferences',
    'Ce que vous souhaitez recevoir': 'What you want to receive',
    'Une catégorie refusée ne dépose plus rien dans votre boîte ; les décisions et les tâches elles-mêmes restent consultables dans leurs écrans.':
        'A category you turn off no longer puts anything in your inbox; the decisions and tasks themselves remain available on their own screens.',
    'Tâches de validation': 'Validation tasks',
    'Versements à contrôler': 'Accessions to check',
    'Décisions sur mes versements': 'Decisions on my accessions',
    'Bordereaux d’élimination à viser': 'Destruction schedules to approve',
    'Décisions sur mes bordereaux d’élimination': 'Decisions on my destruction schedules',
    'Bordereaux d’élimination à exécuter': 'Destruction schedules to carry out',
    'Bordereaux de versement à recevoir': 'Transfer lists to receive',
    'Réceptions de mes bordereaux de versement': 'Receipts of my transfer lists',
    'Bordereaux de versement à remettre': 'Transfer lists to hand over',
    'Demandes d’accès à instruire': 'Access requests to review',
    'Échéances de conservation': 'Retention deadlines',
    'Notification': 'Notification'
};

// ---- catalogues complémentaires (écrans métier) : chargés à la demande, par texte exact ou par modèle à paramètres

interface Template { pattern: RegExp; target: string }
const extra = new Map<string, string>();
const templates: Template[] = [];
const PLACEHOLDER = /\{n\}/g;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Ajoute un catalogue complémentaire. Une clé qui contient `{n}` est un **modèle** : chaque `{n}` capte un morceau de texte (un nombre, un nom) et la traduction le reprend par
 * `{1}`, `{2}`… dans l'ordre des captures. Exemple : « Sur {n} fichiers : {n} conformes » → « Out of {1} files: {2} compliant ».
 */
export function registerCatalog(entries: Readonly<Record<string, string>>): void {
    for (const [source, target] of Object.entries(entries)) {
        if (!source.includes('{n}')) { extra.set(source, target); continue; }
        const body = source.split(PLACEHOLDER).map(part => part.replace(REGEX_SPECIALS, '\\$&')).join('(.+?)');
        templates.push({ pattern: new RegExp('^' + body + '$', 's'), target });
    }
}

/** Remet le registre à zéro (tests). */
export function resetCatalogs(): void { extra.clear(); templates.length = 0; memo.clear(); }

const memo = new Map<string, string | null>();
const MEMO_LIMIT = 20000;

/** La traduction d'un texte déjà nettoyé de ses espaces de bordure, ou null s'il n'est dans aucun catalogue. */
const own = (text: string): string | undefined => Object.prototype.hasOwnProperty.call(EN, text) ? EN[text] : undefined;

function lookup(text: string): string | null {
    const exact = own(text) ?? extra.get(text);
    if (exact !== undefined) return exact;
    if (templates.length === 0 || text.length > 400) return null;
    const cached = memo.get(text);
    if (cached !== undefined) return cached;
    let found: string | null = null;
    for (const { pattern, target } of templates) {
        const match = pattern.exec(text);
        if (match) { found = target.replace(/\{(\d+)\}/g, (whole, index) => match[Number(index)] ?? whole); break; }
    }
    if (memo.size >= MEMO_LIMIT) memo.clear();
    memo.set(text, found);
    return found;
}

const NUMBER_HEAD = /^(\d[\d.,/:%-]*)\s+(\D.*)$/s;
const NUMBER_TAIL = /^(\D.*?)\s+(\d[\d.,/:%-]*)$/s;

/**
 * Un texte « 50 % vérifié » ou « Page 3 » est une valeur chiffrée collée à un texte du catalogue (le code assemble la valeur et le libellé). Si le reste est dans le catalogue,
 * la valeur est conservée telle quelle. Seule une valeur qui commence par un chiffre est reconnue : un nom ou une phrase n'est jamais découpé.
 */
function withNumber(text: string): string | null {
    const head = NUMBER_HEAD.exec(text);
    if (head) { const rest = lookup(head[2] ?? ''); if (rest !== null) return `${head[1]} ${rest}`; }
    const tail = NUMBER_TAIL.exec(text);
    if (tail) { const rest = lookup(tail[1] ?? ''); if (rest !== null) return `${rest} ${tail[2]}`; }
    return null;
}

/**
 * Un libellé repris en milieu de phrase change de casse (« à relire » pour « À relire », « Ligne » pour « ligne ») : on cherche la forme de l'autre casse et on rend la traduction
 * dans la casse du texte affiché. Une traduction qui commence par un sigle (« SKOS import ») garde sa majuscule.
 */
function withCase(text: string): string | null {
    const first = text[0];
    if (!first) return null;
    const upper = first.toLocaleUpperCase('fr'), lower = first.toLocaleLowerCase('fr');
    const recase = (value: string, toUpper: boolean): string => {
        const head = value[0], second = value[1];
        if (!head || (second !== undefined && second !== second.toLowerCase())) return value;
        return (toUpper ? head.toLocaleUpperCase('en') : head.toLocaleLowerCase('en')) + value.slice(1);
    };
    if (first === lower && upper !== first) { const found = lookup(upper + text.slice(1)); return found === null ? null : recase(found, false); }
    if (first === upper && lower !== first) { const found = lookup(lower + text.slice(1)); return found === null ? null : recase(found, true); }
    return null;
}

/** Le nombre de textes et de modèles des catalogues complémentaires (pour les mesures de couverture). */
export function catalogSize(): { exact: number; templates: number } { return { exact: extra.size, templates: templates.length }; }

/**
 * La traduction d'un texte français dans la langue demandée ; le texte lui-même si la langue est le français ou s'il n'est pas traduit. Les espaces de bordure sont conservés :
 * les textes d'une interface sont souvent des morceaux (« · à revoir avant le »).
 */
export function translate(locale: Locale, text: string): string {
    if (locale !== 'en') return text;
    const direct = own(text);
    if (direct !== undefined) return direct;
    const trimmed = text.trim();
    if (trimmed.length === 0) return text;
    // Le catalogue est écrit avec des espaces simples : un texte composé de plusieurs morceaux peut en porter deux (« un compte  habilité »), il se retrouve en les réduisant.
    const found = lookup(trimmed) ?? (/\s{2,}|[\n\t]/.test(trimmed) ? lookup(trimmed.replace(/\s+/g, ' ')) : null) ?? withNumber(trimmed) ?? withCase(trimmed);
    if (found === null) return text;
    const start = text.length - text.trimStart().length;
    return text.slice(0, start) + found + text.slice(text.trimEnd().length);
}

/** Les textes du catalogue sans traduction utile (vide, ou identique à la source alors qu'un mot a été traduit ailleurs) : vide quand le catalogue est sain. */
export function catalogProblems(catalog: Readonly<Record<string, string>> = EN): string[] {
    return Object.entries(catalog).flatMap(([source, target]) => {
        const problems: string[] = [];
        if (source.trim().length === 0) problems.push('une clé vide');
        if (target.trim().length === 0) problems.push(`« ${source} » n'a pas de traduction`);
        if (source !== source.trim() || target !== target.trim()) problems.push(`« ${source} » a des espaces en bordure`);
        return problems;
    });
}

/** Un texte avec un nombre : « 3 éléments sur cette page · page 2 » ou sa version anglaise. Le pluriel suit la langue. */
export function pageSummary(locale: Locale, count: number, page: number): string {
    return locale === 'en'
        ? `${count} item${count === 1 ? '' : 's'} on this page · page ${page}`
        : `${count} élément${count > 1 ? 's' : ''} sur cette page · page ${page}`;
}
