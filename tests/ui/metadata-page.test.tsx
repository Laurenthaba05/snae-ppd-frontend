import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le module métadonnées : la liste des schémas (création, création depuis un gabarit), le détail d'un schéma (champs, rattachements, activation réservée au brouillon complet), l'ajout
// d'un champ (une liste de valeurs pour le type liste), et le panneau des métadonnées d'un document. Un refus du serveur est dit dans la fenêtre, qui reste ouverte avec la saisie.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, allowed: new Set<string>(),
    scope: { institutionId: null as string | null, departmentId: null as string | null },
    extra: {} as Record<string, unknown>,
    metadata: { schemas: vi.fn(), fields: vi.fn(), bindings: vi.fn(), command: vi.fn(), documentMetadata: vi.fn(), applicableFields: vi.fn(), history: vi.fn() },
    records: { documentTypes: vi.fn() },
    vocabulary: { list: vi.fn(), terms: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => fixture.extra, values: {} }) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id, kind }: { id: string; kind?: string }) => <span>{(kind === 'users' ? 'Personne ' : 'Institution ') + id}</span> }));
vi.mock('../../src/ui/MetadataTemplates', () => ({
    MetadataTemplatesDialog: ({ onCreated, onClose }: { onCreated: (i: unknown) => void; onClose: () => void }) => <div role="dialog" aria-label="Gabarits"><button onClick={() => { onCreated({ schema: { id: 's2' } }); onClose(); }}>Instancier le gabarit</button></div>
}));
import { MetadataPage, MetadataPanel } from '../../src/pages/Metadata';

const schema = (n: number, over: Record<string, unknown> = {}) => ({ id: 's' + n, code: 'SCHEMA-' + n, name: 'Schéma ' + n, version: n, status: 'BROUILLON', institutionId: null, effectiveFrom: '2026-10-01', effectiveTo: null, ...over });
const field = (n: number, over: Record<string, unknown> = {}) => ({ id: 'f' + n, code: 'CHAMP' + n, name: 'Champ ' + n, type: 'TEXTE', required: false, repeatable: false, order: n, description: null, vocabulary: null, configuration: {}, ...over });
const docType = (id: string, label: string, over: Record<string, unknown> = {}) => ({ id, code: 'T-' + id, label, status: 'ACTIF', ...over });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.epoch += 1; fixture.extra = {}; fixture.scope = { institutionId: null, departmentId: null };
    const m = fixture.metadata;
    m.schemas.mockReset().mockResolvedValue([schema(1), schema(2, { status: 'ACTIF' })]);
    m.fields.mockReset().mockResolvedValue([field(1, { required: true, description: 'Intitulé du document', vocabulary: 'Natures', configuration: { maxLength: 80 } })]);
    m.bindings.mockReset().mockResolvedValue([{ schemaId: 's1', typeDocumentId: 't1', required: true, from: '2026-10-01', to: null }]);
    m.command.mockReset().mockResolvedValue({});
    m.documentMetadata.mockReset().mockResolvedValue([{ schemaCode: 'SCHEMA-1', schemaVersion: 1, fieldCode: 'CHAMP1', fieldName: 'Champ 1', type: 'TEXTE', order: 0, value: 'Registre', version: 1 },
        { schemaCode: 'SCHEMA-1', schemaVersion: 1, fieldCode: 'N', fieldName: 'Nombre', type: 'ENTIER', order: 0, value: 12, version: 1 }]);
    m.applicableFields.mockReset().mockResolvedValue([]);
    m.history.mockReset().mockResolvedValue({ items: [], hasMore: false });
    fixture.records.documentTypes.mockReset().mockResolvedValue([docType('t1', 'Arrêté'), docType('t2', 'Circulaire'), docType('t3', 'Ancien type', { status: 'INACTIF' })]);
    fixture.vocabulary.list.mockReset().mockResolvedValue([{ id: 'v-nat', institutionId: null, code: 'NATURES', name: 'Natures documentaires', status: 'ACTIF' }, { id: 'v-own', institutionId: 'i1', code: 'LOCAL', name: 'Vocabulaire local', status: 'ACTIF' }]);
    fixture.vocabulary.terms.mockReset().mockResolvedValue({ items: [{ id: 'term-1', label: 'Rapport', status: 'ACTIF' }, { id: 'term-2', label: 'Décision', status: 'ACTIF' }], page: 0, size: 100, total: 2, hasMore: false });
});

const openSchema = async (name = /SCHEMA-1/) => { fireEvent.click(await screen.findByRole('button', { name })); return screen.findByRole('dialog', { name: 'Schéma 1' }); };

// ---------- la liste des schémas
it('la liste montre le code, le nom, la version et le statut de chaque schéma, pour le périmètre de travail', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    render(<MetadataPage />);
    expect(await screen.findByText('Schéma 1')).toBeTruthy();
    expect(fixture.metadata.schemas).toHaveBeenCalledWith('i1', expect.anything());
    const rows = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent));
    expect(rows[0]).toEqual(['SCHEMA-1', 'Schéma 1', '1', 'Brouillon', 'Depuis le 2026-10-01']);
    expect(rows[1]![3]).toBe('Actif');
});

it('une liste vide ou une erreur du serveur est dite, avec une relecture', async () => {
    fixture.metadata.schemas.mockResolvedValue([]);
    const first = render(<MetadataPage />);
    expect(await screen.findByText('Aucun schéma de métadonnées')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.metadata.schemas.mockRejectedValueOnce(new Error('Schémas indisponibles')).mockResolvedValue([schema(1)]);
    render(<MetadataPage />);
    expect(await screen.findByText('Schémas indisponibles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('Schéma 1')).toBeTruthy();
});

it('sans le droit de gérer les schémas, aucune création n’est proposée', async () => {
    render(<MetadataPage />);
    await screen.findByText('Schéma 1');
    expect(screen.queryByRole('button', { name: 'Créer un schéma' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Créer depuis un gabarit' })).toBeNull();
});

it('créer un schéma envoie le code et le nom nettoyés avec la portée de travail et une clé, relit la liste et referme la fenêtre', async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']); fixture.scope = { institutionId: 'i1', departmentId: null };
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un schéma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un schéma de métadonnées' });
    expect(within(dialog).getByText('Institution i1')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: '  FICHE-ARRETE  ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: '  Fiche d’arrêté ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledWith('/admin/metadata-schemas', { institutionId: 'i1', code: 'FICHE-ARRETE', name: 'Fiche d’arrêté' }, expect.stringMatching(/^[0-9a-f-]{36}$/), 'POST'));
    await waitFor(() => expect(fixture.metadata.schemas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('sans institution dans le périmètre, le schéma est national ; un refus du serveur reste dans la fenêtre avec la saisie', async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']);
    fixture.metadata.command.mockRejectedValue(new Error('Ce code existe déjà'));
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un schéma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un schéma de métadonnées' });
    expect(within(dialog).getByText(/nationale/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'DC' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Dublin Core' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(await within(dialog).findByText('Ce code existe déjà')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('DC');
    expect(fixture.metadata.command.mock.calls[0]![1]).toEqual({ institutionId: null, code: 'DC', name: 'Dublin Core' });
    expect(fixture.metadata.schemas).toHaveBeenCalledTimes(1);
});

it('créer depuis un gabarit relit la liste et ouvre le schéma créé', async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']);
    fixture.metadata.schemas.mockResolvedValueOnce([schema(1)]).mockResolvedValue([schema(1), schema(2, { name: 'Schéma issu du gabarit' })]);
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer depuis un gabarit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Instancier le gabarit' }));
    expect(await screen.findByRole('dialog', { name: 'Schéma issu du gabarit' })).toBeTruthy();
});

// ---------- le détail d'un schéma
it('le détail montre les champs avec leurs contraintes et les types de documents liés par leur nom, jamais par leur identifiant', async () => {
    render(<MetadataPage />);
    const dialog = await openSchema();
    expect(await within(dialog).findByText('Champ 1')).toBeTruthy();
    expect(within(dialog).getByText('Intitulé du document')).toBeTruthy();
    expect(within(dialog).getByText('Vocabulaire : Natures')).toBeTruthy();
    expect(within(dialog).getByText(/"maxLength": 80/)).toBeTruthy();
    expect(await within(dialog).findByText('Arrêté')).toBeTruthy();
    expect(within(dialog).queryByText('t1')).toBeNull();
});

it('un type de document qu’on ne retrouve pas n’est pas remplacé par son identifiant', async () => {
    fixture.metadata.bindings.mockResolvedValue([{ schemaId: 's1', typeDocumentId: '3f2c9a10-0000-4000-8000-00000000abcd', required: false, from: '2026-10-01', to: '2027-10-01' }]);
    render(<MetadataPage />);
    const dialog = await openSchema();
    await within(dialog).findByText('2027-10-01');
    expect(within(dialog).queryByText(/3f2c9a10/)).toBeNull();
    expect(within(dialog).getByText('Type de document non retrouvé')).toBeTruthy();
});

it('les actions de gestion n’apparaissent que pour un brouillon et avec le droit ; un schéma actif est en lecture seule', async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']);
    const first = render(<MetadataPage />);
    let dialog = await openSchema();
    expect(within(dialog).getByRole('button', { name: 'Ajouter un champ' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Lier à un type de document' })).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    dialog = await screen.findByRole('dialog', { name: 'Schéma 2' });
    await within(dialog).findByText('Champ 1');
    expect(within(dialog).queryByRole('button', { name: 'Ajouter un champ' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Activer le schéma' })).toBeNull();
});

it('l’activation attend au moins un champ et un rattachement, puis part avec une clé et relit la liste', async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']);
    fixture.metadata.fields.mockResolvedValue([]);
    const first = render(<MetadataPage />);
    let dialog = await openSchema();
    await within(dialog).findByText('Aucun champ');
    expect((within(dialog).getByRole('button', { name: 'Activer le schéma' }) as HTMLButtonElement).disabled).toBe(true);
    first.unmount();
    fixture.epoch += 1;
    fixture.metadata.fields.mockResolvedValue([field(1)]);
    render(<MetadataPage />);
    dialog = await openSchema();
    await within(dialog).findByText('Champ 1');
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Activer le schéma' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activer le schéma' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledWith('/admin/metadata-schemas/s1/activate', {}, expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.metadata.schemas).toHaveBeenCalledTimes(3));
});

// ---------- l'ajout d'un champ
const addField = async () => {
    fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']);
    render(<MetadataPage />);
    const detail = await openSchema();
    await within(detail).findByText('Champ 1');
    fireEvent.click(within(detail).getByRole('button', { name: 'Ajouter un champ' }));
    return screen.findByRole('dialog', { name: 'Ajouter un champ' });
};

it('ajouter un champ texte envoie le code et le nom nettoyés, le type, les indicateurs et une clé, puis relit les champs', async () => {
    const dialog = await addField();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: ' DATE_SIGNATURE ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: ' Date de signature ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'DATE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Obligatoire/), { target: { value: 'oui' } });
    fireEvent.change(within(dialog).getByLabelText(/^Répétable/), { target: { value: 'oui' } });
    expect(within(dialog).queryByLabelText(/^Valeurs autorisées/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledWith('/admin/metadata-schemas/s1/fields',
        { configuration: undefined, code: 'DATE_SIGNATURE', name: 'Date de signature', type: 'DATE', required: true, repeatable: true }, expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.metadata.fields).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajouter un champ' })).toBeNull());
});

it('un champ de type liste exige des valeurs autorisées, nettoyées et sans doublon, et garde les contraintes avancées', async () => {
    fixture.extra = { configuration: { maxLength: 40 }, description: 'Nature du document' };
    const dialog = await addField();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'NATURE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Nature' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'ENUM' } });
    const values = within(dialog).getByLabelText(/^Valeurs autorisées/);
    fireEvent.change(values, { target: { value: ' \n  \n' } });
    fireEvent.submit(values.closest('form')!);
    expect(await within(dialog).findByText('Renseignez au moins une valeur autorisée.')).toBeTruthy();
    expect(fixture.metadata.command).not.toHaveBeenCalled();
    fireEvent.change(values, { target: { value: 'Rapport\n  Décision \r\nRapport\n\nArrêté' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(fixture.metadata.command.mock.calls[0]![1]).toEqual({
        description: 'Nature du document', configuration: { maxLength: 40, allowedValues: ['Rapport', 'Décision', 'Arrêté'] }, code: 'NATURE', name: 'Nature', type: 'ENUM', required: false, repeatable: false
    });
});

it('un refus du serveur à l’ajout d’un champ est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.metadata.command.mockRejectedValue(new Error('Ce champ existe déjà dans le schéma'));
    const dialog = await addField();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'TITRE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Titre' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(await within(dialog).findByText('Ce champ existe déjà dans le schéma')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('TITRE');
    expect(fixture.metadata.fields).toHaveBeenCalledTimes(1);
});

// ---------- le panneau d'un document
it('le panneau montre les valeurs courantes (texte tel quel, autres valeurs en JSON) avec leur schéma et sa version', async () => {
    render(<MetadataPanel documentId="d1" />);
    expect(await screen.findByText('Registre')).toBeTruthy();
    expect(fixture.metadata.documentMetadata).toHaveBeenCalledWith('d1', expect.anything());
    expect(screen.getAllByText('SCHEMA-1 v1')).toHaveLength(2);
    expect(screen.getByText('12')).toBeTruthy();
});

it('sans valeur, le panneau le dit ; une erreur de lecture propose de relire et bloque la modification', async () => {
    fixture.allowed = new Set(['DOCUMENT_METADATA_WRITE']);
    fixture.metadata.documentMetadata.mockResolvedValue([]);
    const first = render(<MetadataPanel documentId="d1" />);
    expect(await screen.findByText('Aucune métadonnée renseignée')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.metadata.documentMetadata.mockRejectedValueOnce(new Error('Valeurs indisponibles')).mockResolvedValue([]);
    render(<MetadataPanel documentId="d1" />);
    expect(await screen.findByText('Valeurs indisponibles')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Modifier les métadonnées' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('Aucune métadonnée renseignée')).toBeTruthy();
});

it('la modification n’est proposée qu’avec le droit d’écrire les métadonnées, et ouvre la fenêtre de saisie', async () => {
    const first = render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    expect(screen.queryByRole('button', { name: 'Modifier les métadonnées' })).toBeNull();
    first.unmount();
    fixture.epoch += 1; fixture.allowed = new Set(['DOCUMENT_METADATA_WRITE']);
    render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    const edit = screen.getByRole('button', { name: 'Modifier les métadonnées' }) as HTMLButtonElement;
    await waitFor(() => expect(edit.disabled).toBe(false));
    fireEvent.click(edit);
    expect(await screen.findByRole('dialog', { name: 'Modifier les métadonnées' })).toBeTruthy();
    expect(screen.getByText('Aucun schéma de métadonnées n’est applicable à ce document.')).toBeTruthy();
});

// ---------- le cycle de vie des schémas : corriger un brouillon, nouvelle version, retrait
const manage = () => { fixture.allowed = new Set(['METADATA_SCHEMA_MANAGE']); };
const openDraft = async () => {
    manage();
    fixture.metadata.fields.mockResolvedValue([field(1), field(2, { type: 'ENUM', required: true, vocabulary: 'Natures', description: 'Nature', configuration: { allowedValues: ['Rapport', 'Décision'], maxLength: 40 } }), field(3)]);
    render(<MetadataPage />);
    const dialog = await openSchema();
    await within(dialog).findByText('Champ 3');
    return dialog;
};
const commands = () => fixture.metadata.command.mock.calls.map(c => [c[0], c[1], c[3]]);

it('chaque champ d’un brouillon se déplace, se corrige ou se supprime ; les extrémités ne se déplacent pas plus loin', async () => {
    const dialog = await openDraft();
    expect((within(dialog).getByRole('button', { name: 'Monter Champ 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Descendre Champ 3' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Descendre Champ 1' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Modifier Champ 2' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Supprimer Champ 2' })).toBeTruthy();
});

it('monter ou descendre un champ envoie l’ordre complet des champs et relit la liste ; un refus est dit', async () => {
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descendre Champ 1' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledWith('/admin/metadata-schemas/s1/field-order', { fieldIds: ['f2', 'f1', 'f3'] }, expect.any(String), 'PUT'));
    await waitFor(() => expect(fixture.metadata.fields).toHaveBeenCalledTimes(2));
    fixture.metadata.command.mockRejectedValueOnce(new Error('Ordre refusé par le serveur'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Monter Champ 3' }));
    expect(await within(dialog).findByText('Ordre refusé par le serveur')).toBeTruthy();
    expect(commands().at(-1)![1]).toEqual({ fieldIds: ['f1', 'f3', 'f2'] });
});

it('corriger un champ préremplit son formulaire (code figé, liste de valeurs, contraintes) et l’envoie sans code', async () => {
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Modifier Champ 2' }));
    const edit = await screen.findByRole('dialog', { name: 'Modifier le champ' });
    const code = within(edit).getByLabelText(/^Code/) as HTMLInputElement;
    expect(code.value).toBe('CHAMP2');
    expect(code.disabled).toBe(true);
    expect((within(edit).getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('Champ 2');
    expect((within(edit).getByLabelText(/^Type/) as HTMLSelectElement).value).toBe('ENUM');
    expect((within(edit).getByLabelText(/^Valeurs autorisées/) as HTMLTextAreaElement).value).toBe('Rapport\nDécision');
    fireEvent.change(within(edit).getByLabelText(/^Nom/), { target: { value: '  Nature du document ' } });
    fireEvent.change(within(edit).getByLabelText(/^Valeurs autorisées/), { target: { value: 'Rapport\nDécision\nArrêté' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(commands()[0]).toEqual(['/admin/metadata-schemas/s1/fields/f2', { configuration: { allowedValues: ['Rapport', 'Décision', 'Arrêté'] }, name: 'Nature du document', type: 'ENUM', required: true, repeatable: false }, 'PUT']);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier le champ' })).toBeNull());
    expect(fixture.metadata.fields).toHaveBeenCalledTimes(2);
});

it('un refus du serveur à la correction d’un champ est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.metadata.command.mockRejectedValue(new Error('Motif trop coûteux'));
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Modifier Champ 1' }));
    const edit = await screen.findByRole('dialog', { name: 'Modifier le champ' });
    fireEvent.change(within(edit).getByLabelText(/^Nom/), { target: { value: 'Nouveau nom' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(edit).findByText('Motif trop coûteux')).toBeTruthy();
    expect((within(edit).getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('Nouveau nom');
});

it('supprimer un champ demande une confirmation, puis envoie la suppression et relit la liste ; annuler n’envoie rien', async () => {
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer Champ 3' }));
    const confirm = await screen.findByRole('dialog', { name: 'Supprimer ce champ ?' });
    expect(within(confirm).getByText('Champ 3')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer ce champ ?' })).toBeNull());
    expect(fixture.metadata.command).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer Champ 3' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Supprimer ce champ ?' })).getByRole('button', { name: 'Supprimer le champ' }));
    await waitFor(() => expect(commands()).toEqual([['/admin/metadata-schemas/s1/fields/f3/delete', {}, 'POST']]));
    await waitFor(() => expect(fixture.metadata.fields).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer ce champ ?' })).toBeNull());
});

it('un refus à la suppression est dit dans la confirmation, qui reste ouverte', async () => {
    fixture.metadata.command.mockRejectedValue(new Error('Ce champ porte déjà des valeurs'));
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer Champ 1' }));
    const confirm = await screen.findByRole('dialog', { name: 'Supprimer ce champ ?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Supprimer le champ' }));
    expect(await within(confirm).findByText('Ce champ porte déjà des valeurs')).toBeTruthy();
    expect(fixture.metadata.fields).toHaveBeenCalledTimes(1);
});

it('un rattachement se retire par le nom du type de document, et la liste est relue', async () => {
    const dialog = await openDraft();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Retirer le rattachement à Arrêté' }));
    await waitFor(() => expect(commands()).toEqual([['/admin/metadata-schemas/s1/document-types/t1/unbind', {}, 'POST']]));
    await waitFor(() => expect(fixture.metadata.bindings).toHaveBeenCalledTimes(2));
});

it('le nom et la date d’effet d’un brouillon se corrigent, et la liste des schémas est relue', async () => {
    const dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Modifier le nom et la date d’effet' }));
    const edit = await screen.findByRole('dialog', { name: 'Modifier le schéma' });
    expect((within(edit).getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('Schéma 1');
    expect((within(edit).getByLabelText(/^Date d’effet/) as HTMLInputElement).value).toBe('2026-10-01');
    fireEvent.change(within(edit).getByLabelText(/^Nom/), { target: { value: '  Fiche d’arrêté  ' } });
    fireEvent.change(within(edit).getByLabelText(/^Date d’effet/), { target: { value: '2026-11-15' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(commands()).toEqual([['/admin/metadata-schemas/s1', { name: 'Fiche d’arrêté', effectiveFrom: '2026-11-15' }, 'PUT']]));
    await waitFor(() => expect(fixture.metadata.schemas).toHaveBeenCalledTimes(2));
});

it('un schéma actif n’offre aucune correction : il explique pourquoi et propose une nouvelle version ou son retrait', async () => {
    manage();
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Schéma 2' });
    await within(dialog).findByText('Champ 1');
    expect(within(dialog).getByText(/Ce schéma est actif : ses champs ne se modifient pas/)).toBeTruthy();
    for (const name of [/^Modifier /, /^Supprimer /, /^Monter /, /^Descendre /, /^Retirer le rattachement/, 'Ajouter un champ', 'Activer le schéma']) expect(within(dialog).queryByRole('button', { name })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Créer une nouvelle version' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Retirer ce schéma' })).toBeTruthy();
});

it('une nouvelle version crée un brouillon, relit la liste et l’ouvre', async () => {
    manage();
    fixture.metadata.schemas.mockResolvedValueOnce([schema(1), schema(2, { status: 'ACTIF' })]).mockResolvedValue([schema(1), schema(2, { status: 'ACTIF' }), schema(3, { name: 'Schéma 3', version: 3 })]);
    fixture.metadata.command.mockResolvedValue(schema(3, { name: 'Schéma 3', version: 3 }));
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une nouvelle version' }));
    await waitFor(() => expect(commands()).toEqual([['/admin/metadata-schemas/s2/new-version', {}, 'POST']]));
    const opened = await screen.findByRole('dialog', { name: 'Schéma 3' });
    expect(within(opened).getByText(/SCHEMA-3 · v3/)).toBeTruthy();
});

it('un refus à la création d’une nouvelle version (un brouillon existe déjà) est dit dans la fenêtre du schéma', async () => {
    manage();
    fixture.metadata.command.mockRejectedValue(new Error('Un brouillon de ce schéma existe déjà'));
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une nouvelle version' }));
    expect(await screen.findByText('Un brouillon de ce schéma existe déjà')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Schéma 2' })).toBeTruthy();
});

it('retirer un schéma actif demande une confirmation qui dit ce qui reste, puis le retire et relit la liste', async () => {
    manage();
    render(<MetadataPage />);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer ce schéma' }));
    const confirm = await screen.findByRole('dialog', { name: 'Retirer ce schéma ?' });
    expect(within(confirm).getByText(/Les documents qui l’ont déjà reçu le gardent/)).toBeTruthy();
    expect(fixture.metadata.command).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retirer le schéma' }));
    await waitFor(() => expect(commands()).toEqual([['/admin/metadata-schemas/s2/retire', {}, 'POST']]));
    await waitFor(() => expect(fixture.metadata.schemas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('un schéma retiré ne propose que la nouvelle version, et la liste montre sa période d’effet', async () => {
    manage();
    fixture.metadata.schemas.mockResolvedValue([schema(1, { status: 'RETIRE', effectiveFrom: '2026-01-01', effectiveTo: '2026-09-30' })]);
    render(<MetadataPage />);
    expect(await screen.findByText('Du 2026-01-01 au 2026-09-30')).toBeTruthy();
    expect(screen.getByText('Retiré')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /SCHEMA-1/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Schéma 1' });
    expect(within(dialog).getByText(/Ce schéma est retiré/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Créer une nouvelle version' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Retirer ce schéma' })).toBeNull();
});

it('sans le droit de gérer les schémas, aucune action du cycle de vie n’est proposée', async () => {
    render(<MetadataPage />);
    const dialog = await openSchema();
    await within(dialog).findByText('Champ 1');
    expect(within(dialog).queryByRole('button', { name: /^Modifier / })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Créer une nouvelle version' })).toBeNull();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    fireEvent.click(await screen.findByRole('button', { name: /SCHEMA-2/ }));
    const active = await screen.findByRole('dialog', { name: 'Schéma 2' });
    expect(within(active).queryByRole('button', { name: 'Retirer ce schéma' })).toBeNull();
    expect(within(active).queryByText(/Ce schéma est actif/)).toBeNull();
});

// ---------- les champs reliés à un vocabulaire contrôlé (type « terme »)
const termDefinition = (over: Record<string, unknown> = {}) => ({ fieldId: 'f9', fieldCode: 'NATURE', fieldName: 'Nature', type: 'TERME', required: false, repeatable: false, schemaRequired: false, schemaCode: 'SCHEMA-1', schemaVersion: 1,
    configuration: {}, description: null, vocabulary: null, vocabularyId: 'v-nat', vocabularyName: 'Natures documentaires', order: 0, ...over });
const termValue = (over: Record<string, unknown> = {}) => ({ schemaCode: 'SCHEMA-1', schemaVersion: 1, fieldCode: 'NATURE', fieldName: 'Nature', type: 'TERME', order: 0, value: 'term-1', valueVersion: 1, label: 'Rapport', termObsolete: false, ...over });

it('un champ de type terme demande un vocabulaire contrôlé : les vocabulaires du périmètre du schéma sont proposés, et le choix part avec le champ', async () => {
    const dialog = await addField();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'NATURE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Nature du document' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'TERME' } });
    expect(fixture.vocabulary.list).toHaveBeenCalledWith(null, false, expect.anything());      // schéma national : vocabulaires nationaux
    expect(within(dialog).getByRole('option', { name: 'Terme d’un vocabulaire' })).toBeTruthy();
    const select = await within(dialog).findByLabelText(/^Vocabulaire contrôlé/) as HTMLSelectElement;
    await waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Choisir un vocabulaire…', 'Natures documentaires (national)', 'Vocabulaire local']));
    fireEvent.submit(select.closest('form')!);
    expect(await within(dialog).findByText('Choisissez un vocabulaire contrôlé.')).toBeTruthy();
    expect(fixture.metadata.command).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'v-nat' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(fixture.metadata.command.mock.calls[0]).toEqual(['/admin/metadata-schemas/s1/fields',
        { configuration: undefined, vocabularyId: 'v-nat', code: 'NATURE', name: 'Nature du document', type: 'TERME', required: false, repeatable: false }, expect.any(String), 'POST']);
});

it('le vocabulaire proposé suit l’institution du schéma ; sans vocabulaire actif, l’écran le dit ; une erreur de lecture se relit', async () => {
    fixture.metadata.schemas.mockResolvedValue([schema(1, { institutionId: 'i1' })]);
    fixture.vocabulary.list.mockResolvedValue([]);
    const dialog = await addField();
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'TERME' } });
    expect(await within(dialog).findByText(/Aucun vocabulaire actif n’est disponible pour ce schéma/)).toBeTruthy();
    expect(fixture.vocabulary.list).toHaveBeenCalledWith('i1', false, expect.anything());
    fixture.vocabulary.list.mockReset().mockRejectedValueOnce(new Error('Vocabulaires indisponibles')).mockResolvedValue([{ id: 'v-own', institutionId: 'i1', name: 'Vocabulaire local' }]);
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'TEXTE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'TERME' } });
    expect(await within(dialog).findByText('Vocabulaires indisponibles')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await within(dialog).findByRole('option', { name: 'Vocabulaire local' })).toBeTruthy();
});

it('corriger un champ de type terme préremplit son vocabulaire ; changer de type n’envoie plus de vocabulaire', async () => {
    fixture.metadata.fields.mockResolvedValue([field(1, { code: 'NATURE', name: 'Nature', type: 'TERME', vocabularyId: 'v-nat', vocabularyName: 'Natures documentaires' })]);
    manage();
    render(<MetadataPage />);
    const detail = await openSchema();
    expect(await within(detail).findByText('Vocabulaire contrôlé : Natures documentaires')).toBeTruthy();
    expect(within(detail).getByText('Terme d’un vocabulaire')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Modifier Nature' }));
    const edit = await screen.findByRole('dialog', { name: 'Modifier le champ' });
    await waitFor(() => expect((within(edit).getByLabelText(/^Vocabulaire contrôlé/) as HTMLSelectElement).value).toBe('v-nat'));
    fireEvent.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(fixture.metadata.command.mock.calls[0]![1]).toMatchObject({ vocabularyId: 'v-nat', type: 'TERME' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Modifier Nature' }));
    const again = await screen.findByRole('dialog', { name: 'Modifier le champ' });
    fireEvent.change(within(again).getByLabelText(/^Type/), { target: { value: 'TEXTE' } });
    expect(within(again).queryByLabelText(/^Vocabulaire contrôlé/)).toBeNull();
    fireEvent.click(within(again).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(2));
    expect(fixture.metadata.command.mock.calls[1]![1]).not.toHaveProperty('vocabularyId');
});

it('le panneau d’un document montre le libellé du terme, jamais son identifiant, et signale un terme devenu obsolète', async () => {
    fixture.metadata.documentMetadata.mockResolvedValue([termValue(), termValue({ order: 1, value: 'term-9', label: 'Ancien rapport', termObsolete: true }), termValue({ order: 2, value: 'term-404', label: null, termObsolete: null })]);
    render(<MetadataPanel documentId="d1" />);
    expect(await screen.findByText('Rapport')).toBeTruthy();
    expect(screen.getByText('Ancien rapport')).toBeTruthy();
    expect(screen.getByText('(terme obsolète)')).toBeTruthy();
    expect(screen.getByText('Terme non retrouvé')).toBeTruthy();
    for (const id of ['term-1', 'term-9', 'term-404']) expect(screen.queryByText(id)).toBeNull();
});

const editTerm = async (values: unknown[]) => {
    fixture.allowed = new Set(['DOCUMENT_METADATA_WRITE']);
    fixture.metadata.applicableFields.mockResolvedValue([termDefinition()]);
    fixture.metadata.documentMetadata.mockResolvedValue(values);
    render(<MetadataPanel documentId="d1" />);
    const open = await screen.findByRole('button', { name: 'Modifier les métadonnées' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    return screen.findByRole('dialog', { name: 'Modifier les métadonnées' });
};

it('la saisie d’un champ de type terme propose les termes actifs du vocabulaire par leur libellé, avec une recherche', async () => {
    const dialog = await editTerm([]);
    const select = await within(dialog).findByRole('combobox', { name: 'Nature' }) as HTMLSelectElement;
    await waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Aucun', 'Rapport', 'Décision']));
    expect(fixture.vocabulary.terms).toHaveBeenCalledWith('v-nat', { q: undefined, status: 'ACTIF' }, expect.anything());
    expect(within(dialog).getByText(/Vocabulaire : Natures documentaires/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Chercher : Nature'), { target: { value: 'déci' } });
    await waitFor(() => expect(fixture.vocabulary.terms).toHaveBeenLastCalledWith('v-nat', { q: 'déci', status: 'ACTIF' }, expect.anything()));
});

it('choisir un terme enregistre son identifiant ; garder un terme obsolète déjà porté est possible et le conserve sans le proposer aux autres', async () => {
    const dialog = await editTerm([termValue({ value: 'term-9', label: 'Ancien rapport', termObsolete: true })]);
    const select = await within(dialog).findByRole('combobox', { name: 'Nature' }) as HTMLSelectElement;
    await waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Aucun', 'Ancien rapport (obsolète)', 'Rapport', 'Décision']));
    expect(select.value).toBe('term-9');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(fixture.metadata.command.mock.calls[0]![1]).toEqual({ values: [{ fieldCode: 'NATURE', order: 0, value: 'term-9' }], requireComplete: false });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier les métadonnées' })).toBeNull());
    // en rouvrant la fenêtre, on choisit un terme actif : l'identifiant du terme choisi part, pas son libellé
    fireEvent.click(screen.getByRole('button', { name: 'Modifier les métadonnées' }));
    const reopened = await screen.findByRole('dialog', { name: 'Modifier les métadonnées' });
    const choice = await within(reopened).findByRole('combobox', { name: 'Nature' }) as HTMLSelectElement;
    await waitFor(() => expect(within(choice).getAllByRole('option')).toHaveLength(4));
    fireEvent.change(choice, { target: { value: 'term-2' } });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(2));
    expect(fixture.metadata.command.mock.calls[1]![1]).toEqual({ values: [{ fieldCode: 'NATURE', order: 0, value: 'term-2' }], requireComplete: false });
});

it('choisir « Aucun » retire la valeur du terme ; un champ sans vocabulaire est signalé au lieu d’une saisie libre', async () => {
    const dialog = await editTerm([termValue()]);
    const select = await within(dialog).findByRole('combobox', { name: 'Nature' }) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('term-1'));
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.metadata.command).toHaveBeenCalledTimes(1));
    expect(fixture.metadata.command.mock.calls[0]![1]).toEqual({ values: [], requireComplete: false });
});

it('un champ de type terme sans vocabulaire est signalé au lieu d’une saisie libre', async () => {
    fixture.allowed = new Set(['DOCUMENT_METADATA_WRITE']);
    fixture.metadata.applicableFields.mockResolvedValue([termDefinition({ vocabularyId: null, vocabularyName: null })]);
    fixture.metadata.documentMetadata.mockResolvedValue([]);
    render(<MetadataPanel documentId="d1" />);
    const open = await screen.findByRole('button', { name: 'Modifier les métadonnées' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Modifier les métadonnées' });
    expect(within(dialog).getByText(/Ce champ n’est relié à aucun vocabulaire/)).toBeTruthy();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
});

// ---------- l'historique des valeurs d'un document
const entry = (over: Record<string, unknown> = {}) => ({ schemaCode: 'SCHEMA-1', schemaVersion: 1, fieldCode: 'TITRE', fieldName: 'Titre', type: 'TEXTE', order: 0, value: 'Registre', valueVersion: 1,
    validFrom: '2026-10-01T08:00:00Z', validTo: null, enteredById: 'u-7', label: null, termObsolete: null, superseded: false, ...over });

it('l’historique est proposé à tout lecteur des métadonnées, même sans le droit de les modifier', async () => {
    render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    expect(screen.queryByRole('button', { name: 'Modifier les métadonnées' })).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Historique des modifications' }) as HTMLButtonElement).disabled).toBe(false));
});

it('l’historique montre pour chaque valeur son entrée en vigueur, son état (en vigueur, remplacée, retirée) et la personne nommée qui l’a saisie', async () => {
    fixture.metadata.history.mockResolvedValue({ hasMore: false, items: [
        entry({ valueVersion: 2, value: 'Registre des naissances', validFrom: '2026-10-05T09:30:00Z' }),
        entry({ valueVersion: 1, value: 'Registre', validTo: '2026-10-05T09:30:00Z', superseded: true, validFrom: '2026-10-01T08:00:00Z' }),
        entry({ fieldCode: 'AUTEUR', fieldName: 'Auteur', value: 'Direction', validFrom: '2026-10-02T08:00:00Z', validTo: '2026-10-04T08:00:00Z', superseded: false, enteredById: 'u-8' }),
        entry({ fieldCode: 'NATURE', fieldName: 'Nature', type: 'TERME', value: 'term-1', label: 'Rapport', termObsolete: true, order: 1, enteredById: null })
    ] });
    render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    fireEvent.click(await screen.findByRole('button', { name: 'Historique des modifications' }));
    const dialog = await screen.findByRole('dialog', { name: 'Historique des métadonnées' });
    expect(fixture.metadata.history).toHaveBeenCalledWith('d1', undefined, expect.anything());
    const rows = (await within(dialog).findAllByRole('row')).slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent ?? ''));
    expect(rows).toHaveLength(4);
    expect(rows[0]![1]).toContain('Titre');
    expect(rows[0]![2]).toBe('Registre des naissances');
    expect(rows[0]![3]).toBe('En vigueur');
    expect(rows[0]![4]).toBe('Personne u-7');
    expect(rows[1]![3]).toMatch(/^Remplacée le /);
    expect(rows[2]![3]).toMatch(/^Retirée le /);
    expect(rows[2]![4]).toBe('Personne u-8');
    expect(rows[3]![1]).toContain('occurrence 2');
    expect(rows[3]![2]).toBe('Rapport (terme obsolète)');          // le libellé du terme, jamais son identifiant
    expect(rows[3]![4]).toBe('—');
    expect(within(dialog).queryByText('term-1')).toBeNull();
    expect(within(dialog).getAllByText('SCHEMA-1 v1').length).toBeGreaterThan(0);
});

it('un historique vide, une erreur de lecture et un historique tronqué sont dits chacun à leur façon', async () => {
    const first = render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    fireEvent.click(await screen.findByRole('button', { name: 'Historique des modifications' }));
    expect(await screen.findByText('Aucun historique')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.metadata.history.mockReset().mockRejectedValueOnce(new Error('Historique indisponible')).mockResolvedValue({ hasMore: true, items: [entry()] });
    render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    fireEvent.click(await screen.findByRole('button', { name: 'Historique des modifications' }));
    const dialog = await screen.findByRole('dialog', { name: 'Historique des métadonnées' });
    expect(await within(dialog).findByText('Historique indisponible')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await within(dialog).findByText(/L’historique est plus long que la page affichée/)).toBeTruthy();
});

it('l’historique se ferme sans rien changer', async () => {
    render(<MetadataPanel documentId="d1" />);
    await screen.findByText('Registre');
    fireEvent.click(await screen.findByRole('button', { name: 'Historique des modifications' }));
    const dialog = await screen.findByRole('dialog', { name: 'Historique des métadonnées' });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.metadata.command).not.toHaveBeenCalled();
});
