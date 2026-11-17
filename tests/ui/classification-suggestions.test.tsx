import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ClassificationSuggestionsPanel, ClassificationKeywordsButton } from '../../src/ui/ClassificationSuggestions';
import { ClassificationApi } from '../../src/api/classification';
const fixture = vi.hoisted(() => ({ epoch: 1, classification: { suggestions: vi.fn(), acceptSuggestion: vi.fn(), keywords: vi.fn(), saveKeywords: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
const ID = '11111111-1111-4111-8111-111111111111';
const NODE = '22222222-2222-4222-8222-222222222222';
const result = { revision: 'a'.repeat(64), currentNodeId: null, ocrResults: 3, unvalidatedResults: 1, ocrPending: false, limited: false,
    candidates: [{ nodeId: NODE, code: 'FIN', label: 'Marchés publics', score: 100, matchedTerms: ['marchés publics'] }] };
beforeEach(() => { vi.clearAllMocks(); fixture.epoch++; fixture.classification.suggestions.mockResolvedValue(result); fixture.classification.acceptSuggestion.mockResolvedValue(undefined); });
it('propose sans écriture puis exige un choix et un motif explicites', async () => {
    const changed = vi.fn(); render(<ClassificationSuggestionsPanel kind="documents" id={ID} canAccept onChanged={changed} />);
    await screen.findByText('FIN · Marchés publics');
    expect(fixture.classification.acceptSuggestion).not.toHaveBeenCalled();
    expect(screen.getByText(/ne sont pas encore validés/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir cette rubrique' }));
    expect((screen.getByRole('button', { name: 'Valider le classement' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motif de validation'), { target: { value: 'Vérifié sur les trois pages' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider le classement' }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(fixture.classification.acceptSuggestion).toHaveBeenCalledWith('documents', ID, { nodeId: NODE, revision: result.revision, reason: 'Vérifié sur les trois pages' });
});
it('un lecteur voit les propositions sans action de validation', async () => {
    render(<ClassificationSuggestionsPanel kind="dossiers" id={ID} canAccept={false} onChanged={vi.fn()} />);
    await screen.findByText('FIN · Marchés publics');
    expect(screen.queryByRole('button', { name: 'Choisir cette rubrique' })).toBeNull();
});
it('signale une analyse partielle et une absence de correspondance', async () => {
    fixture.classification.suggestions.mockResolvedValue({ ...result, limited: true, candidates: [] });
    render(<ClassificationSuggestionsPanel kind="documents" id={ID} canAccept onChanged={vi.fn()} />);
    await screen.findByText(/Analyse partielle/); expect(screen.getByText(/Aucune correspondance/)).toBeTruthy();
});
it('enregistre les expressions avec la version de la rubrique', async () => {
    fixture.classification.keywords.mockResolvedValue({ keywords: ['budget'], version: 7 }); fixture.classification.saveKeywords.mockResolvedValue({});
    render(<ClassificationKeywordsButton id={NODE} />); fireEvent.click(screen.getByText('Expressions de classement'));
    const input = await screen.findByLabelText(/Une expression par ligne/);
    fireEvent.change(input, { target: { value: 'budget\nmarchés publics' } }); fireEvent.click(screen.getByText('Enregistrer les expressions'));
    await waitFor(() => expect(fixture.classification.saveKeywords).toHaveBeenCalledWith(NODE, ['budget', 'marchés publics'], 7));
});
it('raccorde les quatre opérations au contrat backend', async () => {
    const request = vi.fn().mockResolvedValue({}); const api = new ClassificationApi({ request });
    await api.suggestions('documents', ID); await api.acceptSuggestion('documents', ID, { nodeId: NODE, revision: result.revision, reason: 'Validé' });
    await api.keywords(NODE); await api.saveKeywords(NODE, ['budget'], 3);
    expect(request.mock.calls.map(c => c[0])).toEqual([`/classification/suggestions/documents/${ID}`, `/classification/suggestions/documents/${ID}/accept`, `/classification/nodes/${NODE}/keywords`, `/classification/nodes/${NODE}/keywords`]);
});
