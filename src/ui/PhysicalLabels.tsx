import React, { useState } from 'react';
import { labelsDocument, type LabelSpec } from '../core/physicalLabels';
import { printHtml } from './printHtml';

/**
 * Imprime des étiquettes (QR + Code 128) depuis un cadre invisible de la page : aucune fenêtre n'est ouverte, rien ne quitte le navigateur. Le message d'erreur reste affiché si la
 * préparation échoue ; sans étiquette à imprimer, le bouton le dit au lieu d'ouvrir une impression vide.
 */
export function LabelsButton({ label, title, build, disabled = false }: { label: string; title: string; build: () => LabelSpec[]; disabled?: boolean }) {
    const [error, setError] = useState<string | null>(null);
    const click = () => {
        setError(null);
        try {
            const labels = build();
            if (!labels.length) setError('Aucune étiquette à imprimer.');
            else printHtml(labelsDocument(title, labels));
        } catch (e) { setError(e instanceof Error ? e.message : 'Préparation impossible.'); }
    };
    return <>
        <button type="button" className="btn small secondary" disabled={disabled} onClick={click}>{label}</button>
        {error && <span className="scan-bad" role="alert">{error}</span>}
    </>;
}
