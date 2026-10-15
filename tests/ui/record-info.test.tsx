import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Dossier, RecordDocument } from '../../src/core/types';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const DOS = '55555555-5555-4555-8555-555555555555';
const PARENT = '66666666-6666-4666-8666-666666666666';
const PRODUCER = '77777777-7777-4777-8777-777777777777';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { institutionId: '97571d20-3f49-497e-a185-dac22208eb3f' } } as unknown,
    classification: { nodes: vi.fn().mockResolvedValue([]) },
    records: { saveDocumentInfo: vi.fn(), saveDossierInfo: vi.fn(), documentRelations: vi.fn(), addRelation: vi.fn(), updateRelation: vi.fn(), deleteRelation: vi.fn(), dossier: vi.fn(), dossierChildren: vi.fn(),
        dossierVolumetry: vi.fn(), dossierDocuments: vi.fn(), documentTypes: vi.fn(), dossiers: vi.fn(), command: vi.fn(), transport: { request: vi.fn() } }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => true, platform: () => false }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
vi.mock('../../src/ui/ArchiveRecordPicker', () => ({ ArchiveRecordPicker: ({ value, onChange, disabled }: { value: string | null; onChange: (id: string | null) => void; disabled: boolean }) =>
    <button type="button" disabled={disabled} onClick={() => onChange(TARGET)}>{value ? 'Document choisi' : 'Choisir le document'}</button> }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: ({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) => <button type="button" disabled={disabled}>{value ? 'Choisi : ' + label : label}</button> }));
import { navigate } from '../../src/ui/navigation';
import { DocumentArchivalPanel, DocumentRelationsPanel, DossierStructurePanel } from '../../src/ui/RecordInfo';
import { RecordForm } from '../../src/pages/RecordForm';

const doc = (over: Partial<RecordDocument> = {}): RecordDocument => ({ id: DOC, reference: 'DOC-2026-001', institutionId: INST, departmentId: null, typeDocumentId: 't', dossierId: null, classificationNodeId: null, title: 'Circulaire',
    businessStatus: 'ACTIF', archivalStatus: 'ACTIF', distributionStatus: 'NON_PUBLIE', confidentiality: 'INTERNE', destroyed: false, versionLock: 4, persistentId: 'snae-000000000001d', language: null,
    extentQuantity: null, extentUnit: null, formerReference: null, formerReferenceOrigin: null, personalData: 'A_EVALUER', sensitiveData: false, personalDataNature: null, essential: false, essentialReason: null, ...over });
const dossier = (over: Partial<Dossier> = {}): Dossier => ({ id: DOS, reference: 'DOS-2026-001', institutionId: INST, departmentId: null, title: 'Dossier du personnel', businessStatus: 'ACTIF', archivalStatus: 'ACTIF', confidentiality: 'INTERNE',
    openedOn: '2026-01-01', closedOn: null, versionLock: 2, parentId: null, level: 1, producerId: null, contentStartDate: null, contentEndDate: null, extentQuantity: null, extentUnit: null, ...over } as Dossier);
const relation = (id: string, label: string, over: Record<string, unknown> = {}) => ({ id, type: 'REMPLACE', outgoing: true, label, other: { id: 'o' + id, reference: 'DOC-OLD-' + id, title: 'Ancien texte ' + id, persistentId: null, archivalStatus: 'ACTIF', destroyed: false }, comment: null, version: 3, createdAt: '2026-01-01T00:00:00Z', ...over });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.classification.nodes.mockResolvedValue([]);
    for (const fn of Object.values(fixture.records)) if ('mockReset' in fn) fn.mockReset();
    fixture.records.transport.request.mockReset();
    fixture.records.transport.request.mockImplementation(async (path: string) => { if (path.startsWith('/archives/authorities?')) return [{ id: PRODUCER, input: { institutionId: INST, code: 'DRH', name: 'Direction des ressources humaines', kind: 'COLLECTIVITE', details: {} }, version: 1, updatedAt: '' }]; throw new Error('appel inattendu ' + path); });
    fixture.records.documentRelations.mockResolvedValue({ items: [], unreadable: 0 });
    fixture.records.dossierChildren.mockResolvedValue([]);
    fixture.records.dossierVolumetry.mockResolvedValue({ subDossiers: 0, directSubDossiers: 0, documents: 0, directDocuments: 0, destroyedDocuments: 0, computedStartDate: null, computedEndDate: null, totalBytes: 0 });
    fixture.records.dossierDocuments.mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    fixture.records.dossier.mockResolvedValue(null);
    fixture.records.documentTypes.mockResolvedValue([]);
    fixture.records.dossiers.mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    vi.mocked(navigate).mockReset();
});

// ---------------------------------------------------------------- informations d'archivage
it('le panneau montre l’identifiant pérenne, les informations renseignées et ce qui reste à compléter', () => {
    render(<DocumentArchivalPanel document={doc()} canEdit onChanged={() => {}} />);
    const panel = screen.getByRole('region', { name: 'Informations d’archivage' });
    expect(within(panel).getByText('snae-000000000001d')).toBeTruthy();
    expect(within(panel).getByText(/À compléter : la langue, l’étendue, les données personnelles/)).toBeTruthy();
    expect(within(panel).getByText('Non')).toBeTruthy();                                   // pas essentiel
});

it('un document renseigné affiche langue, étendue, ancienne cote, données personnelles et motif d’essentiel', () => {
    render(<DocumentArchivalPanel canEdit={false} onChanged={() => {}} document={doc({ language: 'fuf', extentQuantity: 12.5, extentUnit: 'PAGES', formerReference: 'B/12', formerReferenceOrigin: 'Ancien plan de 1985',
        personalData: 'PRESENTES', sensitiveData: true, personalDataNature: 'Noms et adresses d’agents', essential: true, essentialReason: 'Titre de propriété' })} />);
    const panel = screen.getByRole('region', { name: 'Informations d’archivage' });
    for (const text of ['Pular (peul)', '12,5 pages', 'B/12', 'Ancien plan de 1985', 'Présentes', 'sensibles', 'Noms et adresses d’agents', 'Essentiel', 'Titre de propriété'])
        expect(within(panel).getByText(text), text).toBeTruthy();
    expect(within(panel).getByText(/ne peut pas être éliminé tant que cette mention n’est pas retirée/)).toBeTruthy();
    expect(within(panel).queryByText(/À compléter/)).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Modifier' })).toBeNull();          // sans droit de modifier
});

it('un document détruit ne se modifie plus', () => {
    render(<DocumentArchivalPanel document={doc({ destroyed: true })} canEdit onChanged={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
});

it('la modification exige un motif, signale les incohérences, puis envoie la bonne requête', async () => {
    fixture.records.saveDocumentInfo.mockResolvedValue(doc());
    const changed = vi.fn();
    render(<DocumentArchivalPanel document={doc()} canEdit onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);                                                     // pas de motif
    fireEvent.change(within(dialog).getByLabelText(/^Langue du contenu/), { target: { value: 'FRA' } });
    fireEvent.change(within(dialog).getByLabelText(/^Étendue : quantité/), { target: { value: '12' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('ET l’unité');
    fireEvent.change(within(dialog).getByLabelText('Étendue : unité'), { target: { value: 'PAGES' } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // les données sensibles et leur nature n'ont de sens que si des données personnelles sont présentes
    const sensitive = within(dialog).getByLabelText(/Données sensibles/) as HTMLInputElement;
    expect(sensitive.disabled).toBe(true);
    expect((within(dialog).getByLabelText(/^Nature des données personnelles/) as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Données personnelles/), { target: { value: 'PRESENTES' } });
    expect(sensitive.disabled).toBe(false);
    fireEvent.click(sensitive);
    fireEvent.change(within(dialog).getByLabelText(/^Nature des données personnelles/), { target: { value: 'Noms d’agents' } });
    // un document essentiel exige son motif
    fireEvent.click(within(dialog).getByLabelText(/Document essentiel/));
    expect(within(dialog).getByRole('alert').textContent).toContain('exige son motif');
    fireEvent.change(within(dialog).getByLabelText(/^Motif de la mention/), { target: { value: 'Titre de propriété' } });
    fireEvent.change(within(dialog).getByLabelText(/^Motif de la modification/), { target: { value: 'Inventaire du service' } });
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(fixture.records.saveDocumentInfo).toHaveBeenCalled());
    const [id, body] = fixture.records.saveDocumentInfo.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(DOC);
    expect(body).toEqual({ expectedVersion: 4, language: 'fra', extentQuantity: 12, extentUnit: 'PAGES', formerReference: null, formerReferenceOrigin: null, personalData: 'PRESENTES', sensitiveData: true,
        personalDataNature: 'Noms d’agents', essential: true, essentialReason: 'Titre de propriété', reason: 'Inventaire du service' });
    await waitFor(() => expect(changed).toHaveBeenCalled());
});

// ---------------------------------------------------------------- relations
it('les relations se lisent par nature, avec le nom des documents, et se suppriment depuis le document qui les porte', async () => {
    fixture.records.documentRelations.mockResolvedValue({ unreadable: 1, items: [relation('1', 'remplace'), relation('2', 'est remplacé par', { outgoing: false, other: { id: 'o2', reference: 'DOC-NEW', title: 'Texte plus récent', persistentId: null, archivalStatus: 'ACTIF', destroyed: false } }),
        relation('3', 'remplace', { other: { id: 'o3', reference: 'DOC-GONE', title: 'Texte détruit', persistentId: null, archivalStatus: 'DETRUIT', destroyed: true }, comment: 'Abrogation' })] });
    render(<DocumentRelationsPanel document={doc()} canEdit />);
    const panel = await screen.findByRole('region', { name: 'Relations avec d’autres documents' });
    expect(await within(panel).findByText('Ce document remplace')).toBeTruthy();
    expect(within(panel).getByText('Ce document est remplacé par')).toBeTruthy();
    expect(within(panel).getByText(/Ancien texte 1/)).toBeTruthy(); expect(within(panel).getByText('Abrogation')).toBeTruthy(); expect(within(panel).getByText('Détruit')).toBeTruthy();
    expect(within(panel).getByText(/Une relation concerne un document que vous n’avez pas le droit de lire/)).toBeTruthy();
    expect(panel.textContent).not.toContain('o1');                                          // jamais d'identifiant
    // les relations entrantes ne se modifient pas d'ici : 2 relations sortantes → 2 boutons Supprimer
    expect(within(panel).getAllByRole('button', { name: 'Supprimer' }).length).toBe(2);
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Supprimer' })[0]!);
    expect(within(panel).getByText('Supprimer cette relation ?')).toBeTruthy();
    fixture.records.deleteRelation.mockResolvedValue(undefined);
    fireEvent.click(within(within(panel).getByText('Supprimer cette relation ?').closest('span')!.parentElement as HTMLElement).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(fixture.records.deleteRelation).toHaveBeenCalledWith(DOC, '1', 3, expect.any(String)));
});

it('ajouter une relation : on choisit la nature et le document, la relation part avec son commentaire', async () => {
    fixture.records.addRelation.mockResolvedValue(relation('9', 'remplace'));
    render(<DocumentRelationsPanel document={doc()} canEdit />);
    expect(await screen.findByText('Aucune relation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);                                                     // aucun document choisi
    fireEvent.change(within(dialog).getByLabelText(/^Ce document…/), { target: { value: 'ANNEXE' } });
    expect(within(dialog).getByText('Ce document est une annexe d’un autre.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choisir le document' }));
    fireEvent.change(within(dialog).getByLabelText(/^Commentaire/), { target: { value: 'Annexe 1' } });
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(fixture.records.addRelation).toHaveBeenCalledWith(DOC, TARGET, 'ANNEXE', 'Annexe 1', expect.any(String)));
});

it('un document détruit n’accepte plus de relation', async () => {
    render(<DocumentRelationsPanel document={doc({ destroyed: true })} canEdit />);
    await screen.findByText('Aucune relation');
    expect(screen.queryByRole('button', { name: 'Ajouter une relation' })).toBeNull();
});

// ---------------------------------------------------------------- dossier
it('le dossier montre son niveau, son parent, son service producteur par son nom, ses dates calculées et sa volumétrie', async () => {
    fixture.records.dossier.mockResolvedValue(dossier({ id: PARENT, reference: 'DOS-RACINE', title: 'Fonds du ministère' }));
    fixture.records.dossierChildren.mockResolvedValue([dossier({ id: 'c1', reference: 'DOS-ENFANT', title: 'Sous-dossier A', level: 3 })]);
    fixture.records.dossierVolumetry.mockResolvedValue({ subDossiers: 1, directSubDossiers: 1, documents: 3, directDocuments: 1, destroyedDocuments: 1, computedStartDate: '1961-05-01', computedEndDate: '1972-03-09', totalBytes: 2048 });
    fixture.records.dossierDocuments.mockResolvedValue({ items: [doc({ reference: 'DOC-A', title: 'Pièce A' })], page: 0, size: 20, hasMore: false });
    render(<DossierStructurePanel dossier={dossier({ parentId: PARENT, level: 2, producerId: PRODUCER })} canEdit canCreate onChanged={() => {}} onCreateChild={() => {}} />);
    const panel = screen.getByRole('region', { name: 'Structure du dossier' });
    expect(await within(panel).findByText(/DOS-RACINE · Fonds du ministère/)).toBeTruthy();
    expect(within(panel).getByText(/^Sous-dossier de/)).toBeTruthy();
    expect(await within(panel).findByText('Direction des ressources humaines')).toBeTruthy();
    expect(await within(panel).findByText('3 documents (dont 1 détruit) dans 1 sous-dossier')).toBeTruthy();
    expect(within(panel).getByText('Calculées d’après les dates des documents')).toBeTruthy();
    expect(within(panel).getByText(/2\s?Ko de fichiers/)).toBeTruthy();
    expect(within(panel).getByText(/Compte seulement ce que vous avez le droit de voir/)).toBeTruthy();
    expect(await within(panel).findByRole('button', { name: /DOS-ENFANT · Sous-dossier A/ })).toBeTruthy();
    expect(within(panel).getByText('Sous-sous-dossier')).toBeTruthy();
    expect(await within(panel).findByRole('button', { name: /DOC-A · Pièce A/ })).toBeTruthy();
    expect(panel.textContent).not.toContain(PRODUCER);
    fireEvent.click(within(panel).getByText(/DOS-RACINE · Fonds du ministère/));
    expect(navigate).toHaveBeenCalledWith('/app/dossiers/' + PARENT);
});

it('créer un sous-dossier n’est proposé que pour un dossier ouvert qui a le droit de grandir', async () => {
    const create = vi.fn();
    const { rerender } = render(<DossierStructurePanel dossier={dossier()} canEdit canCreate onChanged={() => {}} onCreateChild={create} />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer un sous-dossier' }));
    expect(create).toHaveBeenCalled();
    rerender(<DossierStructurePanel dossier={dossier({ businessStatus: 'CLOS' })} canEdit canCreate onChanged={() => {}} onCreateChild={create} />);
    expect(screen.queryByRole('button', { name: 'Créer un sous-dossier' })).toBeNull();
    rerender(<DossierStructurePanel dossier={dossier({ level: 8 })} canEdit canCreate onChanged={() => {}} onCreateChild={create} />);
    expect(screen.queryByRole('button', { name: 'Créer un sous-dossier' })).toBeNull();
    rerender(<DossierStructurePanel dossier={dossier()} canEdit canCreate={false} onChanged={() => {}} onCreateChild={create} />);
    expect(screen.queryByRole('button', { name: 'Créer un sous-dossier' })).toBeNull();
    await screen.findByText('Aucun sous-dossier.');
});

it('la structure du dossier se modifie avec un motif : producteur, dates extrêmes, étendue', async () => {
    fixture.records.saveDossierInfo.mockResolvedValue(dossier());
    render(<DossierStructurePanel dossier={dossier()} canEdit canCreate={false} onChanged={() => {}} onCreateChild={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    await waitFor(() => expect((within(dialog).getByLabelText(/^Service producteur/) as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(within(dialog).getByLabelText(/^Service producteur/), { target: { value: PRODUCER } });
    fireEvent.change(within(dialog).getByLabelText(/^Date de début du contenu/), { target: { value: '2000-01-01' } });
    fireEvent.change(within(dialog).getByLabelText(/^Date de fin du contenu/), { target: { value: '1999-12-31' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('précède'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Date de fin du contenu/), { target: { value: '2010-12-31' } });
    fireEvent.change(within(dialog).getByLabelText(/^Étendue : quantité/), { target: { value: '2,5' } });
    fireEvent.change(within(dialog).getByLabelText('Étendue : unité'), { target: { value: 'ML' } });
    fireEvent.change(within(dialog).getByLabelText(/^Motif de la modification/), { target: { value: 'Inventaire du fonds' } });
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(fixture.records.saveDossierInfo).toHaveBeenCalled());
    expect(fixture.records.saveDossierInfo.mock.calls[0]![0]).toBe(DOS);
    expect(fixture.records.saveDossierInfo.mock.calls[0]![1]).toEqual({ expectedVersion: 2, producerId: PRODUCER, contentStartDate: '2000-01-01', contentEndDate: '2010-12-31', extentQuantity: 2.5, extentUnit: 'ML', reason: 'Inventaire du fonds' });
});

// ---------------------------------------------------------------- création d'un sous-dossier
it('créer un sous-dossier : le parent est nommé, son institution est figée, la confidentialité ne descend pas, le parent part dans la requête', async () => {
    fixture.records.command.mockResolvedValue({ id: 'nouveau' });
    const created = vi.fn();
    render(<RecordForm kind="dossiers" parent={dossier({ confidentiality: 'CONFIDENTIEL', level: 2 })} onClose={() => {}} onCreated={created} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Créer un sous-dossier')).toBeTruthy();
    expect(within(dialog).getByText(/DOS-2026-001 · Dossier du personnel/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: /^Institution/ }) as HTMLButtonElement).disabled).toBe(true);
    const confidentiality = within(dialog).getByLabelText('Confidentialité') as HTMLSelectElement;
    expect(confidentiality.value).toBe('CONFIDENTIEL');
    expect((within(confidentiality).getByRole('option', { name: 'Interne' }) as HTMLOptionElement).disabled).toBe(true);
    expect((within(confidentiality).getByRole('option', { name: 'Public' }) as HTMLOptionElement).disabled).toBe(true);
    expect((within(confidentiality).getByRole('option', { name: 'Secret' }) as HTMLOptionElement).disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Cote ou référence/), { target: { value: 'DOS-2026-001/A' } });
    fireEvent.change(within(dialog).getByLabelText(/^Titre/), { target: { value: 'Carrières 1960-1970' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await screen.findByText('Vérifiez les informations avant de confirmer.');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(fixture.records.command).toHaveBeenCalled());
    const [path, body] = fixture.records.command.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/dossiers');
    expect(body).toMatchObject({ reference: 'DOS-2026-001/A', title: 'Carrières 1960-1970', institutionId: INST, parentId: DOS, confidentiality: 'CONFIDENTIEL' });
});

it('un dossier simple n’envoie pas de parent', async () => {
    fixture.records.command.mockResolvedValue({ id: 'nouveau' });
    render(<RecordForm kind="dossiers" onClose={() => {}} onCreated={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Créer un dossier')).toBeTruthy();
    expect(within(dialog).queryByText(/Sous-dossier de/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Cote ou référence/), { target: { value: 'DOS-1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Titre/), { target: { value: 'Dossier' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await screen.findByText('Vérifiez les informations avant de confirmer.');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(fixture.records.command).toHaveBeenCalled());
    expect((fixture.records.command.mock.calls[0]![1] as Record<string, unknown>).parentId).toBeNull();
});
