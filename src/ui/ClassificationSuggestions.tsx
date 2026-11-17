import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';

export function ClassificationSuggestionsPanel({ kind, id, canAccept, onChanged }: { kind: 'documents' | 'dossiers'; id: string; canAccept: boolean; onChanged: () => void }) {
    const { classification, epoch } = useSession();
    const q = useResource(s => classification!.suggestions(kind, id, s), `classification-proposals:${kind}:${id}:${epoch}`);
    const [selected, setSelected] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [done, setDone] = useState(false);
    useEffect(() => {
        if (!q.data?.ocrPending) return;
        const timer = setTimeout(q.refresh, 5000);
        return () => clearTimeout(timer);
    }, [q.data, q.refresh]);
    const proposal = q.data?.candidates.find(c => c.nodeId === selected);
    const accept = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!q.data || !proposal || !reason.trim() || busy) return;
        setBusy(true); setError(null);
        try {
            await classification!.acceptSuggestion(kind, id, { nodeId: selected, revision: q.data.revision, reason: reason.trim() });
            setSelected(''); setReason(''); setDone(true); q.refresh(); onChanged();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <section className="panel panel-padding" aria-label="Propositions de classement">
        <div className="section-heading"><h3>Propositions de classement</h3><button className="btn small secondary" onClick={q.refresh} disabled={busy || q.loading}>Actualiser</button></div>
        <p>Le texte est comparé aux rubriques et aux expressions du plan. Le classement reste inchangé jusqu’à votre validation.</p>
        {q.loading && <Busy />}
        {q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : null}
        {done && <Notice>Le classement a été enregistré.</Notice>}
        {q.data && <>
            <p>{kind === 'documents' ? `${q.data.ocrResults} résultat(s) OCR pris en compte, en plus du titre et de la description.` : 'Propositions fondées sur le titre, l’objet et la description du dossier.'}</p>
            {q.data.ocrPending && <Notice>L’OCR est en cours. Les propositions seront actualisées à la fin du traitement.</Notice>}
            {q.data.unvalidatedResults > 0 && <Notice tone="warning">{q.data.unvalidatedResults} résultat(s) OCR ne sont pas encore validés : vérifiez le texte avant de choisir une rubrique.</Notice>}
            {q.data.limited && <Notice tone="warning">Analyse partielle : la limite de texte ou de rubriques a été atteinte. Vérifiez aussi le reste du document et du plan.</Notice>}
            {q.data.candidates.length === 0 ? <p>Aucune correspondance. Complétez le texte ou les expressions des rubriques dans le plan de classement.</p> :
                <ul>{q.data.candidates.map(c => <li key={c.nodeId}>
                    <strong>{[c.code, c.label].filter(Boolean).join(' · ')}</strong>
                    <p>Expressions retrouvées : <span translate="no">{c.matchedTerms.join(', ')}</span>. Couverture : {c.score} % des expressions de cette rubrique.</p>
                    {c.nodeId === q.data!.currentNodeId ? <span>Classement actuel</span> : canAccept && <button type="button" className="btn secondary small" disabled={busy} onClick={() => { setSelected(c.nodeId); setError(null); }}>Choisir cette rubrique</button>}
                </li>)}</ul>}
        </>}
        {proposal && <Modal title="Valider le classement proposé" onClose={() => setSelected('')} locked={busy}>
            <form onSubmit={accept}>
                <p>{proposal.code} · {proposal.label}</p>
                <Notice>Cette validation remplace le classement actuel de cette fiche. Elle ne déplace pas les documents dans un autre dossier.</Notice>
                <Field label="Motif de validation"><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={2000} disabled={busy} /></Field>
                {error ? <ErrorNotice error={error} /> : null}
                <footer className="modal-footer"><button type="button" className="btn secondary" onClick={() => setSelected('')} disabled={busy}>Annuler</button><button className="btn primary" disabled={busy || !reason.trim()}>Valider le classement</button></footer>
            </form>
        </Modal>}
    </section>;
}

export function ClassificationKeywordsButton({ id }: { id: string }) {
    const [open, setOpen] = useState(false);
    return <><button type="button" className="btn small secondary" onClick={() => setOpen(true)}>Expressions de classement</button>{open && <KeywordDialog id={id} onClose={() => setOpen(false)} />}</>;
}
function KeywordDialog({ id, onClose }: { id: string; onClose: () => void }) {
    const { classification } = useSession();
    const q = useResource(s => classification!.keywords(id, s), `classification-keywords:${id}`);
    const [text, setText] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const save = async (event: React.FormEvent) => {
        event.preventDefault(); if (!q.data || busy) return;
        setBusy(true); setError(null);
        try { await classification!.saveKeywords(id, (text ?? q.data.keywords.join('\n')).split('\n').map(t => t.trim()).filter(Boolean), q.data.version); onClose(); }
        catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Expressions de classement" onClose={onClose} locked={busy}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <form onSubmit={save}>
            <Field label="Une expression par ligne" hint="Au plus 30 expressions de 3 à 100 caractères. Sans expression, les mots significatifs du libellé sont utilisés."><textarea rows={8} maxLength={3030} value={text ?? q.data?.keywords.join('\n') ?? ''} onChange={e => setText(e.target.value)} disabled={busy} /></Field>
            {error ? <ErrorNotice error={error} /> : null}<button className="btn primary" disabled={busy}>Enregistrer les expressions</button>
        </form>}
    </Modal>;
}
