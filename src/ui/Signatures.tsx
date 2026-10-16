import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { formatDay } from '../core/format';
import {
    CHAIN_LABELS, CHECK_LABELS, REVOCATION_LABELS, FORMAT_LABELS, FORMAT_SHORT, LEVEL_HINTS, LEVEL_LABELS, commonName, declarationBody, declarationProblems, emptyDeclaration, groupByFile, isDetachedSignature, isSelfSigned,
    isVerifiable, overview, overviewText, shortHash, verdictOf,
    type DeclarationForm, type DocumentSignature, type SignatureFormat, type SignatureLevel
} from '../core/signatures';

interface FileChoice { id: string; name: string; versionNumber: number; mediaType: string }

/** Les fichiers de toutes les versions du document, par leur nom : jamais leur identifiant. */
function useDocumentFiles(documentId: string) {
    const { records, epoch } = useSession();
    return useResource<FileChoice[]>(async signal => {
        const versions = await records!.versions(documentId, signal);
        const lists = await Promise.all(versions.map(v => records!.files(v.id, signal).then(files => files.map(f => ({ id: f.id, name: f.originalFilename, versionNumber: v.number, mediaType: f.mediaType })))));
        return lists.flat();
    }, `signature-files:${documentId}:${epoch}`);
}
const fileLabel = (f: FileChoice) => `${f.name} · version ${f.versionNumber}`;

const SOURCE_LABEL = { DECLAREE: 'Déclarée', VERIFIEE: 'Vérifiée par le serveur' } as const;

/** Les signatures électroniques d'un document : déclarées par une personne, ou vérifiées par le serveur dans un PDF (contenu intact ? certificat ?). */
export function SignaturesPanel({ documentId, canEdit, destroyed = false }: { documentId: string; canEdit: boolean; destroyed?: boolean }) {
    const { records, epoch } = useSession();
    const q = useResource<DocumentSignature[]>(signal => records!.documentSignatures(documentId, signal), `document-signatures:${documentId}:${epoch}`);
    const [declaring, setDeclaring] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const list = q.data ?? [];
    const groups = useMemo(() => groupByFile(list), [list]);
    const counts = useMemo(() => overview(list), [list]);
    const remove = async (s: DocumentSignature) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { remove: s.id, version: s.version });
        try { await records!.deleteSignature(documentId, s.id, s.version, intention.current.key); setConfirming(null); q.refresh(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <section className="panel document-signatures" aria-label="Signatures électroniques">
        <div className="section-heading"><h3>Signatures électroniques</h3>{canEdit && !destroyed && <div className="table-actions">
            <button type="button" className="btn small secondary" onClick={() => setVerifying(true)}>Vérifier les signatures d’un fichier</button>
            <button type="button" className="btn small secondary" onClick={() => setDeclaring(true)}>Déclarer une signature</button></div>}</div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : groups.length === 0 ? <Empty title="Aucune signature" description="Déclarez la signature d’un acte signé sur papier, ou faites vérifier celles d’un PDF, d’un fichier .p7m ou d’un XML signés électroniquement." icon="shield" />
                : <>
                    <p className="signature-overview">{overviewText(counts)}</p>
                    {groups.map(g => <div key={g.fileId} className="signature-group"><h4>{g.fileName}</h4>
                        <ul>{g.items.map(s => <SignatureItem key={s.id} s={s}>
                            {canEdit && !destroyed && s.source === 'DECLAREE' && (confirming === s.id
                                ? <span className="relation-actions"><span className="relation-confirm">Retirer cette signature ?</span> <button type="button" className="btn small danger" disabled={busy} onClick={() => void remove(s)}>Retirer</button> <button type="button" className="btn small secondary" disabled={busy} onClick={() => setConfirming(null)}>Garder</button></span>
                                : <span className="relation-actions"><button type="button" className="btn small danger-outline" onClick={() => { setError(null); setConfirming(s.id); }}>Retirer</button></span>)}
                        </SignatureItem>)}</ul></div>)}
                </>}
        {error ? <ErrorNotice error={error} /> : null}
        {declaring && <DeclareDialog documentId={documentId} onClose={() => setDeclaring(false)} onSaved={q.refresh} />}
        {verifying && <VerifyDialog documentId={documentId} onClose={() => setVerifying(false)} onVerified={q.refresh} />}
    </section>;
}

function SignatureItem({ s, children }: { s: DocumentSignature; children?: React.ReactNode }) {
    const verdict = verdictOf(s);
    const c = s.certificate;
    const detail = [s.quality, s.organization].filter(Boolean).join(' · ');
    return <li className={'signature-item tone-' + verdict.tone}>
        <div className="signature-head"><strong>{s.signer}</strong>{detail && <span className="cell-sub">{detail}</span>}
            <Badge value={s.source === 'DECLAREE' ? 'NON_VERIFIEE' : s.status} label={CHECK_LABELS[s.source === 'DECLAREE' ? 'NON_VERIFIEE' : s.status]} />
            {s.source === 'VERIFIEE' && s.status === 'INTEGRITE_VALIDE' && s.chainStatus && s.chainStatus !== 'NON_EVALUEE' && <Badge value={s.chainStatus === 'VALIDE' ? 'VALIDE' : 'SUSPENDU'} label={CHAIN_LABELS[s.chainStatus]} />}
            {s.source === 'VERIFIEE' && s.status === 'INTEGRITE_VALIDE' && s.chainStatus === 'VALIDE' && s.revocationStatus && s.revocationStatus !== 'NON_VERIFIEE' &&
                <Badge value={s.revocationStatus === 'NON_REVOQUE' ? 'VALIDE' : s.revocationStatus === 'REVOQUE' ? 'ECHEC' : 'SUSPENDU'} label={REVOCATION_LABELS[s.revocationStatus]} />}</div>
        <small className="cell-sub">{SOURCE_LABEL[s.source]} · {FORMAT_SHORT[s.format]} · {LEVEL_LABELS[s.level]}{s.signedAt ? ' · signée le ' + formatDate(s.signedAt) : ''}{s.verifiedAt ? ' · vérifiée le ' + formatDate(s.verifiedAt) : ''}</small>
        <p className="signature-verdict">{verdict.title}</p>
        {verdict.notes.length > 0 && <ul className="signature-notes">{verdict.notes.map(n => <li key={n}>{n}</li>)}</ul>}
        {s.comment && <small className="cell-sub">{s.comment}</small>}
        {c && <details className="signature-certificate"><summary>Certificat du signataire</summary><dl className="f3-description-list">
            <div><dt>Titulaire</dt><dd>{commonName(c.subject)}</dd></div>
            <div><dt>Émetteur</dt><dd>{isSelfSigned(c) ? 'Lui-même (certificat auto-signé)' : commonName(c.issuer)}</dd></div>
            <div><dt>Valide</dt><dd>du {formatDay(c.validFrom)} au {formatDay(c.validTo)}</dd></div>
            <div><dt>Numéro de série</dt><dd><code>{c.serial}</code></dd></div>
            <div><dt>Empreinte SHA-256</dt><dd><code title={c.sha256}>{shortHash(c.sha256)}</code></dd></div></dl></details>}
        <small className="cell-sub">Fichier signé : empreinte <code title={s.fileHash}>{shortHash(s.fileHash)}</code></small>
        {children}
    </li>;
}

function DeclareDialog({ documentId, onClose, onSaved }: { documentId: string; onClose: () => void; onSaved: () => void }) {
    const { records } = useSession();
    const files = useDocumentFiles(documentId);
    const [form, setForm] = useState<DeclarationForm>(emptyDeclaration());
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => declarationProblems(form), [form]);
    useEffect(() => { if (!form.fileId && files.data?.length === 1) setForm(f => ({ ...f, fileId: files.data![0]!.id })); }, [files.data, form.fileId]);
    const text = (key: keyof DeclarationForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = declarationBody(form);
        intention.current = commandKey(intention.current, body);
        try { await records!.declareSignature(documentId, body, intention.current.key); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Déclarer une signature" subtitle="Qui a signé, en quelle qualité, sur quel fichier" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Une signature déclarée est une information saisie : le serveur ne la contrôle pas. Pour un fichier signé électroniquement (PDF, .p7m, .p7s, XML), utilisez plutôt la vérification.</Notice>
            <div className="form-grid">
                <Field label="Fichier signé *" wide hint="L’empreinte du fichier est conservée avec la signature."><select value={form.fileId} onChange={text('fileId')} disabled={busy || files.loading}>
                    <option value="">{files.loading ? 'Chargement…' : 'Choisir un fichier'}</option>{(files.data ?? []).map(f => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}</select></Field>
                <Field label="Signataire *" wide><input value={form.signer} onChange={text('signer')} maxLength={500} disabled={busy} autoComplete="off" /></Field>
                <Field label="Qualité" hint="Directeur général, ordonnateur…"><input value={form.quality} onChange={text('quality')} maxLength={300} disabled={busy} /></Field>
                <Field label="Organisme"><input value={form.organization} onChange={text('organization')} maxLength={300} disabled={busy} /></Field>
                <Field label="Format"><select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value as SignatureFormat }))} disabled={busy}>
                    {(Object.keys(FORMAT_LABELS) as SignatureFormat[]).map(k => <option key={k} value={k}>{FORMAT_LABELS[k]}</option>)}</select></Field>
                <Field label="Niveau" hint={LEVEL_HINTS[form.level]}><select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value as SignatureLevel }))} disabled={busy}>
                    {(Object.keys(LEVEL_LABELS) as SignatureLevel[]).map(k => <option key={k} value={k}>{LEVEL_LABELS[k]}</option>)}</select></Field>
                <Field label="Date de signature"><input type="date" value={form.signedAt} onChange={text('signedAt')} disabled={busy} /></Field>
                <Field label="Commentaire" wide><textarea value={form.comment} onChange={text('comment')} rows={2} maxLength={2000} disabled={busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

function VerifyDialog({ documentId, onClose, onVerified }: { documentId: string; onClose: () => void; onVerified: () => void }) {
    const { records } = useSession();
    const files = useDocumentFiles(documentId);
    const verifiable = useMemo(() => (files.data ?? []).filter(f => isVerifiable(f.mediaType, f.name)), [files.data]);
    const detached = useMemo(() => (files.data ?? []).filter(f => isDetachedSignature(f.mediaType, f.name)), [files.data]);
    const signed = useMemo(() => (files.data ?? []).filter(f => !isDetachedSignature(f.mediaType, f.name)), [files.data]);
    const [mode, setMode] = useState<'EMBEDDED' | 'DETACHED'>('EMBEDDED');
    const [fileId, setFileId] = useState('');
    const [signatureFileId, setSignatureFileId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [result, setResult] = useState<DocumentSignature[] | null>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    useEffect(() => { if (!fileId && mode === 'EMBEDDED' && verifiable.length === 1) setFileId(verifiable[0]!.id); }, [verifiable, fileId, mode]);
    const ready = mode === 'EMBEDDED' ? !!fileId : !!fileId && !!signatureFileId;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !ready) return;
        setBusy(true); setError(null); setResult(null);
        intention.current = commandKey(intention.current, { mode, fileId, signatureFileId, at: Date.now() });
        try {
            setResult(mode === 'EMBEDDED' ? await records!.verifySignatures(documentId, fileId, intention.current.key)
                : await records!.verifyDetachedSignature(documentId, fileId, signatureFileId, intention.current.key));
            intention.current = null; onVerified();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Vérifier les signatures d’un fichier" subtitle="Le serveur relit le fichier, contrôle chaque signature et évalue la chaîne de confiance" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {files.loading && !files.data ? <Busy /> : files.error ? <ErrorNotice error={files.error} onRetry={files.refresh} />
                : verifiable.length === 0 && detached.length === 0 ? <Notice tone="warning">Ce document n’a aucun fichier à signature vérifiable (PDF, .p7m, XML, ou .p7s avec son fichier). Déclarez les autres.</Notice>
                    : <div className="form-grid">
                        {detached.length > 0 && <Field label="Type de signature" wide><select value={mode} onChange={e => { setMode(e.target.value as 'EMBEDDED' | 'DETACHED'); setFileId(''); setSignatureFileId(''); setResult(null); }} disabled={busy}>
                            <option value="EMBEDDED">Signature intégrée au fichier (PDF, .p7m, XML)</option><option value="DETACHED">Signature détachée (.p7s) d’un autre fichier</option></select></Field>}
                        <Field label={mode === 'EMBEDDED' ? 'Fichier signé' : 'Fichier signé par la signature détachée'} wide hint="Le fichier doit avoir été validé. Chaque nouvelle vérification remplace la précédente.">
                            <select value={fileId} onChange={e => { setFileId(e.target.value); setResult(null); }} disabled={busy}>
                                <option value="">Choisir un fichier</option>{(mode === 'EMBEDDED' ? verifiable : signed).map(f => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}</select></Field>
                        {mode === 'DETACHED' && <Field label="Fichier de signature (.p7s)" wide><select value={signatureFileId} onChange={e => { setSignatureFileId(e.target.value); setResult(null); }} disabled={busy}>
                            <option value="">Choisir le fichier de signature</option>{detached.map(f => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}</select></Field>}
                    </div>}
            {result && (result.length === 0
                ? <Notice>Ce fichier ne porte aucune signature électronique.</Notice>
                : <div role="status"><p className="signature-overview">{overviewText(overview(result))}</p><ul className="signature-list">{result.map(s => <SignatureItem key={s.id} s={s} />)}</ul></div>)}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={busy || !ready}>{busy ? 'Vérification…' : result ? 'Vérifier de nouveau' : 'Vérifier'}</button></footer>
        </form>
    </Modal>;
}
