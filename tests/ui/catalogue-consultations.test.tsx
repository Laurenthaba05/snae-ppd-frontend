import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me, Grant, RecordDocument } from '../../src/core/types';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const ID = '11111111-1111-4111-8111-111111111101';
const fixture = vi.hoisted(() => ({ epoch: 1, me: null as Me | null, codification: null,
    api: { get: vi.fn() }, classification: { nodes: vi.fn() },
    records: { documents: vi.fn(), document: vi.fn(), dossiers: vi.fn(), dossier: vi.fn(), actors: vi.fn(), actor: vi.fn(), documentActors: vi.fn(), command: vi.fn(), documentTypes: vi.fn() },
    consultation: { myRequests: vi.fn(), requestsByInstitution: vi.fn(), createRequest: vi.fn() },
    portalAdmin: { accessRequests: vi.fn(), accessRequest: vi.fn(), accessRequestJournal: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST } }) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: () => null }));
vi.mock('../../src/ui/InstitutionChoice', () => ({ InstitutionChoice: () => null }));
vi.mock('../../src/ui/CodeField', () => ({ CodeField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="Cote" value={value} onChange={e => onChange(e.target.value)}/> }));
import { ArchiveRecordPicker } from '../../src/ui/ArchiveRecordPicker';
import { AttachActorDialog, ActorsPanel } from '../../src/ui/RecordActors';
import { CreateConsultationRequestDialog, ConsultationsPage } from '../../src/pages/Consultations';
import { RecordForm } from '../../src/pages/RecordForm';
import { moduleVisible } from '../../src/design/navigation';
import { navigate } from '../../src/ui/navigation';
import { notificationPath } from '../../src/core/notifications';
import { EntityName } from '../../src/ui/names';
const account = (codes: string[], scope: Grant['scope'] = 'INSTITUTION'): Me => ({ user: { status: 'ACTIF', accountType: 'USER', institutionId: INST },
    grants: codes.map(permission => ({ permission, scope, institutionId: INST, expiresAt: null })) } as Me);
beforeEach(() => {
    vi.clearAllMocks(); fixture.epoch++; history.replaceState(null, '', '/app/consultations'); window.scrollTo = vi.fn();
    fixture.me = account(['DOCUMENT_READ', 'DOCUMENT_CREATE', 'DOCUMENT_ACTOR_MANAGE', 'CONSULTATION_READ', 'CONSULTATION_REQUEST_CREATE']);
    for (const key of ['documents','dossiers','actors'] as const) fixture.records[key].mockResolvedValue({ items: [], hasMore: false });
    fixture.records.document.mockResolvedValue({ id: ID, reference: 'DOC-101', title: 'Document cent un' });
    fixture.records.dossier.mockResolvedValue({ id: ID, reference: 'DOS-101', title: 'Dossier cent un' });
    fixture.records.actor.mockResolvedValue({ id: ID, name: 'Acteur cent un' });
    fixture.records.command.mockResolvedValue({ id: ID }); fixture.records.documentTypes.mockResolvedValue([{ id: ID, label: 'Rapport' }]);
    fixture.classification.nodes.mockResolvedValue([]);
    fixture.consultation.requestsByInstitution.mockResolvedValue([]); fixture.consultation.createRequest.mockResolvedValue({ id: ID });
    fixture.portalAdmin.accessRequests.mockResolvedValue({ items: [], total: 0, hasMore: false });
    fixture.portalAdmin.accessRequest.mockRejectedValue(new Error('Demande introuvable')); fixture.portalAdmin.accessRequestJournal.mockResolvedValue([]);
});
it.each(['documents','dossiers','actors'] as const)('parcourt les 101 %s sans doublon et sélectionne la sixième page', async kind => {
    fixture.records[kind].mockImplementation(async ({ page }: { page: number }) => ({ items: Array.from({ length: page === 5 ? 1 : 20 }, (_, n) => ({ id: page === 5 ? ID : `id-${page*20+n}`, reference: `REF-${page*20+n+1}`, title: `Notice ${page*20+n+1}`, name: `Acteur ${page*20+n+1}` })), hasMore: page < 5 }));
    const change = vi.fn(); render(<ArchiveRecordPicker kind={kind} institution={INST} value={null} onChange={change} disabled={false}/>);
    fireEvent.click(screen.getByRole('button', { name: kind === 'documents' ? 'Document lié' : kind === 'dossiers' ? 'Dossier lié' : 'Acteur du référentiel' }));
    for (let n = 1; n <= 5; n++) { await screen.findByText('Page ' + n); fireEvent.click(screen.getByRole('button', { name: 'Suivante' })); }
    await screen.findByText('Page 6');
    expect((screen.getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: kind === 'actors' ? 'Acteur 101' : 'REF-101 · Notice 101' }));
    expect(change).toHaveBeenCalledWith(ID);
    expect(fixture.records[kind].mock.calls.map(c => c[0].page)).toEqual([0,1,2,3,4,5]);
});
it('recherche les acteurs côté serveur et résout la sélection au rechargement', async () => {
    const { unmount } = render(<ArchiveRecordPicker kind="actors" institution={INST} value={ID} onChange={() => {}} disabled={false}/>);
    await screen.findByText('Acteur cent un'); expect(fixture.records.actor).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Acteur du référentiel' }));
    await screen.findByText('Page 1'); fireEvent.change(screen.getByRole('textbox'), { target: { value: '100%_recette' } });
    await waitFor(() => expect(fixture.records.actors).toHaveBeenLastCalledWith({ q: '100%_recette', page: 0, size: 20 }, expect.any(AbortSignal)));
    unmount(); render(<EntityName kind="institutions" id={ID}/>); fixture.api.get.mockResolvedValue({ nom: 'Institution 101' });
    await screen.findByText('Institution 101'); expect(fixture.api.get).toHaveBeenCalledWith('institutions', ID);
});
it('permet une nouvelle recherche après une erreur du catalogue', async () => {
    fixture.records.documents.mockRejectedValueOnce(new Error('Catalogue indisponible'));
    render(<ArchiveRecordPicker kind="documents" institution={INST} value={null} onChange={() => {}} disabled={false}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Document lié' })); await screen.findByText(/Catalogue indisponible/);
    fixture.records.documents.mockResolvedValue({ items: [{ id: ID, reference: 'RECETTE', title: 'Retrouvé' }], hasMore: false });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RECETTE' } }); await screen.findByText('RECETTE · Retrouvé');
});
it('envoie le document recherché dans la demande de dérogation', async () => {
    fixture.records.documents.mockImplementation(async ({ q }: { q?: string }) => ({ items: q ? [{ id: ID, reference: 'DOC-101', title: 'Document cent un' }] : [], hasMore: false }));
    render(<CreateConsultationRequestDialog onClose={() => {}} onSuccess={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Document lié' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filtrer document lié' }), { target: { value: 'DOC-101' } });
    fireEvent.click(await screen.findByRole('button', { name: 'DOC-101 · Document cent un' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Motif/ }), { target: { value: 'Recette consultation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Déposer' }));
    await waitFor(() => expect(fixture.consultation.createRequest).toHaveBeenCalledWith(ID, null, 'Recette consultation', expect.any(String)));
});
it('crée le document dans le dossier recherché au-delà des cent premiers', async () => {
    fixture.records.dossiers.mockResolvedValue({ items: [{ id: ID, reference: 'DOS-101', title: 'Dossier cent un' }], hasMore: false });
    render(<RecordForm kind="documents" onClose={() => {}} onCreated={() => {}}/>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cote' }), { target: { value: 'RECETTE-CHOIX' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Titre/ }), { target: { value: 'Recette choix dossier' } });
    await screen.findByRole('option', { name: 'Rapport' }); fireEvent.change(screen.getByRole('combobox', { name: /Type de document/ }), { target: { value: ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Dossier lié' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filtrer dossier lié' }), { target: { value: 'DOS-101' } });
    fireEvent.click(await screen.findByRole('button', { name: 'DOS-101 · Dossier cent un' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' })); fireEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.records.command).toHaveBeenCalledWith('/documents', expect.objectContaining({ dossierId: ID }), expect.any(String), 'POST'));
});
it('attache un acteur recherché puis affiche sa fiche complète sans liste limitée', async () => {
    fixture.records.actors.mockResolvedValue({ items: [{ id: ID, name: 'Acteur 101' }], hasMore: false });
    const { unmount } = render(<AttachActorDialog documentId={ID} onClose={() => {}} onSuccess={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Acteur du référentiel' })); fireEvent.click(await screen.findByRole('button', { name: 'Acteur 101' }));
    fireEvent.click(screen.getByRole('button', { name: 'Attacher' }));
    await waitFor(() => expect(fixture.records.command).toHaveBeenCalledWith('/documents/' + ID + '/actors', expect.objectContaining({ actorId: ID }), expect.any(String), 'POST'));
    unmount(); fixture.records.actors.mockClear();
    fixture.records.documentActors.mockResolvedValue([{ id: 'link', actorId: ID, role: 'AUTEUR', actor: { id: ID, name: 'Acteur 101', description: 'Fiche complète au rechargement', externalId: 'EXT-101' } }]);
    render(<ActorsPanel documentId={ID} document={{ id: ID, institutionId: INST, destroyed: false, businessStatus: "ACTIF", archivalStatus: "ACTIF" } as RecordDocument}/>); await screen.findByText('Acteur 101'); expect(screen.getByText('Fiche complète au rechargement')).toBeTruthy();
    expect(fixture.records.actors).not.toHaveBeenCalled();
});
it('ouvre le portail pour le relecteur seul sans charger les dérogations interdites', async () => {
    fixture.me = account(['CONSULTATION_REVIEW']);
    expect(moduleVisible(fixture.me, 'consultations', { institutionId: INST })).toBe(true);
    expect(moduleVisible(fixture.me, 'consultations', { institutionId: 'autre' })).toBe(false);
    render(<ConsultationsPage/>); await screen.findByText('Aucune demande');
    expect(fixture.consultation.requestsByInstitution).not.toHaveBeenCalled(); expect(fixture.consultation.myRequests).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: 'Demandes de dérogation' })).toBeNull();
});
it('une notification ouvre la demande exacte même absente de la liste et conserve une erreur explicite si refusée', async () => {
    navigate(notificationPath('DEMANDE_ACCES_PORTAIL', ID)!); render(<ConsultationsPage/>);
    const modal = await screen.findByRole('dialog'); await within(modal).findByText('Demande introuvable');
    expect(fixture.portalAdmin.accessRequest).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
    fireEvent.click(within(modal).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(location.search).toBe('?tab=portail');
});
