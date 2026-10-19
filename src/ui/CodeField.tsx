import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ErrorNotice, Field, useResource } from './components';
import { useDebounced } from './search';
import type { CodificationCheck, CodificationKind, CodificationModel } from '../core/codification';

/**
 * Le champ « référence » d'un document, d'un dossier ou d'une notice, guidé par le modèle de codification de l'institution : le modèle est rappelé sous le champ, un bouton propose
 * la référence suivante, et ce qu'on saisit est comparé au modèle. Sans modèle (ou sans client de codification, en démonstration), c'est un champ libre, comme avant.
 * Un modèle **obligatoire** signale l'écart comme une erreur (le serveur refusera la création) ; un modèle **indicatif** le signale seulement.
 */
export function CodeField({ kind, institutionId, parentId = null, classementId = null, value, onChange, label, maxLength, disabled = false }: {
    kind: CodificationKind;
    institutionId: string;
    /** Le dossier d'un document, le dossier parent d'un dossier, la notice parente d'une notice. */
    parentId?: string | null;
    /** Le nœud du plan de classement de l'objet. */
    classementId?: string | null;
    value: string;
    onChange: (code: string) => void;
    label: string;
    maxLength: number;
    disabled?: boolean;
}) {
    const { codification, epoch } = useSession();
    const active = !!codification && !!institutionId;
    // Une erreur de lecture du modèle ne bloque jamais la saisie : sans modèle lisible, la référence reste libre.
    const modelQ = useResource<CodificationModel | null>(s => active ? codification!.model(kind, institutionId, s).catch(() => null) : Promise.resolve(null), `code-model:${kind}:${institutionId}:${epoch}`);
    const model = modelQ.data ?? null;
    const typed = useDebounced(value.trim());
    const checkQ = useResource<CodificationCheck | null>(s => active && model && typed ? codification!.check(kind, institutionId, typed, parentId, classementId, s).catch(() => null) : Promise.resolve(null),
        `code-check:${kind}:${institutionId}:${parentId}:${classementId}:${typed}:${model?.version ?? 0}:${epoch}`);
    const [proposing, setProposing] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const propose = async () => {
        if (!codification || proposing) return;
        setProposing(true); setError(null);
        try { onChange((await codification.proposal(kind, institutionId, parentId, classementId)).code); }
        catch (e) { setError(e); }
        finally { setProposing(false); }
    };
    const input = <input value={value} onChange={e => onChange(e.target.value)} required maxLength={maxLength} disabled={disabled} />;
    if (!model) return <Field label={label}>{input}</Field>;
    const mandatory = model.mode === 'OBLIGATOIRE';
    const off = !!checkQ.data && !checkQ.data.conform && typed === value.trim();
    // les textes sont écrits en entier (et non composés) pour que l'interface anglaise puisse les traduire
    const guide = `Modèle de l’institution : ${model.pattern} (${mandatory ? 'obligatoire' : 'indicatif'}).`;
    return <div>
        <Field label={label} hint={guide} error={off && mandatory ? 'Cette référence ne suit pas le modèle obligatoire de l’institution ; l’enregistrement sera refusé.' : undefined}>{input}</Field>
        {off && !mandatory ? <p className="page-note" role="status">Cette référence ne suit pas le modèle : vous pouvez l’enregistrer quand même.</p> : null}
        <div style={{ marginTop: 6 }}><button type="button" className="btn small secondary" disabled={disabled || proposing} onClick={propose}>Proposer la prochaine référence</button></div>
        {error ? <ErrorNotice error={error} /> : null}
    </div>;
}
