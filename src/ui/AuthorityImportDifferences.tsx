import React from 'react';
import type { EacChange } from '../api/archives';

export const authorityImportKinds = { PERSONNE: 'Personne', COLLECTIVITE: 'Collectivité', FAMILLE: 'Famille' };
export const authorityFieldNames: Record<string, string> = { status: 'État', dateStart: 'Date de début', dateEnd: 'Date de fin', otherNames: 'Autres noms', parallelNames: 'Noms parallèles', standardizedNames: 'Noms normalisés', identifiers: 'Identifiants', places: 'Lieux', legalStatus: 'Statut juridique', functions: 'Fonctions', mandates: 'Mandats', structure: 'Structure ou généalogie', context: 'Contexte général', history: 'Histoire', detailLevel: 'Niveau de détail', rules: 'Règles', languages: 'Langues', sources: 'Sources', maintenanceNotes: 'Notes de mise à jour' };

export const authorityImportActions = { CREATE: 'À créer', UPDATE: 'À mettre à jour', UNCHANGED: 'Inchangé — aucune écriture' };
export function AuthorityImportDifferences({ changes }: { changes: EacChange[] }) {
    const labels: Record<string, string> = { ...authorityFieldNames, code: 'Référence', name: 'Nom retenu', kind: 'Type de producteur', actorId: 'Lien acteur', description: 'Description de la relation' };
    const values: Record<string, string> = { ...authorityImportKinds, BROUILLON: 'Brouillon', A_RELIRE: 'À relire', VALIDEE: 'Validée', MINIMAL: 'Minimal', PARTIEL: 'Partiel', COMPLET: 'Complet' };
    const display = (change: EacChange, value: string | null) => value == null || value === '' ? 'Non renseigné' : ['kind', 'status', 'detailLevel'].includes(change.field) ? values[value] ?? value : value;
    return <dl aria-label="Différences avant confirmation">{changes.map(change => <React.Fragment key={change.field}>
        <dt><strong>{labels[change.field] ?? change.field}</strong></dt>
        <dd style={{ whiteSpace: 'pre-wrap' }}>Avant : {display(change, change.before)}<br />Après : {display(change, change.after)}</dd>
    </React.Fragment>)}</dl>;
}
