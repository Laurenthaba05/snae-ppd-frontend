import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { ApiError } from '../core/http';
import { IntentKey } from '../core/validation';
import { MAX_RULE_TARGETS, emptyRuleForm, ruleBody, ruleFormOf, ruleProblems, toggled, versionBody, type RuleForm } from '../core/retentionRule';
import type { ClassificationNode, DocumentType, RetentionRuleListItem } from '../core/types';
import type { TriggerEventType } from '../core/triggerEvents';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { Icon } from './icons';

/** Une liste de cases à cocher, lisible par le nom de chaque élément. */
function Checklist<T extends { id: string }>({ legend, items, chosen, onToggle, label, disabled }: { legend: string; items: T[]; chosen: string[]; onToggle: (id: string, on: boolean) => void; label: (item: T) => string; disabled: boolean }) {
    return <fieldset className="span2 checklist"><legend>{legend}</legend>
        <div style={{ maxHeight: 170, overflowY: 'auto', display: 'grid', gap: 6, padding: '4px 2px' }}>
            {items.map(item => <label key={item.id} className="field asset-flag"><input type="checkbox" checked={chosen.includes(item.id)} disabled={disabled} onChange={e => onToggle(item.id, e.target.checked)} /><span>{label(item)}</span></label>)}
        </div>
    </fieldset>;
}

/**
 * Configurer une règle de conservation : la règle, sa première version, puis son activation, en une seule démarche. Les trois envois sont repris là où ils se sont arrêtés :
 * une règle déjà créée n'est jamais recréée (sinon le code serait déjà pris), et chaque envoi garde sa clé d'idempotence tant que son contenu ne change pas.
 * Avec `existing`, la règle existe déjà : le formulaire ne crée que sa nouvelle version (préremplie avec la dernière) puis l'active.
 */
export function ConfigureRetentionRuleDialog({ onClose, onSuccess, existing }: { onClose: () => void; onSuccess: (code: string, activated?: boolean) => void; existing?: RetentionRuleListItem }) {
    const { retention, records, classification, epoch } = useSession();
    const { scope } = useWorkspace();
    const [form, setForm] = useState<RuleForm>(() => existing ? ruleFormOf(existing) : emptyRuleForm(scope.institutionId));
    const [activateNow, setActivateNow] = useState(true);
    const [versionSaved, setVersionSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problems, setProblems] = useState<string[]>([]);
    const [created, setCreated] = useState(false);
    const progress = useRef<{ ruleId?: string; versionId?: string }>({ ruleId: existing?.id });
    const locked = created || Boolean(existing);
    const keys = useRef({ rule: new IntentKey(), version: new IntentKey(), activate: new IntentKey() });
    const typesQ = useResource<DocumentType[]>(s => records!.documentTypes(s), 'retention-rule-types:' + epoch);
    const nodeInstitution = form.scope === 'INSTITUTION' ? (existing?.institutionId ?? scope.institutionId ?? null) : null;
    const nodesQ = useResource<ClassificationNode[]>(s => classification!.nodes(nodeInstitution, s), 'retention-rule-nodes:' + nodeInstitution + ':' + epoch);
    const eventTypesQ = useResource<TriggerEventType[]>(s => retention!.triggerEventTypes(existing?.institutionId ?? scope.institutionId ?? null, s), 'retention-rule-event-types:' + (existing?.institutionId ?? scope.institutionId ?? '') + ':' + epoch);
    const eventTypes = (eventTypesQ.data ?? []).filter(t => t.status === 'ACTIF' && (form.scope === 'INSTITUTION' || t.scope === 'NATIONAL'));
    const types = (typesQ.data ?? []).filter(t => t.status === 'ACTIF');
    // Une règle nationale ne vise que des rubriques nationales ; le serveur le refuse autrement.
    const nodes = (nodesQ.data ?? []).filter(n => n.statut === 'ACTIF' && (form.scope === 'INSTITUTION' || n.institutionId === null));
    const set = (patch: Partial<RuleForm>) => { if (versionSaved) return; setForm(old => ({ ...old, ...patch })); setProblems([]); };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const found = ruleProblems(form, existing?.institutionId ?? scope.institutionId, locked);
        const today = new Date().toISOString().slice(0, 10);
        if (activateNow && ((form.effectiveFrom || today) > today || (form.effectiveTo && form.effectiveTo < today))) found.push('Cette période ne permet pas une activation aujourd’hui. Choisissez l’enregistrement en brouillon.');
        setProblems(found);
        if (found.length) return;
        setBusy(true); setError(null);
        try {
            if (!progress.current.ruleId) {
                const body = ruleBody(form, scope.institutionId);
                const rule = await retention!.command<{ id: string }>('/rules', body, keys.current.rule.forRequest('POST', '/rules', body), 'POST');
                progress.current.ruleId = rule.id; setCreated(true);
            }
            if (!progress.current.versionId) {
                const path = `/rules/${progress.current.ruleId}/versions`;
                const body = versionBody(form, new Date().toISOString().slice(0, 10));
                const version = await retention!.command<{ id: string }>(path, body, keys.current.version.forRequest('POST', path, body), 'POST');
                progress.current.versionId = version.id; setVersionSaved(true);
            }
            if (activateNow) {
            const activation = `/versions/${progress.current.versionId}/activate`;
            await retention!.command(activation, {}, keys.current.activate.forRequest('POST', activation, {}), 'POST');
            }
            onSuccess(form.code.trim().toUpperCase(), activateNow); onClose();
        }
        catch (err) { setError(err); }
        finally { setBusy(false); }
    };
    const codeTaken = error instanceof ApiError && error.code === 'RETENTION_RULE_EXISTS';
    return <Modal title={existing ? `Nouvelle version de la règle ${existing.code}` : 'Configurer une règle de conservation'} subtitle={existing ? existing.label : 'Définir la règle et sa première version, puis choisir son activation ou son enregistrement en brouillon.'} onClose={onClose} locked={busy}>
        <form onSubmit={submit} noValidate><div className="form-grid">
            <Field label="Enregistrement"><select aria-label="Enregistrement de la règle" value={activateNow ? 'active' : 'draft'} onChange={e => setActivateNow(e.target.value === 'active')} disabled={busy}><option value="active">Enregistrer et activer maintenant</option><option value="draft">Enregistrer en brouillon</option></select></Field>
            {versionSaved && <Notice>La version est enregistrée. Ses champs sont figés ; vous pouvez reprendre son activation ou conserver le brouillon.</Notice>}
            {existing && <div className="span2"><Notice>La nouvelle version <strong>remplace la version en vigueur</strong> dès son activation, pour les prochaines échéances. Les échéances déjà planifiées gardent la version avec laquelle elles ont été calculées.</Notice></div>}
            {created && !existing && <div className="span2"><Notice tone="warning">La règle <strong>{form.code.trim().toUpperCase()}</strong> est créée ; il reste à enregistrer et activer sa première version. Corrigez ce qui est signalé puis relancez : la règle ne sera pas créée une seconde fois.</Notice></div>}
            <Field label="Code *" hint="Converti en majuscules ; unique parmi toutes les règles."><input value={form.code} onChange={e => set({ code: e.target.value })} required maxLength={100} placeholder="EX-DEFAUT-10ANS" disabled={busy || locked} /></Field>
            <Field label="Intitulé *"><input value={form.label} onChange={e => set({ label: e.target.value })} required maxLength={255} disabled={busy || locked} /></Field>
            <Field label="Description de la règle" wide><textarea aria-label="Description de la règle" value={form.description ?? ''} onChange={e => set({ description: e.target.value })} maxLength={4000} disabled={busy || locked}/></Field>
            <Field label="Priorité" hint="De 0 à 1000000."><input aria-label="Priorité de la règle" type="number" min={0} max={1000000} step={1} value={form.priority ?? '100'} onChange={e => set({ priority: e.target.value })} disabled={busy || locked}/></Field>
            <Field label="Début d’effet" hint="Aujourd’hui si vide."><input aria-label="Début d’effet" type="date" value={form.effectiveFrom ?? ''} onChange={e => set({ effectiveFrom: e.target.value })} disabled={busy || versionSaved}/></Field>
            <Field label="Fin d’effet"><input aria-label="Fin d’effet" type="date" value={form.effectiveTo ?? ''} onChange={e => set({ effectiveTo: e.target.value })} disabled={busy || versionSaved}/></Field>
            <Field label="Description juridique" wide><textarea aria-label="Description juridique" value={form.legalDescription ?? ''} onChange={e => set({ legalDescription: e.target.value })} maxLength={4000} disabled={busy || versionSaved}/></Field>
            <Field label="Portée *" hint={!scope.institutionId ? 'Sélectionnez une institution dans le contexte de travail pour créer une règle au niveau institution.' : undefined}><select value={form.scope} onChange={e => set({ scope: e.target.value as RuleForm['scope'], classificationNodeIds: [] })} disabled={busy || locked}><option value="NATIONAL">Nationale</option><option value="INSTITUTION" disabled={!scope.institutionId}>Institution courante</option></select></Field>
            <Field label="Déclencheur *"><select value={form.trigger} onChange={e => set({ trigger: e.target.value })} disabled={busy || versionSaved}><option value="DATE_DOCUMENT">Date du document</option><option value="DATE_CLOTURE_DOCUMENT">Clôture du document</option><option value="DATE_ARCHIVAGE">Date d’archivage</option><option value="DATE_CLOTURE_DOSSIER">Clôture du dossier</option><option value="EVENEMENT">Événement constaté (fin de marché, décès…)</option></select></Field>
            {form.trigger === 'EVENEMENT' && <Field label="Type d’événement *" hint={eventTypes.length === 0 && !eventTypesQ.loading ? 'Aucun type d’événement n’est défini : créez-en un dans « Événements déclencheurs », page Conservation.' : 'Le délai part de la date à laquelle cet événement est constaté sur le document ou son dossier.'}>
                <select value={form.triggerEventTypeId} onChange={e => set({ triggerEventTypeId: e.target.value })} disabled={busy}><option value="">Choisir un type…</option>{eventTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>}
            <Field label="Durée *"><input type="number" min={0} value={form.duration} onChange={e => set({ duration: e.target.value })} required disabled={busy || versionSaved} /></Field>
            <Field label="Unité"><select value={form.unit} onChange={e => set({ unit: e.target.value })} disabled={busy}><option value="JOURS">Jours</option><option value="MOIS">Mois</option><option value="ANNEES">Années</option></select></Field>
            <Field label="Sort final *"><select value={form.finalDisposition} onChange={e => set({ finalDisposition: e.target.value })} disabled={busy}><option value="CONSERVER_DEFINITIVEMENT">Conserver définitivement</option><option value="ELIMINER">Éliminer</option><option value="TRANSFERER">Transférer</option><option value="REEXAMINER">Réexaminer</option><option value="TRIER">Trier (échantillon conservé, reste éliminé)</option></select></Field>
            {form.finalDisposition === 'TRIER' && <>
                <Field label="Méthode de tri *" hint="Comment l'échantillon conservé est choisi parmi les documents arrivés à échéance."><select value={form.sampling.method} onChange={e => set({ sampling: { ...form.sampling, method: e.target.value } })} disabled={busy}>
                    <option value="SYSTEMATIQUE">Systématique : un document sur N</option><option value="ALEATOIRE">Aléatoire : un pourcentage tiré au hasard</option><option value="CHRONOLOGIQUE">Chronologique : certaines années</option><option value="QUALITATIF">Qualitatif : critères décrits, retenus un à un</option></select></Field>
                {form.sampling.method === 'SYSTEMATIQUE' && <Field label="Un document sur *" hint="De 2 à 1000."><input type="number" min={2} max={1000} value={form.sampling.step} onChange={e => set({ sampling: { ...form.sampling, step: e.target.value } })} disabled={busy || versionSaved} /></Field>}
                {form.sampling.method === 'ALEATOIRE' && <Field label="Pourcentage conservé *" hint="De 1 à 99."><input type="number" min={1} max={99} value={form.sampling.rate} onChange={e => set({ sampling: { ...form.sampling, rate: e.target.value } })} disabled={busy || versionSaved} /></Field>}
                {form.sampling.method === 'CHRONOLOGIQUE' && <>
                    <Field label="Années divisées par *" hint="Par exemple 5 pour les années en 0 et en 5."><input type="number" min={2} max={100} value={form.sampling.modulo} onChange={e => set({ sampling: { ...form.sampling, modulo: e.target.value } })} disabled={busy || versionSaved} /></Field>
                    <Field label="Reste conservé *" hint="Les années dont le reste de la division est celui-ci (0 pour les années en 0 et en 5)."><input type="number" min={0} value={form.sampling.remainder} onChange={e => set({ sampling: { ...form.sampling, remainder: e.target.value } })} disabled={busy || versionSaved} /></Field></>}
                <Field label={form.sampling.method === 'QUALITATIF' ? 'Critères du tri *' : 'Note sur le tri'} wide hint="Les critères ou la référence du tableau de tri ; repris sur chaque campagne."><textarea value={form.sampling.note} onChange={e => set({ sampling: { ...form.sampling, note: e.target.value } })} rows={2} maxLength={4000} disabled={busy || versionSaved} /></Field></>}
            <Field label="Phase courante" hint="Facultatif : combien de temps le document reste en usage courant, avant de passer en archives intermédiaires jusqu'à l'échéance. Vide : pas de phase intermédiaire."><input type="number" min={0} value={form.phaseDuration} onChange={e => set({ phaseDuration: e.target.value })} disabled={busy} placeholder="5" /></Field>
            <Field label="Unité de la phase courante"><select value={form.phaseUnit} onChange={e => set({ phaseUnit: e.target.value })} disabled={busy || form.phaseDuration.trim() === ''}><option value="JOURS">Jours</option><option value="MOIS">Mois</option><option value="ANNEES">Années</option></select></Field>
            <Field label={form.finalDisposition === 'ELIMINER' || form.finalDisposition === 'TRIER' ? 'Référence légale *' : 'Référence légale'} hint={form.finalDisposition === 'ELIMINER' || form.finalDisposition === 'TRIER' ? 'Obligatoire pour éliminer ou trier.' : 'Optionnelle.'}><input value={form.legalReference} onChange={e => set({ legalReference: e.target.value })} maxLength={4000} disabled={busy || versionSaved} /></Field>
            <div className="span2"><strong>À quoi la règle s’applique *</strong><p className="wf-note">Choisissez les types de documents et/ou les rubriques du plan de classement visés (au plus {MAX_RULE_TARGETS}).</p>
                {form.typeDocumentIds.length > 0 && form.classificationNodeIds.length > 0 && <Notice tone="warning">Types <strong>et</strong> rubriques sont cochés : la règle ne s’applique qu’aux documents de ces types <strong>qui sont aussi</strong> classés dans ces rubriques. Pour viser plus large, ne cochez que l’un des deux.</Notice>}</div>
            {typesQ.loading ? <div className="span2"><Busy /></div> : typesQ.error ? <div className="span2"><ErrorNotice error={typesQ.error} onRetry={typesQ.refresh} /></div>
                : <Checklist legend="Types de documents" items={types} chosen={form.typeDocumentIds} onToggle={(id, on) => set({ typeDocumentIds: toggled(form.typeDocumentIds, id, on) })} label={t => t.label} disabled={busy || versionSaved} />}
            {nodesQ.loading ? null : nodesQ.error ? <div className="span2"><p className="wf-note">Le plan de classement n’a pas pu être lu : la règle peut viser des types de documents seulement.</p></div>
                : nodes.length > 0 && <Checklist legend="Rubriques du plan de classement" items={nodes} chosen={form.classificationNodeIds} onToggle={(id, on) => set({ classificationNodeIds: toggled(form.classificationNodeIds, id, on) })} label={n => (n.code ? n.code + ' — ' : '') + n.libelle} disabled={busy || versionSaved} />}
        </div>
        {problems.length > 0 && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>À corriger avant d’envoyer</strong><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></div></div>}
        {Boolean(error) && <ErrorNotice error={error} />}
        {codeTaken && <Notice tone="warning">Ce code est déjà pris, parfois par une tentative précédente restée sans version. Choisissez un autre code.</Notice>}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="arrow" size={17} />} {activateNow ? (locked ? 'Enregistrer et activer la version' : 'Créer et activer') : 'Enregistrer le brouillon'}</button></footer></form></Modal>;
}
