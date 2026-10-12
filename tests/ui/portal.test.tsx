import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { PortalApi } from '../../src/api/portal';
import type { PortalAccessRequest, PortalNotice, PortalNoticeSummary, PortalReader, PortalSubscription, PublicPlan } from '../../src/core/types';
import { PortalApp, isPortalPath, portalRoute } from '../../src/portal/PortalApp';

const DOC = '00000000-0000-4000-8000-0000000000d1';
const NOTICE = '00000000-0000-4000-8000-0000000000b1';
const DOC2 = '00000000-0000-4000-8000-0000000000d2';
const api = {
    me: vi.fn(), subscriptions: vi.fn(), plans: vi.fn(), categories: vi.fn(), readerCategories: vi.fn(), notices: vi.fn(), notice: vi.fn(), termsVersion: vi.fn(), register: vi.fn(), login: vi.fn(), logout: vi.fn(),
    verifyEmail: vi.fn(), resendVerification: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), updateMe: vi.fn(), changePassword: vi.fn(), subscribe: vi.fn(), cancelSubscription: vi.fn(), receipt: vi.fn(), pages: vi.fn(),
    accessRequests: vi.fn(), requestAccess: vi.fn(), cancelAccessRequest: vi.fn()
};
const reader = (extra: Partial<PortalReader> = {}): PortalReader => ({ id: 'r1', numero: 'LEC-000001', email: 'awa@exemple.gn', prenom: 'Awa', nom: 'Camara', organisme: null, categorie: null, emailVerifie: true, conditionsVersion: '1', creeLe: '2026-10-01T09:00:00Z', ...extra });
const sub = (extra: Partial<PortalSubscription> = {}): PortalSubscription => ({ id: 's1', numero: 'ABO-2026-000001', formuleCode: 'ANNUEL', formuleLibelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', referencePaiement: 'PAY-ABCDEFGH',
    statut: 'ACTIF', etat: 'EN_COURS', demandeLe: '2026-10-01T09:00:00Z', debutLe: '2026-10-05T09:00:00Z', finLe: '2027-10-05T09:00:00Z', modeActivation: 'PAIEMENT', paiement: { numero: 'REC-2026-000001', recuLe: '2026-10-05T09:00:00Z', mode: 'ESPECES' },
    annuleLe: null, annuleMotif: null, annuleParLecteur: false, ...extra });
const pending = (): PortalSubscription => sub({ etat: 'EN_ATTENTE_PAIEMENT', statut: 'EN_ATTENTE_PAIEMENT', debutLe: null, finLe: null, modeActivation: null, paiement: null });
const summary = (extra: Partial<PortalNoticeSummary> = {}): PortalNoticeSummary => ({ id: NOTICE, intitule: 'Registre des naissances de Kankan', categorie: 'REGISTRE', categorieLibelle: 'Registre', dateTexte: 'vers 1910', extrait: 'Registre d’état civil colonial.', documents: 1, surDemande: 0, ...extra });
const notice = (extra: Partial<PortalNotice> = {}): PortalNotice => ({ id: NOTICE, intitule: 'Registre des naissances de Kankan', categorie: 'REGISTRE', categorieLibelle: 'Registre', resume: 'Registre d’état civil colonial.', langues: ['Français'], ecritures: [],
    support: 'Papier', materiaux: null, dimensions: null, paginationDuree: '120 feuillets', dateDebut: '1908-01-01', dateFin: '1912-12-31', precisionDate: null, dateTexte: null, attributionIncertaine: false, bibliographie: null,
    documents: [{ id: DOC, titre: 'Registre numérisé', pages: 3, acces: 'LIBRE' }], ...extra });
const restricted = (): PortalNotice => notice({ documents: [{ id: DOC2, titre: 'Registre sous réserve', pages: 8, acces: 'SUR_DEMANDE' }] });
const request = (extra: Partial<PortalAccessRequest> = {}): PortalAccessRequest => ({ id: 'q1', numero: 'ACC-2026-000001', documentId: DOC2, documentTitre: 'Registre sous réserve', noticeId: NOTICE, noticeIntitule: 'Registre des naissances de Kankan',
    motif: 'Recherche sur l’état civil colonial de Kankan', statut: 'DEPOSEE', etat: 'DEPOSEE', deposeLe: '2026-10-05T09:00:00Z', decideLe: null, message: null, accordeJusquAu: null, annuleLe: null, peutAnnuler: true, ...extra });
const plan = (extra: Partial<PublicPlan> = {}): PublicPlan => ({ id: 'p1', code: 'ANNUEL', libelle: 'Abonnement annuel', description: 'Un an de lecture.', dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: false, categorie: null, ...extra });
const unauthorized = () => new ApiError(401, 'PORTAL_AUTH_REQUIRED', 'Connectez-vous pour continuer.');
const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

const open = (path: string) => { window.history.pushState(null, '', path); return render(<PortalApp api={api as unknown as PortalApi} />); };
const signedIn = (subs: PortalSubscription[] = [], requests: PortalAccessRequest[] = []) => { api.me.mockResolvedValue(reader()); api.subscriptions.mockResolvedValue(subs); api.accessRequests.mockResolvedValue(requests); };

beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.me.mockRejectedValue(unauthorized());
    api.subscriptions.mockResolvedValue([]);
    api.accessRequests.mockResolvedValue([]);
    api.plans.mockResolvedValue([plan()]);
    api.categories.mockResolvedValue([{ code: 'REGISTRE', libelle: 'Registre' }]);
    api.readerCategories.mockResolvedValue([{ code: 'CHERCHEUR', libelle: 'Chercheur' }]);
    api.notices.mockResolvedValue({ items: [summary()], page: 0, size: 12, total: 1, hasMore: false });
    api.notice.mockResolvedValue(notice());
    api.termsVersion.mockResolvedValue({ version: '2026-1' });
    api.pages.mockResolvedValue([{ number: 1, images: 1 }, { number: 2, images: 1 }, { number: 3, images: 1 }]);
});

it('reconnaît les adresses du portail et choisit l’écran sans navigateur', () => {
    expect(isPortalPath('/portail')).toBe(true); expect(isPortalPath('/portail/formules')).toBe(true); expect(isPortalPath('/portail?q=x')).toBe(true);
    expect(isPortalPath('/portailx')).toBe(false); expect(isPortalPath('/app')).toBe(false); expect(isPortalPath('/')).toBe(false);
    expect(portalRoute('/portail')).toEqual({ screen: 'catalogue' });
    expect(portalRoute('/portail/notices/' + NOTICE)).toEqual({ screen: 'notice', id: NOTICE });
    expect(portalRoute('/portail/notices/pas-un-uuid')).toEqual({ screen: 'invalide' });
    expect(portalRoute('/portail/lecture/' + DOC)).toEqual({ screen: 'lecture', id: DOC });
    for (const screenName of ['formules', 'compte', 'connexion', 'inscription', 'verification', 'mot-de-passe-oublie', 'reinitialisation']) expect(portalRoute('/portail/' + screenName)).toEqual({ screen: screenName });
    expect(portalRoute('/portail/formules/extra')).toEqual({ screen: 'inconnu' }); expect(portalRoute('/portail/autre')).toEqual({ screen: 'inconnu' });
});

it('le catalogue est ouvert sans compte et propose de se connecter ou de s’inscrire', async () => {
    open('/portail');
    expect(await screen.findByRole('heading', { name: 'Registre des naissances de Kankan' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Navigation du portail' });
    await waitFor(() => expect(within(nav).getByText('Se connecter')).toBeTruthy());
    expect(within(nav).getByText('Créer un compte')).toBeTruthy();
    expect(screen.getByText('1 notice')).toBeTruthy();
    expect(screen.getByText('1 document à lire')).toBeTruthy();
    expect(api.notices).toHaveBeenCalledWith({ q: undefined, categorie: undefined, page: 0, size: 12 }, expect.anything());
});

it('la recherche et la catégorie se mettent dans l’adresse, puis relancent la recherche', async () => {
    open('/portail');
    await screen.findByText('1 notice');
    fireEvent.change(screen.getByLabelText('Rechercher dans le catalogue'), { target: { value: ' atlas ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(window.location.search).toBe('?q=atlas'));
    await waitFor(() => expect(api.notices).toHaveBeenLastCalledWith({ q: 'atlas', categorie: undefined, page: 0, size: 12 }, expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: 'Registre' }));
    await waitFor(() => expect(window.location.search).toBe('?q=atlas&categorie=REGISTRE'));
});

it('un catalogue sans résultat le dit, et une erreur du serveur se montre avec un moyen de réessayer', async () => {
    api.notices.mockResolvedValueOnce({ items: [], page: 0, size: 12, total: 0, hasMore: false });
    const view = open('/portail?q=zzz');
    expect(await screen.findByText('Aucune notice trouvée')).toBeTruthy();
    view.unmount();
    api.notices.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'Connexion impossible. Réessayez dans un moment.'));
    open('/portail');
    expect(await screen.findByText('Connexion impossible. Réessayez dans un moment.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByRole('heading', { name: 'Registre des naissances de Kankan' })).toBeTruthy();
});

it('la notice anonyme montre la fiche, jamais d’image, et renvoie vers la connexion avec retour à la lecture', async () => {
    open('/portail/notices/' + NOTICE);
    expect(await screen.findByRole('heading', { level: 1, name: 'Registre des naissances de Kankan' })).toBeTruthy();
    expect(screen.getByText('Papier')).toBeTruthy(); expect(screen.getByText('120 feuillets')).toBeTruthy();
    expect(screen.getByText('1 janvier 1908 — 31 décembre 1912', { selector: 'dd' })).toBeTruthy();
    const link = await screen.findByRole('link', { name: 'Se connecter pour lire' });
    expect(link.getAttribute('href')).toBe('/portail/connexion?retour=%2Fportail%2Flecture%2F' + DOC);
    expect(document.querySelector('img')).toBeNull();
});

it('la notice d’un lecteur abonné propose la lecture, sans abonnement elle propose les formules, en attente elle renvoie au compte', async () => {
    signedIn([sub()]);
    const view = open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'Lire' })).getAttribute('href')).toBe('/portail/lecture/' + DOC);
    view.unmount();
    signedIn([]);
    const second = open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'S’abonner pour lire' })).getAttribute('href')).toBe('/portail/formules');
    second.unmount();
    signedIn([pending()]);
    open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'Voir ma demande' })).getAttribute('href')).toBe('/portail/compte');
});

it('une notice absente affiche l’erreur du serveur et un retour au catalogue', async () => {
    api.notice.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Notice introuvable.'));
    open('/portail/notices/' + NOTICE);
    expect(await screen.findByText('Notice introuvable.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retour au catalogue' })).toBeTruthy();
});

it('les formules affichent leur prix et exigent un compte pour être demandées', async () => {
    open('/portail/formules');
    expect(await screen.findByRole('heading', { name: 'Abonnement annuel' })).toBeTruthy();
    expect(flat(document.querySelector('.portal-price')!.textContent)).toMatch(/150 000\s?GNF/);
    expect(screen.getByText('Un an de lecture.')).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'Se connecter pour demander' })).getAttribute('href')).toBe('/portail/connexion?retour=%2Fportail%2Fformules');
});

it('un lecteur demande une formule : une seule demande part, et il arrive sur son compte avec la référence', async () => {
    signedIn([]);
    api.subscribe.mockResolvedValue(pending());
    open('/portail/formules');
    const button = await screen.findByRole('button', { name: 'Demander cet abonnement' });
    api.subscriptions.mockResolvedValue([pending()]);
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(window.location.pathname).toBe('/portail/compte'));
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    expect(api.subscribe).toHaveBeenCalledWith('p1');
    expect(await screen.findByText('PAY-ABCDEFGH')).toBeTruthy();
});

it('une demande en attente bloque une seconde demande et le serveur peut refuser avec son message', async () => {
    signedIn([pending()]);
    open('/portail/formules');
    const button = await screen.findByRole('button', { name: 'Demander cet abonnement' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/attend encore son règlement/)).toBeTruthy();
});

it('une formule gratuite se demande, et dit qu’un agent l’accorde', async () => {
    signedIn([]);
    api.plans.mockResolvedValue([plan({ id: 'p0', code: 'CONVENTION', libelle: 'Convention université', montant: 0, dureeMois: 6 })]);
    open('/portail/formules');
    expect(await screen.findByText('Sur exonération')).toBeTruthy();
    expect((await screen.findByRole('button', { name: 'Demander cet abonnement' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/un agent examine votre demande/)).toBeTruthy();
});

it('le compte sans session renvoie vers la connexion avec le retour', async () => {
    open('/portail/compte');
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/portail/connexion?retour=%2Fportail%2Fcompte'));
});

it('le compte montre l’abonnement en cours, ses jours restants et le reçu imprimable', async () => {
    signedIn([sub({ finLe: new Date(Date.now() + 10 * 86400000).toISOString() })]);
    api.receipt.mockResolvedValue({ paiement: { id: 'pay1', numero: 'REC-2026-000001', abonnementId: 's1', abonnementNumero: 'ABO-2026-000001', lecteurNumero: 'LEC-000001', lecteurNom: 'Awa Camara', formuleLibelle: 'Abonnement annuel', montant: 150000, devise: 'GNF', mode: 'ESPECES',
        referenceExterne: null, note: null, recuPar: 'Mamadou Bah', recuParId: 'u1', recuLe: '2026-10-05T09:00:00Z', statut: 'ENREGISTRE', annulePar: null, annuleLe: null, annuleMotif: null, peutAnnuler: false },
        lecteurEmail: 'awa@exemple.gn', formuleCode: 'ANNUEL', dureeMois: 12, debutLe: '2026-10-05T09:00:00Z', finLe: '2027-10-05T09:00:00Z' });
    open('/portail/compte');
    expect(await screen.findByText(/Vous pouvez lire les documents communicables/)).toBeTruthy();
    expect(screen.getByText(/jours? restants?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le reçu' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.receipt).toHaveBeenCalledWith('REC-2026-000001');
    expect(within(dialog).getByText('Awa Camara (LEC-000001)')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Imprimer/ })).toBeTruthy();
});

it('le compte d’une demande en attente donne la référence, et l’annulation relit les abonnements', async () => {
    signedIn([pending()]);
    api.cancelSubscription.mockResolvedValue(sub({ etat: 'ANNULE', statut: 'ANNULE', annuleParLecteur: true }));
    open('/portail/compte');
    expect(await screen.findByText('PAY-ABCDEFGH')).toBeTruthy();
    expect(flat(screen.getByText(/Réglez/).textContent)).toMatch(/150 000\s?GNF/);
    api.subscriptions.mockResolvedValue([sub({ etat: 'ANNULE', statut: 'ANNULE', annuleParLecteur: true, debutLe: null, finLe: null, paiement: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler ma demande' }));
    await waitFor(() => expect(api.cancelSubscription).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText(/Annulé à votre demande/)).toBeTruthy();
});

it('l’inscription refuse un mot de passe faible et des conditions non acceptées, puis envoie la demande', async () => {
    api.register.mockResolvedValue({ message: 'Si l’adresse peut être inscrite, un courrier de confirmation lui est envoyé.' });
    open('/portail/inscription');
    await screen.findByRole('heading', { name: 'Créer un compte lecteur' });
    await screen.findByRole('option', { name: 'Chercheur' });
    fireEvent.change(screen.getByLabelText('Adresse électronique'), { target: { value: 'awa@exemple.gn' } });
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Awa' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Camara' } });
    fireEvent.change(screen.getByLabelText('Mot de passe', { exact: false }), { target: { value: 'court' } });
    expect(screen.getByText(/10 caractères/, { selector: 'li' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByText('Les conditions d’utilisation doivent être acceptées.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mot de passe', { exact: false }), { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Vous êtes (facultatif)'), { target: { value: 'CHERCHEUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await waitFor(() => expect(api.register).toHaveBeenCalledTimes(1));
    expect(api.register).toHaveBeenCalledWith({ email: 'awa@exemple.gn', motDePasse: 'Kankan#2026x', prenom: 'Awa', nom: 'Camara', accepteConditions: true, categorie: 'CHERCHEUR' });
    expect(await screen.findByRole('heading', { name: 'Vérifiez votre courrier' })).toBeTruthy();
});

it('la connexion échouée montre le message du serveur et vide le mot de passe ; réussie, elle revient à la page demandée', async () => {
    api.login.mockRejectedValueOnce(new ApiError(401, 'PORTAL_LOGIN_FAILED', 'Adresse ou mot de passe incorrect.'));
    open('/portail/connexion?retour=%2Fportail%2Flecture%2F' + DOC);
    fireEvent.change(await screen.findByLabelText('Adresse électronique'), { target: { value: 'awa@exemple.gn' } });
    const password = screen.getByLabelText('Mot de passe') as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter', exact: true } as never));
    expect(await screen.findByText('Adresse ou mot de passe incorrect.')).toBeTruthy();
    expect(password.value).toBe('');
    api.login.mockResolvedValueOnce(reader());
    api.subscriptions.mockResolvedValue([sub()]);
    fireEvent.change(password, { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Se connecter' }).find(b => b.closest('form'))!);
    await waitFor(() => expect(window.location.pathname).toBe('/portail/lecture/' + DOC));
    expect(api.login).toHaveBeenLastCalledWith('awa@exemple.gn', 'Kankan#2026x');
});

it('un retour extérieur au portail est ignoré à la connexion', async () => {
    api.login.mockResolvedValue(reader());
    open('/portail/connexion?retour=https%3A%2F%2Fexemple.com');
    fireEvent.change(await screen.findByLabelText('Adresse électronique'), { target: { value: 'awa@exemple.gn' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Se connecter' }).find(b => b.closest('form'))!);
    await waitFor(() => expect(window.location.pathname).toBe('/portail/compte'));
});

it('une adresse non confirmée propose de renvoyer le courrier', async () => {
    api.login.mockRejectedValue(new ApiError(422, 'PORTAL_EMAIL_NOT_VERIFIED', 'Confirmez votre adresse avant de vous connecter.'));
    api.resendVerification.mockResolvedValue({ message: 'Si l’adresse a un compte à confirmer, un nouveau courrier lui est envoyé.' });
    open('/portail/connexion');
    fireEvent.change(await screen.findByLabelText('Adresse électronique'), { target: { value: 'awa@exemple.gn' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Se connecter' }).find(b => b.closest('form'))!);
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer le courrier de confirmation' }));
    await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith('awa@exemple.gn'));
    expect(await screen.findByText(/nouveau courrier/)).toBeTruthy();
});

it('la confirmation d’adresse n’envoie le jeton que sur clic, et un lien sans jeton est signalé', async () => {
    api.verifyEmail.mockResolvedValue({ message: 'Adresse confirmée : vous pouvez vous connecter.' });
    const view = open('/portail/verification?jeton=abc123');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer mon adresse' }));
    await waitFor(() => expect(api.verifyEmail).toHaveBeenCalledWith('abc123'));
    expect(await screen.findByText('Adresse confirmée : vous pouvez vous connecter.')).toBeTruthy();
    view.unmount();
    open('/portail/verification');
    expect(await screen.findByText(/Le lien est incomplet/)).toBeTruthy();
});

it('le mot de passe oublié répond de la même façon quelle que soit l’adresse, et la réinitialisation exige un mot de passe solide', async () => {
    api.forgotPassword.mockResolvedValue({ message: 'Si l’adresse a un compte, un courrier lui est envoyé.' });
    const first = open('/portail/mot-de-passe-oublie');
    fireEvent.change(await screen.findByLabelText('Adresse électronique'), { target: { value: 'inconnue@exemple.gn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));
    expect(await screen.findByText('Si l’adresse a un compte, un courrier lui est envoyé.')).toBeTruthy();
    first.unmount();
    api.resetPassword.mockResolvedValue({ message: 'Mot de passe modifié : connectez-vous avec le nouveau.' });
    open('/portail/reinitialisation?jeton=tok');
    const field = await screen.findByLabelText('Nouveau mot de passe', { exact: false });
    fireEvent.change(field, { target: { value: 'court' } });
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Kankan#2026x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith('tok', 'Kankan#2026x'));
});

it('la lecture sans abonnement montre le blocage du serveur et mène aux formules, sans demander d’image', async () => {
    signedIn([]);
    api.pages.mockRejectedValue(new ApiError(402, 'PORTAL_SUBSCRIPTION_REQUIRED', 'La lecture des documents exige un abonnement en cours.'));
    open('/portail/lecture/' + DOC);
    expect(await screen.findByRole('heading', { name: 'Un abonnement en cours est nécessaire' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir les abonnements' }).getAttribute('href')).toBe('/portail/formules');
    expect(document.querySelector('img')).toBeNull();
});

it('la lecture sans session renvoie vers la connexion', async () => {
    open('/portail/lecture/' + DOC);
    await waitFor(() => expect(window.location.pathname).toBe('/portail/connexion'));
    expect(window.location.search).toContain('retour=%2Fportail%2Flecture%2F' + DOC);
    expect(api.pages).not.toHaveBeenCalled();
});

it('la lecture affiche une page à la fois depuis le serveur, avec la navigation et les flèches du clavier', async () => {
    signedIn([sub()]);
    open('/portail/lecture/' + DOC);
    const image = await screen.findByRole('img', { name: 'Page 1 sur 3' });
    expect(image.getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/1');
    expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect((await screen.findByRole('img', { name: 'Page 2 sur 3' })).getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/2');
    expect(window.location.search).toBe('?page=2');
    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    expect((await screen.findByRole('img', { name: 'Page 3 sur 3' })).getAttribute('src')).toContain('/pages/3');
    expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/porte votre numéro de lecteur/)).toBeTruthy();
    // Une page à la fois : ni vignettes ni préchargement, chaque page lue étant comptée par heure.
    expect(document.querySelectorAll('img').length).toBe(1);
    expect(document.querySelector('img[src*="vignette"]')).toBeNull();
});

it('une page de plusieurs images se lit image après image, avec le rang de l’image dans l’adresse et dans la demande au serveur', async () => {
    signedIn([sub()]);
    api.pages.mockResolvedValue([{ number: 1, images: 1 }, { number: 2, images: 3 }, { number: 4, images: 1 }]);
    open('/portail/lecture/' + DOC);
    expect((await screen.findByRole('img', { name: 'Page 1 sur 5' })).getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/1');
    expect(screen.getByText('sur 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect((await screen.findByRole('img', { name: 'Page 2, image 1 sur 3' })).getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/2');
    expect(window.location.search).toBe('?page=2');
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect((await screen.findByRole('img', { name: 'Page 2, image 2 sur 3' })).getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/2?image=2');
    expect(window.location.search).toBe('?page=2&image=2');
    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    expect((await screen.findByRole('img', { name: 'Page 2, image 3 sur 3' })).getAttribute('src')).toContain('/pages/2?image=3');
    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    expect((await screen.findByRole('img', { name: 'Page 4 sur 5' })).getAttribute('src')).toBe('/api/v1/portal/documents/' + DOC + '/pages/4');
    expect(window.location.search).toBe('?page=4');
    expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);
    // Le menu nomme chaque image ; on y saute directement.
    const menu = screen.getByRole('combobox', { name: 'Aller à la page' }) as HTMLSelectElement;
    expect(Array.from(menu.options).map(o => o.textContent)).toEqual(['Page 1', 'Page 2 · image 1 sur 3', 'Page 2 · image 2 sur 3', 'Page 2 · image 3 sur 3', 'Page 4']);
    fireEvent.change(menu, { target: { value: '2:2' } });
    expect((await screen.findByRole('img', { name: 'Page 2, image 2 sur 3' })).getAttribute('src')).toContain('/pages/2?image=2');
    expect(document.querySelectorAll('img').length).toBe(1);
});

it('une adresse qui désigne une image au-delà de la page revient à la première image du document', async () => {
    signedIn([sub()]);
    api.pages.mockResolvedValue([{ number: 1, images: 1 }, { number: 2, images: 3 }]);
    open('/portail/lecture/' + DOC + '?page=2&image=9');
    expect(await screen.findByRole('img', { name: 'Page 1 sur 4' })).toBeTruthy();
    cleanup();
    open('/portail/lecture/' + DOC + '?page=2&image=3');
    expect(await screen.findByRole('img', { name: 'Page 2, image 3 sur 3' })).toBeTruthy();
});

it('une page demandée hors du document revient à la première, et une image refusée propose de réessayer', async () => {
    signedIn([sub()]);
    open('/portail/lecture/' + DOC + '?page=99');
    const image = await screen.findByRole('img', { name: 'Page 1 sur 3' });
    fireEvent.error(image);
    expect(await screen.findByText(/n’a pas pu être chargée/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('img', { name: 'Page 1 sur 3' })).toBeTruthy();
});

it('la limite de lecture par heure est expliquée', async () => {
    signedIn([sub()]);
    api.pages.mockRejectedValue(new ApiError(429, 'PORTAL_RATE_LIMIT', 'Vous avez atteint la limite de pages lues par heure : reprenez plus tard.'));
    open('/portail/lecture/' + DOC);
    expect(await screen.findByRole('heading', { name: 'Limite de lecture atteinte' })).toBeTruthy();
    expect(screen.getByText(/limite de pages lues par heure/)).toBeTruthy();
});

it('la déconnexion ferme la session et revient au catalogue', async () => {
    signedIn([sub()]);
    api.logout.mockResolvedValue({ message: 'Vous êtes déconnecté.' });
    open('/portail/compte');
    fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    await waitFor(() => expect(window.location.pathname).toBe('/portail'));
});

it('le catalogue dit ce qui se lit et ce qui se demande', async () => {
    api.notices.mockResolvedValue({ items: [summary({ documents: 1, surDemande: 1 }), summary({ id: 'n2', intitule: 'Atlas colonial', documents: 0, surDemande: 2 })], page: 0, size: 12, total: 2, hasMore: false });
    open('/portail');
    expect(await screen.findByText('1 document à lire, 1 sur demande')).toBeTruthy();
    expect(screen.getByText('2 sur demande')).toBeTruthy();
});

it('un document sur demande est signalé, et un visiteur est renvoyé à la connexion avec retour à la notice', async () => {
    api.notice.mockResolvedValue(restricted());
    open('/portail/notices/' + NOTICE);
    expect(await screen.findByText('Sur demande')).toBeTruthy();
    const link = await screen.findByRole('link', { name: 'Se connecter pour demander l’accès' });
    expect(link.getAttribute('href')).toBe('/portail/connexion?retour=%2Fportail%2Fnotices%2F' + NOTICE);
    expect(screen.queryByRole('link', { name: 'Lire' })).toBeNull();
});

it('un lecteur sans abonnement est renvoyé aux formules pour demander l’accès', async () => {
    signedIn([]);
    api.notice.mockResolvedValue(restricted());
    open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'S’abonner pour demander l’accès' })).getAttribute('href')).toBe('/portail/formules');
    expect(screen.queryByRole('button', { name: 'Demander l’accès' })).toBeNull();
});

it('un lecteur abonné demande l’accès par écrit : le motif est exigé, la demande part une fois, puis la fiche suit son avancement', async () => {
    signedIn([sub()]);
    api.notice.mockResolvedValue(restricted());
    api.requestAccess.mockResolvedValue(request());
    open('/portail/notices/' + NOTICE);
    fireEvent.click(await screen.findByRole('button', { name: 'Demander l’accès' }));
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Envoyer la demande' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Pourquoi avez-vous besoin/), { target: { value: 'court' } });
    expect(within(dialog).getByText(/au moins 20 caractères/, { selector: 'li' })).toBeTruthy();
    expect(send.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Pourquoi avez-vous besoin/), { target: { value: '  Recherche sur l’état civil colonial de Kankan  ' } });
    expect(send.disabled).toBe(false);
    api.accessRequests.mockResolvedValue([request()]);
    fireEvent.click(send);
    await waitFor(() => expect(api.requestAccess).toHaveBeenCalledTimes(1));
    expect(api.requestAccess).toHaveBeenCalledWith(DOC2, 'Recherche sur l’état civil colonial de Kankan');
    expect(await within(dialog).findByText(/Votre demande est déposée/)).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    expect(await screen.findByRole('link', { name: 'Suivre ma demande' })).toBeTruthy();
    expect(screen.getByText(/ACC-2026-000001 déposée le .* elle attend d’être prise en charge/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demander l’accès' })).toBeNull();
});

it('une demande refusée par le serveur montre sa raison et ne prétend pas avoir été déposée', async () => {
    signedIn([sub()]);
    api.notice.mockResolvedValue(restricted());
    api.requestAccess.mockRejectedValue(new ApiError(409, 'PORTAL_ACCESS_ALREADY_PENDING', 'Une demande est déjà en cours pour ce document.'));
    open('/portail/notices/' + NOTICE);
    fireEvent.click(await screen.findByRole('button', { name: 'Demander l’accès' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Pourquoi avez-vous besoin/), { target: { value: 'Recherche sur l’état civil colonial de Kankan' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    expect(await within(dialog).findByText('Une demande est déjà en cours pour ce document.')).toBeTruthy();
    expect(within(dialog).queryByText(/Votre demande est déposée/)).toBeNull();
});

it('un accès accordé ouvre la lecture avec sa date limite ; refusé ou expiré, il se redemande', async () => {
    signedIn([sub()], [request({ statut: 'ACCORDEE', etat: 'ACCORDEE', accordeJusquAu: '2026-11-06T00:00:00Z', decideLe: '2026-10-06T08:00:00Z', peutAnnuler: false })]);
    api.notice.mockResolvedValue(restricted());
    const view = open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'Lire' })).getAttribute('href')).toBe('/portail/lecture/' + DOC2);
    expect(screen.getByText('Accès accordé jusqu’au 5 novembre 2026.')).toBeTruthy();
    view.unmount();
    signedIn([sub()], [request({ statut: 'REFUSEE', etat: 'REFUSEE', message: 'Le document est encore sous réserve', peutAnnuler: false })]);
    const second = open('/portail/notices/' + NOTICE);
    expect(await screen.findByRole('button', { name: 'Demander l’accès' })).toBeTruthy();
    expect(screen.getByText('Votre dernière demande a été refusée : Le document est encore sous réserve')).toBeTruthy();
    second.unmount();
    signedIn([sub()], [request({ statut: 'ACCORDEE', etat: 'EXPIREE', accordeJusquAu: '2026-09-01T00:00:00Z', peutAnnuler: false })]);
    open('/portail/notices/' + NOTICE);
    expect(await screen.findByRole('button', { name: 'Demander l’accès' })).toBeTruthy();
    expect(screen.getByText('Votre accès a expiré le 31 août 2026.')).toBeTruthy();
});

it('le compte liste les demandes d’accès, mène à la lecture quand l’accès est accordé et permet d’annuler une demande en cours', async () => {
    signedIn([sub()], [request({ id: 'q2', numero: 'ACC-2026-000002', documentTitre: 'Plan cadastral', statut: 'ACCORDEE', etat: 'ACCORDEE', accordeJusquAu: '2026-11-06T00:00:00Z', message: 'Accès accordé pour votre thèse', peutAnnuler: false, documentId: DOC }), request()]);
    api.cancelAccessRequest.mockResolvedValue(request({ statut: 'ANNULEE', etat: 'ANNULEE', peutAnnuler: false }));
    open('/portail/compte');
    expect(await screen.findByRole('heading', { name: 'Mes demandes d’accès' })).toBeTruthy();
    const granted = screen.getByRole('heading', { name: 'Plan cadastral' }).closest('article')!;
    expect(within(granted).getByText('Accordée')).toBeTruthy();
    expect(within(granted).getByText(/jusqu’au/).textContent).toContain('5 novembre 2026');
    expect(within(granted).getByText('Message de l’institution : Accès accordé pour votre thèse')).toBeTruthy();
    expect(within(granted).getByRole('link', { name: 'Lire' }).getAttribute('href')).toBe('/portail/lecture/' + DOC);
    expect(within(granted).queryByRole('button', { name: 'Annuler ma demande' })).toBeNull();
    const waiting = screen.getByRole('heading', { name: 'Registre sous réserve' }).closest('article')!;
    expect(within(waiting).getByText('Déposée')).toBeTruthy();
    expect(within(waiting).getByRole('link', { name: 'Voir la notice' }).getAttribute('href')).toBe('/portail/notices/' + NOTICE);
    api.accessRequests.mockResolvedValue([request({ statut: 'ANNULEE', etat: 'ANNULEE', peutAnnuler: false })]);
    fireEvent.click(within(waiting).getByRole('button', { name: 'Annuler ma demande' }));
    await waitFor(() => expect(api.cancelAccessRequest).toHaveBeenCalledWith('q1'));
    expect(await screen.findByText('Annulée')).toBeTruthy();
});

it('un compte sans demande d’accès le dit', async () => {
    signedIn([sub()]);
    open('/portail/compte');
    expect(await screen.findByText('Aucune demande pour le moment.')).toBeTruthy();
});

it('si les demandes ne se chargent pas, l’abonnement et la lecture restent disponibles', async () => {
    signedIn([sub()]);
    api.accessRequests.mockRejectedValue(new ApiError(500, 'HTTP_ERROR', 'Le service est momentanément indisponible.'));
    open('/portail/notices/' + NOTICE);
    expect((await screen.findByRole('link', { name: 'Lire' })).getAttribute('href')).toBe('/portail/lecture/' + DOC);
});

it('un document refusé à la lecture (404) rappelle de vérifier l’accès accordé dans le compte', async () => {
    signedIn([sub()]);
    api.pages.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Document introuvable.'));
    open('/portail/lecture/' + DOC2);
    expect(await screen.findByRole('heading', { name: 'Document indisponible' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'votre compte' }).getAttribute('href')).toBe('/portail/compte');
});
