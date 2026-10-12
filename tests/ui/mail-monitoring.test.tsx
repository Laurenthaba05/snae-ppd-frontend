import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MailStatus } from '../../src/core/mail';

const fixture = vi.hoisted(() => ({ epoch: 1, portalAdmin: { mailStatus: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { MailStatusPanel } from '../../src/ui/MailMonitoring';

const status = (over: Partial<MailStatus> = {}): MailStatus => ({
    enabled: true, configured: true, security: 'STARTTLS', pending: 2, sent: 40, failed: 1, oldestPendingAt: '2026-10-10T07:00:00Z', lastSentAt: '2026-10-10T08:00:00Z',
    lastCycleFinishedAt: '2026-10-10T08:01:00Z', lastCycleCode: null, pausedUntil: null,
    failures: [{ category: 'PORTAIL', recipient: 'l***@exemple.gn', subject: 'Réinitialisation de votre mot de passe', attempts: 1, errorCode: 'MAIL_RECIPIENT_REJECTED', createdAt: '2026-10-09T09:00:00Z' }],
    ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.portalAdmin.mailStatus.mockReset();
    fixture.portalAdmin.mailStatus.mockResolvedValue(status());
});

it('montre les compteurs, la connexion chiffrée et chaque échec par son sujet, son destinataire masqué et sa cause', async () => {
    render(<MailStatusPanel />);
    expect(await screen.findByText('Courriers sortants')).toBeTruthy();
    expect(screen.getByText('2 courriers attendent son envoi.')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Connexion chiffrée (STARTTLS).')).toBeTruthy();
    const row = screen.getByText('Réinitialisation de votre mot de passe — l***@exemple.gn').closest('tr')!;
    expect(within(row).getByText('Portail des lecteurs')).toBeTruthy();
    expect(within(row).getByText('Le serveur de courrier a refusé l’adresse du destinataire.')).toBeTruthy();
});

it('sans serveur configuré, le dit et rappelle la vérification à la main', async () => {
    fixture.portalAdmin.mailStatus.mockResolvedValue(status({ enabled: false, configured: false, security: null, pending: 5, failures: [] }));
    render(<MailStatusPanel />);
    expect(await screen.findByText(/Aucun serveur de courrier n’est configuré/)).toBeTruthy();
    expect(screen.getByText('Aucun courrier en échec')).toBeTruthy();
    expect(screen.queryByText(/Connexion/)).toBeNull();
});

it('signale une pause après un refus de configuration', async () => {
    fixture.portalAdmin.mailStatus.mockResolvedValue(status({ pausedUntil: new Date(Date.now() + 600_000).toISOString(), lastCycleCode: 'MAIL_AUTH_REJECTED' }));
    render(<MailStatusPanel />);
    expect(await screen.findByText(/a refusé l’identifiant ou le mot de passe configurés/)).toBeTruthy();
});

it('affiche l’erreur de chargement avec la possibilité de réessayer', async () => {
    fixture.portalAdmin.mailStatus.mockRejectedValue(new Error('Hors ligne'));
    render(<MailStatusPanel />);
    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeTruthy();
});
