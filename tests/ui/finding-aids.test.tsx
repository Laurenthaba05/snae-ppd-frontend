import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PortalApi } from '../../src/api/portal';
import type { FindingAidCandidate, FindingAidPreview, FindingAidPublication, PublicFindingAid, PublicNode } from '../../src/core/findingAids';
import { ApiError } from '../../src/core/http';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const ROOT = '00000000-0000-4000-8000-0000000000a1';
const SERIE = '00000000-0000-4000-8000-0000000000a2';
const PUB = '00000000-0000-4000-8000-0000000000c1';

// ---------------------------------------------------------------- portail public
const portal = { me: vi.fn(), subscriptions: vi.fn(), accessRequests: vi.fn(), findingAids: vi.fn(), findingAidNode: vi.fn(), plans: vi.fn(), termsVersion: vi.fn() };
import { PortalApp, portalRoute } from '../../src/portal/PortalApp';

const aid = (over: Partial<PublicFindingAid> = {}): PublicFindingAid => ({ id: ROOT, institutionName: 'Archives nationales', code: 'FONDS-1', title: 'Fonds des registres civils', level: 'FONDS',
    dateLabel: '1900–1960', extent: '12 boîtes', producerName: 'Ministère de l’Intérieur', summary: 'Registres d’état civil.', publishedAt: '2026-10-01T08:00:00Z', ...over });
const node = (over: Partial<PublicNode> = {}): PublicNode => ({ id: ROOT, rootId: ROOT, code: 'FONDS-1', title: 'Fonds des registres civils', level: 'FONDS', institutionName: 'Archives nationales',
    producerName: 'Ministère de l’Intérieur', fields: { scopeContent: 'Registres de naissances et de décès.', dateStart: '1900-01-01', dateEnd: '1960-12-31', accessConditions: 'Libre accès.' },
    path: [], children: [{ id: SERIE, code: 'S-1', title: 'Série des naissances', level: 'SERIE', dateLabel: '1900–1930', extent: null, childCount: 2 }], hasMoreChildren: false, page: 0, ...over });
const open = (path: string) => { window.history.pushState(null, '', path); return render(<PortalApp api={portal as unknown as PortalApi} />); };

beforeEach(() => {
    for (const fn of Object.values(portal)) fn.mockReset();
    portal.me.mockRejectedValue(new ApiError(401, 'PORTAL_AUTH_REQUIRED', 'Connectez-vous pour continuer.'));
    portal.subscriptions.mockResolvedValue([]);
    portal.accessRequests.mockResolvedValue([]);
    portal.plans.mockResolvedValue([]);
    portal.termsVersion.mockResolvedValue({ version: '1' });
    portal.findingAids.mockResolvedValue([aid()]);
    portal.findingAidNode.mockResolvedValue(node());
});

it('les adresses des inventaires se reconnaissent sans navigateur', () => {
    expect(portalRoute('/portail/inventaires')).toEqual({ screen: 'inventaires' });
    expect(portalRoute(`/portail/inventaires/${ROOT}/notices/${SERIE}`)).toEqual({ screen: 'inventaire-notice', id: SERIE });
    expect(portalRoute('/portail/inventaires/pas-un-uuid/notices/' + SERIE)).toEqual({ screen: 'invalide' });
    expect(portalRoute('/portail/inventaires/' + ROOT)).toEqual({ screen: 'inconnu' });
});

it('le public parcourt la liste des inventaires publiés, sans compte', async () => {
    open('/portail/inventaires');
    expect(await screen.findByRole('heading', { name: 'Fonds des registres civils' })).toBeTruthy();
    expect(screen.getByText(/Fonds · Archives nationales · 1900–1960 · 12 boîtes/)).toBeTruthy();
    expect(screen.getByText('Producteur : Ministère de l’Intérieur')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Fonds des registres civils' });
    expect(link.getAttribute('href')).toBe(`/portail/inventaires/${ROOT}/notices/${ROOT}`);
});

it('une liste vide dit qu’aucun inventaire n’est publié', async () => {
    portal.findingAids.mockResolvedValue([]);
    open('/portail/inventaires');
    expect(await screen.findByText('Aucun inventaire publié')).toBeTruthy();
});

it('une notice montre sa description, son contenu et ses exports, sans élément interne', async () => {
    open(`/portail/inventaires/${ROOT}/notices/${ROOT}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Fonds des registres civils' })).toBeTruthy();
    expect(screen.getByText('Registres de naissances et de décès.')).toBeTruthy();
    expect(screen.getByText('1900–1960')).toBeTruthy();
    expect(screen.getByText('Libre accès.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Série des naissances' }).getAttribute('href')).toBe(`/portail/inventaires/${ROOT}/notices/${SERIE}`);
    expect(screen.getByText(/2 sous-niveaux/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'RiC-O (JSON-LD)' }).getAttribute('href')).toBe(`/api/v1/portal/inventaires/notices/${ROOT}/ric-o`);
    expect(screen.getByRole('link', { name: 'Dublin Core (XML)' }).getAttribute('href')).toBe(`/api/v1/portal/inventaires/notices/${ROOT}/dc`);
    expect(document.body.textContent).not.toMatch(/appraisal|archivistNote|DUA/);
    expect(portal.findingAidNode).toHaveBeenCalledWith(ROOT, 0, expect.anything());
});

it('une notice non publique est introuvable', async () => {
    portal.findingAidNode.mockRejectedValue(new ApiError(404, 'FINDING_AID_NOT_FOUND', 'Instrument de recherche introuvable.'));
    open(`/portail/inventaires/${ROOT}/notices/${SERIE}`);
    expect(await screen.findByText('Instrument de recherche introuvable.')).toBeTruthy();
});

it('le fil d’Ariane remonte jusqu’au fonds', async () => {
    portal.findingAidNode.mockResolvedValue(node({ id: SERIE, title: 'Série des naissances', level: 'SERIE', code: 'S-1', children: [],
        path: [{ id: ROOT, code: 'FONDS-1', title: 'Fonds des registres civils', level: 'FONDS' }] }));
    open(`/portail/inventaires/${ROOT}/notices/${SERIE}`);
    const crumbs = await screen.findByRole('navigation', { name: 'Fil d’Ariane' });
    expect(within(crumbs).getByRole('link', { name: 'Instruments de recherche' })).toBeTruthy();
    expect(within(crumbs).getByRole('link', { name: 'Fonds des registres civils' }).getAttribute('href')).toBe(`/portail/inventaires/${ROOT}/notices/${ROOT}`);
    expect(within(crumbs).getByText('Série des naissances').getAttribute('aria-current')).toBe('page');
});

// ---------------------------------------------------------------- personnel
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    dissemination: { oaiStatus: vi.fn(), authority: vi.fn(), identifiers: vi.fn(), findingAids: vi.fn(), findingAidCandidates: vi.fn(), findingAidPreview: vi.fn(), publishFindingAid: vi.fn(), retireFindingAid: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { FindingAidsPanel } from '../../src/ui/FindingAids';
import { DisseminationSection } from '../../src/ui/Dissemination';

const publication = (over: Partial<FindingAidPublication> = {}): FindingAidPublication => ({ id: PUB, descriptionId: ROOT, code: 'FONDS-1', title: 'Fonds des registres civils', level: 'FONDS',
    publishedAt: '2026-10-01T08:00:00Z', publishedByName: 'Awa Camara', retiredAt: null, retireReason: null, retiredByName: null, visibleNodes: 3, totalNodes: 6, ...over });
const candidate = (): FindingAidCandidate => ({ descriptionId: ROOT, code: 'FONDS-2', title: 'Fonds des cartes', level: 'FONDS', visibleNodes: 2, totalNodes: 2 });
const preview = (over: Partial<FindingAidPreview> = {}): FindingAidPreview => ({ descriptionId: ROOT, code: 'FONDS-2', title: 'Fonds des cartes', level: 'FONDS', eligible: true, problems: [],
    totalNodes: 6, visibleNodes: 3, hiddenNotPublic: 1, hiddenNotValidated: 1, alreadyPublished: false, ...over });

function staff() {
    fixture.epoch += 1;
    fixture.allowed = new Set(['FINDING_AID_PUBLISH']);
    for (const fn of Object.values(fixture.dissemination)) fn.mockReset();
    fixture.dissemination.findingAids.mockResolvedValue([publication()]);
    fixture.dissemination.findingAidCandidates.mockResolvedValue([candidate()]);
    fixture.dissemination.findingAidPreview.mockResolvedValue(preview());
}

it('le personnel voit les instruments publiés par leur titre, avec ce que le public en voit', async () => {
    staff();
    render(<FindingAidsPanel institutionId={INST} />);
    const row = (await screen.findByText('Fonds des registres civils')).closest('tr')!;
    expect(within(row).getByText('3 notices visibles sur 6')).toBeTruthy();
    expect(within(row).getByText(/par Awa Camara/)).toBeTruthy();
    expect(within(row).getByText('Publié')).toBeTruthy();
    expect(document.body.textContent).not.toContain(PUB);
});

it('publie un fonds après avoir vu l’aperçu, et ne laisse pas publier ce qui n’est pas éligible', async () => {
    staff();
    fixture.dissemination.publishFindingAid.mockResolvedValue(publication());
    render(<FindingAidsPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier un instrument de recherche' }));
    const dialog = await screen.findByRole('dialog');
    const select = await within(dialog).findByLabelText(/^Fonds ou niveau/);
    fireEvent.change(select, { target: { value: ROOT } });
    expect(await within(dialog).findByText(/3 notices visibles sur 6 au public/)).toBeTruthy();
    expect(within(dialog).getByText(/1 notice non publique restent masquée/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publier sur le portail' }));
    await waitFor(() => expect(fixture.dissemination.publishFindingAid).toHaveBeenCalledWith(ROOT, expect.any(String)));
});

it('une notice non éligible se voit refusée avec ses raisons', async () => {
    staff();
    fixture.dissemination.findingAidPreview.mockResolvedValue(preview({ eligible: false, problems: ['La notice n’est pas validée : seul un état de rédaction « validée » peut être publié.'] }));
    render(<FindingAidsPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier un instrument de recherche' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/^Fonds ou niveau/), { target: { value: ROOT } });
    expect(await within(dialog).findByText(/n’est pas validée/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Publier sur le portail' }) as HTMLButtonElement).disabled).toBe(true);
});

it('retire un instrument avec un motif', async () => {
    staff();
    fixture.dissemination.retireFindingAid.mockResolvedValue(publication({ retiredAt: '2026-10-05T08:00:00Z', retireReason: 'Fonds en cours de reclassement' }));
    render(<FindingAidsPanel institutionId={INST} />);
    const row = (await screen.findByText('Fonds des registres civils')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Fonds en cours de reclassement' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer du portail' }));
    await waitFor(() => expect(fixture.dissemination.retireFindingAid).toHaveBeenCalledWith(PUB, 'Fonds en cours de reclassement', expect.any(String)));
});

it('la section de diffusion montre la publication à qui la détient, même sans lecture de la diffusion', async () => {
    staff();
    fixture.dissemination.oaiStatus.mockResolvedValue({ enabled: false, configured: false, problems: [], repositoryIdentifier: '', repositoryName: '', endpoint: '', pageSize: 100 });
    render(<DisseminationSection />);
    expect(await screen.findByRole('region', { name: 'Instruments de recherche publiés' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Dépôt OAI-PMH' })).toBeNull();
    expect(fixture.dissemination.oaiStatus).not.toHaveBeenCalled();
});
