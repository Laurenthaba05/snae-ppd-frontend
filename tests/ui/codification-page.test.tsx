import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// La page d'administration de la codification : pour l'institution du périmètre, un modèle par objet (documents, dossiers, notices), les pièces dans l'ordre, le mode, l'aperçu en toutes
// lettres ; retirer un modèle rend la référence libre. Un refus du serveur est dit dans la fenêtre, qui reste ouverte avec la saisie.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, allowed: new Set<string>(),
    scope: { institutionId: null as string | null, departmentId: null as string | null },
    codification: { models: vi.fn(), saveModel: vi.fn(), removeModel: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <span>{'Institution ' + id}</span> }));
import { CodificationPage } from '../../src/ui/Codification';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const model = (kind: string, over: Record<string, unknown> = {}) => ({
    id: 'm-' + kind, institutionId: INSTITUTION, kind, label: null, segments: [{ type: 'TEXTE', value: 'ARC' }, { type: 'COMPTEUR', digits: 3 }], mode: 'INDICATIF', version: 1, pattern: 'ARC001', example: 'ARC042', ...over
});

beforeEach(() => {
    fixture.epoch += 1; fixture.allowed = new Set(['CODIFICATION_MANAGE']); fixture.scope = { institutionId: INSTITUTION, departmentId: null };
    const c = fixture.codification;
    c.models.mockReset().mockResolvedValue([model('DOSSIER', { label: 'Dossiers du greffe', mode: 'OBLIGATOIRE', pattern: 'DOS-AAAA-0001', example: 'DOS-2026-0042' })]);
    c.saveModel.mockReset().mockResolvedValue({});
    c.removeModel.mockReset().mockResolvedValue(undefined);
});

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const openDefine = async (name: string) => { fireEvent.click(await screen.findByRole('button', { name })); return screen.findByRole('dialog'); };

it('sans institution dans le périmètre, la page le dit et ne lit rien', async () => {
    fixture.scope = { institutionId: null, departmentId: null };
    render(<CodificationPage />);
    expect(await screen.findByText(/Choisissez une institution dans le périmètre de travail/)).toBeTruthy();
    expect(fixture.codification.models).not.toHaveBeenCalled();
});

it('sans l’habilitation de gestion, la page le dit, ne lit rien et ne propose aucune action', async () => {
    fixture.allowed = new Set();
    render(<CodificationPage />);
    expect(await screen.findByText(/exige l’habilitation de gestion de la codification/)).toBeTruthy();
    expect(fixture.codification.models).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /modèle/i })).toBeNull();
});

it('la liste montre les trois objets : le modèle, le mode et un exemple quand il y en a un, « référence libre » sinon', async () => {
    render(<CodificationPage />);
    expect(await screen.findByText('Dossiers du greffe')).toBeTruthy();
    expect(fixture.codification.models).toHaveBeenCalledWith(INSTITUTION, expect.anything());
    const rows = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent));
    expect(rows.map(r => r[0])).toEqual(['Documents', 'DossiersDossiers du greffe', 'Notices de description']);
    expect(rows[0]!.slice(1, 4)).toEqual(['Aucun modèle : la référence est libre', '—', '—']);
    expect(rows[1]!.slice(1, 4)).toEqual(['DOS-AAAA-0001', 'Obligatoire', 'DOS-2026-0042']);
    expect(within(row('Documents')).getByRole('button', { name: 'Définir un modèle pour les documents' })).toBeTruthy();
    expect(within(row('Documents')).queryByRole('button', { name: /Retirer/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Modifier le modèle des dossiers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer le modèle des dossiers' })).toBeTruthy();
});

it('une erreur du serveur est dite, avec une relecture', async () => {
    fixture.codification.models.mockRejectedValueOnce(new Error('Modèles indisponibles')).mockResolvedValue([model('DOCUMENT')]);
    render(<CodificationPage />);
    expect(await screen.findByText('Modèles indisponibles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('ARC001')).toBeTruthy();
});

it('définir un modèle part d’un exemple annuel, montre l’aperçu, et enregistre les pièces, le mode et le libellé avec une clé', async () => {
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    expect(within(dialog).getByText('Modèle de codification : documents')).toBeTruthy();
    expect(within(dialog).getByText('ARC-AAAA-0001', { selector: 'code' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: '  Pièces courantes ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Mode/), { target: { value: 'OBLIGATOIRE' } });
    fixture.codification.models.mockClear();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.codification.saveModel).toHaveBeenCalledTimes(1));
    expect(fixture.codification.saveModel).toHaveBeenCalledWith('DOCUMENT', {
        institutionId: INSTITUTION, label: 'Pièces courantes', mode: 'OBLIGATOIRE',
        segments: [{ type: 'TEXTE', value: 'ARC' }, { type: 'TEXTE', value: '-' }, { type: 'ANNEE' }, { type: 'TEXTE', value: '-' }, { type: 'COMPTEUR', digits: 4 }]
    }, expect.any(String));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.codification.models).toHaveBeenCalled();
});

it('modifier un modèle reprend ses pièces ; on change un texte, un nombre de chiffres, on ajoute, déplace et retire des pièces, et l’aperçu suit', async () => {
    fixture.codification.models.mockResolvedValue([model('NOTICE', { label: null, segments: [{ type: 'PARENT' }, { type: 'TEXTE', value: '/' }, { type: 'COMPTEUR', digits: 3 }], pattern: '{contenant}/001' })]);
    render(<CodificationPage />);
    const dialog = await openDefine('Modifier le modèle des notices de description');
    const code = () => dialog.querySelector('.notice code')!.textContent;
    expect(code()).toBe('{contenant}/001');
    expect((within(dialog).getByLabelText('Type de la pièce 1') as HTMLSelectElement).value).toBe('PARENT');
    expect(within(within(dialog).getByLabelText('Type de la pièce 1')).getByRole('option', { name: 'Notice parente' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Texte de la pièce 2'), { target: { value: '-' } });
    fireEvent.change(within(dialog).getByLabelText('Chiffres du compteur de la pièce 3'), { target: { value: '5' } });
    expect(code()).toBe('{contenant}-00001');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter une pièce' }));
    fireEvent.change(within(dialog).getByLabelText('Type de la pièce 4'), { target: { value: 'ANNEE' } });
    expect(code()).toBe('{contenant}-00001AAAA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Monter la pièce 4' }));
    expect(code()).toBe('{contenant}-AAAA00001');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer la pièce 2' }));
    expect(code()).toBe('{contenant}AAAA00001');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.codification.saveModel).toHaveBeenCalled());
    expect(fixture.codification.saveModel.mock.calls[0]![1].segments).toEqual([{ type: 'PARENT' }, { type: 'ANNEE' }, { type: 'COMPTEUR', digits: 5 }]);
});

it('les premières et dernières pièces ne peuvent pas sortir de la liste', async () => {
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    expect((within(dialog).getByRole('button', { name: 'Monter la pièce 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Descendre la pièce 5' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Descendre la pièce 1' }) as HTMLButtonElement).disabled).toBe(false);
});

it('on ne dépasse pas huit pièces et on ne peut pas enregistrer un modèle vide', async () => {
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    for (let i = 0; i < 3; i++) fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter une pièce' }));
    expect((within(dialog).getByRole('button', { name: 'Ajouter une pièce' }) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 8; i++) fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer la pièce 1' }));
    expect((within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
});

it('partir d’un exemple remplace les pièces sans rien enregistrer', async () => {
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    fireEvent.change(within(dialog).getByLabelText(/^Partir d’un exemple/), { target: { value: 'simple' } });
    expect(dialog.querySelector('.notice code')!.textContent).toBe('00001');
    expect(fixture.codification.saveModel).not.toHaveBeenCalled();
});

it('changer le type d’une pièce efface le texte et le nombre de chiffres de l’ancien type', async () => {
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    fireEvent.change(within(dialog).getByLabelText('Type de la pièce 1'), { target: { value: 'COMPTEUR' } });
    expect((within(dialog).getByLabelText('Chiffres du compteur de la pièce 1') as HTMLInputElement).value).toBe('4');
    fireEvent.change(within(dialog).getByLabelText('Type de la pièce 1'), { target: { value: 'CLASSEMENT' } });
    expect(within(dialog).queryByLabelText('Chiffres du compteur de la pièce 1')).toBeNull();
    expect(within(dialog).queryByLabelText('Texte de la pièce 1')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.codification.saveModel).toHaveBeenCalled());
    expect(fixture.codification.saveModel.mock.calls[0]![1].segments[0]).toEqual({ type: 'CLASSEMENT' });
});

it('un refus du serveur est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.codification.saveModel.mockRejectedValue(new Error('Le modèle doit contenir un compteur.'));
    render(<CodificationPage />);
    const dialog = await openDefine('Définir un modèle pour les documents');
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Mon libellé' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Le modèle doit contenir un compteur.')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Libellé/) as HTMLInputElement).value).toBe('Mon libellé');
    expect(screen.getByRole('dialog')).toBeTruthy();
});

it('retirer un modèle demande confirmation, annuler ne retire rien, confirmer envoie l’institution avec une clé et relit la liste', async () => {
    render(<CodificationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer le modèle des dossiers' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/redeviennent libres/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.codification.removeModel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le modèle des dossiers' }));
    dialog = await screen.findByRole('dialog');
    fixture.codification.models.mockClear();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer le modèle' }));
    await waitFor(() => expect(fixture.codification.removeModel).toHaveBeenCalledWith('DOSSIER', INSTITUTION, expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.codification.models).toHaveBeenCalled();
});

it('un refus au retrait est dit et la fenêtre reste ouverte', async () => {
    fixture.codification.removeModel.mockRejectedValue(new Error('Retrait impossible'));
    render(<CodificationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer le modèle des dossiers' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer le modèle' }));
    expect(await within(dialog).findByText('Retrait impossible')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
});

// Accessibilité : axe-core voit les noms accessibles, les étiquettes et la structure (le contraste ne se mesure pas sous jsdom).
async function violations(container: HTMLElement): Promise<string[]> {
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    return result.violations.map(v => v.id + ' (' + v.impact + ') : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '));
}
it('la page, l’éditeur de modèle et la confirmation de retrait n’ont aucune violation d’accessibilité', async () => {
    const { container } = render(<CodificationPage />);
    await screen.findByText('Dossiers du greffe');
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le modèle des dossiers' }));
    expect(await violations(await screen.findByRole('dialog'))).toEqual([]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le modèle des dossiers' }));
    expect(await violations(await screen.findByRole('dialog'))).toEqual([]);
});
