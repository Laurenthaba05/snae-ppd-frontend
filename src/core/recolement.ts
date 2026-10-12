import type { CampaignStatus, ElementStatus, Recolement, RecolementElement, RecolementProgress, RecolementReport, RecolementTransitionOption } from './types.js';
import { MOTIF_MIN, motifValide } from './heritageAssets.js';
import { PRESENCE_SHORT, dayText, placeText } from './placement.js';

/* Récolement : vérifier la collection pièce par pièce, au lieu de la déclarer conforme.
   Un report n'est pas une vérification : il se compte à part et se motive. */

export const CAMPAIGN_LABELS: Record<CampaignStatus, string> = { PLANIFIEE: 'Planifiée', EN_COURS: 'En cours', CLOTUREE: 'Clôturée', ANNULEE: 'Annulée' };
export const ELEMENT_LABELS: Record<ElementStatus, string> = { A_VERIFIER: 'À vérifier', VERIFIE: 'Vérifié', REPORTE: 'Reporté' };
export const RECOLEMENT_JOURNAL_LABELS: Record<string, string> = { CREATION: 'Campagne créée', MODIFICATION: 'Modification', TRANSITION: 'Passage' };
export const RECOLEMENT_FIELD_LABELS: Record<string, string> = { libelle: 'Libellé', objet: 'Objet', localisation: 'Périmètre', dates: 'Dates prévues', statut: 'Étape' };

export const campaignLabel = (status: string | null | undefined): string => status ? (CAMPAIGN_LABELS[status as CampaignStatus] ?? status) : '—';
export const campaignTone = (status: CampaignStatus): 'ok' | 'warn' | 'bad' | '' => status === 'CLOTUREE' ? 'ok' : status === 'EN_COURS' ? 'warn' : status === 'ANNULEE' ? 'bad' : '';
export const isTerminal = (status: CampaignStatus): boolean => status === 'CLOTUREE' || status === 'ANNULEE';

/** Passage d'une campagne, du point de vue de la personne qui agit. */
export function recolementTransitionLabel(to: CampaignStatus): string {
    if (to === 'EN_COURS') return 'Lancer le récolement';
    if (to === 'CLOTUREE') return 'Clôturer la campagne';
    if (to === 'ANNULEE') return 'Annuler la campagne';
    return CAMPAIGN_LABELS[to] ?? to;
}
/** Ce que la personne doit écrire pour un passage : la conclusion d'une clôture, le motif d'une annulation. */
export const transitionTextLabel = (to: CampaignStatus): string => to === 'CLOTUREE' ? 'Conclusion de la campagne' : 'Motif';
export const transitionTextHint = (to: CampaignStatus): string => to === 'CLOTUREE'
    ? 'Ce que la campagne a établi : écarts constatés, éléments reportés, suites à donner. Conservé avec le procès-verbal.'
    : 'Conservé dans le journal de la campagne.';

export function transitionTextProblems(option: Pick<RecolementTransitionOption, 'vers' | 'motifRequis'>, text: string): string[] {
    if (option.motifRequis && !motifValide(text)) return [`${transitionTextLabel(option.vers)} : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`];
    return [];
}
export function transitionBody(vers: CampaignStatus, expectedVersion: number, text: string): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (text.trim()) body.texte = text.trim();
    return body;
}

export interface Segment { key: 'conformes' | 'autres' | 'introuvables' | 'reportes' | 'restants'; label: string; count: number; percent: number }
/** Les parts d'une barre d'avancement : chaque élément y figure une fois, un report n'est pas une vérification. */
export function progressSegments(p: RecolementProgress): Segment[] {
    if (p.total === 0) return [];
    const parts: Array<[Segment['key'], string, number]> = [['conformes', 'Présentes', p.conformes], ['autres', 'Trouvées ailleurs', p.autresEmplacements], ['introuvables', 'Introuvables', p.introuvables],
        ['reportes', 'Reportées', p.reportes], ['restants', 'À vérifier', p.restants]];
    return parts.map(([key, label, count]) => ({ key, label, count, percent: Math.round(count * 1000 / p.total) / 10 }));
}

/** Ce qui a été fait d'un élément, en une ligne. */
export function outcomeText(e: Pick<RecolementElement, 'statut' | 'resultat' | 'uniteConstatee' | 'motifReport' | 'enSortie'>): string {
    if (e.statut === 'VERIFIE') return (e.resultat ? PRESENCE_SHORT[e.resultat] : 'Vérifié') + (e.resultat === 'AUTRE_EMPLACEMENT' && e.uniteConstatee ? ' : ' + placeText(e.uniteConstatee) : '');
    if (e.statut === 'REPORTE') return 'Reporté : ' + (e.motifReport ?? '');
    return e.enSortie ? 'Archive sortie : à reporter, ou à vérifier à son retour' : 'À vérifier';
}
export const elementTone = (e: Pick<RecolementElement, 'statut' | 'resultat'>): 'ok' | 'warn' | 'bad' | '' =>
    e.statut === 'VERIFIE' ? (e.resultat === 'PRESENTE' ? 'ok' : e.resultat === 'ABSENTE' ? 'bad' : 'warn') : e.statut === 'REPORTE' ? 'warn' : '';

export const postponeProblems = (motif: string): string[] => motifValide(motif) ? [] : [`Un report exige un motif écrit d’au moins ${MOTIF_MIN} caractères (archive sortie, local inaccessible…).`];

export function dateRangeText(debut: string | null | undefined, fin: string | null | undefined): string {
    if (debut && fin) return `Du ${dayText(debut)} au ${dayText(fin)}`;
    if (debut) return `À partir du ${dayText(debut)}`;
    if (fin) return `Jusqu’au ${dayText(fin)}`;
    return 'Dates non fixées';
}

export interface RecolementForm { libelle: string; objet: string; localisationId: string; dateDebutPrevue: string; dateFinPrevue: string }
export const emptyRecolementForm = (): RecolementForm => ({ libelle: '', objet: '', localisationId: '', dateDebutPrevue: '', dateFinPrevue: '' });
export const formOf = (c: Pick<Recolement, 'libelle' | 'objet' | 'localisationId' | 'dateDebutPrevue' | 'dateFinPrevue'>): RecolementForm =>
    ({ libelle: c.libelle, objet: c.objet ?? '', localisationId: c.localisationId ?? '', dateDebutPrevue: c.dateDebutPrevue ?? '', dateFinPrevue: c.dateFinPrevue ?? '' });

export function recolementProblems(form: RecolementForm): string[] {
    const problems: string[] = [];
    if (!form.libelle.trim()) problems.push('Le libellé de la campagne est obligatoire.');
    if (form.dateDebutPrevue && form.dateFinPrevue && form.dateFinPrevue < form.dateDebutPrevue) problems.push('La date de fin prévue doit suivre la date de début prévue.');
    return problems;
}
/** Corps de la demande : les champs vides sont omis. */
export function recolementBody(form: RecolementForm): Record<string, unknown> {
    const body: Record<string, unknown> = { libelle: form.libelle.trim() };
    if (form.objet.trim()) body.objet = form.objet.trim();
    if (form.localisationId) body.localisationId = form.localisationId;
    if (form.dateDebutPrevue) body.dateDebutPrevue = form.dateDebutPrevue;
    if (form.dateFinPrevue) body.dateFinPrevue = form.dateFinPrevue;
    return body;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Procès-verbal de récolement imprimable : l'avancement, chaque écart et son sort actuel, les éléments reportés, la conclusion, les signatures. Tout le texte est échappé. */
export function reportHtml(campaign: Pick<Recolement, 'numero' | 'libelle' | 'objet' | 'localisation' | 'statut' | 'lanceLe' | 'clotureLe' | 'clotureResume' | 'dateDebutPrevue' | 'dateFinPrevue'>, report: RecolementReport): string {
    const p = report.progres;
    const row = (name: string, value: string) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`;
    const gaps = report.ecarts.length ? `<table class="list"><thead><tr><th>Cote</th><th>Bien</th><th>Constat</th><th>Aujourd’hui</th></tr></thead><tbody>${report.ecarts.map(g =>
        `<tr><td>${escapeHtml(g.element.cote)}</td><td>${escapeHtml(g.element.bienIdentifiant + ' — ' + g.element.bienIntitule)}</td><td>${escapeHtml(outcomeText(g.element))}${g.element.note ? '<br><small>' + escapeHtml(g.element.note) + '</small>' : ''}</td>` +
        `<td>${g.ouvert ? 'Écart encore ouvert' : 'Régularisé depuis'}</td></tr>`).join('')}</tbody></table>${report.ecartsTotal > report.ecarts.length ? `<p><small>${report.ecartsTotal - report.ecarts.length} autre(s) écart(s) non listé(s).</small></p>` : ''}` : '<p>Aucun écart constaté.</p>';
    const postponed = report.reportes.length ? `<table class="list"><thead><tr><th>Cote</th><th>Bien</th><th>Motif du report</th></tr></thead><tbody>${report.reportes.map(r =>
        `<tr><td>${escapeHtml(r.cote)}</td><td>${escapeHtml(r.bienIdentifiant + ' — ' + r.bienIntitule)}</td><td>${escapeHtml(r.motifReport ?? '')}</td></tr>`).join('')}</tbody></table>${report.reportesTotal > report.reportes.length ? `<p><small>${report.reportesTotal - report.reportes.length} autre(s) élément(s) reporté(s) non listé(s).</small></p>` : ''}` : '<p>Aucun élément reporté.</p>';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Procès-verbal ${escapeHtml(campaign.numero)}</title><style>
body{font:13px/1.5 system-ui,sans-serif;margin:32px;color:#16251f}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}p.sub{margin:0 0 16px;color:#46605a}
table{border-collapse:collapse;width:100%}table.meta th{text-align:left;width:220px;font-weight:600;padding:3px 8px 3px 0;vertical-align:top}table.meta td{padding:3px 0}
table.list th,table.list td{border:1px solid #c9d5cd;padding:4px 8px;text-align:left;vertical-align:top}table.list th{background:#eef3ef}
.conclusion{margin-top:18px;padding:10px 14px;border:2px solid #16251f;font-weight:600;white-space:pre-line}.sign{display:flex;gap:40px;margin-top:56px}.sign div{flex:1;border-top:1px solid #16251f;padding-top:6px;font-size:12px}
</style></head><body><h1>Procès-verbal de récolement ${escapeHtml(campaign.numero)}</h1><p class="sub">${escapeHtml(campaign.libelle)}</p><table class="meta">
${row('Périmètre', campaign.localisation.length ? campaign.localisation.join(' › ') : 'Toute l’institution')}${row('Dates prévues', dateRangeText(campaign.dateDebutPrevue, campaign.dateFinPrevue))}${row('Lancée le', dayText(campaign.lanceLe))}${row('Clôturée le', dayText(campaign.clotureLe))}${campaign.objet ? row('Objet', campaign.objet) : ''}</table>
<h2>Avancement</h2><table class="meta">${row('Éléments à vérifier', String(p.total))}${row('Présents à leur place', String(p.conformes))}${row('Trouvés ailleurs', String(p.autresEmplacements))}${row('Introuvables', String(p.introuvables))}${row('Reportés', String(p.reportes))}${row('Restant à vérifier', String(p.restants))}${row('Éléments vérifiés', p.verifiesPourcent + ' %')}</table>
<h2>Écarts constatés</h2>${gaps}<h2>Éléments reportés</h2>${postponed}
${campaign.clotureResume ? `<h2>Conclusion</h2><p class="conclusion">${escapeHtml(campaign.clotureResume)}</p>` : ''}
<div class="sign"><div>Responsable du lancement</div><div>Responsable de la clôture</div></div></body></html>`;
}
