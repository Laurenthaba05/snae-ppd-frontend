import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Modal, Notice, formatDate, useResource } from './components';
import { EntityName, useEntityName } from './names';
import { ActSealPanel } from './ActSeal';
import { formatBytes } from '../core/format';
import {
    KIND_LABELS, blockerText, certificateHtml, destroyedSummary, kindCounts, previewSummary,
    type DestructionCertificate, type DestructionPreview
} from '../core/destruction';
import { printHtml } from './printHtml';

const SHOWN = 50;
const shortHash = (h: string | null) => h ? h.slice(0, 12) + '…' : '—';

/**
 * Ce que l'exécution d'une élimination supprimerait, avant de la viser ou de l'exécuter : le nombre d'objets et leur taille, les fichiers de conservation un par un,
 * et les obstacles. Lecture seule ; `onLoaded` remonte l'aperçu pour que la boîte de dialogue sache s'il y a quelque chose à confirmer.
 */
export function DestructionPreviewBox({ dispositionId, onLoaded }: { dispositionId: string; onLoaded?: (preview: DestructionPreview) => void }) {
    const { retention, epoch } = useSession();
    const q = useResource<DestructionPreview>(async signal => { const p = await retention!.destructionPreview(dispositionId, signal); onLoaded?.(p); return p; }, `destruction-preview:${dispositionId}:${epoch}`);
    if (q.loading && !q.data) return <Busy label="Inventaire du contenu…" />;
    if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const p = q.data;
    if (!p) return null;
    const files = p.objects.filter(o => o.kind === 'FICHIER');
    return <section className="destruction-preview" aria-label="Contenu qui serait détruit">
        <Notice tone="warning"><strong>Contenu concerné :</strong> {previewSummary(p)}</Notice>
        {p.objectCount > 0 && <p className="destruction-kinds">{kindCounts(p.objects).map(k => <span key={k.kind} className="finding">{k.count} · {KIND_LABELS[k.kind].toLowerCase()}{k.count > 1 ? 's' : ''}</span>)}</p>}
        {files.length > 0 && <details><summary>Fichiers de conservation ({files.length})</summary>
            <div className="table-scroll"><table><thead><tr><th>Nom</th><th>Taille</th><th>Empreinte</th></tr></thead>
                <tbody>{files.slice(0, SHOWN).map((o, i) => <tr key={i}><td>{o.name ?? '—'}</td><td>{formatBytes(o.size)}</td><td><code title={o.sha256 ?? undefined}>{shortHash(o.sha256)}</code></td></tr>)}</tbody></table></div>
            {files.length > SHOWN && <p><small>{files.length - SHOWN} autres fichiers ne sont pas listés ici ; le certificat les détaillera tous.</small></p>}</details>}
        {p.previousAttempts > 0 && <Notice tone="warning">Une destruction a déjà été commencée pour cette action ({p.previousAttempts} tentative{p.previousAttempts > 1 ? 's' : ''}){p.lastError ? <> ; dernier échec : <code>{p.lastError}</code></> : null}. Les objets déjà supprimés sont reconnus à la reprise ; l’action ne peut plus être annulée.</Notice>}
        {p.blockers.length > 0 && <ul className="relation-problems" role="alert">{p.blockers.map(b => <li key={b}>{blockerText(b)}</li>)}</ul>}
    </section>;
}

/** Le certificat de destruction : ce qui a été détruit, par qui, avec la preuve de l'absence de chaque objet. Imprimable. */
export function CertificateDialog({ certificate: c, onClose }: { certificate: DestructionCertificate; onClose: () => void }) {
    const operator = useEntityName('users', c.operatorId);
    const proposer = useEntityName('users', c.proposedById);
    const validator = useEntityName('users', c.validatedById);
    const institution = useEntityName('institutions', c.institutionId);
    const print = () => {
        const html = certificateHtml(c, { operator: operator.name ?? 'Agent', proposer: proposer.name ?? 'Agent', validator: validator.name ?? 'Agent', institution: institution.name ?? 'Institution', date: formatDate });
        printHtml(html);
    };
    return <Modal wide title="Certificat de destruction" subtitle={c.reference} onClose={onClose}>
        <div className="panel-padding destruction-certificate">
            <dl className="detail-card">
                <div><dt>Document détruit</dt><dd>{c.identifiantMetier} — {c.title}</dd></div>
                <div><dt>Statut</dt><dd><Badge value={c.status} label={c.status === 'COMPLET' ? 'Complet' : 'En cours'} /></dd></div>
                <div><dt>Visa de la validation</dt><dd>{c.visaReference ?? '—'}</dd></div>
                <div><dt>Proposée par</dt><dd>{c.proposedById ? <EntityName kind="users" id={c.proposedById} /> : '—'}</dd></div>
                <div><dt>Validée par</dt><dd>{c.validatedById ? <EntityName kind="users" id={c.validatedById} /> : '—'}</dd></div>
                <div><dt>Exécutée par</dt><dd><EntityName kind="users" id={c.operatorId} /> le {formatDate(c.finishedAt ?? c.startedAt)}</dd></div>
                <div><dt>Contenu détruit</dt><dd>{destroyedSummary(c)}</dd></div>
            </dl>
            {c.objects.length > 0 && <div className="table-scroll"><table><thead><tr><th>Nature</th><th>Nom</th><th>Taille</th><th>Empreinte</th><th>État</th></tr></thead>
                <tbody>{c.objects.map((o, i) => <tr key={i}><td>{KIND_LABELS[o.kind]}</td><td>{o.name ?? '—'}</td><td>{formatBytes(o.size)}</td><td><code title={o.sha256 ?? undefined}>{shortHash(o.sha256)}</code></td>
                    <td>{o.alreadyAbsent ? 'Déjà absent' : 'Supprimé'}{o.absenceVerified ? ' · absence vérifiée' : ''}</td></tr>)}</tbody></table></div>}
            {c.fingerprint && <p><small>Empreinte de la liste des objets : <code>{c.fingerprint}</code></small></p>}
            <Notice>Ce certificat couvre le stockage de l’application. Les sauvegardes et réplicas éventuels de l’hébergeur ne sont pas couverts.</Notice>
            {c.status === 'COMPLET' && <ActSealPanel type="CERTIFICAT_DESTRUCTION" id={c.id} />}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={print}>Afficher et imprimer</button><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

/** Charge puis affiche le certificat d'une action d'élimination exécutée. */
export function CertificateButton({ load, label = 'Certificat' }: { load: (signal: AbortSignal) => Promise<DestructionCertificate>; label?: string }) {
    const [open, setOpen] = useState(false);
    const [certificate, setCertificate] = useState<DestructionCertificate | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const show = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try { setCertificate(await load(new AbortController().signal)); setOpen(true); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <>
        <button type="button" className="btn small secondary" disabled={busy} onClick={() => void show()}>{busy ? 'Chargement…' : label}</button>
        {error ? <ErrorNotice error={error} /> : null}
        {open && certificate && <CertificateDialog certificate={certificate} onClose={() => setOpen(false)} />}
    </>;
}

/** Sur un document détruit : le tombeau, et le lien vers le certificat qui prouve la destruction. */
export function DocumentTombstone({ documentId }: { documentId: string }) {
    const { retention } = useSession();
    return <Notice tone="warning"><strong>Ce document a été détruit.</strong> Son contenu n’existe plus ; seule sa notice demeure, comme tombeau, avec le certificat de destruction.
        {' '}{retention && <CertificateButton label="Voir le certificat de destruction" load={signal => retention.certificateOfDocument(documentId, signal)} />}</Notice>;
}

/** Les certificats de destruction de l'institution, du plus récent au plus ancien. */
export function CertificatesPanel({ institutionId }: { institutionId: string }) {
    const { retention, epoch } = useSession();
    const q = useResource<DestructionCertificate[]>(signal => retention!.certificates(institutionId, signal), `destruction-certificates:${institutionId}:${epoch}`);
    const [open, setOpen] = useState<DestructionCertificate | null>(null);
    const certificates = q.data ?? [];
    return <div className="panel">
        <div className="section-heading"><h3>Certificats de destruction</h3></div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : certificates.length === 0 ? <Empty title="Aucune destruction" description="Une élimination exécutée établit ici son certificat." icon="check" />
                : <div className="table-scroll"><table><thead><tr><th>Certificat</th><th>Document</th><th>Exécuté le</th><th>Exécuté par</th><th>Contenu détruit</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{certificates.map(c => <tr key={c.id}>
                        <td><strong>{c.reference}</strong></td>
                        <td>{c.identifiantMetier}<small className="cell-sub">{c.title}</small></td>
                        <td>{formatDate(c.finishedAt ?? c.startedAt)}</td>
                        <td><EntityName kind="users" id={c.operatorId} /></td>
                        <td>{c.objectCount} objet{c.objectCount > 1 ? 's' : ''} · {formatBytes(c.totalSize)}</td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpen(c)}>Voir</button></td>
                    </tr>)}</tbody></table></div>}
        {open && <CertificateLoader id={open.id} onClose={() => setOpen(null)} />}
    </div>;
}

/** La liste ne porte pas les objets : le certificat complet se charge à l'ouverture. */
function CertificateLoader({ id, onClose }: { id: string; onClose: () => void }) {
    const { retention } = useSession();
    const q = useResource<DestructionCertificate>(signal => retention!.certificate(id, signal), 'destruction-certificate:' + id);
    if (q.error) return <Modal title="Certificat de destruction" onClose={onClose}><div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh} /></div></Modal>;
    if (!q.data) return <Modal title="Certificat de destruction" onClose={onClose}><div className="panel-padding"><Busy /></div></Modal>;
    return <CertificateDialog certificate={q.data} onClose={onClose} />;
}
