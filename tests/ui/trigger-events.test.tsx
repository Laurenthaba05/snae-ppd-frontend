import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TriggerEvent, TriggerEventType } from '../../src/core/triggerEvents';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { triggerEventTypes: vi.fn(), createTriggerEventType: vi.fn(), retireTriggerEventType: vi.fn(), triggerEvents: vi.fn(), declareTriggerEvent: vi.fn(),
        cancelTriggerEvent: vi.fn(), triggerEventDocuments: vi.fn(), scheduleTriggerEvent: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ id }: { id: string }) => <>{'Nom ' + String(id).slice(0, 2)}</>,
    useEntityName: (_kind: string, id: string | null | undefined) => ({ name: id ? 'Nom ' + id.slice(0, 2) : null, loading: false })
}));
import { DeclareTriggerEventDialog, DocumentTriggerEvents, TriggerEventTypesPanel } from '../../src/ui/TriggerEvents';

const type = (over: Partial<TriggerEventType> = {}): TriggerEventType => ({ id: 't1', code: 'FIN_MARCHE', label: 'Réception définitive du marché', description: 'Procès-verbal de réception', scope: 'INSTITUTION',
    institutionId: INST, status: 'ACTIF', versionsUsing: 2, ...over });
const event = (over: Partial<TriggerEvent> = {}): TriggerEvent => ({ id: 'e1', typeId: 't1', typeLabel: 'Réception définitive du marché', institutionId: INST, documentId: null, documentReference: null,
    documentTitle: null, dossierId: 'dos1', dossierReference: 'DOS-2026-001', dossierTitle: 'Marché de travaux', eventDate: '2026-05-05', justification: 'PV n° 12', observations: null, status: 'CONSTATE',
    declaredById: '11-a', declaredAt: '2026-10-01T08:00:00Z', cancelledById: null, cancelledAt: null, cancellationReason: null, inUse: false, ...over });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['RETENTION_RULE_MANAGE', 'RETENTION_SCHEDULE', 'RETENTION_REVIEW']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.triggerEventTypes.mockResolvedValue([type()]);
    fixture.retention.triggerEvents.mockResolvedValue([]);
});

it('liste les types d’événements par leur libellé, avec les règles qui les utilisent, et propose d’en créer à qui gère les règles', async () => {
    render(<TriggerEventTypesPanel institutionId={INST} />);
    expect(await screen.findByText('Réception définitive du marché')).toBeTruthy();
    expect(screen.getByText('2 versions de règle')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouveau type d’événement' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer Réception définitive du marché' })).toBeTruthy();
});

it('sans le droit de gérer les règles, aucun type ne se crée ni ne se retire', async () => {
    fixture.allowed = new Set(['RETENTION_REVIEW']);
    render(<TriggerEventTypesPanel institutionId={INST} />);
    await screen.findByText('Réception définitive du marché');
    expect(screen.queryByRole('button', { name: 'Nouveau type d’événement' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
});

it('créer un type : les manques sont nommés avant l’envoi, puis le type part avec son institution', async () => {
    fixture.retention.createTriggerEventType.mockResolvedValue(type({ id: 't2' }));
    render(<TriggerEventTypesPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau type d’événement' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le type' }));
    expect(await within(dialog).findByText('Le libellé est obligatoire.')).toBeTruthy();
    expect(fixture.retention.createTriggerEventType).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Décès de l’agent' } });
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'deces agent' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le type' }));
    await waitFor(() => expect(fixture.retention.createTriggerEventType).toHaveBeenCalledWith(
        { code: 'deces agent', label: 'Décès de l’agent', description: null, institutionId: INST }, expect.any(String)));
});

it('retirer un type l’envoie au serveur', async () => {
    fixture.retention.retireTriggerEventType.mockResolvedValue(type({ status: 'RETIRE' }));
    render(<TriggerEventTypesPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer Réception définitive du marché' }));
    await waitFor(() => expect(fixture.retention.retireTriggerEventType).toHaveBeenCalledWith('t1', expect.any(String)));
});

it('constater l’événement : date passée et justification exigées, puis envoi sur le dossier par défaut', async () => {
    fixture.retention.declareTriggerEvent.mockResolvedValue(event());
    const done = vi.fn();
    render(<DeclareTriggerEventDialog documentId="d1" dossierId="dos1" typeId="t1" typeLabel="Réception définitive du marché" onClose={() => undefined} onDone={done} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constater l’événement' }));
    expect(await within(dialog).findByText('La date de l’événement est obligatoire.')).toBeTruthy();
    expect(fixture.retention.declareTriggerEvent).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Date de l’événement/), { target: { value: '2026-05-05' } });
    fireEvent.change(within(dialog).getByLabelText(/^Justification/), { target: { value: 'Procès-verbal n° 12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constater l’événement' }));
    await waitFor(() => expect(fixture.retention.declareTriggerEvent).toHaveBeenCalledWith(
        { typeId: 't1', documentId: null, dossierId: 'dos1', eventDate: '2026-05-05', justification: 'Procès-verbal n° 12', observations: null }, expect.any(String)));
    await waitFor(() => expect(done).toHaveBeenCalled());
});

it('les événements d’un document se lisent avec leur auteur par son nom, et ne s’annulent plus quand une échéance en est partie', async () => {
    fixture.retention.triggerEvents.mockResolvedValue([event(), event({ id: 'e2', typeLabel: 'Fin du mandat', inUse: true, dossierId: null, dossierReference: null, documentReference: 'DOC-1' }), event({ id: 'e3', status: 'ANNULE' })]);
    render(<DocumentTriggerEvents documentId="d1" />);
    expect(await screen.findByText('Événements déclencheurs constatés')).toBeTruthy();
    expect(screen.getAllByText(/Constaté le/).length).toBe(2);
    expect(screen.getAllByText(/par Nom 11/).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Annuler l’événement Réception définitive du marché' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler l’événement Fin du mandat' })).toBeNull();
    expect(screen.getByText(/une échéance en est partie/)).toBeTruthy();
});

it('annuler un événement exige un motif', async () => {
    fixture.retention.triggerEvents.mockResolvedValue([event()]);
    fixture.retention.cancelTriggerEvent.mockResolvedValue(event({ status: 'ANNULE' }));
    render(<DocumentTriggerEvents documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler l’événement Réception définitive du marché' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = () => within(dialog).getByRole('button', { name: 'Annuler l’événement' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Date saisie par erreur' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fixture.retention.cancelTriggerEvent).toHaveBeenCalledWith('e1', 'Date saisie par erreur', expect.any(String)));
});

it('planifier depuis l’événement montre la situation de chaque document puis planifie ce qui l’est', async () => {
    fixture.retention.triggerEvents.mockResolvedValue([event()]);
    fixture.retention.triggerEventDocuments.mockResolvedValue([
        { documentId: 'd1', reference: 'DOC-1', title: 'Cahier des charges', status: 'PLANIFIABLE' },
        { documentId: 'd2', reference: 'DOC-2', title: 'Avenant', status: 'NON_CLOS' }]);
    fixture.retention.scheduleTriggerEvent.mockResolvedValue({ event: event({ inUse: true }), scheduled: 1, failures: [],
        documents: [{ documentId: 'd1', reference: 'DOC-1', title: 'Cahier des charges', status: 'PLANIFIE' }, { documentId: 'd2', reference: 'DOC-2', title: 'Avenant', status: 'NON_CLOS' }] });
    render(<DocumentTriggerEvents documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Planifier les documents concernés' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Peut être planifié')).toBeTruthy();
    expect(within(dialog).getByText('Pas encore clos : clôturez-le d’abord')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Planifier 1 échéance' }));
    await waitFor(() => expect(fixture.retention.scheduleTriggerEvent).toHaveBeenCalledWith('e1', expect.any(String)));
    expect(await within(dialog).findByText('1 échéance a été planifiée.')).toBeTruthy();
    expect(within(dialog).getByText('Planifié à l’instant')).toBeTruthy();
});
