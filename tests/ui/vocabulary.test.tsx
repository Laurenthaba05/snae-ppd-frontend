import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { DocumentForm, Keyword, TermPage, Vocabulary, VocabularyTerm } from '../../src/core/vocabulary';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const VOC = 'b1f5a5d0-2b0f-4d3c-9d5e-0d3d7f1c9a11';
const T1 = '0a1b2c3d-0000-4000-8000-000000000001';
const T2 = '0a1b2c3d-0000-4000-8000-000000000002';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    vocabulary: {
        list: vi.fn(), create: vi.fn(), retire: vi.fn(), terms: vi.fn(), createTerm: vi.fn(), updateTerm: vi.fn(), obsoleteTerm: vi.fn(), replaceUsages: vi.fn(), importTerms: vi.fn(), importSkos: vi.fn(), skos: vi.fn(),
        keywords: vi.fn(), addKeywords: vi.fn(), removeKeyword: vi.fn(), form: vi.fn(), setForm: vi.fn(), termObjects: vi.fn()
    } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { DocumentFormPanel, KeywordsPanel, VocabularyPage } from '../../src/ui/Vocabularies';

const vocab = (over: Partial<Vocabulary> = {}): Vocabulary => ({
    id: VOC, institutionId: INST, code: 'THEMES', name: 'Thèmes d’état civil', description: 'Pour l’indexation', source: null, status: 'ACTIF', terms: 2, createdAt: '2026-10-01T08:00:00Z', ...over
});
const term = (over: Partial<VocabularyTerm> = {}): VocabularyTerm => ({
    id: T1, vocabularyId: VOC, label: 'Mariage', definition: 'Union légale', parentId: null, parentLabel: null, alternativeLabels: ['Union'], status: 'ACTIF', replacedById: null, replacedByLabel: null,
    obsolescenceReason: null, usage: 3, ...over
});
const page = (items: VocabularyTerm[]): TermPage => ({ items, page: 0, size: 100, total: items.length, hasMore: false });
const keyword = (over: Partial<Keyword> = {}): Keyword => ({
    termId: T1, label: 'Mariage', vocabularyId: VOC, vocabularyName: 'Thèmes d’état civil', vocabularyCode: 'THEMES', status: 'ACTIF', replacedByLabel: null, addedAt: '2026-10-02T08:00:00Z', ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['VOCABULARY_MANAGE']);
    for (const fn of Object.values(fixture.vocabulary)) fn.mockReset();
    fixture.vocabulary.list.mockResolvedValue([vocab(), vocab({ id: 'n1', institutionId: null, code: 'NATIONAL', name: 'Thésaurus national', terms: 40 })]);
    fixture.vocabulary.terms.mockResolvedValue(page([term(), term({ id: T2, label: 'Contrat de mariage', parentId: T1, parentLabel: 'Mariage', alternativeLabels: [], definition: null, usage: 0 })]));
});

it('liste les vocabulaires par leur nom et leur périmètre, sans identifiant', async () => {
    render(<VocabularyPage />);
    expect(await screen.findByText('Thèmes d’état civil')).toBeTruthy();
    const national = screen.getByText('Thésaurus national').closest('tr')!;
    expect(within(national).getByText('National')).toBeTruthy();
    expect(within(national).getByText('40')).toBeTruthy();
    expect(document.body.textContent).not.toContain(VOC);
    expect(fixture.vocabulary.list).toHaveBeenCalledWith(INST, false, expect.anything());
});

it('ouvre un vocabulaire : termes en arbre, synonymes, emplois', async () => {
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('Contrat de mariage')).toBeTruthy();
    expect(screen.getByText('Synonymes : Union')).toBeTruthy();
    expect(screen.getByText('Union légale')).toBeTruthy();
    expect(fixture.vocabulary.terms).toHaveBeenCalledWith(VOC, { q: undefined, status: undefined, page: 0 }, expect.anything());
});

it('crée un vocabulaire : le code se contrôle avant l’envoi', async () => {
    fixture.vocabulary.create.mockResolvedValue(vocab({ id: 'new', code: 'ESSAI', name: 'Essai' }));
    render(<VocabularyPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau vocabulaire' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: '1 mauvais' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Essai' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le vocabulaire' }));
    expect(await within(dialog).findByText(/Le code compte de 2 à 60 caractères/)).toBeTruthy();
    expect(fixture.vocabulary.create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'essai' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le vocabulaire' }));
    await waitFor(() => expect(fixture.vocabulary.create).toHaveBeenCalledWith(
        { institutionId: INST, code: 'ESSAI', name: 'Essai', description: undefined, source: undefined }, expect.any(String)));
});

it('importe un CSV et dit ce qui a été créé et sauté', async () => {
    fixture.vocabulary.importTerms.mockResolvedValue({ created: 2, skipped: ['Mariage'] });
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un fichier CSV' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Contenu/), { target: { value: 'parent;definition\nx;y' } });
    expect(await within(dialog).findByText(/colonne « libelle »/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Importer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Contenu/), { target: { value: 'libelle;parent\nRoutes;\nPistes;Routes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Importer' }));
    expect(await within(dialog).findByText(/2 termes créés, 1 déjà présent/)).toBeTruthy();
    expect(fixture.vocabulary.importTerms).toHaveBeenCalledWith(VOC, 'libelle;parent\nRoutes;\nPistes;Routes', expect.any(String));
});

it('importe un thésaurus SKOS : le Turtle est refusé avant l’envoi, le JSON-LD est envoyé tel quel', async () => {
    fixture.vocabulary.importSkos.mockResolvedValue({ created: 3, skipped: [] });
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un thésaurus SKOS' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Contenu/), { target: { value: '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .' } });
    expect(await within(dialog).findByText(/Le Turtle n’est pas lu/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Importer' }) as HTMLButtonElement).disabled).toBe(true);
    const json = '{"@graph":[{"@id":"a","@type":"skos:Concept","skos:prefLabel":"Routes"}]}';
    fireEvent.change(within(dialog).getByLabelText(/^Contenu/), { target: { value: json } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Importer' }));
    expect(await within(dialog).findByText(/3 termes créés/)).toBeTruthy();
    expect(fixture.vocabulary.importSkos).toHaveBeenCalledWith(VOC, json, expect.any(String));
    expect(fixture.vocabulary.importTerms).not.toHaveBeenCalled();
});

it('rend un terme obsolète avec un motif et un remplaçant choisi par son libellé', async () => {
    fixture.vocabulary.obsoleteTerm.mockResolvedValue(term({ status: 'OBSOLETE' }));
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    const termRow = (await screen.findByText('Union légale')).closest('tr')!;
    fireEvent.click(within(termRow).getByRole('button', { name: 'Rendre obsolète' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByRole('button', { name: 'Rendre obsolète' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Remplacé par le contrat' } });
    const picker = await within(dialog).findByRole('combobox', { name: 'Terme remplaçant' });
    fireEvent.change(picker, { target: { value: T2 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rendre obsolète' }));
    await waitFor(() => expect(fixture.vocabulary.obsoleteTerm).toHaveBeenCalledWith(T1, 'Remplacé par le contrat', T2, expect.any(String)));
});

it('retrouve les documents indexés par un terme, par pages, sans total', async () => {
    fixture.vocabulary.termObjects.mockResolvedValue({
        items: [{ id: DOC, reference: 'DOC-0001', title: 'Registre des naissances 1950', confidentiality: 'INTERNE', archivalStatus: 'ACTIF', institutionId: INST }], page: 0, size: 50, hasMore: true
    });
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Documents indexés par Mariage' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Registre des naissances 1950')).toBeTruthy();
    expect(within(dialog).getByText('DOC-0001')).toBeTruthy();
    expect(fixture.vocabulary.termObjects).toHaveBeenCalledWith(T1, 'DOCUMENT', 0, expect.anything());
    expect((within(dialog).getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Objets/), { target: { value: 'DOSSIER' } });
    await waitFor(() => expect(fixture.vocabulary.termObjects).toHaveBeenCalledWith(T1, 'DOSSIER', 0, expect.anything()));
});

it('le nombre d’emplois n’est donné qu’à qui gère le vocabulaire', async () => {
    fixture.vocabulary.terms.mockResolvedValue(page([term({ usage: null })]));
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    const termRow = (await screen.findByText('Union légale')).closest('tr')!;
    expect(within(termRow).getByText('—')).toBeTruthy();
    expect(within(termRow).queryByText('3')).toBeNull();
});

it('sans habilitation de gestion, on lit sans pouvoir modifier', async () => {
    fixture.allowed = new Set();
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    expect(screen.queryByRole('button', { name: 'Nouveau vocabulaire' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('Contrat de mariage')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajouter un terme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rendre obsolète' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Exporter en SKOS' })).toBeTruthy();
});

it('les mots-clés d’un document se lisent, dont un terme obsolète et son remplaçant, et se retirent', async () => {
    fixture.vocabulary.keywords.mockResolvedValue([keyword(), keyword({ termId: T2, label: 'Registre des patentes', status: 'OBSOLETE', replacedByLabel: 'Registre du commerce' })]);
    fixture.vocabulary.removeKeyword.mockResolvedValue([]);
    render(<KeywordsPanel kind="DOCUMENT" objectId={DOC} institutionId={INST} canEdit />);
    expect(await screen.findByText('Mariage')).toBeTruthy();
    expect(screen.getByText(/remplacé par « Registre du commerce »/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le mot-clé Mariage' }));
    await waitFor(() => expect(fixture.vocabulary.removeKeyword).toHaveBeenCalledWith('DOCUMENT', DOC, T1, expect.any(String)));
});

it('ajoute des mots-clés en les choisissant dans un vocabulaire actif', async () => {
    fixture.vocabulary.keywords.mockResolvedValue([keyword()]);
    fixture.vocabulary.addKeywords.mockResolvedValue([keyword(), keyword({ termId: T2, label: 'Contrat de mariage' })]);
    render(<KeywordsPanel kind="DOSSIER" objectId={DOC} institutionId={INST} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter des mots-clés' }));
    const dialog = await screen.findByRole('dialog');
    const select = await within(dialog).findByLabelText(/^Vocabulaire/);
    fireEvent.change(select, { target: { value: VOC } });
    // « Mariage » est déjà attaché : il ne se propose plus
    expect(await within(dialog).findByText('Contrat de mariage')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Mariage')).toBeNull();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Ajouter \(1\)/ }));
    await waitFor(() => expect(fixture.vocabulary.addKeywords).toHaveBeenCalledWith('DOSSIER', DOC, [T2], expect.any(String)));
});

it('sans droit de description, aucun bouton d’ajout ni de retrait', async () => {
    fixture.vocabulary.keywords.mockResolvedValue([keyword()]);
    render(<KeywordsPanel kind="DOCUMENT" objectId={DOC} institutionId={INST} canEdit={false} />);
    expect(await screen.findByText('Mariage')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajouter des mots-clés' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer le mot-clé/ })).toBeNull();
});

it('la forme du document se renseigne avec son numéro de version, « autre » se précise', async () => {
    const none: DocumentForm = { form: null, precision: null, version: 0 };
    fixture.vocabulary.form.mockResolvedValue(none);
    fixture.vocabulary.setForm.mockResolvedValue({ form: 'AUTRE', precision: 'Fac-similé', version: 1 });
    render(<DocumentFormPanel documentId={DOC} canEdit />);
    expect(await screen.findByText('Non renseignée')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Renseigner la forme' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Forme/), { target: { value: 'AUTRE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/forme « autre » se précise/)).toBeTruthy();
    expect(fixture.vocabulary.setForm).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Précision/), { target: { value: 'Fac-similé' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.vocabulary.setForm).toHaveBeenCalledWith(DOC, 'AUTRE', 'Fac-similé', 0, expect.any(String)));
});

it('un conflit de version de la forme est dit en français', async () => {
    fixture.vocabulary.form.mockResolvedValue({ form: 'COPIE', precision: null, version: 2 });
    fixture.vocabulary.setForm.mockRejectedValue(new ApiError(409, 'DOCUMENT_FORM_VERSION_CONFLICT', 'conflict'));
    render(<DocumentFormPanel documentId={DOC} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la forme' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Forme/), { target: { value: 'ORIGINAL' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/modifiée entre-temps/)).toBeTruthy();
});

it('sans client des vocabulaires (démonstration), les panneaux ne s’affichent pas', () => {
    const saved = (fixture as unknown as { vocabulary: unknown }).vocabulary;
    (fixture as unknown as { vocabulary: unknown }).vocabulary = null;
    try {
        const a = render(<KeywordsPanel kind="DOCUMENT" objectId={DOC} institutionId={INST} canEdit />);
        expect(a.container.textContent).toBe('');
        const b = render(<DocumentFormPanel documentId={DOC} canEdit />);
        expect(b.container.textContent).toBe('');
    } finally { (fixture as unknown as { vocabulary: unknown }).vocabulary = saved; }
});

it('un terme obsolète qui a un remplaçant et des emplois se remplace partout, avec des décomptes pour toute réponse', async () => {
    fixture.vocabulary.terms.mockResolvedValue(page([
        term({ id: T1, label: 'Registre des patentes', status: 'OBSOLETE', replacedById: T2, replacedByLabel: 'Registre du commerce', obsolescenceReason: 'Remplacé', usage: 4 }),
        term({ id: T2, label: 'Registre du commerce', usage: 0 })]));
    fixture.vocabulary.replaceUsages.mockResolvedValue({ termId: T1, replacementId: T2, replacementLabel: 'Registre du commerce', counts: [
        { kind: 'DOCUMENT', replaced: 2, alreadyHeld: 1, skipped: 1 }, { kind: 'DOSSIER', replaced: 1, alreadyHeld: 0, skipped: 0 },
        { kind: 'BIEN', replaced: 0, alreadyHeld: 0, skipped: 0 }, { kind: 'NOTICE', replaced: 0, alreadyHeld: 0, skipped: 0 }] });
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    // un terme actif, ou sans emploi, ne propose pas le remplacement
    const active = (await screen.findByText('Registre du commerce')).closest('tr')!;
    expect(within(active).queryByRole('button', { name: /Remplacer/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Remplacer « Registre des patentes » partout' }));
    const dialog = await screen.findByRole('dialog', { name: /Remplacer « Registre des patentes » partout/ });
    expect(within(dialog).getByText(/sera retiré de chaque objet qui le porte/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer partout' }));
    await waitFor(() => expect(fixture.vocabulary.replaceUsages).toHaveBeenCalledWith(T1, expect.any(String)));
    const documents = (await within(dialog).findByText('Documents')).closest('tr')!;
    expect(within(documents).getAllByRole('cell').map(c => c.textContent)).toEqual(['Documents', '2', '1', '1']);
    expect(within(dialog).getByText(/1 objet porte encore le terme obsolète/)).toBeTruthy();
});

it('sans l’habilitation de gestion, le remplacement en lot n’est pas proposé', async () => {
    fixture.allowed = new Set();
    fixture.vocabulary.terms.mockResolvedValue(page([term({ status: 'OBSOLETE', replacedById: T2, replacedByLabel: 'Registre du commerce', usage: 4 })]));
    render(<VocabularyPage />);
    const row = (await screen.findByText('Thèmes d’état civil')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Mariage');
    expect(screen.queryByRole('button', { name: /Remplacer/ })).toBeNull();
});
