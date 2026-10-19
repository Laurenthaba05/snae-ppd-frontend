import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
const INST = '22222222-2222-4222-8222-222222222222';
const TUTELLE = '33333333-3333-4333-8333-333333333333';
const fixture = vi.hoisted(() => ({ epoch: 1, me: null as unknown, allowed: new Set<string>(), records: { transport: { request: vi.fn() } } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: ({ label, onChange, value }: { label: string; onChange: (id: string) => void; value: string }) => <button type="button" onClick={() => onChange('33333333-3333-4333-8333-333333333333')}>{value ? 'Tutelle choisie' : label}</button> }));
import { InstitutionFichePanel } from '../../src/ui/InstitutionFiche';

const empty = { input: { institutionId: INST, adresse: null, telephone: null, courriel: null, siteWeb: null, horaires: null, accessibilite: null, services: null, histoire: null, mandat: null, politiqueAcquisition: null, tutelleInstitutionId: null, version: 0 },
    code: 'AN', nom: 'Archives nationales', sigle: 'AN', tutelleNom: null, version: 0, updatedAt: null };
const filled = { ...empty, input: { ...empty.input, adresse: 'Boulevard du Commerce\nConakry', courriel: 'archives@exemple.gn', histoire: 'Créées en 1960.', tutelleInstitutionId: TUTELLE, version: 3 }, tutelleNom: 'Présidence de la République', version: 3, updatedAt: '2026-10-08T09:00:00Z' };
const request = fixture.records.transport.request;
beforeEach(() => { fixture.epoch += 1; fixture.allowed = new Set(['ARCHIVAL_DESCRIPTION_MANAGE']); request.mockReset(); });

it('une fiche vide le dit, et le droit de décrire permet de la renseigner', async () => {
    request.mockResolvedValue(empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    expect(await screen.findByText('Aucune zone renseignée.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renseigner la fiche' })).toBeTruthy();
    expect(request).toHaveBeenCalledWith(`/archives/institutions/${INST}/fiche`, expect.anything());
    expect(screen.getAllByText('Non renseigné').length).toBeGreaterThan(5);
});

it('affiche les zones renseignées, la tutelle par son nom et la date de mise à jour', async () => {
    request.mockResolvedValue(filled);
    render(<InstitutionFichePanel institutionId={INST} />);
    expect(await screen.findByText('Présidence de la République')).toBeTruthy();
    expect(screen.getByText(/4 zones renseignées sur 30/)).toBeTruthy();
    expect(screen.getByText(/Dernière mise à jour le/)).toBeTruthy();
    expect(screen.getByText(/Boulevard du Commerce/)).toBeTruthy(); expect(screen.getByText('Créées en 1960.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier la fiche' })).toBeTruthy();
    expect(document.body.textContent).not.toContain(TUTELLE);
});

it('sans droit de décrire ni d’administrer l’institution, la fiche se lit sans bouton de modification', async () => {
    fixture.allowed = new Set();
    request.mockResolvedValue(filled);
    render(<InstitutionFichePanel institutionId={INST} />);
    await screen.findByText('Présidence de la République');
    expect(screen.queryByRole('button', { name: 'Modifier la fiche' })).toBeNull();
});

it('l’administration de l’institution suffit aussi pour la renseigner', async () => {
    fixture.allowed = new Set(['IAM_INSTITUTION_MANAGE']);
    request.mockResolvedValue(empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    expect(await screen.findByRole('button', { name: 'Renseigner la fiche' })).toBeTruthy();
});

it('l’identifiant du service (ISIL) et le pays se saisissent, se contrôlent et partent à la forme normale', async () => {
    request.mockImplementation(async (_path: string, options: { method?: string }) => options?.method === 'PUT' ? { ...filled, version: 1 } : empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renseigner la fiche' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText(/^Identifiant du service/), { target: { value: 'ANG' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('forme ISIL attendue'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Identifiant du service/), { target: { value: 'FR-ANG' } });
    fireEvent.change(within(dialog).getByLabelText(/^Pays/), { target: { value: 'gn' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('ne correspond pas au pays'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Identifiant du service/), { target: { value: 'GN-ANG' } });
    expect(within(dialog).queryByRole('alert')).toBeNull(); expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await screen.findByText('Fiche enregistrée.');
    const put = request.mock.calls.find(c => (c[1] as { method?: string }).method === 'PUT')!;
    expect((put[1] as { body: Record<string, unknown> }).body).toMatchObject({ codePays: 'GN', identifiantService: 'GN-ANG' });
});

it('les zones ISDIAH de description, d’accès et de contrôle se saisissent et partent avec leur état de rédaction', async () => {
    request.mockImplementation(async (_path: string, options: { method?: string }) => options?.method === 'PUT' ? { ...filled, version: 1 } : empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renseigner la fiche' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Identification', 'Contact', 'Description du service', 'Accès et services', 'Contrôle de la fiche']);
    fireEvent.change(within(dialog).getByLabelText(/^Formes parallèles du nom/), { target: { value: 'National Archives of Guinea' } });
    fireEvent.change(within(dialog).getByLabelText(/^Structure administrative/), { target: { value: 'Direction, trois services' } });
    fireEvent.change(within(dialog).getByLabelText(/^Conditions d’accès et d’utilisation/), { target: { value: 'Carte de lecteur' } });
    fireEvent.change(within(dialog).getByLabelText(/^Niveau de détail/), { target: { value: 'PARTIEL' } });
    fireEvent.change(within(dialog).getByLabelText(/^Langues de la fiche/), { target: { value: 'fr+en' } });
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText(/^État de rédaction/), { target: { value: 'VALIDEE' } });
    expect(within(dialog).getByRole('alert').textContent).toBe('Une fiche validée exige : identifiant du service, adresse, horaires d’ouverture.'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Identifiant du service/), { target: { value: 'GN-ANG' } });
    fireEvent.change(within(dialog).getByLabelText(/^Adresse/), { target: { value: 'Conakry' } });
    fireEvent.change(within(dialog).getByLabelText(/^Horaires d’ouverture/), { target: { value: '8 h – 16 h' } });
    expect(within(dialog).queryByRole('alert')).toBeNull(); expect(save().disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Langues de la fiche/), { target: { value: 'français' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('codes de langue ISO 639'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Langues de la fiche/), { target: { value: 'fr+en' } });
    fireEvent.click(save());
    await screen.findByText('Fiche enregistrée.');
    const put = request.mock.calls.find(c => (c[1] as { method?: string }).method === 'PUT')!;
    expect((put[1] as { body: unknown }).body).toMatchObject({ formesParalleles: 'National Archives of Guinea', structure: 'Direction, trois services', conditionsAcces: 'Carte de lecteur', niveauDetail: 'PARTIEL',
        langues: 'fr+en', statut: 'VALIDEE', identifiantService: 'GN-ANG', adresse: 'Conakry', horaires: '8 h – 16 h' });
});

it('montre l’état de rédaction en toutes lettres et les dates de première saisie et de mise à jour', async () => {
    request.mockResolvedValue({ ...filled, createdAt: '2026-09-01T09:00:00Z', input: { ...filled.input, statut: 'A_RELIRE', niveauDetail: 'COMPLET' } });
    render(<InstitutionFichePanel institutionId={INST} />);
    await screen.findByText('Présidence de la République');
    expect(screen.getByText('À relire')).toBeTruthy(); expect(screen.getByText('Complet')).toBeTruthy();
    expect(screen.getByText(/Première saisie le/)).toBeTruthy(); expect(screen.getByText(/Dernière mise à jour le/)).toBeTruthy();
});

it('enregistre la fiche avec sa version, les zones vides absentes et la tutelle choisie, puis relit la fiche', async () => {
    request.mockImplementation(async (_path: string, options: { method?: string }) => options?.method === 'PUT' ? { ...filled, version: 1 } : empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renseigner la fiche' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Adresse/), { target: { value: 'Conakry, Kaloum' } });
    fireEvent.change(within(dialog).getByLabelText(/^Courriel/), { target: { value: ' archives@exemple.gn ' } });
    fireEvent.click(within(dialog).getByText('Choisir l’institution de tutelle'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Fiche enregistrée.');
    const put = request.mock.calls.find(c => (c[1] as { method?: string }).method === 'PUT')!;
    expect(put[0]).toBe(`/archives/institutions/${INST}/fiche`);
    expect((put[1] as { idempotencyKey: string }).idempotencyKey).toBeTruthy();
    const body = (put[1] as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({ institutionId: INST, adresse: 'Conakry, Kaloum', courriel: 'archives@exemple.gn', tutelleInstitutionId: TUTELLE, version: 0 });
    // Les zones laissées vides partent absentes (null), pas en chaîne vide.
    const filledKeys = ['institutionId', 'adresse', 'courriel', 'tutelleInstitutionId', 'version'];
    expect(Object.entries(body).filter(([k]) => !filledKeys.includes(k)).every(([, v]) => v === null)).toBe(true);
    await waitFor(() => expect(request.mock.calls.filter(c => (c[1] as { method?: string }).method !== 'PUT').length).toBe(2));   // relue après l’enregistrement
});

it('un courriel ou un site mal formé bloque l’enregistrement avec le motif', async () => {
    request.mockResolvedValue(empty);
    render(<InstitutionFichePanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renseigner la fiche' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Courriel/), { target: { value: 'pas-un-courriel' } });
    fireEvent.change(within(dialog).getByLabelText(/^Site web/), { target: { value: 'ftp://exemple.gn' } });
    const alert = within(dialog).getByRole('alert');
    expect(alert.textContent).toContain('Courriel : adresse invalide.'); expect(alert.textContent).toContain('Site web');
    expect((within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
});

it('un refus du serveur (fiche modifiée entre-temps) s’affiche et la fenêtre reste ouverte', async () => {
    request.mockImplementation(async (_path: string, options: { method?: string }) => {
        if (options?.method === 'PUT') throw new ApiError(409, 'ARCHIVAL_CONFLICT', 'La fiche a été modifiée. Rechargez-la avant de l’enregistrer.');
        return filled;
    });
    render(<InstitutionFichePanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la fiche' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/La fiche a été modifiée/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
});

it('une lecture refusée est expliquée avec la possibilité de réessayer', async () => {
    request.mockRejectedValue(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.'));
    render(<InstitutionFichePanel institutionId={INST} />);
    expect(await screen.findByText('Accès refusé.')).toBeTruthy();
});
