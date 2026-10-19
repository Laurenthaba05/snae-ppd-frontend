import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Acquisition et imports : un import ne crée rien avant la confirmation explicite du lot entier (un lot invalide ne se confirme pas), le dépôt des pièces reprend sans doubler un envoi,
// l'extraction ne s'applique jamais sans décision motivée, et une même décision rejouée réutilise sa clé d'idempotence.
const fixture = vi.hoisted(() => ({
    demo: false, epoch: 1,
    records: { transport: {}, uploadContent: vi.fn(), ingestion: vi.fn(), versions: vi.fn(), files: vi.fn() } as unknown,
    scope: { institutionId: 'i1' as string | null, departmentId: null as string | null },
    api: {
        capabilities: vi.fn(), csv: vi.fn(), preview: vi.fn(), import: vi.fn(), commit: vi.fn(), cancelImport: vi.fn(),
        extract: vi.fn(), extraction: vi.fn(), cancelExtraction: vi.fn(), review: vi.fn()
    },
    saveBlob: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/api/acquisition', () => ({
    AcquisitionApi: class {
        capabilities = fixture.api.capabilities; csv = fixture.api.csv; preview = fixture.api.preview; import = fixture.api.import; commit = fixture.api.commit; cancelImport = fixture.api.cancelImport;
        extract = fixture.api.extract; extraction = fixture.api.extraction; cancelExtraction = fixture.api.cancelExtraction; review = fixture.api.review;
    }
}));
vi.mock('../../src/ui/download', () => ({ saveBlob: fixture.saveBlob }));
vi.mock('../../src/ui/ScannerCapture', () => ({ ScannerCapture: () => <div data-testid="scanner" /> }));
vi.mock('../../src/ui/names', () => ({ ScopeName: () => <span>Archives nationales</span> }));
vi.mock('../../src/ui/ArchiveRecordPicker', () => ({ ArchiveRecordPicker: ({ onChange, disabled }: { onChange: (id: string) => void; disabled?: boolean }) => <button disabled={disabled} onClick={() => onChange('doc-1')}>Choisir le document</button> }));
import { AcquisitionPage } from '../../src/pages/Acquisition';

const caps = (over: Record<string, unknown> = {}) => ({ importsEnabled: true, extractionEnabled: true, workerEnabled: true, maxImportBytes: 1000, maxImportRows: 500, ...over });
const row = (n: number, over: Record<string, unknown> = {}) => ({ number: n, values: { reference: 'REF-' + n, titre: 'Registre ' + n }, issues: [] as unknown[], ...over });
const preview = (over: Record<string, unknown> = {}) => ({
    id: 'lot-1', context: { kind: 'DOCUMENTS', institutionId: 'i1', departmentId: null }, sourceSha256: 'sha-abc', state: 'PREVIEW', expiresAt: '2026-10-20T10:00:00Z', valid: true,
    rows: [row(1), row(2)], created: [], ...over
});
const created = [
    { row: 1, reference: 'REF-1', id: 'n1', initialVersionId: 'v1', fileName: 'a.pdf' },
    { row: 2, reference: 'REF-2', id: 'n2', initialVersionId: 'v2', fileName: 'b.pdf' }
];
const csv = (name = 'lot.csv', size = 10) => new File(['x'.repeat(size)], name, { type: 'text/csv' });
const job = (over: Record<string, unknown> = {}) => ({ id: 'x-1', fileId: 'f1', documentId: 'doc-1', state: 'TO_REVIEW', sourceSha256: 'sha-file', documentVersion: 4, options: { ocr: 'AUTO', language: 'fra+eng' }, errorCode: null, review: null,
    result: { technical: { pages: 2 }, text: 'Texte reconnu', pages: [], warnings: ['Texte peu lisible'], candidates: [
        { field: 'title', value: 'Arrêté n° 12', page: 1, evidence: 'ligne 1', source: 'OCR', ruleStrength: 'FORTE', rule: 'r1', requiresReview: true },
        { field: 'documentDate', value: '1953-04-02', page: null, evidence: 'en-tête', source: 'TEXTE', ruleStrength: 'MOYENNE', rule: 'r2', requiresReview: true }] }, ...over });

beforeEach(() => {
    fixture.demo = false; fixture.epoch += 1; fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.records = { transport: {}, uploadContent: vi.fn(), ingestion: vi.fn(), versions: vi.fn().mockResolvedValue([{ id: 'ver-1', number: 1, state: 'ACTIVE', sealed: true }]),
        files: vi.fn().mockResolvedValue([{ id: 'f1', originalFilename: 'scan.pdf', state: 'VALIDATED', scanStatus: 'CLEAN', validatedAt: '2026-10-01T00:00:00Z' }, { id: 'f2', originalFilename: 'suspect.pdf', state: 'QUARANTINED', scanStatus: 'INFECTED', validatedAt: null }]) };
    for (const fn of Object.values(fixture.api)) fn.mockReset();
    fixture.saveBlob.mockReset();
    fixture.api.capabilities.mockResolvedValue(caps());
    fixture.api.csv.mockResolvedValue(new Blob(['csv']));
});
afterEach(() => { vi.useRealTimers(); });

const open = async (tab?: string) => {
    const view = render(<AcquisitionPage />);
    await screen.findByText(/Jusqu’à \d+ lignes par lot|Texte natif d’abord/).catch(() => null);
    if (tab) fireEvent.click(screen.getByRole('button', { name: tab }));
    return view;
};
const analyse = async (file = csv()) => {
    fireEvent.change(screen.getByLabelText('Fichier CSV ou Excel (.xlsx)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le fichier' }));
};

// ---------- la page
it('en démonstration, rien n’est lu et l’écran dit que les parcours exigent le backend', () => {
    fixture.demo = true;
    render(<AcquisitionPage />);
    expect(screen.getByText(/Le mode démonstration n’effectue ni import, ni numérisation, ni extraction/)).toBeTruthy();
    expect(fixture.api.capabilities).not.toHaveBeenCalled();
});

it('sans connexion au backend, la page le dit ; une erreur de capacités propose de relire', async () => {
    fixture.records = null;
    const first = render(<AcquisitionPage />);
    expect(await screen.findByText('Connexion au backend nécessaire.')).toBeTruthy();
    first.unmount();
    fixture.records = { transport: {}, uploadContent: vi.fn(), ingestion: vi.fn(), versions: vi.fn(), files: vi.fn() };
    fixture.api.capabilities.mockRejectedValueOnce(new Error('Capacités indisponibles'));
    render(<AcquisitionPage />);
    expect(await screen.findByText('Capacités indisponibles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText(/Jusqu’à 500 lignes par lot/)).toBeTruthy();
});

it('les trois parcours s’ouvrent par onglets, l’import d’abord', async () => {
    await open();
    expect(screen.getByRole('button', { name: '1 · Importer un tableau' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: '2 · Scanner un document' }));
    expect(screen.getByTestId('scanner')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3 · Extraire et relire' }));
    expect(screen.getByText(/Texte natif d’abord, OCR si nécessaire/)).toBeTruthy();
    expect(screen.queryByTestId('scanner')).toBeNull();
});

// ---------- l'import
it('un import désactivé sur le serveur le dit et ne laisse pas analyser', async () => {
    fixture.api.capabilities.mockResolvedValue(caps({ importsEnabled: false }));
    await open();
    expect(screen.getByText(/L’import est désactivé sur ce serveur/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Fichier CSV ou Excel (.xlsx)'), { target: { files: [csv()] } });
    expect((screen.getByRole('button', { name: 'Analyser le fichier' }) as HTMLButtonElement).disabled).toBe(true);
});

it('l’analyse exige un fichier et une institution (sauf le catalogue national des institutions)', async () => {
    fixture.scope = { institutionId: null, departmentId: null };
    await open();
    const analyseButton = screen.getByRole('button', { name: 'Analyser le fichier' }) as HTMLButtonElement;
    expect(analyseButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Fichier CSV ou Excel (.xlsx)'), { target: { files: [csv()] } });
    expect(analyseButton.disabled).toBe(true);
    expect(screen.getByText(/institution à sélectionner dans l’en-tête/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Éléments à créer'), { target: { value: 'INSTITUTIONS' } });
    fireEvent.change(screen.getByLabelText('Fichier CSV ou Excel (.xlsx)'), { target: { files: [csv()] } });
    expect((screen.getByRole('button', { name: 'Analyser le fichier' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Catalogue national — droits spécifiques requis.')).toBeTruthy();
});

it('un fichier trop volumineux est refusé avant tout envoi', async () => {
    await open();
    await analyse(csv('gros.csv', 2000));
    expect(await screen.findByText('Fichier trop volumineux (5 Mio maximum).')).toBeTruthy();
    expect(fixture.api.preview).not.toHaveBeenCalled();
});

it('l’analyse envoie le fichier avec le type, le séparateur, le périmètre et une clé ; le périmètre d’un département ne porte pas le département', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: 'd1' };
    fixture.api.preview.mockResolvedValue(preview());
    await open();
    fireEvent.change(screen.getByLabelText('Séparateur CSV'), { target: { value: ',' } });
    const file = csv();
    await analyse(file);
    await screen.findByText(/À confirmer · 2 lignes/);
    expect(fixture.api.preview).toHaveBeenCalledWith(file, { kind: 'DOCUMENTS', delimiter: ',', institutionId: 'i1', departmentId: 'd1' }, expect.stringMatching(/^[0-9a-f-]{36}$/));
    fireEvent.change(screen.getByLabelText('Éléments à créer'), { target: { value: 'DEPARTMENTS' } });
    expect(screen.queryByText(/À confirmer · 2 lignes/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Fichier CSV ou Excel (.xlsx)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le fichier' }));
    await waitFor(() => expect(fixture.api.preview).toHaveBeenCalledTimes(2));
    expect(fixture.api.preview.mock.calls[1]![1]).toEqual({ kind: 'DEPARTMENTS', delimiter: ',', institutionId: 'i1' });
});

it('toute modification du choix (type, fichier, séparateur) efface l’aperçu et renouvelle la clé', async () => {
    fixture.api.preview.mockResolvedValue(preview());
    await open();
    await analyse();
    await screen.findByText(/Lot lot-1/);
    const firstKey = fixture.api.preview.mock.calls[0]![2];
    fireEvent.change(screen.getByLabelText('Séparateur CSV'), { target: { value: '\t' } });
    expect(screen.queryByText(/Lot lot-1/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le fichier' }));
    await waitFor(() => expect(fixture.api.preview).toHaveBeenCalledTimes(2));
    expect(fixture.api.preview.mock.calls[1]![2]).not.toBe(firstKey);
});

it('l’aperçu liste les lignes avec leurs anomalies, par pages de vingt-cinq', async () => {
    fixture.api.preview.mockResolvedValue(preview({ valid: false, rows: Array.from({ length: 60 }, (_, i) => row(i + 1, i === 1 ? { issues: [{ row: 2, field: 'date', code: 'DATE_INVALIDE', message: 'format AAAA-MM-JJ attendu' }] } : {})) }));
    await open();
    await analyse();
    expect(await screen.findByText(/À confirmer · 60 lignes/)).toBeTruthy();
    expect(screen.getByText('date : format AAAA-MM-JJ attendu')).toBeTruthy();
    expect(screen.getAllByText('Conforme aux contrôles de l’aperçu')).toHaveLength(24);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Précédente' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    expect(screen.getByText('Page 3')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect((screen.getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(true);
});

it('la création du lot exige la confirmation cochée, et un lot invalide ne se crée jamais', async () => {
    fixture.api.preview.mockResolvedValue(preview({ valid: false }));
    const first = await open();
    await analyse();
    await screen.findByText(/À confirmer/);
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai vérifié le type, le périmètre et les valeurs/ }));
    expect((screen.getByRole('button', { name: 'Créer les 2 éléments' }) as HTMLButtonElement).disabled).toBe(true);
    first.unmount();
    fixture.epoch += 1;
    fixture.api.preview.mockResolvedValue(preview());
    render(<AcquisitionPage />);
    await screen.findByText(/Jusqu’à 500 lignes/);
    await analyse();
    await screen.findByText(/À confirmer/);
    const create = screen.getByRole('button', { name: 'Créer les 2 éléments' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai vérifié le type/ }));
    expect(create.disabled).toBe(false);
});

it('confirmer crée le lot entier avec l’empreinte de l’aperçu, puis annonce les notices créées et propose d’enregistrer les références', async () => {
    const shown = preview();
    fixture.api.preview.mockResolvedValue(shown);
    fixture.api.commit.mockResolvedValue(preview({ state: 'COMMITTED', created }));
    await open();
    await analyse();
    await screen.findByText(/À confirmer/);
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai vérifié le type/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer les 2 éléments' }));
    expect(await screen.findByText('2 notices créées. Les pièces jointes restent à déposer séparément.')).toBeTruthy();
    expect(fixture.api.commit).toHaveBeenCalledWith(shown);
    expect(screen.queryByRole('checkbox', { name: /J’ai vérifié le type/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les références du résultat' }));
    expect(fixture.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'resultat-import.json');
    expect(screen.getByText('Associer les fichiers du lot')).toBeTruthy();
});

it('annuler le lot l’annule côté serveur et retire les boutons de confirmation', async () => {
    fixture.api.preview.mockResolvedValue(preview());
    fixture.api.cancelImport.mockResolvedValue(preview({ state: 'CANCELLED' }));
    await open();
    await analyse();
    await screen.findByText(/À confirmer/);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler ce lot' }));
    expect(await screen.findByText(/Annulé · 2 lignes/)).toBeTruthy();
    expect(fixture.api.cancelImport).toHaveBeenCalledWith('lot-1');
    expect(screen.queryByRole('button', { name: /Créer les/ })).toBeNull();
});

it('un lot d’institutions n’ouvre pas le dépôt des pièces, et une erreur du serveur à l’analyse est dite', async () => {
    fixture.api.preview.mockRejectedValueOnce(new Error('Colonne inconnue'));
    await open();
    await analyse();
    expect(await screen.findByText('Colonne inconnue')).toBeTruthy();
    fixture.api.import.mockResolvedValue(preview({ state: 'COMMITTED', context: { kind: 'INSTITUTIONS', institutionId: null, departmentId: null }, created: [] }));
    fireEvent.change(screen.getByLabelText('Identifiant du lot'), { target: { value: 'lot-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Relire l’état' }));
    expect(await screen.findByText('0 notices créées. Les pièces jointes restent à déposer séparément.')).toBeTruthy();
    expect(fixture.api.import).toHaveBeenCalledWith('lot-9');
    expect(screen.queryByText('Associer les fichiers du lot')).toBeNull();
});

it('le modèle CSV et le rapport des erreurs sont enregistrés sous leur nom', async () => {
    fixture.api.preview.mockResolvedValue(preview());
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Modèle CSV' }));
    await waitFor(() => expect(fixture.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'modele-documents.csv'));
    expect(fixture.api.csv).toHaveBeenCalledWith('templates/DOCUMENTS.csv');
    await analyse();
    await screen.findByText(/À confirmer/);
    fireEvent.click(screen.getByRole('button', { name: 'Rapport des erreurs' }));
    await waitFor(() => expect(fixture.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'erreurs-import.csv'));
    expect(fixture.api.csv).toHaveBeenCalledWith('lot-1/errors.csv');
});

// ---------- le dépôt des pièces
const committed = async () => {
    fixture.api.preview.mockResolvedValue(preview());
    fixture.api.commit.mockResolvedValue(preview({ state: 'COMMITTED', created }));
    await open();
    await analyse();
    await screen.findByText(/À confirmer/);
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai vérifié le type/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer les 2 éléments' }));
    await screen.findByText('Associer les fichiers du lot');
};
const pick = (...names: string[]) => fireEvent.change(screen.getByLabelText('Sélectionner les PDF et images'), { target: { files: names.map(n => new File(['pdf'], n, { type: 'application/pdf', lastModified: 1 })) } });
const deposit = () => fireEvent.click(screen.getByRole('button', { name: 'Déposer / relire les reçus' }));

it('deux fichiers dont les noms ne diffèrent que par la casse sont refusés comme ambigus, sans aucun envoi', async () => {
    await committed();
    pick('a.pdf', 'A.PDF');
    deposit();
    expect(await screen.findByText('Noms de fichiers ambigus : choisissez un seul fichier par nom.')).toBeTruthy();
    expect((fixture.records as { uploadContent: ReturnType<typeof vi.fn> }).uploadContent).not.toHaveBeenCalled();
});

it('le dépôt associe chaque fichier à sa notice par son nom exact, dit ceux qui manquent et garde le reçu', async () => {
    const records = fixture.records as { uploadContent: ReturnType<typeof vi.fn> };
    records.uploadContent.mockResolvedValue({ id: 'r1', status: 'COMPLETED', fileId: 'file-1' });
    await committed();
    expect((screen.getByRole('button', { name: 'Déposer / relire les reçus' }) as HTMLButtonElement).disabled).toBe(true);
    pick('A.pdf');
    deposit();
    expect(await screen.findByText(/Dépôt terminé · reçu r1/)).toBeTruthy();
    expect(records.uploadContent).toHaveBeenCalledTimes(1);
    expect(records.uploadContent).toHaveBeenCalledWith('v1', expect.objectContaining({ name: 'A.pdf' }), 'PIECE_JOINTE', expect.any(String));
    expect(screen.getByText(/Fichier absent de la sélection/)).toBeTruthy();
    deposit();
    await waitFor(() => expect(screen.getAllByText(/Fichier absent de la sélection/)).toHaveLength(1));
    expect(records.uploadContent).toHaveBeenCalledTimes(1);
});

it('un reçu encore en contrôle se relit au lieu de renvoyer le fichier', async () => {
    const records = fixture.records as { uploadContent: ReturnType<typeof vi.fn>; ingestion: ReturnType<typeof vi.fn> };
    records.uploadContent.mockResolvedValue({ id: 'r1', status: 'PROCESSING', fileId: null });
    records.ingestion.mockResolvedValue({ id: 'r1', status: 'COMPLETED', fileId: 'file-1' });
    await committed();
    pick('a.pdf');
    deposit();
    expect(await screen.findByText(/Contrôles en cours · r1 — relire avant reprise/)).toBeTruthy();
    deposit();
    expect(await screen.findByText(/Dépôt terminé · reçu r1/)).toBeTruthy();
    expect(records.ingestion).toHaveBeenCalledWith('r1');
    expect(records.uploadContent).toHaveBeenCalledTimes(1);
});

it('la demande d’extraction après dépôt n’est possible que si le serveur l’active, et un échec d’extraction est dit sans perdre le dépôt', async () => {
    const records = fixture.records as { uploadContent: ReturnType<typeof vi.fn> };
    records.uploadContent.mockResolvedValue({ id: 'r1', status: 'COMPLETED', fileId: 'file-1' });
    fixture.api.extract.mockRejectedValue(new Error('Extraction refusée'));
    await committed();
    const auto = screen.getByRole('checkbox', { name: /Demander l’extraction après chaque dépôt terminé/ }) as HTMLInputElement;
    expect(auto.disabled).toBe(false);
    fireEvent.click(auto);
    pick('a.pdf');
    deposit();
    expect(await screen.findByText('Extraction refusée')).toBeTruthy();
    expect(fixture.api.extract).toHaveBeenCalledWith('file-1', { ocr: 'AUTO', language: 'fra+eng' }, 'import-extract:lot-1:1');
    expect(screen.getByText(/Dépôt terminé ; extraction non confirmée/)).toBeTruthy();
});

it('sans extraction active sur le serveur, la case de demande automatique est désactivée', async () => {
    fixture.api.capabilities.mockResolvedValue(caps({ workerEnabled: false }));
    await committed();
    expect((screen.getByRole('checkbox', { name: /Demander l’extraction après chaque dépôt terminé/ }) as HTMLInputElement).disabled).toBe(true);
});

// ---------- l'extraction
const chooseFile = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le document' }));
    await waitFor(() => expect(within(screen.getByLabelText('Version documentaire')).getByRole('option', { name: /Version 1 · ACTIVE · scellée/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Version documentaire'), { target: { value: 'ver-1' } });
    await waitFor(() => expect(within(screen.getByLabelText('Fichier validé')).getByRole('option', { name: /scan\.pdf/ })).toBeTruthy());
};
const request = () => fireEvent.click(screen.getByRole('button', { name: 'Demander l’extraction' }));

it('l’extraction exige un fichier validé et sain : un fichier infecté ou non validé n’est pas choisissable', async () => {
    await open('3 · Extraire et relire');
    expect((screen.getByRole('button', { name: 'Demander l’extraction' }) as HTMLButtonElement).disabled).toBe(true);
    await chooseFile();
    expect((within(screen.getByLabelText('Fichier validé')).getByRole('option', { name: /suspect\.pdf/ }) as HTMLOptionElement).disabled).toBe(true);
    expect((within(screen.getByLabelText('Fichier validé')).getByRole('option', { name: /scan\.pdf/ }) as HTMLOptionElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Fichier validé'), { target: { value: 'f1' } });
    expect((screen.getByRole('button', { name: 'Demander l’extraction' }) as HTMLButtonElement).disabled).toBe(false);
});

it('sans extraction active, l’écran le dit et la demande reste impossible', async () => {
    fixture.api.capabilities.mockResolvedValue(caps({ extractionEnabled: false }));
    await open('3 · Extraire et relire');
    expect(screen.getByText('L’extraction automatique n’est pas active sur ce serveur.')).toBeTruthy();
    await chooseFile();
    fireEvent.change(screen.getByLabelText('Fichier validé'), { target: { value: 'f1' } });
    expect((screen.getByRole('button', { name: 'Demander l’extraction' }) as HTMLButtonElement).disabled).toBe(true);
});

it('la demande part avec les options choisies et une clé qui change dès qu’une option change', async () => {
    fixture.api.extract.mockResolvedValue(job({ state: 'FAILED', result: null, errorCode: 'OCR_INDISPONIBLE' }));
    await open('3 · Extraire et relire');
    await chooseFile();
    fireEvent.change(screen.getByLabelText('Fichier validé'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Reconnaissance'), { target: { value: 'FORCE' } });
    fireEvent.change(screen.getByLabelText('Langue OCR'), { target: { value: 'fra' } });
    request();
    await screen.findByText('Échec');
    expect(fixture.api.extract).toHaveBeenCalledWith('f1', { ocr: 'FORCE', language: 'fra' }, expect.any(String));
    expect(screen.getByText(/OCR_INDISPONIBLE\. Corrigez la cause/)).toBeTruthy();
    const firstKey = fixture.api.extract.mock.calls[0]![2];
    fireEvent.change(screen.getByLabelText('Langue OCR'), { target: { value: 'eng' } });
    request();
    await waitFor(() => expect(fixture.api.extract).toHaveBeenCalledTimes(2));
    expect(fixture.api.extract.mock.calls[1]![2]).not.toBe(firstKey);
});

it('une extraction échouée ou annulée se relance avec ses options et une nouvelle clé ; une extraction connue se reprend par son identifiant', async () => {
    fixture.api.extraction.mockResolvedValue(job({ state: 'FAILED', result: null, errorCode: 'DELAI' }));
    fixture.api.extract.mockResolvedValue(job({ state: 'CANCELLED', result: null }));
    await open('3 · Extraire et relire');
    fireEvent.change(screen.getByLabelText('Identifiant de l’extraction'), { target: { value: 'x-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    expect(await screen.findByText('Échec')).toBeTruthy();
    expect(fixture.api.extraction).toHaveBeenCalledWith('x-1');
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle tentative' }));
    await waitFor(() => expect(fixture.api.extract).toHaveBeenCalledWith('f1', { ocr: 'AUTO', language: 'fra+eng' }, expect.any(String)));
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nouvelle tentative' })).toBeTruthy();
});

// L'horloge factice n'est installée qu'après l'ouverture de l'écran, et seules des assertions synchrones suivent : les attentes de la bibliothèque de test utilisent un délai factice.
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const showJob = async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(screen.getByLabelText('Identifiant de l’extraction'), { target: { value: 'x-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    await flush(0);
};

it('une extraction en attente est relue toutes les deux secondes et demie jusqu’à son terme', async () => {
    fixture.api.extraction.mockResolvedValueOnce(job({ state: 'QUEUED', result: null })).mockResolvedValue(job({ state: 'TO_REVIEW' }));
    await open('3 · Extraire et relire');
    await showJob();
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(fixture.api.extraction).toHaveBeenCalledTimes(1);
    await flush(2400);
    expect(fixture.api.extraction).toHaveBeenCalledTimes(1);
    await flush(200);
    expect(screen.getByText('À relire')).toBeTruthy();
    expect(fixture.api.extraction).toHaveBeenCalledTimes(2);
    expect(fixture.api.extraction).toHaveBeenLastCalledWith('x-1', expect.any(AbortSignal));
    await flush(6000);
    expect(fixture.api.extraction).toHaveBeenCalledTimes(2);
});

it('une erreur d’interrogation arrête la relecture automatique et propose de relire à la main', async () => {
    fixture.api.extraction.mockResolvedValueOnce(job({ state: 'RUNNING', result: null })).mockRejectedValueOnce(new Error('Réseau coupé')).mockResolvedValue(job({ state: 'TO_REVIEW' }));
    await open('3 · Extraire et relire');
    await showJob();
    expect(screen.getByText('Extraction en cours')).toBeTruthy();
    await flush(2600);
    expect(screen.getByText('Réseau coupé')).toBeTruthy();
    await flush(6000);
    expect(fixture.api.extraction).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    await flush(0);
    expect(screen.getByText('À relire')).toBeTruthy();
});

// ---------- la relecture
const review = async (extra: Record<string, unknown> = {}) => {
    fixture.api.extraction.mockResolvedValue(job(extra));
    await open('3 · Extraire et relire');
    fireEvent.change(screen.getByLabelText('Identifiant de l’extraction'), { target: { value: 'x-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    await screen.findByText('Propositions à examiner');
};
const reason = (value: string) => fireEvent.change(screen.getByLabelText(/^Motif de la décision/), { target: { value } });
const validate = () => screen.getByRole('button', { name: 'Valider les choix cochés' }) as HTMLButtonElement;
const reject = () => screen.getByRole('button', { name: 'Rejeter le résultat' }) as HTMLButtonElement;

it('la relecture montre les avertissements et les propositions avec leur provenance, sans rien appliquer d’office', async () => {
    await review();
    expect(screen.getByText('Texte peu lisible')).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Titre')).toBeTruthy();
    expect(table.getByText('Date mentionnée')).toBeTruthy();
    expect(table.getByText(/OCR · page 1/)).toBeTruthy();
    expect(table.getAllByText(/score non calibré/)).toHaveLength(2);
    expect((screen.getByLabelText(/Appliquer ce titre/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Appliquer cette date/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/^Texte extrait complet/) as HTMLTextAreaElement).value).toBe('Texte reconnu');
});

it('la décision exige un motif d’au moins dix caractères, et appliquer un titre ou une date exige de les renseigner', async () => {
    await review();
    expect(validate().disabled).toBe(true);
    expect(reject().disabled).toBe(true);
    reason('court');
    expect(validate().disabled).toBe(true);
    reason('Relecture complète du document');
    expect(validate().disabled).toBe(false);
    expect(reject().disabled).toBe(false);
    fireEvent.click(screen.getByLabelText(/Appliquer ce titre/));
    expect(validate().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Titre relu'), { target: { value: 'Arrêté' } });
    expect(validate().disabled).toBe(false);
    fireEvent.click(screen.getByLabelText(/Appliquer cette date/));
    expect(validate().disabled).toBe(true);
    expect(reject().disabled).toBe(false);
});

it('proposer un titre ou une date les reporte dans le formulaire et coche leur application', async () => {
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Proposer comme titre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Proposer comme date' }));
    expect((screen.getByLabelText('Titre relu') as HTMLInputElement).value).toBe('Arrêté n° 12');
    expect((screen.getByLabelText('Date administrative relue') as HTMLInputElement).value).toBe('1953-04-02');
    expect((screen.getByLabelText(/Appliquer ce titre/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Appliquer cette date/) as HTMLInputElement).checked).toBe(true);
});

it('valider envoie la version attendue, les choix cochés et le motif ; le résultat devient une décision enregistrée', async () => {
    fixture.api.review.mockResolvedValue(job({ state: 'REVIEWED', review: { decision: 'ACCEPTED' } }));
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Proposer comme titre' }));
    fireEvent.click(screen.getByLabelText(/J’ai relu le texte et autorise/));
    fireEvent.change(screen.getByLabelText(/^Texte extrait complet/), { target: { value: 'Texte corrigé' } });
    expect((screen.getByLabelText(/J’ai relu le texte et autorise/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/J’ai relu le texte et autorise/));
    reason('  Relecture complète  ');
    fireEvent.click(validate());
    await waitFor(() => expect(fixture.api.review).toHaveBeenCalledTimes(1));
    expect(fixture.api.review).toHaveBeenCalledWith(expect.objectContaining({ id: 'x-1' }), {
        expectedDocumentVersion: 4, accept: true, applyTitle: true, title: 'Arrêté n° 12', applyDate: false, documentDate: null, publishVerifiedText: true,
        reason: '  Relecture complète  ', correctedText: 'Texte corrigé'
    }, expect.any(String));
    expect(await screen.findByText(/Décision enregistrée\. ACCEPTED/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Valider les choix cochés' })).toBeNull();
    expect((screen.getByLabelText(/^Texte extrait complet/) as HTMLTextAreaElement).readOnly).toBe(true);
});

it('rejeter n’applique rien, même si des cases étaient cochées', async () => {
    fixture.api.review.mockResolvedValue(job({ state: 'REVIEWED', review: { decision: 'REJECTED' } }));
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Proposer comme titre' }));
    fireEvent.click(screen.getByLabelText(/J’ai relu le texte et autorise/));
    reason('Texte inexploitable');
    fireEvent.click(reject());
    await waitFor(() => expect(fixture.api.review).toHaveBeenCalledTimes(1));
    expect(fixture.api.review.mock.calls[0]![1]).toEqual({
        expectedDocumentVersion: 4, accept: false, applyTitle: false, title: null, applyDate: false, documentDate: null, publishVerifiedText: false, reason: 'Texte inexploitable', correctedText: null
    });
});

it('rejouer la même décision après un échec réutilise sa clé ; une décision modifiée en prend une nouvelle', async () => {
    fixture.api.review.mockRejectedValueOnce(new Error('Réseau coupé')).mockRejectedValueOnce(new Error('Réseau coupé')).mockResolvedValue(job({ state: 'REVIEWED', review: { decision: 'ACCEPTED' } }));
    await review();
    reason('Relecture complète');
    fireEvent.click(validate());
    expect(await screen.findByText('Réseau coupé')).toBeTruthy();
    fireEvent.click(validate());
    await waitFor(() => expect(fixture.api.review).toHaveBeenCalledTimes(2));
    expect(fixture.api.review.mock.calls[1]![2]).toBe(fixture.api.review.mock.calls[0]![2]);
    reason('Relecture complète et vérifiée');
    fireEvent.click(validate());
    await waitFor(() => expect(fixture.api.review).toHaveBeenCalledTimes(3));
    expect(fixture.api.review.mock.calls[2]![2]).not.toBe(fixture.api.review.mock.calls[0]![2]);
});

it('une extraction déjà décidée est en lecture seule : propositions « indication seulement », aucun bouton de décision', async () => {
    await review({ state: 'REVIEWED', review: { decision: 'ACCEPTED' } });
    expect(within(screen.getByRole('table')).getAllByText('Indication seulement')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Proposer comme titre' })).toBeNull();
    expect(screen.getByText(/Décision enregistrée\. ACCEPTED/)).toBeTruthy();
});
