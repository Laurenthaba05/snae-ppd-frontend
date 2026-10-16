import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { useAction } from './ReadingRoomParts';
import { instantiateBody, schemaCodeProblem, templateGroups, templateSummary, type MetadataTemplate, type MetadataTemplateInstance } from '../core/metadataTemplates';

/**
 * Créer un schéma de métadonnées à partir d'un gabarit : le Dublin Core simple ou le gabarit de gestion des documents d'activité. Ce sont des valeurs d'exemple : le schéma créé est un
 * brouillon que l'institution relit, adapte, lie à ses types documentaires puis active.
 */
export function MetadataTemplatesDialog({ institutionId, onClose, onCreated }: {
    institutionId: string | null | undefined; onClose: () => void; onCreated: (instance: MetadataTemplateInstance) => void;
}) {
    const { metadata, epoch } = useSession();
    const [selected, setSelected] = useState<string>('');
    const [code, setCode] = useState('');
    const action = useAction();
    const q = useResource<MetadataTemplate[]>(s => metadata!.templates(institutionId, s), `metadata-templates:${institutionId ?? 'national'}:${epoch}`);
    const templates = q.data ?? [];
    const template = templates.find(t => t.code === selected) ?? null;
    const problem = schemaCodeProblem(code);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!template || problem) return;
        const body = instantiateBody(institutionId, code);
        const created = await action.run({ template: template.code, body }, key => metadata!.instantiateTemplate(template.code, body, key));
        if (created) { onCreated(created); onClose(); }
    };
    return <Modal wide title="Créer un schéma à partir d’un gabarit" subtitle="Valeurs d’exemple : le schéma créé est un brouillon à relire" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                <fieldset className="check-list"><legend>Gabarit</legend>
                    {templates.map(t => <label key={t.code} className="check-row">
                        <input type="radio" name="metadata-template" value={t.code} checked={selected === t.code} onChange={() => { setSelected(t.code); setCode(''); }} disabled={action.busy} />
                        <span><strong>{t.name}</strong> — {templateSummary(t)}<small className="cell-sub">{t.description}</small></span>
                    </label>)}
                </fieldset>
                {template && <>
                    <Notice>{template.reference}. {template.note}</Notice>
                    {templateGroups(template).map(g => <details key={g.group ?? 'all'}><summary>{g.label} ({g.fields.length})</summary>
                        <ul className="plain-list">{g.fields.map(f => <li key={f.code}><strong>{f.name}</strong> <code>{f.code}</code>{f.repeatable ? ' — répétable' : ''}{f.required ? ' — obligatoire' : ''}
                            <small className="cell-sub">{f.description}</small></li>)}</ul>
                    </details>)}
                    <Field label="Code du schéma" hint={`Facultatif ; par défaut ${template.code}.`}><input value={code} onChange={e => setCode(e.target.value)} maxLength={100} disabled={action.busy} /></Field>
                    {problem && <Notice tone="warning">{problem}</Notice>}
                </>}
            </>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !template || !!problem}>Créer le schéma en brouillon</button></footer>
        </form>
    </Modal>;
}
