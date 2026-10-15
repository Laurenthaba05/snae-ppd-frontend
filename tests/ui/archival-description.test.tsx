import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ArchivesApi, commandKey, flattenDescriptions, type DescriptionView } from '../../src/api/archives';
const session = vi.hoisted(() => ({ epoch: 1, me: null, demo: false, records: { transport: { request: vi.fn() } } }));
const workspace = vi.hoisted(() => ({ scope: { institutionId: '11111111-1111-4111-8111-111111111111' as string | null } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => workspace }));
vi.mock('../../src/core/policy', () => ({ can: () => true }));
import { ArchiveImport, ArchivalDescriptionPage } from '../../src/pages/ArchivalDescription';
const institution = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { session.records.transport.request.mockReset(); workspace.scope.institutionId = institution; });
function file(text: string) { const f = new File([text], 'fonds.csv', { type: 'text/csv' }); Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer }); return f; }
it('refuse de lancer une lecture globale sans institution', () => {
    workspace.scope.institutionId = null; render(<ArchivalDescriptionPage />);
    expect(screen.getByText(/Sélectionnez une institution/)).toBeTruthy(); expect(session.records.transport.request).not.toHaveBeenCalled();
});
it('conserve la clé de la même intention et la renouvelle si le contenu change', () => {
    const one = commandKey(null, { title: 'Un' }); expect(commandKey(one, { title: 'Un' }).key).toBe(one.key); expect(commandKey(one, { title: 'Deux' }).key).not.toBe(one.key);
});
it('ordonne les descriptions par parent sans boucler sur des données incohérentes', () => {
    const row = (id: string, parent: string | null): DescriptionView => ({ id, input: { institutionId: institution, code: id, title: id, level: parent ? 'SERIE' : 'FONDS', parentId: parent, producerId: null, confidentiality: 'INTERNE', documentId: null, dossierId: null, details: {} }, version: 0, updatedAt: '' });
    const tree = flattenDescriptions([row('C', 'A'), row('A', null), row('B', 'A'), row('X', 'X')]);
    expect(tree.map(x => [x.row.id, x.depth])).toEqual([['A', 0], ['B', 1], ['C', 1]]);
});
it('ne confirme jamais un import avant un contrôle réussi', async () => {
    const transport = { request: vi.fn().mockResolvedValue({ hash: 'h', rows: 2, issues: [{ row: 3, message: 'Parent inconnu' }] }) };
    render(<ArchiveImport api={new ArchivesApi(transport)} institution={institution} kind="descriptions" onClose={() => {}} onImported={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Fichier CSV'), { target: { files: [file('test')] } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' })); await screen.findByText('Ligne 3 : Parent inconnu'); expect(confirm.disabled).toBe(true);
    expect(transport.request.mock.calls.every(call => call[0].endsWith('/preview'))).toBe(true);
});
it('annule la prévisualisation dès que le fichier change et conserve la clé après une erreur réseau', async () => {
    const transport = { request: vi.fn().mockImplementation((path: string) => path.endsWith('/preview') ? Promise.resolve({ hash: 'h', rows: 1, issues: [] }) : Promise.reject(new Error('Réseau interrompu'))) };
    render(<ArchiveImport api={new ArchivesApi(transport)} institution={institution} kind="descriptions" onClose={() => {}} onImported={() => {}} />);
    const input = screen.getByLabelText('Fichier CSV'); fireEvent.change(input, { target: { files: [file('first')] } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' })); await screen.findByText(/1 notice\(s\) contrôlée/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import' })); await screen.findByText('Réseau interrompu');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import' })); await waitFor(() => expect(transport.request.mock.calls.length).toBe(3));
    const calls = transport.request.mock.calls as unknown as [string, { idempotencyKey: string }][]; expect(calls[1][1].idempotencyKey).toBe(calls[2][1].idempotencyKey);
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false)); fireEvent.change(input, { target: { files: [file('second')] } });
    expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
});
it('garde les opérations utilisables sous StrictMode et les annule à la fermeture', async () => {
    const transport = { request: vi.fn().mockResolvedValue({ hash: 'h', rows: 1, issues: [] }) };
    const view = render(<React.StrictMode><ArchiveImport api={new ArchivesApi(transport)} institution={institution} kind="descriptions" onClose={() => {}} onImported={() => {}} /></React.StrictMode>);
    fireEvent.change(screen.getByLabelText('Fichier CSV'), { target: { files: [file('test')] } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' })); await screen.findByText(/1 notice\(s\) contrôlée/);
    const calls = transport.request.mock.calls as unknown as [string, { signal: AbortSignal }][]; const signal = calls[0][1].signal;
    expect(signal.aborted).toBe(false); view.unmount(); expect(signal.aborted).toBe(true);
});

// ---------- notices d'autorité : champs ISAAR, état de rédaction, relations
const authorityRow = (n: number, name: string, kind: 'COLLECTIVITE' | 'PERSONNE' | 'FAMILLE' = 'COLLECTIVITE', details: Record<string, string> = {}) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`, input: { institutionId: institution, code: `P${n}`, name, kind, actorId: null, details, version: 1 }, version: 1, updatedAt: '2026-10-08T09:00:00Z', createdAt: '2026-09-01T09:00:00Z' });
function serve(authorities: unknown[], relations: unknown[] = []) {
    session.records.transport.request.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
        if (path.startsWith('/archives/descriptions?')) return [];
        if (path.startsWith('/archives/authorities?')) return authorities;
        if (path.startsWith('/archives/relations?')) return relations;
        if (options?.method === 'PUT' || options?.method === 'POST') return authorities[0];
        throw new Error('appel inattendu ' + path);
    });
}
async function showAuthorities() {
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Producteurs et autorités' }));
}
it('la liste des producteurs montre leur état de rédaction et le nombre de leurs relations', async () => {
    serve([authorityRow(1, 'Ministère de l’Énergie', 'COLLECTIVITE', { status: 'VALIDEE' }), authorityRow(2, 'Présidence'), authorityRow(3, 'Mariam Keita', 'PERSONNE', { status: 'A_RELIRE' })],
        [{ id: 'r1', version: 0, updatedAt: '', input: { institutionId: institution, sourceId: '00000000-0000-4000-8000-000000000001', targetId: '00000000-0000-4000-8000-000000000002', type: 'TUTELLE', dateStart: '2018', dateEnd: null, description: null } }]);
    await showAuthorities();
    const rows = (await screen.findAllByRole('row')).slice(1).map(r => r.textContent ?? '');
    expect(rows[0]).toContain('Validée'); expect(rows[0]).toContain('1 relation');
    expect(rows[1]).toContain('Brouillon'); expect(rows[1]).toContain('1 relation');
    expect(rows[2]).toContain('À relire'); expect(rows[2]).toContain('Relations');
});
it('« Relations » ouvre les relations de la notice avec le nom de la notice liée', async () => {
    serve([authorityRow(1, 'Ministère de l’Énergie'), authorityRow(2, 'Présidence')],
        [{ id: 'r1', version: 0, updatedAt: '', input: { institutionId: institution, sourceId: '00000000-0000-4000-8000-000000000001', targetId: '00000000-0000-4000-8000-000000000002', type: 'TUTELLE', dateStart: '2018', dateEnd: null, description: null } }]);
    await showAuthorities();
    fireEvent.click((await screen.findAllByRole('button', { name: '1 relation' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Sous la tutelle de'); expect(dialog.textContent).toContain('Présidence'); expect(dialog.textContent).toContain('depuis 2018');
});
it('un serveur sans relations (404) laisse la liste des producteurs utilisable', async () => {
    session.records.transport.request.mockImplementation(async (path: string) => {
        if (path.startsWith('/archives/descriptions?')) return [];
        if (path.startsWith('/archives/authorities?')) return [authorityRow(1, 'Présidence')];
        throw Object.assign(new (await import('../../src/core/http')).ApiError(404, 'ROUTE_NOT_FOUND', 'Cette opération n’existe pas sur ce serveur.'));
    });
    await showAuthorities();
    expect(await screen.findByText('Présidence')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Relations' }).length).toBe(1);
});
it('l’éditeur de notice d’autorité regroupe les champs ISAAR par zone, avec dates de création et de révision', async () => {
    serve([authorityRow(1, 'Ministère de l’Énergie', 'COLLECTIVITE', { status: 'VALIDEE', mandates: 'Décret D/2018/014' })]);
    await showAuthorities();
    fireEvent.click(await screen.findByRole('button', { name: 'Consulter / modifier' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Identification', 'Description', 'Contrôle de la notice']);
    for (const label of ['Formes parallèles du nom', 'Formes normalisées', 'Identifiants officiels', 'Lieux', 'Statut juridique', 'Textes et mandats', 'Structure interne', 'Contexte général', 'État de rédaction', 'Niveau de détail', 'Règles ou conventions', 'Langues et écritures', 'Notes de mise à jour'])
        expect(within(dialog).getByLabelText(new RegExp('^' + label))).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Textes et mandats/) as HTMLTextAreaElement).value).toBe('Décret D/2018/014');
    expect((within(dialog).getByLabelText(/^État de rédaction/) as HTMLSelectElement).value).toBe('VALIDEE');
    expect(dialog.textContent).toContain('Notice créée le'); expect(dialog.textContent).toContain('dernière révision le');
});
it('une nouvelle notice d’autorité part en brouillon et enregistre les champs ISAAR saisis', async () => {
    serve([authorityRow(1, 'Ministère de l’Énergie')]);
    await showAuthorities();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un producteur' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText(/^État de rédaction/) as HTMLSelectElement).value).toBe('BROUILLON');
    fireEvent.change(within(dialog).getByLabelText('Référence'), { target: { value: 'MIN-NEW' } });
    fireEvent.change(within(dialog).getByLabelText('Nom retenu'), { target: { value: 'Ministère du Plan' } });
    fireEvent.change(within(dialog).getByLabelText(/^Textes et mandats/), { target: { value: 'Décret D/2020/001' } });
    fireEvent.change(within(dialog).getByLabelText(/^Niveau de détail/), { target: { value: 'PARTIEL' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(session.records.transport.request.mock.calls.some(c => (c[1] as { method?: string })?.method === 'POST')).toBe(true));
    const post = session.records.transport.request.mock.calls.find(c => (c[1] as { method?: string })?.method === 'POST')!;
    expect(post[0]).toBe('/archives/authorities');
    expect((post[1] as { body: { details: Record<string, string> } }).body.details).toMatchObject({ status: 'BROUILLON', mandates: 'Décret D/2020/001', detailLevel: 'PARTIEL' });
});


// ---------- notice de description complète (ISAD(G))
const descriptionRow = (n: number, extra: Record<string, unknown> = {}, details: Record<string, string> = {}) => ({
    id: `00000000-0000-4000-8000-0000000001${n}`, input: { institutionId: institution, code: `GN/${n}`, title: `Fonds ${n}`, level: 'FONDS', parentId: null, producerId: null, confidentiality: 'INTERNE', documentId: null, dossierId: null, details, version: 1, ...extra },
    version: 1, updatedAt: '2026-10-08T09:00:00Z', createdAt: '2026-09-01T09:00:00Z' });
function serveDescriptions(descriptions: unknown[], authorities: unknown[] = []) {
    session.records.transport.request.mockImplementation(async (path: string, options?: { method?: string }) => {
        if (path.startsWith('/archives/descriptions?')) return descriptions;
        if (path.startsWith('/archives/authorities?')) return authorities;
        if (path.startsWith('/archives/relations?')) return [];
        if (options?.method === 'PUT' || options?.method === 'POST') return descriptions[0];
        throw new Error('appel inattendu ' + path);
    });
}
it('la liste des descriptions montre l’état de rédaction et les éléments ISAD(G) renseignés, producteur hérité compris', async () => {
    const producer = '00000000-0000-4000-8000-000000000001';
    const fonds = descriptionRow(1, { producerId: producer }, { status: 'VALIDEE', dateLabel: 'vers 1960', extent: '3 boîtes' });
    const serie = descriptionRow(2, { level: 'SERIE', parentId: fonds.id }, { scopeContent: 'Correspondance' });
    serveDescriptions([fonds, serie], [authorityRow(1, 'Ministère')]);
    render(<ArchivalDescriptionPage />);
    const rows = (await screen.findAllByRole('row')).slice(1).map(r => r.textContent ?? '');
    expect(rows[0]).toContain('Validée'); expect(rows[0]).toContain('8 / 26');          // 4 de base + producteur (2) + dates + importance matérielle
    expect(rows[1]).toContain('Brouillon'); expect(rows[1]).toContain('7 / 26');        // 4 de base + producteur hérité (2) + contenu
});
it('l’éditeur de description regroupe les éléments ISAD(G) par zone et propose les dix éléments ajoutés', async () => {
    serveDescriptions([descriptionRow(1, {}, { accruals: 'Versements annuels attendus', extentQuantity: '12,5', extentUnit: 'ML' })]);
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Consulter / modifier' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Identification', 'Contexte', 'Contenu et structure', 'Conditions d’accès et d’utilisation', 'Sources complémentaires', 'Notes et contrôle de la description', 'Description enrichie']);
    for (const label of ['Accroissements', 'Écritures des documents', 'Caractéristiques matérielles', 'Existence et lieu de conservation des originaux', 'Existence et lieu de conservation des copies', 'Unités de description associées', 'Note de publication', 'Note générale', 'Note de l’archiviste', 'Règles ou conventions', 'Nature des dates', 'Support'])
        expect(within(dialog).getByLabelText(new RegExp('^' + label)), label).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Accroissements/) as HTMLTextAreaElement).value).toBe('Versements annuels attendus');
    expect((within(dialog).getByLabelText(/^Importance matérielle : unité/) as HTMLSelectElement).value).toBe('ML');
    expect(dialog.textContent).toContain('Description créée le');
});
it('une quantité sans unité, ou une validation sans dates ni producteur, bloque l’enregistrement avec le motif', async () => {
    serveDescriptions([descriptionRow(1)]);
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une description' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText(/^État de rédaction/) as HTMLSelectElement).value).toBe('BROUILLON');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save().disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Importance matérielle : quantité/), { target: { value: '12,5' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('quantité ET l’unité'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Importance matérielle : unité/), { target: { value: 'ML' } });
    expect(within(dialog).queryByRole('alert')).toBeNull(); expect(save().disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^État de rédaction/), { target: { value: 'VALIDEE' } });
    expect(within(dialog).getByRole('alert').textContent).toBe('Une description validée exige : dates, producteur.'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Dates telles que décrites/), { target: { value: 'vers 1960' } });
    expect(within(dialog).getByRole('alert').textContent).toBe('Une description validée exige : producteur.');
});
it('enregistre les éléments ISAD(G) saisis, quantité et unité comprises', async () => {
    const producer = authorityRow(1, 'Ministère');
    serveDescriptions([descriptionRow(1)], [producer]);
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une description' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Référence'), { target: { value: 'GN/NEW' } });
    fireEvent.change(within(dialog).getByLabelText('Intitulé'), { target: { value: 'Nouveau fonds' } });
    fireEvent.change(within(dialog).getByLabelText('Producteur'), { target: { value: producer.id } });
    fireEvent.change(within(dialog).getByLabelText(/^Importance matérielle : quantité/), { target: { value: '12,5' } });
    fireEvent.change(within(dialog).getByLabelText(/^Importance matérielle : unité/), { target: { value: 'ML' } });
    fireEvent.change(within(dialog).getByLabelText(/^Support/), { target: { value: 'papier' } });
    fireEvent.change(within(dialog).getByLabelText(/^Dates telles que décrites/), { target: { value: 'vers 1960' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nature des dates/), { target: { value: 'ACCUMULATION' } });
    fireEvent.change(within(dialog).getByLabelText(/^Accroissements/), { target: { value: 'Versements annuels' } });
    fireEvent.change(within(dialog).getByLabelText(/^État de rédaction/), { target: { value: 'VALIDEE' } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(session.records.transport.request.mock.calls.some(c => (c[1] as { method?: string })?.method === 'POST')).toBe(true));
    const post = session.records.transport.request.mock.calls.find(c => (c[1] as { method?: string })?.method === 'POST')!;
    expect(post[0]).toBe('/archives/descriptions');
    expect((post[1] as { body: { details: Record<string, string> } }).body.details).toMatchObject({ status: 'VALIDEE', extentQuantity: '12,5', extentUnit: 'ML', medium: 'papier', dateKind: 'ACCUMULATION', accruals: 'Versements annuels', dateLabel: 'vers 1960' });
});

it('enregistre les enrichissements structurés et valide une notice sans champs historiques dupliqués', async () => {
    const producer=authorityRow(1,'Ministère enrichi'); serveDescriptions([], [producer]); render(<ArchivalDescriptionPage/>);
    fireEvent.click(await screen.findByRole('button',{name:'Créer une description'})); const dialog=await screen.findByRole('dialog'); const ui=within(dialog);
    const fill=(label:string,value:string)=>fireEvent.change(ui.getByLabelText(label),{target:{value}});
    fill('Référence','ENR-UI'); fill('Intitulé','Fonds enrichi');
    fireEvent.click(ui.getByRole('button',{name:'Ajouter un identifiant'})); fill('Type d’identifiant','ancienne cote'); fill('Valeur de l’identifiant','AA/1'); fill('Système d’origine','Ancien SI'); fill('URI de l’identifiant','urn:archive:1');
    fireEvent.click(ui.getByRole('button',{name:'Ajouter une date'})); fill('Début structuré','1958'); fill('Fin structurée','1960-10'); fill('Certitude','ESTIMEE');
    fireEvent.click(ui.getByRole('button',{name:'Ajouter un producteur lié'})); fill('Autorité productrice',producer.id); fill('Début de responsabilité','1958');
    fireEvent.click(ui.getByRole('button',{name:'Ajouter un volume'})); fill('Quantité du volume','12,5'); fill('Unité du volume','ML'); fill('Support du volume','papier'); fill('Dimensions','30 cm');
    fireEvent.click(ui.getByRole('button',{name:'Planifier le traitement'})); fill('Plan de traitement','Classer les registres'); fill('Heures prévues','12.5'); fill('Financement du traitement','Budget archives');
    fireEvent.change(ui.getByLabelText(/^État de rédaction/),{target:{value:'VALIDEE'}});
    expect(ui.queryByRole('alert')).toBeNull(); fireEvent.click(ui.getByRole('button',{name:'Enregistrer'}));
    await waitFor(()=>expect(session.records.transport.request.mock.calls.some(c=>(c[1] as {method?:string})?.method==='POST')).toBe(true));
    const body=session.records.transport.request.mock.calls.find(c=>(c[1] as {method?:string})?.method==='POST')![1].body;
    expect(body.enrichment).toMatchObject({identifiers:[{type:'ancienne cote',value:'AA/1',source:'Ancien SI',uri:'urn:archive:1'}],dates:[{start:'1958',end:'1960-10',certainty:'ESTIMEE'}],
        producers:[{authorityId:producer.id,start:'1958'}],extents:[{quantity:'12.5',unit:'ML',medium:'papier',dimensions:'30 cm'}],processing:{plan:'Classer les registres',estimatedHours:12.5,funding:'Budget archives'}});
});
it('refuse une date structurée impossible puis permet de retirer une ligne',async()=>{
    serveDescriptions([]); render(<ArchivalDescriptionPage/>); fireEvent.click(await screen.findByRole('button',{name:'Créer une description'}));
    const ui=within(await screen.findByRole('dialog')); fireEvent.click(ui.getByRole('button',{name:'Ajouter une date'}));
    fireEvent.change(ui.getByLabelText('Début structuré'),{target:{value:'2025-02-29'}});
    expect((ui.getByRole('button',{name:'Enregistrer'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(ui.getByRole('button',{name:'Supprimer la date 1'})); expect(ui.queryByRole('alert')).toBeNull();
});
