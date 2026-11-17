import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Busy, ErrorNotice, Field, Modal, Notice, Pagination, useResource } from './components';
import { useCommand } from './PortalAdmin';

interface Tariff { typeId: string; typeLabel: string; amountGnf: number | null; durationDays: number | null; active: boolean; decisionReference: string | null; version: number | null }
interface Tariffs { items: Tariff[]; page: number; hasMore: boolean }
export function DocumentTariffsPanel() {
    const { portalAdmin, me, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [input, setInput] = useState('');
    const [term, setTerm] = useState('');
    const [editing, setEditing] = useState<Tariff | null>(null);
    const list = useResource(s => portalAdmin!.transport.request<Tariffs>('/portal-admin/document-tariffs?page=' + page + '&q=' + encodeURIComponent(term), { signal: s }), JSON.stringify(['document-tariffs', page, term, epoch]));
    const manage = can(me, 'PORTAL_PLAN_MANAGE', {});
    return <section className="panel">
        <h2>Tarifs de lecture par type de document</h2>
        <p>La Direction des Archives nationales fixe le prix en GNF et la durée de lecture d’un document de chaque type. Une référence de décision est conservée dans le journal. Aucun prix n’est prérempli et le téléchargement est désactivé.</p>
        <Notice tone="warning">Orange Money et PayCard attendent l’ouverture des comptes marchands et le raccordement de leurs API. Publier un tarif n’active pas encore les paiements.</Notice>
        <form onSubmit={e => { e.preventDefault(); setPage(0); setTerm(input.trim()); }}><Field label="Rechercher un type de document"><input value={input} maxLength={100} onChange={e => setInput(e.target.value)} /></Field><button className="btn secondary">Rechercher</button></form>
        {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : list.data && <>
            <div className="table-scroll"><table><thead><tr><th>Type de document</th><th>Prix en GNF</th><th>Durée de lecture</th><th>Publication</th><th>Décision</th><th>Action</th></tr></thead><tbody>
                {list.data.items.map(item => <tr key={item.typeId}><td>{item.typeLabel}</td><td>{item.amountGnf === null ? 'Non défini' : new Intl.NumberFormat('fr-GN').format(item.amountGnf)}</td><td>{item.durationDays === null ? 'Non définie' : item.durationDays + ' jour(s)'}</td><td>{item.active ? 'Publié' : 'Non publié'}</td><td>{item.decisionReference ?? '—'}</td><td>{manage && <button className="text-link" onClick={() => setEditing(item)}>Définir le tarif de {item.typeLabel}</button>}</td></tr>)}
            </tbody></table></div>
            <Pagination page={page} count={list.data.items.length} hasMore={list.data.hasMore} onChange={setPage} />
        </>}
        {editing && <TariffDialog key={editing.typeId} tariff={editing} close={() => setEditing(null)} saved={list.refresh} />}
    </section>;
}
function TariffDialog({ tariff, close, saved }: { tariff: Tariff; close: () => void; saved: () => void }) {
    const [amount, setAmount] = useState(tariff.amountGnf?.toString() ?? '');
    const [days, setDays] = useState(tariff.durationDays?.toString() ?? '');
    const [decision, setDecision] = useState(tariff.decisionReference ?? '');
    const [active, setActive] = useState(tariff.active);
    const command = useCommand();
    const valid = /^\d+$/.test(amount) && Number(amount) > 0 && Number(amount) <= 999999999999 && /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 3650 && decision.trim().length >= 5;
    return <Modal title={'Tarif : ' + tariff.typeLabel} onClose={close} locked={command.busy}>
        <form onSubmit={e => { e.preventDefault(); if (valid) void command.send('/document-tariffs/' + tariff.typeId, { amountGnf: Number(amount), durationDays: Number(days), active, decisionReference: decision.trim(), expectedVersion: tariff.version }, 'PUT').then(result => { if (result !== null) { saved(); close(); } }); }}>
            <Field label="Prix fixé par la direction (GNF)"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} required /></Field>
            <Field label="Durée de lecture d’un document (jours)"><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} required /></Field>
            <Field label="Référence de la décision de la direction"><textarea value={decision} onChange={e => setDecision(e.target.value)} maxLength={500} minLength={5} required /></Field>
            <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Publier ce tarif</label>
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={close} disabled={command.busy}>Annuler</button><button className="btn primary" disabled={!valid || command.busy}>Enregistrer la décision</button></footer>
        </form>
    </Modal>;
}
