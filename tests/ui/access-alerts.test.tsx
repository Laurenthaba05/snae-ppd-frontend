import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReaderAccessAlertsPage } from '../../src/portal/ReaderPurchases';
import { AccessAlertsSummary } from '../../src/portal/AccessAlerts';
import { DocumentPaymentsApi, type ReaderDocumentPayment, type ReaderDocumentPaymentsPage } from '../../src/api/documentPayments';
import type { PublicDocumentsApi } from '../../src/api/publicDocuments';
import { ApiError } from '../../src/core/http';
import { portalRoute } from '../../src/portal/PortalApp';
const DOC='11111111-1111-4111-8111-111111111111',ORDER='22222222-2222-4222-8222-222222222222';
const session=vi.hoisted(()=>({reader:{id:'r1'} as {id:string}|null,loading:false,expired:vi.fn()}));
vi.mock('../../src/portal/context',()=>({usePortal:()=>session,useAction:()=>({busy:false,error:null,run:async(action:()=>Promise<void>)=>{await action();}})}));
const item=(extra:Partial<ReaderDocumentPayment>={}):ReaderDocumentPayment=>({id:ORDER,documentId:DOC,documentTitle:'Recette multipage',documentReference:'RECETTE-SCANNER-MULTIPAGE-20261015',provider:'PAYCARD',amountGnf:1000,currency:'GNF',durationDays:30,status:'CONFIRME',mode:'LOCAL_TEST',createdAt:'2026-11-01T10:00:00Z',validFrom:'2026-11-01T10:01:00Z',validUntil:'2026-11-12T10:00:00Z',accessStatus:'EN_COURS',accessAlert:'EXPIRING_SOON',documentAvailable:true,canRead:true,downloadAllowed:false,...extra});
const result=(items=[item()],extra:Partial<ReaderDocumentPaymentsPage>={}):ReaderDocumentPaymentsPage=>({items,page:0,size:20,hasMore:false,mode:'LOCAL_TEST',evaluatedAt:'2026-11-09T10:00:00Z',alertWindowDays:7,downloadAllowed:false,...extra});
const expired=()=>item({accessAlert:'EXPIRED',accessStatus:'EXPIRE',canRead:false,validUntil:'2026-11-08T10:00:00Z'});
const client=(data=result())=>({alerts:vi.fn().mockResolvedValue(data),latest:vi.fn().mockResolvedValue({payment:null}),start:vi.fn(),refresh:vi.fn()});
beforeEach(()=>{history.replaceState(null,'','/portail/alertes-acces');session.reader={id:'r1'};session.expired.mockReset();});
afterEach(()=>vi.useRealTimers());
it('un accès proche de sa fin avertit le lecteur avec son échéance sans proposer de paiement anticipé',async()=>{
    const api=client();render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi}/>);
    await screen.findByText(/Votre accès expire dans les sept prochains jours/);
    expect(screen.getByText('12 nov. 2026, 10:00 UTC')).toBeTruthy();expect(screen.getByRole('link',{name:'Lire le document'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Renouveler l’accès'})).toBeNull();expect(screen.queryByRole('link',{name:/Télécharger/})).toBeNull();
});
it('le rappel expiré ouvre le renouvellement dans la même fiche sans débloquer le document',async()=>{
    const api=client(result([expired()]));
    const documents={offer:vi.fn().mockResolvedValue({mode:'LOCAL_TEST',tariff:{typeLabel:'Rapport',amountGnf:1000,durationDays:30},currency:'GNF',providers:[{code:'PAYCARD',label:'PayCard',available:true}]})};
    render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    await screen.findByText(/Votre accès a expiré. Pour reprendre/);
    fireEvent.click(screen.getByRole('button',{name:'Renouveler l’accès'}));await screen.findByRole('button',{name:'Renouveler avec PayCard'});
    expect(screen.queryByRole('link',{name:'Lire le document'})).toBeNull();expect(api.start).not.toHaveBeenCalled();
});
it('le rappel disparaît après confirmation serveur du renouvellement',async()=>{
    const api=client(result([expired()]));
    api.latest.mockResolvedValue({payment:{...expired(),status:'EN_ATTENTE',validUntil:null}});
    api.refresh.mockResolvedValue({...item(),validUntil:'2099-12-09T10:00:00Z'});
    const documents={offer:vi.fn().mockResolvedValue({tariff:null,providers:[]})};
    render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Renouveler l’accès'}));
    const verify=await screen.findByRole('button',{name:'Vérifier la confirmation du paiement'});
    api.alerts.mockResolvedValue(result([]));fireEvent.click(verify);
    await screen.findByText('Aucun accès expiré ou arrivant à échéance dans les sept prochains jours.');
    expect(screen.queryByRole('article')).toBeNull();expect(api.refresh).toHaveBeenCalledWith(ORDER);
});
it('le compte lecteur signale les alertes et donne accès à leur liste complète',async()=>{
    render(<AccessAlertsSummary client={client() as unknown as DocumentPaymentsApi}/>);
    await screen.findByText(/Des accès arrivent à échéance/);
    expect(screen.getByRole('link',{name:'Voir mes alertes d’accès'}).getAttribute('href')).toBe('/portail/alertes-acces');
});
it('les pages d’alertes restent paginées et privées',async()=>{
    const api=client(result([item()],{hasMore:true}));render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Suivante'}));
    await waitFor(()=>expect(api.alerts).toHaveBeenLastCalledWith(1,expect.any(AbortSignal)));
    expect(portalRoute('/portail/alertes-acces')).toEqual({screen:'alertes-acces'});expect(portalRoute('/portail/alertes-acces/extra').screen).toBe('inconnu');
});
it('l’API utilise le cookie et aucune identité de lecteur fournie par le navigateur',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(result()),{status:200}));
    await new DocumentPaymentsApi(fetcher).alerts(2);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/portal/document-payments/access-alerts?page=2&size=20');
    expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin');expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
});
it('une erreur de session est signalée sans afficher des alertes en cache',async()=>{
    const api=client();api.alerts.mockRejectedValue(new ApiError(401,'PORTAL_AUTH_REQUIRED','Session expirée'));
    render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi}/>);await screen.findByText('Session expirée');
    expect(session.expired).toHaveBeenCalled();expect(screen.queryByRole('article')).toBeNull();
});
it('la transition à l’expiration relit le serveur même si l’horloge du navigateur est décalée',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2035-01-01T00:00:00Z'));
    const api=client(result([item({validUntil:'2026-11-09T10:00:02Z'})]));
    render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi}/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
    expect(screen.getByRole('link',{name:'Lire le document'})).toBeTruthy();
    api.alerts.mockResolvedValue(result([expired()],{evaluatedAt:'2026-11-09T10:00:03Z'}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(2101);});
    expect(screen.queryByRole('link',{name:'Lire le document'})).toBeNull();expect(screen.getByRole('button',{name:'Renouveler l’accès'})).toBeTruthy();
});
it('le retour sur l’onglet relit les alertes sans fermer un renouvellement ouvert',async()=>{
    const api=client(result([expired()]));const documents={offer:vi.fn().mockResolvedValue({tariff:null,providers:[]})};
    render(<ReaderAccessAlertsPage client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Renouveler l’accès'}));await screen.findByRole('region',{name:'Renouveler l’accès au document'});
    fireEvent(window,new Event('focus'));await waitFor(()=>expect(api.alerts).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button',{name:'Fermer le renouvellement'})).toBeTruthy();expect(api.latest).toHaveBeenCalledTimes(1);
});
