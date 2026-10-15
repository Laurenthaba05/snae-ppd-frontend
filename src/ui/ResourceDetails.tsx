import '../design/resource-details.css';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ResourceDetailsApi, detailResources, type DetailResource } from '../api/resourceDetails';
import { display } from '../core/format';
import { Busy, Empty, ErrorNotice, Modal, useResource } from './components';

const labels: Record<string, string> = {
    id: 'Identifiant', instanceId: 'Identifiant du circuit', input: 'Description', details: 'Informations complémentaires',
    title: 'Titre', name: 'Nom', label: 'Libellé', type: 'Type', status: 'Statut', state: 'État',
    createdAt: 'Création', updatedAt: 'Dernière modification', startedAt: 'Démarrage', finishedAt: 'Fin',
    openedAt: 'Ouverture', closedAt: 'Clôture', reference: 'Référence', reason: 'Motif', comments: 'Commentaires',
    code: 'Code', description: 'Description', content: 'Contenu', text: 'Texte', language: 'Langue',
    baseDate: 'Date de départ', dueDate: 'Échéance', reviewCount: 'Nombre de révisions',
    active: 'Actif', isActive: 'Actif', version: 'Version', versionLock: 'Version de modification',
    documentId: 'Document', dossierId: 'Dossier', institutionId: 'Institution', departmentId: 'Département',
    fichierId: 'Fichier', fileId: 'Fichier', userId: 'Utilisateur', assignedUserId: 'Responsable',
    roleId: 'Rôle', roleName: 'Rôle', assignedUserName: 'Responsable', stepLabel: 'Étape',
    tasks: 'Tâches', taskId: 'Tâche', currentStepId: 'Étape courante', definitionId: 'Définition',
    parentId: 'Parent', producerId: 'Producteur', level: 'Niveau', confidentiality: 'Confidentialité',
    startDate: 'Date de début', endDate: 'Date de fin', dateDebut: 'Date de début', dateFin: 'Date de fin',
    nom: 'Nom', titre: 'Titre', libelle: 'Libellé', intitule: 'Intitulé', statut: 'Statut', motif: 'Motif',
    texte: 'Texte', texteExtrait: 'Texte extrait', contenu: 'Contenu', langue: 'Langue',
    tauxConfiance: 'Confiance', confidence: 'Confiance', hasLayout: 'Positions des mots disponibles',
    numeroPage: 'Numéro de page', dateControle: 'Date du contrôle', dateCreation: 'Création',
    dateValidation: 'Validation', validePar: 'Validé par', statutValidation: 'État de vérification',
    typeReconnaissance: 'Type de reconnaissance', moteur: 'Moteur de reconnaissance', versionMoteur: 'Version du moteur',
    datePublication: 'Date de publication', dateRetrait: 'Date de retrait', estOriginal: 'Texte original',
    terme: 'Terme', vocabulaire: 'Vocabulaire', typeLieu: 'Type de lieu', dateReference: 'Date de référence',
    typeStatut: 'Type de statut', typeSource: 'Type de source', autorite: 'Autorité', titulaire: 'Titulaire',
    estActif: 'Actif', conforme: 'Conforme', dpi: 'Résolution (dpi)', decision: 'Décision',
    email: 'Adresse e-mail', firstName: 'Prénom', lastName: 'Nom', enabled: 'Actif', format: 'Format',
    note: 'Note', notes: 'Notes', url: 'Adresse', scope: 'Périmètre', metadata: 'Métadonnées',
};
function fieldLabel(key: string): string {
    return labels[key] ?? display(key.replace(/([a-zà-ÿ])([A-Z])/g, '$1_$2').toUpperCase());
}
const technical = (key: string) => key === 'id' || /(?:Id|Ids|Lock)$/.test(key);
function Value({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactNode {
    if (value === null || value === undefined || value === '') return <span>Non renseigné</span>;
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return new Intl.NumberFormat('fr').format(value);
    if (typeof value === 'string') return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{/^[A-Z][A-Z_]+$/.test(value) ? display(value) : value}</span>;
    if (depth >= 6) return <span>Consultez la rubrique associée pour ce détail.</span>;
    if (Array.isArray(value)) return value.length ? <ol>{value.map((item, i) => <li key={i}><Value value={item} depth={depth + 1} /></li>)}</ol> : <span>Aucun</span>;
    if (typeof value === 'object') return <dl className="resource-details">{Object.entries(value).map(([key, item]) => <React.Fragment key={key}><dt>{fieldLabel(key)}</dt><dd><Value value={item} depth={depth + 1} /></dd></React.Fragment>)}</dl>;
    return null;
}
export function ResourceDetailsDialog({ resource, id, title, onClose }: {
    resource: DetailResource; id?: string; title?: string; onClose: () => void;
}) {
    const { api, epoch } = useSession();
    const q = useResource<Record<string, unknown> | unknown[]>(signal => {
        if (!api) return Promise.reject(new Error('La session n’est plus disponible.'));
        return new ResourceDetailsApi(api.transport).get(resource, id, signal);
    }, 'resource-details:' + resource + ':' + id + ':' + epoch);
    const entries = Object.entries(q.data ?? {});
    return <Modal title={detailResources[resource][1]} subtitle={title} onClose={onClose} wide>
        <div className="panel-padding">
            {q.loading ? <Busy label="Lecture de la fiche…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : Array.isArray(q.data) ? <Value value={q.data} /> : entries.length ? <>
                <Value value={Object.fromEntries(entries.filter(([key]) => !technical(key)))} />
                {entries.some(([key]) => technical(key)) && <details><summary>Identifiants et version</summary><Value value={Object.fromEntries(entries.filter(([key]) => technical(key)))} /></details>}
            </> : <Empty title="Fiche vide" />}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={q.refresh} disabled={q.loading}>Actualiser la fiche</button><button type="button" className="btn primary" onClick={onClose}>Fermer la fiche</button></footer>
    </Modal>;
}
export function ResourceDetailsButton({ resource, id, title, label = 'Fiche complète' }: {
    resource: DetailResource; id?: string; title?: string; label?: string;
}) {
    const [open, setOpen] = useState(false);
    return <><button type="button" className="btn small secondary" aria-label={label + ' : ' + (title || detailResources[resource][1])} onClick={() => setOpen(true)}>{label}</button>
        {open && <ResourceDetailsDialog resource={resource} id={id} title={title} onClose={() => setOpen(false)} />}</>;
}
