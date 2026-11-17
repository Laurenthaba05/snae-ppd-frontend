import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can, canAnywhere } from '../core/policy';
import type { RecordDocument } from '../core/types';
import { Busy, ErrorNotice, Notice, useResource } from './components';
import { ClassificationSuggestionsPanel } from './ClassificationSuggestions';
import { ReclassifyDialog, classificationEditable, classificationLabel, usableClassification } from './DocumentClassification';
import { RecordDescriptionButton, descriptionEditable } from './RecordDescription';
import { navigate } from './navigation';

export function TreatmentClassificationPanel({ documentId, onChanged }: { documentId: string | null; onChanged: () => void }) {
    const { records, me, epoch } = useSession();
    const readable = canAnywhere(me, 'DOCUMENT_READ');
    const q = useResource(s => documentId && readable ? records!.document(documentId, s) : Promise.resolve(null), `treatment-document:${documentId}:${epoch}:${readable}`);
    return <section className="span2 panel panel-padding" aria-label="Classement et description du document">
        <h3>Classement et description du document</h3>
        {!documentId ? <Notice tone="warning">Aucun document rattaché à cet élément. Le classement et la validation finale nécessitent un document.</Notice>
            : !readable ? <Notice tone="warning">La lecture du document nécessite l’habilitation de lecture documentaire. Le droit de suivre le traitement ne donne pas accès à son contenu.</Notice>
            : q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data &&
                <DocumentClassification key={q.data.id} document={q.data} onChanged={() => { q.refresh(); onChanged(); }} />}
    </section>;
}

function DocumentClassification({ document: d, onChanged }: { document: RecordDocument; onChanged: () => void }) {
    const { me, classification, epoch } = useSession();
    const scope = { institutionId: d.institutionId, departmentId: d.departmentId };
    const readPlan = can(me, 'CLASSIFICATION_READ', scope);
    const editable = descriptionEditable(d);
    const canClassify = readPlan && classificationEditable(d) && can(me, 'DOCUMENT_CLASSIFY', scope);
    const [manual, setManual] = useState(false);
    const plan = useResource(s => readPlan ? classification!.nodes(d.institutionId, s) : Promise.resolve([]), `treatment-plan:${d.institutionId}:${epoch}:${readPlan}:${d.versionLock}`);
    const node = plan.data?.find(n => n.id === d.classificationNodeId);
    const changed = () => { plan.refresh(); onChanged(); };
    return <>
        <p><strong>{d.reference} · {d.title}</strong></p>
        <div className="table-actions"><button type="button" className="btn small secondary" onClick={() => navigate('/app/documents/' + d.id)}>Ouvrir la fiche et les métadonnées</button>
            {editable && can(me, 'DOCUMENT_DESCRIPTION_UPDATE', scope) && <RecordDescriptionButton kind="documents" id={d.id} onChanged={changed} />}
            {canClassify && <button type="button" className="btn small primary" onClick={() => setManual(true)}>Choisir dans le plan</button>}
        </div>
        {!d.classificationNodeId && <Notice tone="warning">Classement obligatoire avant la validation finale : choisissez une rubrique pour ce document. Le classement du dossier ne suffit pas.</Notice>}
        {!readPlan ? <p>La consultation des rubriques nécessite l’habilitation de lecture du plan de classement.</p> : plan.loading ? <Busy /> : plan.error ? <ErrorNotice error={plan.error} onRetry={plan.refresh} /> : <>
            <p>Rubrique du document : <strong>{node ? classificationLabel(node) : d.classificationNodeId ? 'Rubrique non disponible' : 'Aucune'}</strong></p>
            {d.classificationNodeId && (!node || !usableClassification(node, d.institutionId)) && <Notice tone="warning">Cette rubrique n’est plus utilisable. Le document doit être reclassé avant la validation finale.</Notice>}
        </>}
        {d.dossierId && can(me, 'DOSSIER_READ', scope) && <DossierClassification id={d.dossierId} documentNode={d.classificationNodeId} />}
        {readPlan && <ClassificationSuggestionsPanel key={`${d.id}:${d.versionLock}`} kind="documents" id={d.id} canAccept={canClassify} onChanged={changed} />}
        {manual && <ReclassifyDialog documentId={d.id} institutionId={d.institutionId} currentNodeId={d.classificationNodeId} onClose={() => setManual(false)} onSuccess={changed} />}
    </>;
}

function DossierClassification({ id, documentNode }: { id: string; documentNode: string | null }) {
    const { records, classification, me, epoch } = useSession();
    const q = useResource(s => records!.dossier(id, s), `treatment-dossier:${id}:${epoch}`);
    const d = q.data;
    const scope = { institutionId: d?.institutionId, departmentId: d?.departmentId };
    const readPlan = !!d && can(me, 'CLASSIFICATION_READ', scope);
    const plan = useResource(s => readPlan ? classification!.nodes(d!.institutionId, s) : Promise.resolve([]), `treatment-dossier-plan:${id}:${epoch}:${readPlan}:${d?.versionLock}`);
    const [suggestions, setSuggestions] = useState(false);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!d) return null;
    const node = plan.data?.find(n => n.id === d.classificationNodeId);
    return <div className="panel panel-padding"><h4>Dossier de rattachement</h4>
        <button type="button" className="text-link" onClick={() => navigate('/app/dossiers/' + d.id)}>{d.reference} · {d.title}</button>
        {readPlan && (plan.loading ? <Busy /> : plan.error ? <ErrorNotice error={plan.error} onRetry={plan.refresh} /> : <p>Rubrique du dossier : {node ? classificationLabel(node) : d.classificationNodeId ? 'Rubrique non disponible' : 'Aucune'}</p>)}
        {readPlan && documentNode && d.classificationNodeId && d.classificationNodeId !== documentNode && <Notice tone="warning">Le document et son dossier utilisent des rubriques différentes. Vérifiez que ce choix est justifié.</Notice>}
        {readPlan && <button type="button" className="btn small secondary" aria-expanded={suggestions} onClick={() => setSuggestions(v => !v)}>{suggestions ? 'Masquer les propositions du dossier' : 'Proposer le classement du dossier'}</button>}
        {readPlan && suggestions && <ClassificationSuggestionsPanel key={d.id} kind="dossiers" id={d.id} canAccept={descriptionEditable(d) && can(me, 'DOSSIER_DESCRIPTION_UPDATE', scope)} onChanged={q.refresh} />}
    </div>;
}
