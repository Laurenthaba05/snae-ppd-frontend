import { EXTENT_UNITS, extentText } from './archivalDescription.js';

export interface ArchiveIdentifier { type: string; value: string; source?: string | null; label?: string | null; uri?: string | null }
export interface ArchiveDate { type: string; start?: string | null; end?: string | null; expression?: string | null; certainty: string; calendar: string }
export interface ArchiveProducer { authorityId: string; role: string; start?: string | null; end?: string | null }
export interface ArchiveExtent { quantity: string; unit: string; medium?: string | null; portion: string; dimensions?: string | null }
export interface ArchiveProcessing { priority: string; status: string; plan?: string | null; estimatedHours?: number | null; actualHours?: number | null; processors: string[]; funding?: string | null }
export interface DescriptionEnrichment { identifiers: ArchiveIdentifier[]; dates: ArchiveDate[]; producers: ArchiveProducer[]; extents: ArchiveExtent[]; processing?: ArchiveProcessing | null }
export const emptyEnrichment = (): DescriptionEnrichment => ({ identifiers: [], dates: [], producers: [], extents: [], processing: null });
export const emptyProcessing = (): ArchiveProcessing => ({ priority: 'NORMALE', status: 'A_PLANIFIER', processors: [] });
export const DATE_TYPES: Record<string,string> = { CREATION: 'Création', ACCUMULATION: 'Accumulation', PUBLICATION: 'Publication', AUTRE: 'Autre' };
export const CERTAINTIES: Record<string,string> = { EXACTE: 'Exacte', ESTIMEE: 'Estimée', INCERTAINE: 'Incertaine', INCONNUE: 'Inconnue' };
export const CALENDARS: Record<string,string> = { GREGORIEN: 'Grégorien', JULIEN: 'Julien', HEGIRIEN: 'Hégirien', AUTRE: 'Autre' };
export const PRIORITIES: Record<string,string> = { BASSE: 'Basse', NORMALE: 'Normale', HAUTE: 'Haute', URGENTE: 'Urgente' };
export const PROCESSING_STATES: Record<string,string> = { A_PLANIFIER: 'À planifier', PLANIFIE: 'Planifié', EN_COURS: 'En cours', A_RELIRE: 'À relire', TERMINE: 'Terminé', SUSPENDU: 'Suspendu' };

export function dateBounds(value?: string | null): [string,string] | null {
    if (!value) return null;
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return null;
    const [y,m,d] = value.split('-').map(Number); if (!y || y > 9999) return null;
    if (m !== undefined && (m < 1 || m > 12)) return null;
    const days = m === undefined ? 31 : [31, y%4===0 && (y%100!==0 || y%400===0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31][m-1]!;
    if (d !== undefined && (d < 1 || d > days)) return null;
    return [value.length===4 ? value+'-01-01' : value.length===7 ? value+'-01' : value,
        value.length===4 ? value+'-12-31' : value.length===7 ? value+'-'+days : value];
}
export function safeReferenceUri(value?: string | null): boolean {
    if (!value) return true;
    try { const u=new URL(value); return ['https:','http:','urn:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function enrichmentProblems(e?: DescriptionEnrichment | null): string[] {
    if (!e) return [];
    const p:string[]=[];
    if ([e.identifiers,e.dates,e.producers,e.extents].some(a=>a.length>50)) p.push('Maximum 50 lignes par liste.');
    if (JSON.stringify(e).length>10000) p.push('Les enrichissements dépassent 10 000 caractères.');
    for (const x of e.identifiers) {
        if (!x.type.trim() || !x.value.trim()) p.push('Chaque identifiant nécessite un type et une valeur.');
        if (!safeReferenceUri(x.uri)) p.push('L’URI doit utiliser http, https ou urn, sans identifiants de connexion.');
    }
    if (new Set(e.identifiers.map(x=>JSON.stringify([x.type.trim().toLowerCase(),x.value.trim(),x.source?.trim()??'']))).size!==e.identifiers.length) p.push('Un identifiant est répété.');
    const period=(start?:string|null,end?:string|null) => {
        const a=dateBounds(start), b=dateBounds(end);
        if ((start&&!a)||(end&&!b)) p.push('Date invalide : utilisez AAAA, AAAA-MM ou AAAA-MM-JJ.');
        if(a&&b&&a[0]>b[1]) p.push('La fin de période précède le début.');
    };
    for(const x of e.dates) {
        period(x.start,x.end);
        if (!x.start&&!x.end&&!x.expression?.trim()) p.push('Renseignez une date ou son expression.');
        if(x.calendar!=='GREGORIEN'&&(x.start||x.end)) p.push('Pour un autre calendrier, utilisez uniquement l’expression originale.');
    }
    for(const x of e.producers) { if(!x.authorityId||!x.role.trim()) p.push('Chaque producteur nécessite une autorité et un rôle.'); period(x.start,x.end); }
    for(const x of e.extents) if(!/^\d+(?:\.\d{1,3})?$/.test(x.quantity)||Number(x.quantity)>999999999.999||!EXTENT_UNITS.some(u=>u.code===x.unit)) p.push('Chaque volume nécessite une quantité positive (3 décimales au plus) et une unité.');
    if(e.processing) {
        for(const h of [e.processing.estimatedHours,e.processing.actualHours]) if(h!=null&&(!Number.isFinite(h)||h<0||h>1000000||Math.abs(h*100-Math.round(h*100))>0.000001)) p.push('Les heures sont positives, avec au plus deux décimales.');
        if(e.processing.processors.some(id=>!id)||new Set(e.processing.processors).size!==e.processing.processors.length) p.push('Choisissez des intervenants distincts.');
    }
    return [...new Set(p)];
}
export function enrichedDetails(input: { details: Record<string,string>; enrichment?: DescriptionEnrichment | null }): Record<string,string> {
    const d={...input.details}; const e=input.enrichment;
    if(!d.dateStart&&!d.dateEnd&&!d.dateLabel&&e?.dates[0]) { const x=e.dates[0]; d.dateLabel=x.expression||[x.start,x.end].filter(Boolean).join(' / '); }
    if(!extentText(d)&&e?.extents[0]) { d.extentQuantity=e.extents[0].quantity; d.extentUnit=e.extents[0].unit; }
    return d;
}
