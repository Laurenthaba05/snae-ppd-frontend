import React from 'react';

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
function fieldLabel(key: string) {
    const text = labels[key] ?? key.replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}
function Value({ value, field }: { value: unknown; field?: string }) {
    if (value === null || value === undefined || value === '') return <span className="summary-empty">Non renseigné</span>;
    if (typeof value === 'boolean') return <>{value ? 'Oui' : 'Non'}</>;
    if (Array.isArray(value)) return value.length
        ? <ul className="summary-list">{value.map((item, i) => <li key={i}><Value value={item}/></li>)}</ul>
        : <span className="summary-empty">Aucun élément</span>;
    if (typeof value === 'object') return <CommandSummary value={value}/>;
    return <>{field === 'typeInstitution' ? institutionTypes[String(value)] ?? String(value) : String(value)}</>;
}
export function CommandSummary({ value }: { value: unknown }) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return <Value value={value}/>;
    const entries = Object.entries(value).filter(([key, v]) => !hidden.has(key) && v !== undefined);
    return entries.length ? <dl className="command-summary">{entries.map(([key, v]) =>
        <div className="command-summary-row" key={key}><dt>{fieldLabel(key)}</dt><dd><Value value={v} field={key}/></dd></div>
    )}</dl> : <p>Cette action est prête à être confirmée.</p>;
}
