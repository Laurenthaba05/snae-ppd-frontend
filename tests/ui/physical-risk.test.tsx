import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { EmergencyPlan, Exercise, Hazard, PlanSummary, Risk, RiskSummary, SiteRiskSummary } from '../../src/core/physicalRisk';

const SITE = '00000000-0000-4000-8000-0000000000a1';
const RISK = '00000000-0000-4000-8000-0000000000b1';
const PLAN = '00000000-0000-4000-8000-0000000000c1';
const UNIT = '00000000-0000-4000-8000-0000000000d1';
const MEASURE = '00000000-0000-4000-8000-0000000000e1';

const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, demo: false, allowed: new Set<string>(['PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_RISK_MANAGE', 'PHYSICALARCHIVES_RISK_APPROVE']),
    physicalArchives: {
        riskSites: vi.fn(), risks: vi.fn(), risk: vi.fn(), riskHazards: vi.fn(), createRisk: vi.fn(), updateRisk: vi.fn(), reviewRisk: vi.fn(), setRiskStatus: vi.fn(), addRiskMeasure: vi.fn(),
        progressRiskMeasure: vi.fn(), emergencyPlans: vi.fn(), emergencyPlan: vi.fn(), createEmergencyPlan: vi.fn(), updateEmergencyPlan: vi.fn(), approveEmergencyPlan: vi.fn(),
        reviewEmergencyPlan: vi.fn(), abandonEmergencyPlan: vi.fn(), emergencyExercises: vi.fn(), recordEmergencyExercise: vi.fn(), locations: vi.fn(), storageUnits: vi.fn(),
        createHazard: vi.fn(), retireHazard: vi.fn(), reactivateHazard: vi.fn()
    }
}));
const printed = vi.hoisted(() => ({ html: [] as string[] }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/printHtml', () => ({ printHtml: (html: string) => { printed.html.push(html); } }));
import { PhysicalRiskSection } from '../../src/ui/PhysicalRisk';

const api = fixture.physicalArchives;
const site = (extra: Partial<SiteRiskSummary> = {}): SiteRiskSummary => ({ locationId: SITE, locationLabel: 'Bâtiment principal', openRisks: 3, critical: 1, high: 1, moderate: 1, low: 0, overdueMeasures: 0,
    planStatus: 'AUCUN', planVersion: null, planNextReview: null, lastExerciseOn: null, gaps: ['NO_PLAN', 'RISK_WITHOUT_MEASURE'], ...extra });
const summary = (extra: Partial<RiskSummary> = {}): RiskSummary => ({ id: RISK, reference: 'RS-2026-000001', locationId: SITE, locationLabel: 'Bâtiment principal', hazardCode: 'INCENDIE',
    hazardLabel: 'Incendie', description: 'Câblage ancien sous les combles.', score: 20, level: 'CRITIQUE', status: 'OUVERT', nextReview: '2027-03-01', reviewOverdue: false, openMeasures: 1, overdueMeasures: 0, ...extra });
const risk = (extra: Partial<Risk> = {}): Risk => ({ id: RISK, reference: 'RS-2026-000001', locationId: SITE, locationLabel: 'Bâtiment principal', hazardCode: 'INCENDIE', hazardLabel: 'Incendie',
    description: 'Câblage ancien sous les combles.', probability: 4, severity: 5, score: 20, level: 'CRITIQUE', existingMeasures: 'Extincteurs vérifiés', owner: 'Régisseur', status: 'OUVERT',
    statusReason: null, decidedByName: null, decidedAt: null, lastReview: '2026-10-01', nextReview: '2027-10-01', reviewOverdue: false, createdByName: 'A. Camara', createdAt: '2026-10-01T10:00:00Z',
    version: 2, measures: [{ id: MEASURE, label: 'Remplacer le câblage', description: null, owner: 'Services techniques', dueDate: '2027-01-15', status: 'A_FAIRE', overdue: false, completedOn: null,
        note: null, version: 0 }],
    evaluations: [{ probability: 4, severity: 5, score: 20, level: 'CRITIQUE', evaluatedOn: '2026-10-01', note: 'Évaluation initiale', authorName: 'A. Camara' }], ...extra });
const planSummary = (extra: Partial<PlanSummary> = {}): PlanSummary => ({ id: PLAN, locationId: SITE, locationLabel: 'Bâtiment principal', versionNumber: 1, title: 'Plan d’urgence du bâtiment',
    status: 'BROUILLON', createdAt: '2026-10-02T10:00:00Z', approvedAt: null, nextReview: null, reviewOverdue: false, ...extra });
const plan = (extra: Partial<EmergencyPlan> = {}): EmergencyPlan => ({ id: PLAN, locationId: SITE, locationLabel: 'Bâtiment principal', versionNumber: 1, title: 'Plan d’urgence du bâtiment',
    status: 'BROUILLON', scope: null, alert: 'Alerter le responsable puis les pompiers.', evacuation: 'Sortir par l’issue nord.', rescue: 'Sauver d’abord la salle 1.', stabilisation: null, resources: null,
    contacts: [{ rank: 1, role: 'Responsable du site', name: 'A. Camara', phone: '+224 600 00 00 00', email: null, note: null }],
    priorities: [{ rank: 1, label: 'Registres d’état civil', storageUnitId: UNIT, storageUnitLabel: 'ETAG-1', archiveId: null, archiveLabel: null, reason: 'Pièces uniques' }],
    createdByName: 'A. Camara', createdAt: '2026-10-02T10:00:00Z', approvedByName: null, approvedAt: null, approvalReference: null, nextReview: null, reviewOverdue: false, reviewedByName: null,
    reviewedOn: null, abandonReason: null, version: 3, ...extra });
const hazards: Hazard[] = [{ code: 'INCENDIE', label: 'Incendie', order: 10, active: true }, { code: 'INONDATION', label: 'Inondation, crue', order: 20, active: true }];

beforeEach(() => {
    fixture.demo = false;
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_RISK_MANAGE', 'PHYSICALARCHIVES_RISK_APPROVE']);
    printed.html.length = 0;
    for (const fn of Object.values(api)) fn.mockReset();
    api.riskSites.mockResolvedValue([site()]);
    api.risks.mockResolvedValue([summary()]);
    api.risk.mockResolvedValue(risk());
    api.riskHazards.mockResolvedValue(hazards);
    api.emergencyPlans.mockResolvedValue([]);
    api.emergencyPlan.mockResolvedValue(plan());
    api.emergencyExercises.mockResolvedValue([] as Exercise[]);
    api.locations.mockResolvedValue([{ id: SITE, parentId: null, typeLocalisation: 'BATIMENT', code: null, libelle: 'Bâtiment principal', statut: 'ACTIVE' }]);
    api.storageUnits.mockResolvedValue([{ id: UNIT, localisationId: SITE, typeUnite: 'ETAGERE', cote: 'ETAG-1', statut: 'ACTIVE' }]);
});

const lastDialog = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };

async function openSite() {
    render(<PhysicalRiskSection />);
    const row = (await screen.findByText('Bâtiment principal')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    return screen.findByRole('dialog');
}

it('sans habilitation sur les archives physiques ni sur les risques, la rubrique n’apparaît pas ; en démonstration non plus', () => {
    fixture.allowed = new Set();
    const first = render(<PhysicalRiskSection />);
    expect(first.container.querySelector('section')).toBeNull();
    expect(api.riskSites).not.toHaveBeenCalled();
    first.unmount();
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    fixture.demo = true;
    const second = render(<PhysicalRiskSection />);
    expect(second.container.querySelector('section')).toBeNull();
});

it('le tableau montre, par emplacement, les risques ouverts par niveau, le plan, le dernier exercice et ce qui manque', async () => {
    render(<PhysicalRiskSection />);
    const row = (await screen.findByText('Bâtiment principal')).closest('tr')!;
    expect(within(row).getByText('Aucun plan')).toBeTruthy();
    expect(within(row).getByText('Aucun plan d’urgence en vigueur')).toBeTruthy();
    expect(within(row).getByText('Risque élevé sans mesure')).toBeTruthy();
    expect(within(row).getByText('Critique')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suivre un emplacement' })).toBeTruthy();
});

it('en lecture seule, aucun bouton d’écriture n’est proposé', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    render(<PhysicalRiskSection />);
    await screen.findByText('Bâtiment principal');
    expect(screen.queryByRole('button', { name: 'Suivre un emplacement' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Câblage ancien sous les combles/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Ajouter un risque' })).toBeNull();
});

it('un risque s’enregistre avec son danger, son évaluation et sa revue ; l’oubli est signalé avant l’envoi', async () => {
    api.createRisk.mockResolvedValue(risk());
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ajouter un risque' }));
    const form = lastDialog();
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer le risque' }));
    expect(await within(form).findByText('Choisissez le danger.')).toBeTruthy();
    expect(api.createRisk).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Danger'), { target: { value: 'INCENDIE' } });
    fireEvent.change(within(form).getByLabelText(/^Description/), { target: { value: 'Câblage ancien sous les combles : risque de départ de feu.' } });
    fireEvent.change(within(form).getByLabelText(/^Probabilité/), { target: { value: '4' } });
    fireEvent.change(within(form).getByLabelText(/^Gravité/), { target: { value: '5' } });
    expect(within(form).getByText(/Niveau :/).textContent).toContain('Critique');
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer le risque' }));
    await waitFor(() => expect(api.createRisk).toHaveBeenCalledTimes(1));
    const [body] = api.createRisk.mock.calls[0]!;
    expect(body).toMatchObject({ locationId: SITE, hazard: 'INCENDIE', probability: 4, severity: 5, existingMeasures: null, owner: null });
    expect(body.nextReview > new Date().toISOString().slice(0, 10)).toBe(true);
});

it('accepter un risque résiduel n’est proposé qu’à qui approuve, et une mesure ne se clôt qu’avec un compte rendu', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_RISK_MANAGE']);
    api.progressRiskMeasure.mockResolvedValue(risk());
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ouvrir' }));
    const detail = lastDialog();
    expect(await within(detail).findByText('Remplacer le câblage')).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Accepter le risque résiduel' })).toBeNull();
    expect(within(detail).getByRole('button', { name: 'Marquer maîtrisé' })).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Faire avancer' }));
    const progress = lastDialog();
    fireEvent.change(within(progress).getByLabelText(/^Nouvel état/), { target: { value: 'FAITE' } });
    const save = within(progress).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(progress).getByLabelText(/^Compte rendu/), { target: { value: 'Câblage remplacé et contrôlé.' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.progressRiskMeasure).toHaveBeenCalledTimes(1));
    expect(api.progressRiskMeasure.mock.calls[0]![0]).toBe(MEASURE);
    expect(api.progressRiskMeasure.mock.calls[0]![1]).toMatchObject({ version: 0, status: 'FAITE', note: 'Câblage remplacé et contrôlé.' });
});

it('avec l’habilitation d’approbation, accepter le risque demande un motif', async () => {
    api.setRiskStatus.mockResolvedValue(risk({ status: 'ACCEPTE' }));
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ouvrir' }));
    const detail = lastDialog();
    fireEvent.click(await within(detail).findByRole('button', { name: 'Accepter le risque résiduel' }));
    const prompt = lastDialog();
    const confirm = within(prompt).getByRole('button', { name: 'Accepter le risque' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(prompt).getByLabelText(/^Motif/), { target: { value: 'Risque résiduel tolérable par la direction.' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.setRiskStatus).toHaveBeenCalledTimes(1));
    expect(api.setRiskStatus.mock.calls[0]![1]).toMatchObject({ version: 2, status: 'ACCEPTE', reason: 'Risque résiduel tolérable par la direction.' });
});

it('un brouillon de plan s’enregistre avec ses contacts et ses priorités, et ne s’approuve qu’une fois complet et enregistré', async () => {
    api.emergencyPlans.mockResolvedValue([planSummary()]);
    api.emergencyPlan.mockResolvedValue(plan({ alert: null, contacts: [], priorities: [] }));
    api.updateEmergencyPlan.mockResolvedValue(plan());
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Plan d’urgence' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ouvrir' }));
    const editor = await screen.findByRole('dialog', { name: /version 1$/ });
    const approve = await within(editor).findByRole('button', { name: 'Approuver le plan' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(within(editor).getByText(/Pour être approuvé, le plan doit comporter : la procédure d’alerte/)).toBeTruthy();
    fireEvent.change(within(editor).getByLabelText(/^Alerte/), { target: { value: 'Alerter le responsable puis les pompiers.' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Ajouter un contact' }));
    fireEvent.change(within(editor).getByLabelText('Fonction 1'), { target: { value: 'Responsable du site' } });
    fireEvent.change(within(editor).getByLabelText('Nom 1'), { target: { value: 'A. Camara' } });
    // un contact sans moyen de le joindre est signalé et rien n'est envoyé
    fireEvent.click(within(editor).getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await within(editor).findByText(/Contact 1 : un téléphone ou un courriel est nécessaire/)).toBeTruthy();
    expect(api.updateEmergencyPlan).not.toHaveBeenCalled();
    fireEvent.change(within(editor).getByLabelText('Téléphone 1'), { target: { value: '+224 600 00 00 00' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Ajouter une priorité' }));
    fireEvent.change(within(editor).getByLabelText('À sauver 1'), { target: { value: 'Registres d’état civil' } });
    fireEvent.change(within(editor).getByLabelText('Unité de stockage 1'), { target: { value: UNIT } });
    fireEvent.change(within(editor).getByLabelText('Pourquoi 1'), { target: { value: 'Pièces uniques' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(api.updateEmergencyPlan).toHaveBeenCalledTimes(1));
    const [planId, body] = api.updateEmergencyPlan.mock.calls[0]!;
    expect(planId).toBe(PLAN);
    expect(body).toMatchObject({ version: 3, title: 'Plan d’urgence du bâtiment', alert: 'Alerter le responsable puis les pompiers.' });
    expect(body.contacts).toEqual([{ role: 'Responsable du site', name: 'A. Camara', phone: '+224 600 00 00 00', email: null, note: null }]);
    expect(body.priorities).toEqual([{ label: 'Registres d’état civil', storageUnitId: UNIT, archiveId: null, reason: 'Pièces uniques' }]);
});

it('un plan complet s’approuve avec une échéance et une référence', async () => {
    api.emergencyPlans.mockResolvedValue([planSummary()]);
    api.approveEmergencyPlan.mockResolvedValue(plan({ status: 'APPROUVE' }));
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Plan d’urgence' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ouvrir' }));
    const editor = await screen.findByRole('dialog', { name: /version 1$/ });
    const approve = await within(editor).findByRole('button', { name: 'Approuver le plan' }) as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.click(approve);
    const form = lastDialog();
    fireEvent.change(within(form).getByLabelText(/^Référence de l’approbation/), { target: { value: 'Note de service 12' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(api.approveEmergencyPlan).toHaveBeenCalledTimes(1));
    expect(api.approveEmergencyPlan.mock.calls[0]![0]).toBe(PLAN);
    expect(api.approveEmergencyPlan.mock.calls[0]![1]).toMatchObject({ version: 3, approvalReference: 'Note de service 12' });
});

it('un plan en vigueur se lit sans formulaire, s’imprime et se revoit', async () => {
    api.emergencyPlans.mockResolvedValue([planSummary({ status: 'APPROUVE', approvedAt: '2026-10-05T10:00:00Z', nextReview: '2027-10-05' })]);
    api.emergencyPlan.mockResolvedValue(plan({ status: 'APPROUVE', approvedByName: 'B. Diallo', approvedAt: '2026-10-05T10:00:00Z', nextReview: '2027-10-05', approvalReference: 'NS-12' }));
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Plan d’urgence' }));
    expect(await within(dialog).findByText('En vigueur')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir' }));
    const detail = await screen.findByRole('dialog', { name: /version 1$/ });
    expect(await within(detail).findByText(/Approuvé le .* par B\. Diallo \(réf\. NS-12\)/)).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Enregistrer le brouillon' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Approuver le plan' })).toBeNull();
    expect(within(detail).getByRole('button', { name: 'Enregistrer une revue' })).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Imprimer la fiche du plan' }));
    expect(printed.html).toHaveLength(1);
    expect(printed.html[0]).toContain('Alerter le responsable puis les pompiers.');
});

it('un exercice s’enregistre avec ses constats, sur une date qui ne peut pas être future', async () => {
    api.recordEmergencyExercise.mockResolvedValue({} as Exercise);
    const dialog = await openSite();
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Exercices et incidents' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Enregistrer un exercice ou un incident' }));
    const form = lastDialog();
    fireEvent.change(within(form).getByLabelText(/^Intitulé/), { target: { value: 'Évacuation de la salle des registres' } });
    fireEvent.change(within(form).getByLabelText(/^Ce qui s’est passé/), { target: { value: 'Exercice d’évacuation inopiné avec chronométrage.' } });
    fireEvent.change(within(form).getByLabelText(/^Constats/), { target: { value: 'L’issue nord était encombrée ; six minutes pour sortir.' } });
    fireEvent.change(within(form).getByLabelText('Participants'), { target: { value: '12' } });
    // le champ de date porte un maximum (aujourd'hui) : le navigateur refuse une date future avant même l'envoi
    expect((within(form).getByLabelText(/^Date/) as HTMLInputElement).max).toBe(new Date().toISOString().slice(0, 10));
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.recordEmergencyExercise).toHaveBeenCalledTimes(1));
    expect(api.recordEmergencyExercise.mock.calls[0]![0]).toMatchObject({ locationId: SITE, type: 'EXERCICE', participants: 12, riskId: null, actions: null });
});

it('le référentiel des dangers se gère par la gestion : on ajoute, on retire, on réactive, et le code se contrôle', async () => {
    api.riskHazards.mockResolvedValue([{ code: 'INCENDIE', label: 'Incendie', order: 10, active: true }, { code: 'ANCIEN', label: 'Ancien danger', order: 20, active: false }]);
    api.createHazard.mockResolvedValue({ code: 'TEMPETE', label: 'Tempête', order: 100, active: true });
    api.retireHazard.mockResolvedValue({ code: 'INCENDIE', label: 'Incendie', order: 10, active: false });
    api.reactivateHazard.mockResolvedValue({ code: 'ANCIEN', label: 'Ancien danger', order: 20, active: true });
    render(<PhysicalRiskSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gérer les dangers' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dangers' });
    expect(await within(dialog).findByText('Ancien danger')).toBeTruthy();
    expect(api.riskHazards).toHaveBeenCalledWith(true, expect.anything());
    const add = within(dialog).getByRole('button', { name: 'Ajouter le danger' }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText(/^Code du danger/), { target: { value: '1 mauvais' } });
    fireEvent.change(within(dialog).getByLabelText(/^Libellé du danger/), { target: { value: 'Tempête' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Code du danger/), { target: { value: 'TEMPETE' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(api.createHazard).toHaveBeenCalledWith({ code: 'TEMPETE', label: 'Tempête' }, expect.any(String)));
    fireEvent.click(within((await within(dialog).findByText('Ancien danger')).closest('tr')!).getByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(api.reactivateHazard).toHaveBeenCalledWith('ANCIEN', expect.any(String)));
    fireEvent.click(within((await within(dialog).findByText('Incendie')).closest('tr')!).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(api.retireHazard).toHaveBeenCalledWith('INCENDIE', expect.any(String)));
});

it('sans l’habilitation de gestion, le référentiel des dangers ne se gère pas', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    render(<PhysicalRiskSection />);
    await screen.findByText('Bâtiment principal');
    expect(screen.queryByRole('button', { name: 'Gérer les dangers' })).toBeNull();
});
