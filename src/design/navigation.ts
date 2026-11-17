import { conservationVisible, scannerVisible, retentionVisible } from '../core/screenAccess';
import { activeGrant, can } from '../core/policy';
import type { Me, ScopeTarget } from '../core/types';
/** Visual visibility only. Every API operation must still be authorized on the server. */
export const modulePermissions: Record<string, { codes: string[]; national?: boolean; anyScope?: boolean }> = {
  scanners:{codes:['DIGITIZATION_READ','FILE_INGEST'],anyScope:true},
  acquisition:{codes:['FILE_INGEST','ACQUISITION_IMPORT_PREVIEW','ACQUISITION_EXTRACT','ACQUISITION_REVIEW'],anyScope:true},
  documents: {codes:['DOCUMENT_READ']}, dossiers:{codes:['DOSSIER_READ']},
  fonds:{codes:['ARCHIVAL_DESCRIPTION_READ']}, classement:{codes:['CLASSIFICATION_READ']},
  metadonnees:{codes:['METADATA_SCHEMA_MANAGE']}, vocabulaires:{codes:['VOCABULARY_MANAGE']}, codification:{codes:['CODIFICATION_MANAGE']}, gec:{codes:['GEC_READ','GEC_MANAGE']},
  'tableau-de-bord':{codes:['DOCUMENT_READ','DOSSIER_READ','RETENTION_REVIEW','HERITAGE_READ'],anyScope:true}, 'tableau-national':{codes:['DASHBOARD_NATIONAL_READ'],national:true},
  versements:{codes:['ARCHIVAL_INTAKE_READ'], national:true},
  recherche:{codes:['SEARCH_READ'], anyScope:true},
  consultations:{codes:['CONSULTATION_READ','CONSULTATION_REVIEW']}, communications:{codes:['COMMUNICATION_READ']},
  droits:{codes:['RIGHTS_READ'],national:true},
  portail:{codes:['PORTAL_READ','PORTAL_PLAN_MANAGE','PORTAL_READER_MANAGE','PORTAL_CASHIER','PORTAL_SUPERVISE'],national:true},
  'salle-lecture':{codes:['READING_ROOM_READ','READING_ROOM_DESK','READING_ROOM_MANAGE']},
  numerisation:{codes:['DIGITIZATION_READ'],anyScope:true}, ocr:{codes:['DIGITIZATION_READ'],anyScope:true},
  controle:{codes:['DIGITIZATION_READ'],anyScope:true},
  taches:{codes:['WORKFLOW_TASK_CLAIM','WORKFLOW_TASK_COMPLETE'],anyScope:true},
  'circuits-validation':{codes:['WORKFLOW_DEFINITION_MANAGE']},
  conservation:{codes:['PRESERVATION_EVENT_READ']},
  'sort-final':{codes:['RETENTION_REVIEW']}, 'gel-legal':{codes:['LEGAL_HOLD_MANAGE']},
  eliminations:{codes:['RETENTION_REVIEW']},
  'archives-physiques':{codes:['PHYSICALARCHIVES_READ'],anyScope:true},
  patrimoine:{codes:['HERITAGE_READ'],national:true}, restauration:{codes:['RESTORATION_READ'],anyScope:true},
  audit:{codes:['AUDIT_READ'],national:true}
};
export function moduleVisible(me: Me|null, route: string, scope: ScopeTarget, demo = false): boolean {
  if (demo) return true; // Only synthetic data is used in this isolated design mode.
  if (route === 'sort-final' || route === 'eliminations') return retentionVisible(me, scope);
  if (route === 'scanners') return scannerVisible(me);
  if (route === 'conservation') return conservationVisible(me, scope);
  const rule = modulePermissions[route];
  if (!rule) return !['indicateurs','statistiques'].includes(route);
  if (rule.anyScope) return !!me && me.user.status === 'ACTIF' && me.user.accountType === 'USER' && me.grants.some(g=>rule.codes.includes(g.permission)&&activeGrant(g));
  return rule.codes.some(code=>can(me,code,rule.national?{}:scope));
}
/** Ordre métier commun au menu et aux raccourcis. Les routes et leurs droits restent inchangés. */
export const navGroups = [
  {id:'workspace', label:'Mon activité', icon:'home', routes:['recherche','taches','notifications']},
  {id:'collect', label:'Collecte & traitement', icon:'scanner', routes:['acquisition','scanners','versements','gec','numerisation','ocr','controle','traitement']},
  {id:'records', label:'Archives & classement', icon:'folder', routes:['documents','dossiers','fonds','classement']},
  {id:'access', label:'Consultation & diffusion', icon:'eye', routes:['espace-lecteurs','consultations','communications','salle-lecture','portail']},
  {id:'preserve', label:'Conservation & patrimoine', icon:'shield', routes:['archives-physiques','conservation','patrimoine','restauration','sort-final','gel-legal','eliminations']},
  {id:'steering', label:'Pilotage', icon:'chart', routes:['tableau-de-bord','tableau-national','statistiques','audit']},
  {id:'reference', label:'Référentiels & règles', icon:'tag', routes:['metadonnees','vocabulaires','codification','droits','circuits-validation']},
  {id:'identity', label:'Administration', icon:'users', routes:['users','groups','roles','permissions','institutions','departments','governance']},
  {id:'support', label:'Aide & profil', icon:'help', routes:['profile','help','parcours']}
];
export type NavigationItem = { path: string; label: string; ok: boolean; demo?: boolean };
/** Filtrer avant de regrouper : une rubrique vide ne révèle aucun écran non autorisé. */
export function navigationSections<T extends NavigationItem>(items: readonly T[]) {
  const remaining = new Map(items.filter(item => item.ok).map(item => [item.path, item]));
  const sections = navGroups.map(group => ({...group, items: group.routes.flatMap(path => {
    const item = remaining.get(path);
    remaining.delete(path);
    return item ? [item] : [];
  })})).filter(group => group.items.length > 0);
  // Un nouvel écran autorisé reste accessible même avant son classement dans ce catalogue.
  if (remaining.size) sections.push({id:'other', label:'Autres espaces', icon:'grid', routes:[...remaining.keys()], items:[...remaining.values()]});
  return sections;
}
/** Icône de chaque entrée du menu latéral (clé = route). */
export const navIcons: Record<string,string> = {
  institutions:'building', departments:'users', users:'user', groups:'userCheck', roles:'shield', permissions:'key', governance:'scale',
  versements:'inbox', acquisition:'download', documents:'document', dossiers:'folder', classement:'tree', metadonnees:'tag', vocabulaires:'tag', codification:'tag', gec:'inbox', 'tableau-de-bord':'chart', 'tableau-national':'chart', fonds:'landmark',
  'espace-lecteurs':'eye', recherche:'search', consultations:'eye', communications:'send', droits:'scale', portail:'users', 'salle-lecture':'book',
  numerisation:'scanner', ocr:'ocr', taches:'inbox', controle:'checkCircle', 'circuits-validation':'userCheck',
  conservation:'box', 'sort-final':'hourglass', 'gel-legal':'snow', eliminations:'trash', 'archives-physiques':'archive',
  patrimoine:'landmark', restauration:'wrench', statistiques:'chart', audit:'history',
  scanners:'scanner', notifications:'bell', traitement:'chart', parcours:'tree', profile:'user', help:'help'
};
