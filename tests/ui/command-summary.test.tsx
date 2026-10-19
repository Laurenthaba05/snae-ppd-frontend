import React from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// Le résumé avant confirmation ne montre jamais un identifiant : un nom quand on sait ce que désigne le champ, un texte neutre sinon. Un identifiant de connexion saisi à la main reste lisible.
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ kind, id }: { kind: string; id: string }) => <span>{`nom ${kind} ${id.slice(-3)}`}</span>,
    DocumentName: ({ id }: { id: string }) => <span>{`document ${id.slice(-3)}`}</span>
}));
import { CommandSummary } from '../../src/ui/CommandSummary';

const text = (node: React.ReactElement) => render(node).container.textContent ?? '';

it('une institution, un département et un rôle se lisent par leur nom', () => {
    const shown = text(<CommandSummary value={{ institutionId: ID(1), departmentId: ID(2), roleId: ID(3), utilisateurId: ID(4), code: 'DAF' }} />);
    expect(shown).toContain('nom institutions 001');
    expect(shown).toContain('nom departments 002');
    expect(shown).toContain('nom roles 003');
    expect(shown).toContain('nom users 004');
    expect(shown).toContain('DAF');
    expect(shown).not.toContain('00000000-0000');
});

it('le parent d’un département est un département ; sans cette précision il reste neutre', () => {
    expect(text(<CommandSummary value={{ parentId: ID(7) }} parent="departments" />)).toContain('nom departments 007');
    const neutral = text(<CommandSummary value={{ parentId: ID(7) }} />);
    expect(neutral).toContain('Élément sélectionné');
    expect(neutral).not.toContain('00000000-0000');
});

it('un document se lit par sa référence, les autres identifiants par un texte neutre', () => {
    const shown = text(<CommandSummary value={{ documentId: ID(5), typeDocumentId: ID(6), dossierId: ID(8) }} />);
    expect(shown).toContain('document 005');
    expect(shown.match(/Élément sélectionné/g)?.length).toBe(2);
    expect(shown).not.toContain('00000000-0000');
});

it('une liste d’identifiants se compte au lieu de s’énumérer', () => {
    expect(text(<CommandSummary value={{ permissionIds: [ID(1), ID(2), ID(3)] }} />)).toContain('3 éléments sélectionnés');
    expect(text(<CommandSummary value={{ permissionIds: [ID(1)] }} />)).toContain('1 élément sélectionné');
});

it('un identifiant de connexion saisi reste visible, un champ vide se dit', () => {
    const shown = text(<CommandSummary value={{ ssoId: ID(9), email: null }} />);
    expect(shown).toContain(ID(9));
    expect(shown).toContain('Non renseigné');
});

it('un objet imbriqué garde la même règle', () => {
    const shown = text(<CommandSummary value={{ cible: { institutionId: ID(1) } }} />);
    expect(shown).toContain('nom institutions 001');
});
