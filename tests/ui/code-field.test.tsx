import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le champ « référence » guidé par le modèle de l'institution : sans modèle (ou sans client, en démonstration) c'est un champ libre ; avec un modèle, le modèle est rappelé sous le champ,
// la référence suivante se propose d'un clic, et ce qu'on saisit est comparé au modèle — une erreur pour un modèle obligatoire, une simple remarque pour un modèle indicatif.
const fixture = vi.hoisted(() => ({
    epoch: 1,
    codification: { model: vi.fn(), check: vi.fn(), proposal: vi.fn() } as { model: ReturnType<typeof vi.fn>; check: ReturnType<typeof vi.fn>; proposal: ReturnType<typeof vi.fn> } | null
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { CodeField } from '../../src/ui/CodeField';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const PARENT = '22222222-2222-4222-8222-222222222222';
const CLASSEMENT = '33333333-3333-4333-8333-333333333333';
const model = (over: Record<string, unknown> = {}) => ({
    id: 'm1', institutionId: INSTITUTION, kind: 'DOCUMENT', label: null, segments: [], mode: 'INDICATIF', version: 1, pattern: 'ARC-AAAA-0001', example: 'ARC-2026-0001', ...over
});

function Harness({ initial = '', kind = 'DOCUMENT' as 'DOCUMENT' | 'DOSSIER' | 'NOTICE', parentId = null as string | null, classementId = null as string | null }) {
    const [value, setValue] = useState(initial);
    return <CodeField kind={kind} institutionId={INSTITUTION} parentId={parentId} classementId={classementId} value={value} onChange={setValue} label="Cote ou référence *" maxLength={150} />;
}
const input = () => screen.getByLabelText(/Cote ou référence/) as HTMLInputElement;

beforeEach(() => {
    fixture.epoch += 1;
    fixture.codification = { model: vi.fn(), check: vi.fn(), proposal: vi.fn() };
    fixture.codification.model.mockResolvedValue(null);
    fixture.codification.check.mockResolvedValue({ conform: true, mode: 'INDICATIF', pattern: 'ARC-AAAA-0001', example: null, message: null });
    fixture.codification.proposal.mockResolvedValue({ code: 'ARC-2026-0007', counter: 7, pattern: 'ARC-AAAA-0001', mode: 'INDICATIF' });
});

it('sans modèle pour cet objet, la référence reste un champ libre sans proposition ni contrôle', async () => {
    render(<Harness />);
    await waitFor(() => expect(fixture.codification!.model).toHaveBeenCalledWith('DOCUMENT', INSTITUTION, expect.anything()));
    fireEvent.change(input(), { target: { value: 'Z-1' } });
    expect(input().value).toBe('Z-1');
    expect(screen.queryByRole('button', { name: 'Proposer la prochaine référence' })).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(fixture.codification!.check).not.toHaveBeenCalled();
});

it('sans client de codification (démonstration), c’est un champ libre qui n’appelle rien', async () => {
    fixture.codification = null;
    render(<Harness initial="DEMO-1" />);
    expect(input().value).toBe('DEMO-1');
    expect(screen.queryByRole('button', { name: 'Proposer la prochaine référence' })).toBeNull();
});

it('une erreur de lecture du modèle ne bloque jamais la saisie', async () => {
    fixture.codification!.model.mockRejectedValue(new Error('Indisponible'));
    render(<Harness />);
    await waitFor(() => expect(fixture.codification!.model).toHaveBeenCalled());
    fireEvent.change(input(), { target: { value: 'LIBRE' } });
    expect(input().value).toBe('LIBRE');
    expect(screen.queryByText(/Indisponible/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Proposer la prochaine référence' })).toBeNull();
});

it('avec un modèle, le modèle et son mode sont rappelés sous le champ', async () => {
    fixture.codification!.model.mockResolvedValue(model());
    render(<Harness />);
    expect(await screen.findByText('Modèle de l’institution : ARC-AAAA-0001 (indicatif).')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Proposer la prochaine référence' })).toBeTruthy();
});

it('proposer la référence suivante remplit le champ avec le conteneur et le classement du formulaire', async () => {
    fixture.codification!.model.mockResolvedValue(model({ kind: 'DOSSIER' }));
    render(<Harness kind="DOSSIER" parentId={PARENT} classementId={CLASSEMENT} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer la prochaine référence' }));
    await waitFor(() => expect(input().value).toBe('ARC-2026-0007'));
    expect(fixture.codification!.proposal).toHaveBeenCalledWith('DOSSIER', INSTITUTION, PARENT, CLASSEMENT);
});

it('une proposition refusée par le serveur est dite et laisse la saisie intacte', async () => {
    fixture.codification!.model.mockResolvedValue(model());
    fixture.codification!.proposal.mockRejectedValue(new Error('Le dossier du document est requis pour ce modèle.'));
    render(<Harness initial="MA-REF" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer la prochaine référence' }));
    expect(await screen.findByText('Le dossier du document est requis pour ce modèle.')).toBeTruthy();
    expect(input().value).toBe('MA-REF');
});

it('une référence qui ne suit pas un modèle indicatif est signalée sans erreur, une qui le suit ne dit rien', async () => {
    fixture.codification!.model.mockResolvedValue(model());
    fixture.codification!.check.mockImplementation((_k: string, _i: string, code: string) => Promise.resolve({ conform: code === 'ARC-2026-0001', mode: 'INDICATIF', pattern: 'ARC-AAAA-0001', example: null, message: null }));
    render(<Harness />);
    await screen.findByText(/Modèle de l’institution/);
    fireEvent.change(input(), { target: { value: 'AUTRE' } });
    expect(await screen.findByText(/Cette référence ne suit pas le modèle : vous pouvez l’enregistrer quand même\./)).toBeTruthy();
    expect(screen.queryByText(/l’enregistrement sera refusé/)).toBeNull();
    fireEvent.change(input(), { target: { value: 'ARC-2026-0001' } });
    await waitFor(() => expect(screen.queryByText(/ne suit pas le modèle/)).toBeNull());
});

it('une référence qui ne suit pas un modèle obligatoire est une erreur annonçant le refus', async () => {
    fixture.codification!.model.mockResolvedValue(model({ mode: 'OBLIGATOIRE' }));
    fixture.codification!.check.mockResolvedValue({ conform: false, mode: 'OBLIGATOIRE', pattern: 'ARC-AAAA-0001', example: null, message: 'Ne suit pas le modèle' });
    render(<Harness />);
    expect(await screen.findByText('Modèle de l’institution : ARC-AAAA-0001 (obligatoire).')).toBeTruthy();
    fireEvent.change(input(), { target: { value: 'AUTRE' } });
    expect(await screen.findByText('Cette référence ne suit pas le modèle obligatoire de l’institution ; l’enregistrement sera refusé.')).toBeTruthy();
});

it('le contrôle suit ce qui est saisi, avec son conteneur et son classement, et ignore une saisie vide ou en cours de frappe', async () => {
    fixture.codification!.model.mockResolvedValue(model());
    render(<Harness parentId={PARENT} classementId={CLASSEMENT} />);
    await screen.findByText(/Modèle de l’institution/);
    expect(fixture.codification!.check).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'A' } });
    fireEvent.change(input(), { target: { value: 'AB' } });
    fireEvent.change(input(), { target: { value: ' ABC ' } });
    await waitFor(() => expect(fixture.codification!.check).toHaveBeenCalledTimes(1));
    expect(fixture.codification!.check).toHaveBeenCalledWith('DOCUMENT', INSTITUTION, 'ABC', PARENT, CLASSEMENT, expect.anything());
});

it('une erreur du contrôle ne gêne pas la saisie : aucune alerte n’apparaît', async () => {
    fixture.codification!.model.mockResolvedValue(model({ mode: 'OBLIGATOIRE' }));
    fixture.codification!.check.mockRejectedValue(new Error('Contrôle indisponible'));
    render(<Harness />);
    await screen.findByText(/Modèle de l’institution/);
    fireEvent.change(input(), { target: { value: 'X-1' } });
    await waitFor(() => expect(fixture.codification!.check).toHaveBeenCalled());
    expect(screen.queryByText(/Contrôle indisponible/)).toBeNull();
    expect(screen.queryByText(/sera refusé/)).toBeNull();
});
