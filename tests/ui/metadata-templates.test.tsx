import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MetadataTemplate } from '../../src/core/metadataTemplates';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown,
    metadata: { templates: vi.fn(), instantiateTemplate: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { MetadataTemplatesDialog } from '../../src/ui/MetadataTemplates';

const field = (code: string, name: string, over: Record<string, unknown> = {}) => ({ code, name, description: `${name} du document`, type: 'TEXTE', required: false, repeatable: true, maxLength: 1000, group: null, ...over });
const templates = (): MetadataTemplate[] => [
    { code: 'DUBLIN_CORE', name: 'Dublin Core simple', description: 'Les quinze éléments du Dublin Core simple.', reference: 'ISO 15836-1', note: 'Gabarit d’exemple.',
      fields: [field('TITLE', 'Titre'), field('CREATOR', 'Créateur')] as MetadataTemplate['fields'] },
    { code: 'GESTION_DOCUMENTS_ACTIVITE', name: 'Gestion des documents d’activité', description: 'Inspiré de l’ISO 23081.', reference: 'Structure inspirée de l’ISO 23081-1',
      note: 'Sans reproduire sa liste d’éléments.', fields: [field('IDENTIFIANT_DOCUMENT', 'Identifiant du document', { group: 'IDENTITE', repeatable: false }),
          field('REGLE_CONSERVATION', 'Règle de conservation', { group: 'PLAN_EVENEMENTS', repeatable: false })] as MetadataTemplate['fields'] }
];

beforeEach(() => {
    fixture.epoch += 1;
    fixture.metadata.templates.mockReset().mockResolvedValue(templates());
    fixture.metadata.instantiateTemplate.mockReset();
});

it('les gabarits se listent avec leur résumé et leurs champs groupés, et rien ne se crée sans choix', async () => {
    render(<MetadataTemplatesDialog institutionId={INST} onClose={() => undefined} onCreated={() => undefined} />);
    expect(await screen.findByText('Dublin Core simple')).toBeTruthy();
    expect(screen.getByText(/2 champs : tous facultatifs, tous répétables/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Créer le schéma en brouillon' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Gestion des documents d’activité/ }));
    expect(await screen.findByText(/Sans reproduire sa liste d’éléments/)).toBeTruthy();
    expect(screen.getByText(/Identité \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Plan d’événements \(1\)/)).toBeTruthy();
    expect(fixture.metadata.instantiateTemplate).not.toHaveBeenCalled();
});

it('le gabarit choisi est instancié avec l’institution et le code saisi, puis le schéma créé est rendu', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    fixture.metadata.instantiateTemplate.mockResolvedValue({ schema: { id: 'schema-1', code: 'DC-PILOTE', name: 'Dublin Core simple', version: 1, status: 'BROUILLON', institutionId: INST }, fields: 2 });
    render(<MetadataTemplatesDialog institutionId={INST} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Dublin Core simple/ }));
    fireEvent.change(screen.getByLabelText(/^Code du schéma/), { target: { value: 'DC-PILOTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le schéma en brouillon' }));
    await waitFor(() => expect(fixture.metadata.instantiateTemplate).toHaveBeenCalledWith('DUBLIN_CORE', { institutionId: INST, schemaCode: 'DC-PILOTE' }, expect.any(String)));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ fields: 2 })));
    expect(onClose).toHaveBeenCalled();
});

it('un refus du serveur reste affiché dans la fenêtre', async () => {
    fixture.metadata.instantiateTemplate.mockRejectedValue(Object.assign(new Error('Ce schéma existe déjà.'), { status: 409 }));
    render(<MetadataTemplatesDialog institutionId={null} onClose={() => undefined} onCreated={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Dublin Core simple/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le schéma en brouillon' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fixture.metadata.instantiateTemplate).toHaveBeenCalledWith('DUBLIN_CORE', {}, expect.any(String));
});
