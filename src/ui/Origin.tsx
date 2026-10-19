import React, { useState } from 'react';
import { ErrorNotice, Field, Modal } from './components';
import { ReferencePicker } from './ReferencePicker';
import { EntityName } from './names';

/**
 * L'origine d'une activité des modules nationaux (un projet de numérisation, une archive physique, un versement) : l'institution et, si on la connaît, la direction ou le service. Elle
 * sert à lire (tableaux de bord, comptes par institution et par direction) ; elle ne change aucun droit. Les deux champs sont facultatifs, mais une direction se choisit dans l'institution.
 */
export function OriginFields({ institutionId, departmentId, onChange, disabled = false, institutionLabel = 'Institution d’origine', unitLabel = 'Direction ou service d’origine', hint }: {
    institutionId: string;
    departmentId: string;
    onChange: (institutionId: string, departmentId: string) => void;
    disabled?: boolean;
    institutionLabel?: string;
    unitLabel?: string;
    hint?: string;
}) {
    return <>
        <Field label={institutionLabel} hint={hint ?? 'Facultatif : elle sert aux tableaux de bord et aux comptes par institution.'}>
            <ReferencePicker kind="institutions" label="Sélectionner une institution" value={institutionId} disabled={disabled} nullable onChange={id => onChange(id, id === institutionId ? departmentId : '')} />
        </Field>
        <Field label={unitLabel} hint={institutionId ? 'Facultatif : une direction ou un service de cette institution.' : 'Choisissez d’abord l’institution.'}>
            <ReferencePicker kind="departments" label="Sélectionner une direction ou un service" value={departmentId} disabled={disabled || !institutionId} nullable scope={{ institutionId }} onChange={id => onChange(institutionId, id)} />
        </Field>
    </>;
}

/** L'origine à envoyer au serveur : un champ vide devient `null`, jamais une chaîne vide. */
export function originPayload(institutionId: string, departmentId: string, keys: { institution: string; department: string } = { institution: 'institutionId', department: 'departmentId' }): Record<string, string | null> {
    return { [keys.institution]: institutionId || null, [keys.department]: institutionId && departmentId ? departmentId : null };
}

/** L'origine en toutes lettres (jamais un identifiant) ; « Non rattaché » quand l'activité n'a pas d'origine. */
export function OriginText({ institutionId, departmentId }: { institutionId: string | null | undefined; departmentId: string | null | undefined }) {
    if (!institutionId) return <span className="cell-sub">Non rattaché</span>;
    return <><EntityName kind="institutions" id={institutionId} fallback="Institution" />{departmentId ? <small className="cell-sub"><EntityName kind="departments" id={departmentId} fallback="Direction ou service" /></small> : null}</>;
}

/** Rattacher (ou détacher) une activité déjà créée à son institution et à sa direction d'origine. */
export function OriginDialog({ title, subject, institutionId, departmentId, onSave, onClose }: {
    title: string;
    subject: string;
    institutionId: string | null;
    departmentId: string | null;
    onSave: (institutionId: string | null, departmentId: string | null) => Promise<unknown>;
    onClose: () => void;
}) {
    const [institution, setInstitution] = useState(institutionId ?? '');
    const [department, setDepartment] = useState(departmentId ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try { await onSave(institution || null, institution && department ? department : null); onClose(); }
        catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title={title} subtitle={subject} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid"><OriginFields institutionId={institution} departmentId={department} onChange={(i, d) => { setInstitution(i); setDepartment(d); }} disabled={busy} /></div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
