import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { canAnywhere } from '../core/policy';
import type { Dossier, Page, PhysicalArchive } from '../core/types';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { navigate } from './navigation';
import { DossierName } from './names';

/**
 * Le dossier du système dont une archive physique est le papier. Le lien ne change aucun droit : il faut pouvoir gérer l'archive et lire le dossier (un dossier hors de portée est
 * introuvable), l'archive et le dossier ont la même origine, et une archive porte au plus un dossier (pour en changer, on la détache d'abord). Le serveur reste seul juge.
 */

const SHOWN = 10;

/** Cherche un dossier par sa référence ou son titre, dans l'institution de l'archive, et le relie en un clic. */
export function DossierLinkDialog({ archive, onClose, onDone }: { archive: Pick<PhysicalArchive, 'id' | 'cote' | 'versionLock' | 'institutionId'>; onClose: () => void; onDone: () => void }) {
    const { records, physicalArchives, epoch } = useSession();
    const [text, setText] = useState('');
    const [applied, setApplied] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const q = useResource<Page<Dossier>>(signal => records!.dossiers({ q: applied || null, institutionId: archive.institutionId ?? null, page: 0, size: SHOWN }, signal), JSON.stringify(['dossier-link-search', archive.institutionId, applied, epoch]));
    const link = async (dossierId: string) => {
        setBusy(dossierId); setError(null);
        try { await physicalArchives!.command('/archives/' + archive.id + '/dossier', { versionLock: archive.versionLock, dossierId }, crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const items = q.data?.items ?? [];
    return <Modal title="Relier un dossier" subtitle={archive.cote} onClose={onClose} locked={busy !== null}>
        <Notice>Le dossier numérique et l’archive papier désignent la même affaire. Le lien ne change aucun droit : l’archive et le dossier doivent venir de la même institution, et une archive ne porte qu’un seul dossier.</Notice>
        <form className="asset-filters" role="search" aria-label="Chercher un dossier" onSubmit={e => { e.preventDefault(); setApplied(text.trim()); }}>
            <Field label="Référence ou titre du dossier"><input value={text} onChange={e => setText(e.target.value)} disabled={busy !== null} /></Field>
            <button type="submit" className="btn small secondary" disabled={busy !== null}>Rechercher</button>
        </form>
        {q.loading && !q.data ? <Busy label="Recherche des dossiers…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : items.length
            ? <div className="table-scroll"><table><thead><tr><th>Dossier</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>{items.map(d => <tr key={d.id}><td><strong>{d.reference}</strong> · {d.title}</td>
                    <td><button type="button" className="btn small primary" disabled={busy !== null} onClick={() => void link(d.id)}>{busy === d.id ? 'Liaison…' : 'Relier'}</button></td></tr>)}</tbody></table></div>
            : <Empty title="Aucun dossier" description={applied ? 'Aucun dossier lisible par vous ne correspond à ces mots, dans l’institution de cette archive.' : 'Aucun dossier lisible par vous dans l’institution de cette archive.'} />}
        {q.data?.hasMore && <p className="wf-note">D’autres dossiers existent : précisez la référence ou le titre.</p>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy !== null}>Fermer</button></footer>
    </Modal>;
}

/** Détache l'archive de son dossier : le dossier et l'archive restent, seul le lien disparaît. */
function UnlinkDialog({ archive, onClose, onDone }: { archive: Pick<PhysicalArchive, 'id' | 'cote' | 'versionLock'>; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const run = async () => {
        setBusy(true); setError(null);
        try { await physicalArchives!.command('/archives/' + archive.id + '/dossier', { versionLock: archive.versionLock, dossierId: null }, crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Détacher le dossier" subtitle={archive.cote} onClose={onClose} locked={busy}>
        <Notice>L’archive n’est plus reliée à son dossier numérique. Ni l’une ni l’autre n’est supprimé ; le détachement est consigné au journal.</Notice>
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>Détacher</button></footer>
    </Modal>;
}

/** La ligne « Dossier numérique » de la fiche d'une archive : le nom du dossier relié (avec un lien pour l'ouvrir) ou le geste pour en relier un. */
export function ArchiveDossierField({ archive, canManage, onChanged }: { archive: PhysicalArchive; canManage: boolean; onChanged: () => void }) {
    const [linking, setLinking] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    return <>
        {archive.dossierId
            ? <span className="table-actions"><button type="button" className="text-link" onClick={() => navigate('/app/dossiers/' + archive.dossierId)}><DossierName id={archive.dossierId} /></button>
                {canManage && <button type="button" className="btn small secondary" onClick={() => setUnlinking(true)}>Détacher</button>}</span>
            : <span className="table-actions"><span>—</span>{canManage && <button type="button" className="btn small secondary" onClick={() => setLinking(true)}>Relier un dossier</button>}</span>}
        {linking && <DossierLinkDialog archive={archive} onClose={() => setLinking(false)} onDone={onChanged} />}
        {unlinking && <UnlinkDialog archive={archive} onClose={() => setUnlinking(false)} onDone={onChanged} />}
    </>;
}

/** Sur la fiche d'un dossier : les archives papier qui lui sont reliées, pour qui peut lire les archives physiques. */
export function DossierPaperArchives({ dossierId }: { dossierId: string }) {
    const { me, physicalArchives, epoch } = useSession();
    const allowed = canAnywhere(me, 'PHYSICALARCHIVES_READ');
    const q = useResource<Page<PhysicalArchive>>(signal => allowed ? physicalArchives!.dossierArchives(dossierId, signal) : Promise.resolve({ items: [], page: 0, size: 0, hasMore: false }), JSON.stringify(['dossier-paper-archives', dossierId, allowed, epoch]));
    if (!allowed) return null;
    const items = q.data?.items ?? [];
    return <>
        <h4>Archives papier</h4>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <p className="relation-empty">Aucune archive physique n’est reliée à ce dossier.</p>
                : <div className="table-scroll"><table><thead><tr><th>Cote et intitulé</th><th>Support</th></tr></thead>
                    <tbody>{items.map(a => <tr key={a.id}>
                        <td><button type="button" className="text-link" onClick={() => navigate('/app/archives-physiques?archive=' + a.id)}><strong>{a.cote}</strong>{a.intitule ? ' · ' + a.intitule : ''}</button></td>
                        <td>{a.support ?? '—'}</td></tr>)}</tbody></table></div>}
        {q.data?.hasMore && <p className="wf-note">D’autres archives papier sont reliées à ce dossier ; ouvrez-les depuis les archives physiques.</p>}
    </>;
}
