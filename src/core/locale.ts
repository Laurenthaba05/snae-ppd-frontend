/**
 * La langue des chiffres, des dates et des mois que l'écran montre. L'interface est écrite en français et traduite à la volée en anglais (voir ui/i18n) ; ce qui n'est pas un texte à
 * traduire — un nombre, une date, un nom de mois — se met en forme ici selon la langue du document (`lang` de la page), pour que l'anglais ne montre pas « 3 350 », « 21/10/2026 » ni « Févr. ».
 * Hors navigateur (tests du cœur), c'est le français.
 */
export type LocaleTag = 'fr-FR' | 'en-GB';

export const localeTag = (): LocaleTag => typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en-GB' : 'fr-FR';
const english = (): boolean => localeTag() === 'en-GB';

/** « 3 350 » en français, « 3,350 » en anglais. */
export const formatNumber = (n: number): string => n.toLocaleString(localeTag());

/** Un pourcentage entier : « 13 % » en français (espace avant le signe), « 13% » en anglais. */
export const formatPercent = (n: number): string => english() ? n + '%' : n + ' %';

/** « 21/10/2026 » dans les deux langues, mais le même jour de l'année pour tous (jour/mois/année). */
export const formatShortDate = (date: Date): string => date.toLocaleDateString(localeTag());
export const formatClock = (date: Date): string => date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
/** « mercredi 21 octobre 2026 » / « Wednesday 21 October 2026 ». */
export const formatLongDate = (date: Date): Intl.DateTimeFormatPart[] => new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(date);

const MONTHS_FR = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const MONTHS_EN = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

/** Le nom abrégé d'un mois (0 = janvier). */
export const monthShort = (index: number): string => (english() ? MONTHS_EN : MONTHS_FR)[index] ?? '';
