import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Communicability, CommunicabilityCategory, RedactionPage, RedactionZone } from '../../src/core/communicability';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const TYPE = '55555555-5555-4555-8555-555555555555';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    rights: {
        communicabilityCategories: vi.fn(), documentCommunicability: vi.fn(), applyCommunicability: vi.fn(), removeCommunicability: vi.fn(), createCommunicabilityCategory: vi.fn(),
        retireCommunicabilityCategory: vi.fn(), pendingCommunicability: vi.fn(), applyCommunicabilityBatch: vi.fn(), upcomingCommunicability: vi.fn(), personalDataGaps: vi.fn(),
        redactionPages: vi.fn(), redactionZones: vi.fn(), addRedactionZone: vi.fn(), removeRedactionZone: vi.fn()
    },
    records: { documentTypes: vi.fn(), fileDerivative: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <>{'Agent ' + id.slice(0, 2)}</>, useEntityName: () => ({ name: null, loading: false }) }));
import { CommunicabilityCatalogPanel, DocumentCommunicabilityPanel } from '../../src/ui/Communicability';
import { RedactionPanel } from '../../src/ui/Redaction';

const category = (over: Partial<CommunicabilityCategory> = {}): CommunicabilityCategory => ({
    id: 'c1', code: 'VIE-PRIVEE-50', label: 'Vie privée', description: null, scope: 'INSTITUTION', institutionId: INST, trigger: 'DATE_DOCUMENT', eventLabel: null, duration: 50, unit: 'ANNEES',
    perpetual: false, level: 'RESTREINT', legalBasis: 'Loi de test, article 12', legalSourceId: null, personalData: true, status: 'ACTIVE', typeDocumentIds: [TYPE], ...over
});
const applied = (over: Partial<Communicability> = {}): Communicability => ({
    id: 'a1', documentId: DOC, categoryId: 'c1', code: 'VIE-PRIVEE-50', label: 'Vie privée', trigger: 'DATE_DOCUMENT', duration: 50, unit: 'ANNEES', perpetual: false, baseDate: '2016-01-01', eventDate: null,
    freeDate: '2066-01-01', state: 'EN_ATTENTE', daysRemaining: 14_000, restrictionId: 'r1', appliedById: '11-a', appliedAt: '2026-10-10T08:00:00Z', reason: null, status: 'EN_VIGUEUR',
    removedById: null, removedAt: null, removalReason: null, ...over
});
const zone = (over: Partial<RedactionZone> = {}): RedactionZone => ({
    id: 'z1', documentId: DOC, page: 1, image: 1, x: 0.1, y: 0.2, width: 0.5, height: 0.1, reason: 'Adresse d’un agent', status: 'ACTIVE', createdById: '22-b', createdAt: '2026-10-10T08:00:00Z',
    removedById: null, removedAt: null, removalReason: null, ...over
});
const pages = (): RedactionPage[] => [{ number: 1, images: 1, fileId: FILE, fileName: 'p1.tif', zones: 0 }, { number: 2, images: 2, fileId: '66666666-6666-4666-8666-666666666666', fileName: 'p2.tif', zones: 0 }];

beforeEach(() => {
    fixture.epoch += 1;
    for (const fn of [...Object.values(fixture.rights), ...Object.values(fixture.records)]) fn.mockReset();
    fixture.rights.communicabilityCategories.mockResolvedValue([category()]);
    fixture.rights.documentCommunicability.mockResolvedValue({ current: null, suggestions: [], personalData: 'A_EVALUER', sensitiveData: false });
    fixture.rights.upcomingCommunicability.mockResolvedValue([]);
    fixture.rights.personalDataGaps.mockResolvedValue([]);
    fixture.rights.redactionPages.mockResolvedValue(pages());
    fixture.rights.redactionZones.mockResolvedValue([]);
    fixture.records.documentTypes.mockResolvedValue([{ id: TYPE, label: 'Dossier du personnel', status: 'ACTIF' }]);
    fixture.records.fileDerivative.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:page');
    URL.revokeObjectURL = vi.fn();
});

// ---------------------------------------------------------------- le document
it('un document aux données personnelles sans délai le dit, et propose les catégories de son type', async () => {
    fixture.rights.documentCommunicability.mockResolvedValue({ current: null, suggestions: [category()], personalData: 'PRESENTES', sensitiveData: true });
    render(<DocumentCommunicabilityPanel documentId={DOC} institutionId={INST} canManage />);
    const panel = screen.getByRole('region', { name: 'Communicabilité' });
    expect(await within(panel).findByText(/n’a aucun délai de communicabilité/)).toBeTruthy();
    expect(within(panel).getByText(/Présentes/)).toBeTruthy();
    expect(within(panel).getByText(/Vie privée · 50 ans après la date du document/)).toBeTruthy();
});

it('appliquer un délai : la catégorie se choisit avec sa base légale, et part avec son motif', async () => {
    fixture.rights.applyCommunicability.mockResolvedValue(applied());
    render(<DocumentCommunicabilityPanel documentId={DOC} institutionId={INST} canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer un délai' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(await within(dialog).findByText('Choisissez la catégorie à appliquer.')).toBeTruthy();
    expect(fixture.rights.applyCommunicability).not.toHaveBeenCalled();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Vie privée — 50 ans après la date du document/ })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Catégorie/), { target: { value: 'c1' } });
    expect(within(dialog).getByText(/Loi de test, article 12/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Dossier du personnel' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(fixture.rights.applyCommunicability).toHaveBeenCalledWith(DOC, { categoryId: 'c1', eventDate: null, reason: 'Dossier du personnel' }, expect.any(String)));
});

it('une catégorie sur date d’événement exige cette date', async () => {
    fixture.rights.communicabilityCategories.mockResolvedValue([category({ id: 'c2', code: 'SECRET-MEDICAL', label: 'Secret médical', trigger: 'DATE_EVENEMENT', eventLabel: 'Date de naissance de la personne', duration: 120 })]);
    fixture.rights.applyCommunicability.mockResolvedValue(applied());
    render(<DocumentCommunicabilityPanel documentId={DOC} institutionId={INST} canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer un délai' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Secret médical/ })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Catégorie/), { target: { value: 'c2' } });
    const date = await within(dialog).findByLabelText(/^Date de naissance de la personne/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(await within(dialog).findByText(/saisissez-la/)).toBeTruthy();
    fireEvent.change(date, { target: { value: '1960-03-04' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(fixture.rights.applyCommunicability).toHaveBeenCalledWith(DOC, expect.objectContaining({ categoryId: 'c2', eventDate: '1960-03-04' }), expect.any(String)));
});

it('un délai appliqué dit où en est le document, et se retire avec un motif', async () => {
    fixture.rights.documentCommunicability.mockResolvedValue({ current: applied(), suggestions: [], personalData: 'PRESENTES', sensitiveData: false });
    fixture.rights.removeCommunicability.mockResolvedValue(applied({ status: 'RETIREE' }));
    render(<DocumentCommunicabilityPanel documentId={DOC} institutionId={INST} canManage />);
    const panel = screen.getByRole('region', { name: 'Communicabilité' });
    expect(await within(panel).findByText(/Communicable le .*, dans environ 38 ans\./)).toBeTruthy();
    expect(within(panel).getByText('En attente du délai')).toBeTruthy();
    expect(within(panel).getByText(/restriction d’accès est posée jusqu’à la date de libre communicabilité/)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Remplacer par une autre catégorie' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retirer le délai' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = () => within(dialog).getByRole('button', { name: 'Retirer le délai' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Classement erroné' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fixture.rights.removeCommunicability).toHaveBeenCalledWith(DOC, 'Classement erroné', expect.any(String)));
});

it('sans le droit de gérer les restrictions, on lit sans pouvoir appliquer', async () => {
    fixture.rights.documentCommunicability.mockResolvedValue({ current: applied({ state: 'LIBRE', freeDate: '2000-01-01', daysRemaining: null, restrictionId: null }), suggestions: [], personalData: 'AUCUNE', sensitiveData: false });
    render(<DocumentCommunicabilityPanel documentId={DOC} institutionId={INST} canManage={false} />);
    expect(await screen.findByText(/Librement communicable depuis le/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirer le délai' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remplacer par une autre catégorie' })).toBeNull();
});

// ---------------------------------------------------------------- le catalogue
it('le catalogue liste les catégories avec leur délai et leur base légale, et signale les données personnelles sans délai', async () => {
    fixture.rights.upcomingCommunicability.mockResolvedValue([{ documentId: DOC, reference: 'DOC-1', title: 'Dossier A', code: 'VIE-PRIVEE-50', label: 'Vie privée', freeDate: '2026-12-01', daysRemaining: 52 }]);
    fixture.rights.personalDataGaps.mockResolvedValue([{ documentId: 'd2', reference: 'DOC-2', title: 'Dossier B', departmentId: null, sensitive: true, nature: 'Noms et adresses' }]);
    render(<CommunicabilityCatalogPanel institutionId={INST} canCatalog canApply />);
    const panel = screen.getByRole('region', { name: 'Délais de communicabilité' });
    expect(await within(panel).findByText('VIE-PRIVEE-50')).toBeTruthy();
    expect(within(panel).getByText('50 ans après la date du document')).toBeTruthy();
    expect(within(panel).getByText('Loi de test, article 12')).toBeTruthy();
    expect(await within(panel).findByText('DOC-1')).toBeTruthy();
    expect(within(panel).getByText('dans 52 jours')).toBeTruthy();
    expect(await within(panel).findByText('DOC-2')).toBeTruthy();
    expect(within(panel).getByText('Données sensibles')).toBeTruthy();
});

it('créer une catégorie exige le code, l’intitulé, la base légale et la durée, puis part avec les types choisis', async () => {
    fixture.rights.createCommunicabilityCategory.mockResolvedValue(category());
    render(<CommunicabilityCatalogPanel institutionId={INST} canCatalog canApply />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle catégorie' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la catégorie' }));
    expect(await within(dialog).findByText('La base légale du délai est obligatoire : le texte qui le fixe.')).toBeTruthy();
    expect(fixture.rights.createCommunicabilityCategory).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'vie-privee-50' } });
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé/), { target: { value: 'Vie privée' } });
    fireEvent.change(within(dialog).getByLabelText(/^Base légale/), { target: { value: 'Loi de test, article 12' } });
    fireEvent.change(within(dialog).getByLabelText(/^Durée/), { target: { value: '50' } });
    fireEvent.click(await within(dialog).findByLabelText('Dossier du personnel'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la catégorie' }));
    await waitFor(() => expect(fixture.rights.createCommunicabilityCategory).toHaveBeenCalled());
    expect(fixture.rights.createCommunicabilityCategory.mock.calls[0]![0]).toMatchObject({ code: 'VIE-PRIVEE-50', label: 'Vie privée', legalBasis: 'Loi de test, article 12', duration: 50, unit: 'ANNEES',
        institutionId: INST, trigger: 'DATE_DOCUMENT', perpetual: false, typeDocumentIds: [TYPE] });
});

it('les documents à classer se cochent, les obstacles se lisent, et le lot part avec les documents choisis', async () => {
    fixture.rights.pendingCommunicability.mockResolvedValue([
        { documentId: 'd1', reference: 'DOC-1', title: 'Dossier A', departmentId: null, baseDate: '2016-01-01', freeDate: '2066-01-01', personalData: 'PRESENTES', blockers: [] },
        { documentId: 'd2', reference: 'DOC-2', title: 'Dossier B', departmentId: null, baseDate: null, freeDate: null, personalData: 'A_EVALUER', blockers: ['COMMUNICABILITY_BASE_DATE_MISSING'] }]);
    fixture.rights.applyCommunicabilityBatch.mockResolvedValue([applied()]);
    render(<CommunicabilityCatalogPanel institutionId={INST} canCatalog canApply />);
    fireEvent.click(await screen.findByRole('button', { name: 'À classer pour VIE-PRIVEE-50' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('DOC-1')).toBeTruthy();
    expect(within(dialog).getByText('La date d’où court le délai n’existe pas pour ce document.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Choisir DOC-2') as HTMLInputElement).disabled).toBe(true);
    const apply = () => within(dialog).getByRole('button', { name: /^Appliquer à/ }) as HTMLButtonElement;
    expect(apply().disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Tout choisir'));
    expect(apply().textContent).toBe('Appliquer à 1 document');
    fireEvent.click(apply());
    await waitFor(() => expect(fixture.rights.applyCommunicabilityBatch).toHaveBeenCalledWith('c1', ['d1'], null, expect.any(String)));
    expect(await within(dialog).findByText(/1 document classé/)).toBeTruthy();
});

// ---------------------------------------------------------------- l'occultation
const canvasWithSize = async () => {
    const canvas = await screen.findByTestId('redaction-canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ left: 10, top: 20, width: 400, height: 600, right: 410, bottom: 620, x: 10, y: 20, toJSON: () => ({}) }) });
    return canvas;
};

it('une page sans zone invite à tirer un rectangle ; rien ne part sans zone ni motif', async () => {
    render(<RedactionPanel documentId={DOC} canManage />);
    expect(await screen.findByText(/Aucune zone occultée/)).toBeTruthy();
    await canvasWithSize();
    expect(fixture.records.fileDerivative).toHaveBeenCalledWith(FILE, 'consultation', expect.anything(), 1);
    expect(screen.getByText('Tirez un rectangle sur la page pour désigner la zone à cacher.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Occulter cette zone' }));
    expect(await screen.findByText(/Dessinez la zone à cacher/)).toBeTruthy();
    expect(screen.getByText(/motif de l’occultation est obligatoire/)).toBeTruthy();
    expect(fixture.rights.addRedactionZone).not.toHaveBeenCalled();
});

it('le rectangle tiré à la souris devient une zone relative, enregistrée avec son motif', async () => {
    fixture.rights.addRedactionZone.mockResolvedValue(zone());
    render(<RedactionPanel documentId={DOC} canManage />);
    const canvas = await canvasWithSize();
    // de (50, 80) à (250, 200) sur une page de 400 x 600 dont l'origine est en (10, 20) : x=0,1  y=0,1  largeur=0,5  hauteur=0,2
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 80, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 140 });
    fireEvent.mouseUp(canvas, { clientX: 250, clientY: 140 });
    await waitFor(() => expect(screen.getByText(/Zone choisie : 50 % de large sur 10 % de haut/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Motif de l’occultation/), { target: { value: 'Adresse d’un agent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Occulter cette zone' }));
    await waitFor(() => expect(fixture.rights.addRedactionZone).toHaveBeenCalled());
    const [id, body] = fixture.rights.addRedactionZone.mock.calls[0] as [string, Record<string, number | string>];
    expect(id).toBe(DOC);
    expect(body.page).toBe(1); expect(body.image).toBe(1); expect(body.reason).toBe('Adresse d’un agent');
    expect(body.x as number).toBeCloseTo(0.1, 5); expect(body.y as number).toBeCloseTo(0.1, 5); expect(body.width as number).toBeCloseTo(0.5, 5); expect(body.height as number).toBeCloseTo(0.1, 5);
});

it('les zones posées se montrent sur la page et dans la liste, et se retirent avec un motif', async () => {
    fixture.rights.redactionZones.mockResolvedValue([zone(), zone({ id: 'z2', page: 2, reason: 'Mention médicale' }), zone({ id: 'z3', reason: 'Ancienne', status: 'RETIREE', removedById: '33-c', removedAt: '2026-10-11T08:00:00Z', removalReason: 'Accord écrit' })]);
    fixture.rights.removeRedactionZone.mockResolvedValue(zone({ status: 'RETIREE' }));
    const { container } = render(<RedactionPanel documentId={DOC} canManage />);
    expect(await screen.findByText('2 zones occultées sur 2 pages : le lecteur du portail ne les voit jamais.')).toBeTruthy();
    await canvasWithSize();
    expect(container.querySelectorAll('.redaction-zone').length).toBe(1);                 // une zone active sur la page 1
    expect(screen.getByText('Adresse d’un agent', { selector: 'td' })).toBeTruthy();
    expect(screen.getByText(/Zones retirées \(1\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la zone de la page 1' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = () => within(dialog).getByRole('button', { name: 'Retirer la zone' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Motif du retrait/), { target: { value: 'Accord écrit de la personne' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fixture.rights.removeRedactionZone).toHaveBeenCalledWith(DOC, 'z1', 'Accord écrit de la personne', expect.any(String)));
});

it('un lecteur voit les zones sans pouvoir en poser, et un document sans page le dit', async () => {
    fixture.rights.redactionZones.mockResolvedValue([zone()]);
    const { unmount } = render(<RedactionPanel documentId={DOC} canManage={false} />);
    expect(await screen.findByText('Adresse d’un agent', { selector: 'td' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Occulter cette zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retirer la zone/ })).toBeNull();
    unmount();
    fixture.rights.redactionPages.mockResolvedValue([]);
    render(<RedactionPanel documentId={DOC} canManage />);
    expect(await screen.findByText(/n’a pas de page numérisée lisible/)).toBeTruthy();
});
