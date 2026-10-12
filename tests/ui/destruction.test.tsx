import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DestructionCertificate, DestructionPreview } from '../../src/core/destruction';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const EVENT = '11111111-1111-4111-8111-111111111111';
const ACTION = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { eventDispositions: vi.fn(), readiness: vi.fn(), destructionPreview: vi.fn(), certificateOfAction: vi.fn(), certificateOfDocument: vi.fn(), certificates: vi.fn(), certificate: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <>{'Agent ' + id.slice(0, 2)}</>, useEntityName: (_kind: string, id: string | null) => ({ name: id ? 'Agent ' + id.slice(0, 2) : null, loading: false }) }));
import { EventDispositions } from '../../src/pages/Records';
import { CertificatesPanel, DestructionPreviewBox, DocumentTombstone } from '../../src/ui/Destruction';

const disposition = (decision: string, status: string, id = ACTION) => ({ id, eventId: EVENT, decision, status, proposedBy: '11-a', validatedBy: '22-b', executedBy: null, proposedAt: '2026-10-09T09:00:00Z', validatedAt: null, executedAt: null, visaReference: null, evidenceHash: null, executionReference: null, version: 1 });
const preview = (over: Partial<DestructionPreview> = {}): DestructionPreview => ({ actionId: ACTION, documentId: DOC, objectCount: 2, totalSize: 2048, texts: 1, previousAttempts: 0, lastError: null, blockers: [],
    objects: [{ kind: 'FICHIER', name: 'Décision.pdf', size: 1024, sha256: 'a'.repeat(64) }, { kind: 'COPIE', name: 'consultation-1', size: 1024, sha256: null }], ...over });
const certificate = (over: Partial<DestructionCertificate> = {}): DestructionCertificate => ({ id: '44444444-4444-4444-8444-444444444444', reference: 'CD-2026-000001', actionId: ACTION, documentId: DOC, institutionId: INST,
    identifiantMetier: 'DOC-2026-001', title: 'Registre de paie', status: 'COMPLET', method: 'SUPPRESSION_STOCKAGE', operatorId: '33-c', proposedById: '11-a', validatedById: '22-b', visaReference: 'VISA-2026-01',
    startedAt: '2026-10-09T10:00:00Z', finishedAt: '2026-10-09T10:00:05Z', objectCount: 2, totalSize: 2048, purgedTexts: 1, fingerprint: 'f'.repeat(64),
    objects: [{ kind: 'FICHIER', name: 'Décision.pdf', mediaType: 'application/pdf', sha256: 'a'.repeat(64), size: 1024, provider: 'LOCAL_PRIVATE', deletedAt: '2026-10-09T10:00:02Z', alreadyAbsent: false, absenceVerified: true }], ...over });
const render_ = (status = 'EN_DECISION') => render(<table><tbody><EventDispositions eventId={EVENT} eventStatus={status} /></tbody></table>);

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE', 'DISPOSITION_CANCEL']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.readiness.mockResolvedValue({ actionId: ACTION, executable: true, blockers: [] });
    fixture.retention.destructionPreview.mockResolvedValue(preview());
    fixture.retention.command.mockResolvedValue({});
});

it('exécuter une élimination montre ce qui sera détruit et exige une confirmation explicite', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('ELIMINER', 'VALIDEE')]);
    render_();
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Exécuter l’élimination')).toBeTruthy();
    expect(await within(dialog).findByText(/2 objets \(.*Ko\) et 1 texte dérivé à vider/)).toBeTruthy();
    expect(within(dialog).getByText(/1 · fichier de conservation/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText(/Fichiers de conservation \(1\)/));
    expect(within(dialog).getByText('Décision.pdf')).toBeTruthy();
    const run = () => within(dialog).getByRole('button', { name: /Exécuter$/ }) as HTMLButtonElement;
    expect(run().disabled).toBe(true);                                                        // pas de destruction sans avoir coché
    fireEvent.click(within(dialog).getByLabelText(/Je confirme la destruction définitive de 2 objets de ce document/));
    await waitFor(() => expect(run().disabled).toBe(false));
    fixture.retention.certificateOfAction.mockResolvedValue(certificate());
    fireEvent.click(run());
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalled());
    const [path, body, , method] = fixture.retention.command.mock.calls[0] as [string, Record<string, unknown>, string, string];
    expect(path).toBe(`/dispositions/${ACTION}/execute`); expect(body).toEqual({ executionReference: null }); expect(method).toBe('POST');
    // le certificat s'affiche aussitôt, avec la preuve
    const done = await screen.findByText('Certificat de destruction');
    expect(done).toBeTruthy();
    const cert = screen.getByRole('dialog');
    expect(within(cert).getByText('CD-2026-000001')).toBeTruthy();
    expect(within(cert).getByText(/Registre de paie/)).toBeTruthy();
    expect(within(cert).getByText('VISA-2026-01')).toBeTruthy();
    expect(within(cert).getByText(/absence vérifiée/)).toBeTruthy();
    expect(within(cert).getByRole('button', { name: 'Afficher et imprimer' })).toBeTruthy();
    expect(within(cert).getByText(/Les sauvegardes et réplicas éventuels de l’hébergeur ne sont pas couverts/)).toBeTruthy();
});

it('un obstacle empêche l’exécution et se lit en français, jamais en code technique', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('ELIMINER', 'VALIDEE')]);
    fixture.retention.readiness.mockResolvedValue({ actionId: ACTION, executable: false, blockers: ['DESTRUCTION_STORAGE_NOT_CONFIGURED', 'ACTIVE_LEGAL_HOLD'] });
    fixture.retention.destructionPreview.mockResolvedValue(preview({ blockers: ['DESTRUCTION_STORAGE_NOT_CONFIGURED'] }));
    render_();
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter' }));
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findAllByText(/Le stockage ne permet pas de supprimer le contenu/)).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Un gel légal actif bloque l’opération.')).toBeTruthy();
    expect(dialog.textContent).not.toContain('DESTRUCTION_STORAGE_NOT_CONFIGURED');
    expect(dialog.textContent).not.toContain('ACTIVE_LEGAL_HOLD');
    fireEvent.click(await within(dialog).findByLabelText(/Je confirme la destruction/));
    expect((within(dialog).getByRole('button', { name: /Exécuter$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.retention.command).not.toHaveBeenCalled();
});

it('une destruction déjà commencée puis interrompue est signalée avec son échec', async () => {
    fixture.retention.destructionPreview.mockResolvedValue(preview({ previousAttempts: 2, lastError: 'STORAGE_PROVIDER_REJECTED' }));
    render(<DestructionPreviewBox dispositionId={ACTION} />);
    expect(await screen.findByText(/Une destruction a déjà été commencée pour cette action \(2 tentatives\)/)).toBeTruthy();
    expect(screen.getByText('STORAGE_PROVIDER_REJECTED')).toBeTruthy();
    expect(screen.getByText(/l’action ne peut plus être annulée/)).toBeTruthy();
});

it('valider une élimination montre le contenu visé et exige le visa et le procès-verbal ; un rejet ne les exige pas', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('ELIMINER', 'PROPOSEE')]);
    render_();
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/2 objets/)).toBeTruthy();
    const visa = within(dialog).getByLabelText(/^Référence de visa/) as HTMLInputElement;
    const pv = within(dialog).getByLabelText(/^Procès-verbal/) as HTMLTextAreaElement;
    expect(visa.required).toBe(true); expect(pv.required).toBe(true);
    expect(within(dialog).getByText(/L’inventaire exact des fichiers est joint à la preuve/)).toBeTruthy();
    fireEvent.change(visa, { target: { value: 'VISA-2026-01' } }); fireEvent.change(pv, { target: { value: 'Procès-verbal d’élimination.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Approuver|Valider/ }));
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalled());
    const [path, body] = fixture.retention.command.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe(`/dispositions/${ACTION}/validate`);
    expect(body).toMatchObject({ approve: true, visaReference: 'VISA-2026-01', procesVerbal: 'Procès-verbal d’élimination.' });
    expect(body).not.toHaveProperty('evidenceJson');                       // l'inventaire est établi par le serveur, jamais saisi
});

it('rejeter une élimination n’exige ni visa ni procès-verbal, et ne charge pas d’aperçu', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('ELIMINER', 'PROPOSEE')]);
    render_();
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Décision/), { target: { value: '0' } });
    await waitFor(() => expect((within(dialog).getByLabelText(/^Référence de visa/) as HTMLInputElement).required).toBe(false));
    expect((within(dialog).getByLabelText(/^Procès-verbal/) as HTMLTextAreaElement).required).toBe(false);
    expect(within(dialog).queryByLabelText('Contenu qui serait détruit')).toBeNull();
});

it('une décision de conservation garde ses boîtes de dialogue : pas d’aperçu, pas de confirmation de destruction', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('CONSERVER_DEFINITIVEMENT', 'VALIDEE')]);
    render_();
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Exécuter la disposition')).toBeTruthy();
    expect(await within(dialog).findByText('Prête à être exécutée.')).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Je confirme la destruction/)).toBeNull();
    expect(fixture.retention.destructionPreview).not.toHaveBeenCalled();
    expect((within(dialog).getByRole('button', { name: /Exécuter$/ }) as HTMLButtonElement).disabled).toBe(false);
});

it('une élimination exécutée donne accès à son certificat', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('ELIMINER', 'EXECUTEE')]);
    fixture.retention.certificateOfAction.mockResolvedValue(certificate());
    render_('CLOTURE');
    fireEvent.click(await screen.findByRole('button', { name: 'Certificat de destruction' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('CD-2026-000001')).toBeTruthy();
    expect(fixture.retention.certificateOfAction).toHaveBeenCalledWith(ACTION, expect.anything());
    expect(within(dialog).getByText('Décision.pdf')).toBeTruthy();
    expect(dialog.textContent).not.toContain('33-c');                   // les personnes se lisent par leur nom
    expect(dialog.textContent).toContain('Agent 33');
});

it('la liste des certificats de l’institution ouvre le certificat complet', async () => {
    fixture.retention.certificates.mockResolvedValue([certificate({ objects: [] })]);
    fixture.retention.certificate.mockResolvedValue(certificate());
    render(<CertificatesPanel institutionId={INST} />);
    const row = (await screen.findAllByRole('row'))[1]!;
    expect(row.textContent).toContain('CD-2026-000001'); expect(row.textContent).toContain('DOC-2026-001'); expect(row.textContent).toContain('2 objets');
    fireEvent.click(within(row).getByRole('button', { name: 'Voir' }));
    expect(await screen.findByText('Décision.pdf')).toBeTruthy();                // le chargement cède la place au certificat complet
    expect(fixture.retention.certificate).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', expect.anything());
});

it('sans destruction, le panneau des certificats le dit', async () => {
    fixture.retention.certificates.mockResolvedValue([]);
    render(<CertificatesPanel institutionId={INST} />);
    expect(await screen.findByText('Aucune destruction')).toBeTruthy();
});

it('un document détruit affiche son tombeau avec le lien vers le certificat', async () => {
    fixture.retention.certificateOfDocument.mockResolvedValue(certificate());
    render(<DocumentTombstone documentId={DOC} />);
    expect(screen.getByText(/Ce document a été détruit/)).toBeTruthy();
    expect(screen.getByText(/seule sa notice demeure, comme tombeau/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le certificat de destruction' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('CD-2026-000001')).toBeTruthy();
    expect(fixture.retention.certificateOfDocument).toHaveBeenCalledWith(DOC, expect.anything());
});
