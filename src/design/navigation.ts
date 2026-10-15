import { activeGrant, can } from '../core/policy';
import type { Me, ScopeTarget } from '../core/types';
/** Visual visibility only. Every API operation must still be authorized on the server. */
export const modulePermissions: Record<string, { codes: string[]; national?: boolean; anyScope?: boolean }> = {
  scanners:{codes:['DIGITIZATION_READ','FILE_INGEST'],anyScope:true},
  acquisition:{codes:['FILE_INGEST','ACQUISITION_IMPORT_PREVIEW','ACQUISITION_EXTRACT','ACQUISITION_REVIEW'],anyScope:true},
  documents: {codes:['DOCUMENT_READ']}, dossiers:{codes:['DOSSIER_READ']},
  fonds:{codes:['ARCHIVAL_DESCRIPTION_READ']}, classement:{codes:['CLASSIFICATION_READ']},
  metadonnees:{codes:['METADATA_SCHEMA_MANAGE']}, vocabulaires:{codes:['VOCABULARY_MANAGE']},
  versements:{codes:['ARCHIVAL_INTAKE_READ'], national:true},
  recherche:{codes:['SEARCH_READ'], anyScope:true},
  consultations:{codes:['CONSULTATION_READ']}, communications:{codes:['COMMUNICATION_READ']},
  droits:{codes:['RIGHTS_READ'],national:true},
  portail:{codes:['PORTAL_READ','PORTAL_PLAN_MANAGE','PORTAL_READER_MANAGE','PORTAL_CASHIER','PORTAL_SUPERVISE'],national:true},
  'salle-lecture':{codes:['READING_ROOM_READ','READING_ROOM_DESK','READING_ROOM_MANAGE']},
  numerisation:{codes:['DIGITIZATION_READ'],national:true}, ocr:{codes:['DIGITIZATION_READ'],national:true},
  controle:{codes:['DIGITIZATION_READ'],national:true},
  taches:{codes:['WORKFLOW_TASK_CLAIM','WORKFLOW_TASK_COMPLETE'],anyScope:true},
  'circuits-validation':{codes:['WORKFLOW_DEFINITION_MANAGE']},
  conservation:{codes:['PRESERVATION_EVENT_READ']},
  'sort-final':{codes:['RETENTION_REVIEW']}, 'gel-legal':{codes:['LEGAL_HOLD_MANAGE']},
  eliminations:{codes:['RETENTION_REVIEW']},
  'archives-physiques':{codes:['PHYSICALARCHIVES_READ'],national:true},
  patrimoine:{codes:['HERITAGE_READ'],national:true}, restauration:{codes:['RESTORATION_READ'],national:true},
  audit:{codes:['AUDIT_READ'],national:true}
};
export function moduleVisible(me: Me|null, route: string, scope: ScopeTarget, demo = false): boolean {
  if (demo) return true; // Only synthetic data is used in this isolated design mode.
  const rule = modulePermissions[route];
  if (!rule) return !['indicateurs','statistiques'].includes(route);
  if (rule.anyScope) return !!me && me.user.status === 'ACTIF' && me.user.accountType === 'USER' && me.grants.some(g=>rule.codes.includes(g.permission)&&activeGrant(g));
  return rule.codes.some(code=>can(me,code,rule.national?{}:scope));
}
export const navGroups = [
  {id:'identity',label:'Identité & organisation',icon:'building',groups:['admin']},
  {id:'collect',label:'Collecte',icon:'inbox',groups:['Collecte']},
  {id:'records',label:'Archives',icon:'archive',groups:['Archives']},
  {id:'access',label:'Accès',icon:'eye',groups:['Accès']},
  {id:'process',label:'Traitements',icon:'check',groups:['Traitements']},
  {id:'preserve',label:'Conservation',icon:'shield',groups:['Conservation']},
  {id:'heritage',label:'Patrimoine',icon:'landmark',groups:['Patrimoine']},
  {id:'steering',label:'Pilotage',icon:'chart',groups:['Pilotage']},
  {id:'support',label:'Accompagnement',icon:'help',groups:['support']}
];
/** Icône de chaque entrée du menu latéral (clé = route). */
export const navIcons: Record<string,string> = {
  institutions:'building', departments:'users', users:'user', roles:'shield', permissions:'key', governance:'scale',
  versements:'inbox', acquisition:'download', documents:'document', dossiers:'folder', classement:'tree', metadonnees:'tag', vocabulaires:'tag', fonds:'landmark',
  recherche:'search', consultations:'eye', communications:'send', droits:'scale', portail:'users', 'salle-lecture':'book',
  numerisation:'scanner', ocr:'ocr', taches:'inbox', controle:'checkCircle', 'circuits-validation':'userCheck',
  conservation:'box', 'sort-final':'hourglass', 'gel-legal':'snow', eliminations:'trash', 'archives-physiques':'archive',
  patrimoine:'landmark', restauration:'wrench', statistiques:'chart', audit:'history',
  scanners:'scanner', notifications:'bell', traitement:'chart', parcours:'tree', profile:'user', help:'help'
};
