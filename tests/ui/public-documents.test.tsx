import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PublicDocumentsApi } from '../../src/api/publicDocuments';
import { PublicDocumentsPage, PublicDocumentPage } from '../../src/portal/PublicDocuments';
import { portalRoute } from '../../src/portal/PortalApp';
const DOC = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
vi.mock('../../src/portal/context', () => ({ usePortal: () => ({ reader: null, expired: vi.fn() }) }));
beforeEach(() => { history.replaceState(null, '', '/portail/documents/' + DOC); URL.createObjectURL = vi.fn(() => 'blob:recipe'); URL.revokeObjectURL = vi.fn(); });
function client() { return {
    document: vi.fn().mockResolvedValue({ document: { id: DOC, title: 'Recette scanner', reference: 'RECETTE' }, files: [{ id: FILE, filename: 'recette.pdf', mediaType: 'application/pdf', size: 179500 }] }),
    reading: vi.fn().mockResolvedValue({ pageCount: 3, freePageCount: 1, previewPercent: 20, fullAccess: false, downloadAllowed: false }),
    image: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
    layout: vi.fn().mockResolvedValue({ layout: { resultId: DOC, pageNumber: 1, unit: 'pixel', width: 100, height: 150, truncated: false, words: [{ text: 'ALPHA', x: 10, y: 20, width: 30, height: 10, confidence: 95, line: 1 }] } }),
    offer: vi.fn().mockResolvedValue({ tariff: null, currency: 'GNF', providers: [{ code: 'ORANGE_MONEY', label: 'Orange Money', available: false }, { code: 'PAYCARD', label: 'PayCard', available: false }] })
}; }
it('la recherche propose les pages du document et conserve le mot dans le lien', async () => {
    const api = { list: vi.fn().mockResolvedValue({ items: [{ id: DOC, title: 'Recette scanner', reference: 'RECETTE', matches: [{ fileId: FILE, page: 3 }] }], hasMore: true }) };
    render(<PublicDocumentsPage client={api as unknown as PublicDocumentsApi} />);
    await screen.findByRole('link', { name: 'Recette scanner' });
    fireEvent.change(screen.getByLabelText('Rechercher un document'), { target: { value: 'CHARLIE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('CHARLIE', 0, expect.any(AbortSignal)));
    const link = await screen.findByRole('link', { name: 'Voir « CHARLIE » — page 3' });
    expect(link.getAttribute('href')).toContain('page=3'); expect(link.getAttribute('href')).toContain('q=CHARLIE'); expect(link.getAttribute('href')).toContain('file=' + FILE);
});
it('ALPHA ouvre le document original sans exposer les outils OCR ni charger le PDF complet', async () => {
    history.replaceState(null, '', '/portail/documents/' + DOC + '?file=' + FILE + '&page=1&q=ALPHA');
    const api = client(); render(<PublicDocumentPage id={DOC} client={api as unknown as PublicDocumentsApi} />);
    const img = await screen.findByAltText('Aperçu du document, page 1');
    Object.defineProperty(img, 'naturalWidth', { value: 100 }); Object.defineProperty(img, 'naturalHeight', { value: 150 }); fireEvent.load(img);
    expect(api.layout).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /OCR/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mot 1 : ALPHA' })).toBeNull();
    expect(api.image).toHaveBeenCalledWith(DOC, FILE, 1, false, expect.any(AbortSignal));
    expect(screen.queryByRole('link', { name: /Télécharger/ })).toBeNull();
});
it.each([[2, 'BRAVO'], [3, 'CHARLIE']])('la page %s reservee ne demande ni image ni positions', async (page, word) => {
    history.replaceState(null, '', '/portail/documents/' + DOC + '?file=' + FILE + '&page=' + page + '&q=' + word);
    const api = client(); render(<PublicDocumentPage id={DOC} client={api as unknown as PublicDocumentsApi} />);
    await screen.findByRole('region', { name: 'Lecture intégrale réservée' });
    expect(api.image).not.toHaveBeenCalled(); expect(api.layout).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Créer un compte' }).getAttribute('href')).toContain('retour=');
    await screen.findByText('Le tarif de ce type de document n’a pas encore été publié par la direction.');
    expect(screen.getByRole('button', { name: 'Payer avec Orange Money' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Payer avec PayCard' }).hasAttribute('disabled')).toBe(true);
});
it('une page inexistante ne charge pas une autre page', async () => {
    history.replaceState(null, '', '/portail/documents/' + DOC + '?page=99');
    const api = client(); render(<PublicDocumentPage id={DOC} client={api as unknown as PublicDocumentsApi} />);
    await screen.findByText('Cette page n’existe pas.'); expect(api.image).not.toHaveBeenCalled();
});
it('le client omet les credentials anonymes et limite le cookie lecteur aux routes portail', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const api = new PublicDocumentsApi(fetcher);
    await api.list('ALPHA', 0); expect(fetcher.mock.calls[0][1].credentials).toBe('omit'); expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    await api.reading(DOC, FILE, true); expect(fetcher.mock.calls[1][0]).toContain('/api/v1/portal/public-documents/'); expect(fetcher.mock.calls[1][1].credentials).toBe('same-origin');
    fetcher.mockResolvedValue(new Response('', { status: 402 })); await expect(api.image(DOC, FILE, 2, false)).rejects.toThrow(/paiement/);
});
it('les routes publiques acceptent les bonnes adresses seulement', () => {
    expect(portalRoute('/portail/documents')).toEqual({ screen: 'documents-publics' });
    expect(portalRoute('/portail/documents/' + DOC)).toEqual({ screen: 'document-public', id: DOC });
    expect(portalRoute('/portail/documents/' + DOC + '/extra')).toEqual({ screen: 'invalide' });
});
