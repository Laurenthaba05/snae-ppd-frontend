import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import type { Dossier } from '../core/types';
import { uuid } from '../core/validation';
import { CommandDialog } from './CommandDialog';
import { Busy, ErrorNotice, Modal, Notice, useResource } from './components';

export function DossierCloseButton({ dossier, onChanged }: { dossier: Dossier; onChanged: () => void }) {
    const { me } = useSession();
    const [opened, setOpened] = useState(false);
    if (dossier.businessStatus === 'CLOS' || dossier.archivalStatus === 'DETRUIT' || !can(me, 'DOSSIER_CLOSE', dossier)) return null;
    return <><button type="button" className="btn warning" onClick={() => setOpened(true)}>Clore le dossier</button>
        {opened && <DossierCloseDialog id={dossier.id} onClose={() => setOpened(false)} onChanged={onChanged} />}</>;
}
export function DossierCloseDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { records, me, epoch } = useSession();
    const q = useResource(async signal => {
        const dossier = await records!.dossier(id, signal);
        const children = await records!.dossierChildren(id, signal);
        return { dossier, children };
    }, 'dossier-close:' + id + ':' + epoch);
    const d = q.data?.dossier;
    const openChildren = q.data?.children.filter(child => child.businessStatus !== 'CLOS') ?? [];
    const allowed = d && d.businessStatus !== 'CLOS' && d.archivalStatus !== 'DETRUIT' && can(me, 'DOSSIER_CLOSE', d);
    if (!d || !allowed || openChildren.length || q.error) return <Modal title="Clore le dossier" onClose={onClose}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !allowed ? <Notice>Ce dossier ne peut pas être clos par votre compte dans son état actuel.</Notice>
            : <Notice tone="warning">Clôturez d’abord les sous-dossiers encore ouverts : {openChildren.map(child => child.reference).join(', ')}.</Notice>}
        <button type="button" className="btn secondary" onClick={onClose}>Fermer</button></Modal>;
    return <CommandDialog title="Clore le dossier" description={d.reference + ' — ' + d.title + '. La date de clôture sera enregistrée ; le dossier ne recevra plus de nouvelles pièces ou de sous-dossiers.'}
        api={records!} path={'/dossiers/' + uuid(id) + '/close'} build={() => ({})} onClose={onClose} onSuccess={() => { onChanged(); onClose(); }} danger label="Confirmer la clôture">
        <Notice>Les sous-dossiers visibles sont clos. Le serveur revérifie tous les sous-dossiers et vos droits au moment de la clôture.</Notice>
    </CommandDialog>;
}
