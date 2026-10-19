import React from 'react';
import type { Catalog } from '../core/types';
import { DocumentName, EntityName } from './names';

const labels: Record<string, string> = {
    code: 'Code', nom: 'Intitulé', name: 'Nom', prenom: 'Prénom', sigle: 'Sigle',
    typeInstitution: 'Type d’institution', typeUnite: 'Type d’unité', description: 'Description',
    institutionId: 'Institution', departmentId: 'Département', departementId: 'Département',
    parentId: 'Parent', email: 'Adresse professionnelle', ssoId: 'Identifiant de connexion',
    typeCompte: 'Type de compte', scope: 'Portée', reason: 'Motif', motif: 'Motif',
    title: 'Titre', titre: 'Titre', reference: 'Référence', status: 'Statut', statut: 'Statut',
    documentId: 'Document', dossierId: 'Dossier', fichierId: 'Fichier', fileId: 'Fichier',
    confidentiality: 'Confidentialité', typeDocumentId: 'Type de document',
    dateDebut: 'Date de début', dateFin: 'Date de fin', from: 'Début', to: 'Fin',
    sourceAssignmentId: 'Attribution détenue', delegataireId: 'Destinataire',
    roleId: 'Rôle', utilisateurId: 'Utilisateur', permissionIds: 'Permissions',
    comment: 'Commentaire', required: 'Obligatoire', active: 'Actif',
};
const institutionTypes: Record<string, string> = {
    MINISTERE: 'Ministère', DIRECTION_GENERALE: 'Direction générale',
    ETABLISSEMENT_PUBLIC: 'Établissement public', COLLECTIVITE: 'Collectivité', AUTRE: 'Autre',
};
const hidden = new Set(['expectedVersion', 'idempotencyKey']);
// Un identifiant ne se montre jamais : les champs dont on sait le type se lisent par leur nom, les autres par un texte neutre.
const entityFields: Record<string, Catalog> = { institutionId: 'institutions', departmentId: 'departments', departementId: 'departments', roleId: 'roles', utilisateurId: 'users', delegataireId: 'users' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: unknown) => typeof value === 'string' && UUID.test(value);
const idField = (field?: string) => !!field && field !== 'ssoId' && /Ids?$/.test(field);
function fieldLabel(key: string) {
    const text = labels[key] ?? key.replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}
function Value({ value, field, parent }: { value: unknown; field?: string; parent?: Catalog }) {
    if (value === null || value === undefined || value === '') return <span className="summary-empty">Non renseigné</span>;
    if (typeof value === 'boolean') return <>{value ? 'Oui' : 'Non'}</>;
    if (Array.isArray(value)) {
        if (value.length && idField(field) && value.every(isId)) return <>{value.length > 1 ? `${value.length} éléments sélectionnés` : '1 élément sélectionné'}</>;
        return value.length
            ? <ul className="summary-list">{value.map((item, i) => <li key={i}><Value value={item} field={field} parent={parent}/></li>)}</ul>
            : <span className="summary-empty">Aucun élément</span>;
    }
    if (typeof value === 'object') return <CommandSummary value={value} parent={parent}/>;
    if (idField(field) && isId(value)) {
        const kind = field === 'parentId' ? parent : entityFields[field!];
        if (kind) return <EntityName kind={kind} id={String(value)} fallback="Élément sélectionné"/>;
        if (field === 'documentId') return <DocumentName id={String(value)} fallback="Élément sélectionné"/>;
        return <>Élément sélectionné</>;
    }
    return <>{field === 'typeInstitution' ? institutionTypes[String(value)] ?? String(value) : String(value)}</>;
}
/** `parent` : le type de ce que désigne `parentId` dans cette commande (un département pour un département) ; sans lui, un parent se lit « Élément sélectionné ». */
export function CommandSummary({ value, parent }: { value: unknown; parent?: Catalog }) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return <Value value={value} parent={parent}/>;
    const entries = Object.entries(value).filter(([key, v]) => !hidden.has(key) && v !== undefined);
    return entries.length ? <dl className="command-summary">{entries.map(([key, v]) =>
        <div className="command-summary-row" key={key}><dt>{fieldLabel(key)}</dt><dd><Value value={v} field={key} parent={parent}/></dd></div>
    )}</dl> : <p>Cette action est prête à être confirmée.</p>;
}
