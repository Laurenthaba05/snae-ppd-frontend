import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ReaderPaymentsPage, ReaderPurchasesPage, ReaderRenewalPage } from '../../src/portal/ReaderPurchases';
import { DocumentPaymentsApi, type ReaderDocumentPayment } from '../../src/api/documentPayments';
import type { PublicDocumentsApi } from '../../src/api/publicDocuments';
import { ApiError } from '../../src/core/http';
import { portalRoute } from '../../src/portal/PortalApp';
const DOC='11111111-1111-4111-8111-111111111111';const ORDER='22222222-2222-4222-8222-222222222222';
const session=vi.hoisted(()=>({reader:{id:'r1'} as {id:string}|null,loading:false,expired:vi.fn()}));
vi.mock('../../src/portal/context',()=>({usePortal:()=>session,useAction:()=>({busy:false,error:null,run:async(action:()=>Promise<void>)=>{await action();}})}));
const item=(extra:Partial<ReaderDocumentPayment>={}):ReaderDocumentPayment=>({id:ORDER,documentId:DOC,documentTitle:'Recette scanner multipage',documentReference:'RECETTE-SCANNER-MULTIPAGE-20261015',provider:'PAYCARD',amountGnf:1000,currency:'GNF',durationDays:30,status:'CONFIRME',mode:'LOCAL_TEST',createdAt:'2026-11-09T10:00:00Z',validFrom:'2026-11-09T10:01:00Z',validUntil:'2026-12-09T10:01:00Z',accessStatus:'EN_COURS',accessAlert:null,documentAvailable:true,canRead:true,downloadAllowed:false,...extra});
const result=(items:ReaderDocumentPayment[],hasMore=false)=>({items,page:0,size:20,hasMore,mode:'LOCAL_TEST',evaluatedAt:'2026-11-09T14:00:00Z',alertWindowDays:7,downloadAllowed:false});
function client(items=[item()]){return{history:vi.fn().mockResolvedValue(result(items)),purchased:vi.fn().mockResolvedValue(result(items)),refresh:vi.fn().mockResolvedValue({})};}
beforeEach(()=>{history.replaceState(null,'','/portail/achats');session.reader={id:'r1'};session.loading=false;session.expired.mockReset();});
it('les achats affichent les dates exactes, le document et un lien de lecture sans téléchargement',async()=>{
    const api=client();render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi}/>);
    const card=await screen.findByRole('article',{name:'Recette scanner multipage'});
    expect(within(card).getByText('Accès en cours')).toBeTruthy();expect(within(card).getByText('09 déc. 2026, 10:01 UTC')).toBeTruthy();
    expect(within(card).getByRole('link',{name:'Lire le document'}).getAttribute('href')).toBe('/portail/documents/'+DOC);
    expect(screen.queryByRole('link',{name:/Télécharger/})).toBeNull();expect(screen.queryByRole('button',{name:/Télécharger/})).toBeNull();
    expect(screen.getByText(/ces paiements et ces accès sont simulés/)).toBeTruthy();
});
it.each(['EXPIRE','REMBOURSE','INDISPONIBLE','A_VENIR'] as const)('un accès %s ne propose jamais la lecture complète',async accessStatus=>{
    const api=client([item({accessStatus,canRead:false,documentAvailable:accessStatus!=='INDISPONIBLE',status:accessStatus==='REMBOURSE'?'REMBOURSE':'CONFIRME'})]);
    render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi}/>);await screen.findByRole('article');
    expect(screen.queryByRole('link',{name:'Lire le document'})).toBeNull();
    expect(!!screen.queryByRole('link',{name:'Voir l’aperçu gratuit'})).toBe(accessStatus!=='INDISPONIBLE');
    if(accessStatus==='REMBOURSE')expect(screen.getByText('Fin initialement prévue')).toBeTruthy();
});
it('l’historique affiche le prix, le moyen, le statut et permet de vérifier une commande en attente',async()=>{
    const api=client([item({status:'EN_ATTENTE',accessStatus:'NON_CONFIRME',canRead:false,validFrom:null,validUntil:null})]);
    render(<ReaderPaymentsPage client={api as unknown as DocumentPaymentsApi}/>);const card=await screen.findByRole('article');
    expect(within(card).getByText('PayCard')).toBeTruthy();expect(within(card).getByText(/1.?000 GNF/)).toBeTruthy();expect(within(card).getByText('Accès non ouvert')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button',{name:'Vérifier le paiement'}));
    await waitFor(()=>expect(api.refresh).toHaveBeenCalledWith(ORDER));await waitFor(()=>expect(api.history).toHaveBeenCalledTimes(2));
});
it('la pagination et le filtre relisent le serveur et ne tronquent pas la liste au premier écran',async()=>{
    const api=client();api.history.mockResolvedValue(result([item()],true));
    render(<ReaderPaymentsPage client={api as unknown as DocumentPaymentsApi}/>);await screen.findByRole('article');
    fireEvent.click(screen.getByRole('button',{name:'Suivante'}));await waitFor(()=>expect(api.history).toHaveBeenLastCalledWith(1,undefined,expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText('État du paiement'),{target:{value:'REMBOURSE'}});
    await waitFor(()=>expect(api.history).toHaveBeenLastCalledWith(0,'REMBOURSE',expect.any(AbortSignal)));
});
it('une liste vide et une erreur serveur restent compréhensibles et une session expirée est signalée',async()=>{
    const api=client([]);api.history.mockRejectedValueOnce(new ApiError(401,'PORTAL_AUTH_REQUIRED','Session expirée'));
    render(<ReaderPaymentsPage client={api as unknown as DocumentPaymentsApi}/>);await screen.findByText('Session expirée');
    await waitFor(()=>expect(session.expired).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'Réessayer la lecture'}));
    await screen.findByText('Vous n’avez aucun paiement pour le moment.');
});
it('le client utilise uniquement le cookie lecteur et ne transmet aucun identifiant de propriétaire',async()=>{
    const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify(result([])),{status:200}));
    const api=new DocumentPaymentsApi(fetcher);await api.history(1,'CONFIRME');await api.purchased(2);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/portal/document-payments/history?page=1&size=20&status=CONFIRME');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/portal/document-payments/purchased-documents?page=2&size=20');
    expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin');expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
});
it('les routes des achats et paiements sont strictes',()=>{
    expect(portalRoute('/portail/achats')).toEqual({screen:'achats'});expect(portalRoute('/portail/paiements')).toEqual({screen:'paiements'});
    expect(portalRoute('/portail/paiements/extra').screen).toBe('inconnu');
});
it('un visiteur est renvoyé à la connexion sans charger les paiements',async()=>{
    session.reader=null;const api=client();render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi}/>);
    await waitFor(()=>expect(location.pathname).toBe('/portail/connexion'));
    expect(new URLSearchParams(location.search).get('retour')).toBe('/portail/achats');expect(api.purchased).not.toHaveBeenCalled();
});

it('le renouvellement reste fermé tant que le nouveau paiement est en attente puis affiche la nouvelle échéance serveur', async () => {
    const old = item({accessStatus:'EXPIRE',canRead:false,validFrom:'2020-01-01T00:00:00Z',validUntil:'2020-02-01T00:00:00Z'});
    const nextId='33333333-3333-4333-8333-333333333333';
    const pending={...old,id:nextId,status:'EN_ATTENTE',validFrom:null,validUntil:null,verifiedAt:null,checkoutUrl:'http://127.0.0.1:8097/checkout/'+nextId+'?token=test'};
    const api={...client([old]),latest:vi.fn().mockResolvedValue({payment:{...old,checkoutUrl:null,verifiedAt:'2020-01-01T00:00:00Z'}}),start:vi.fn().mockResolvedValue(pending)};
    api.refresh.mockResolvedValue(pending);
    const documents={offer:vi.fn().mockResolvedValue({mode:'LOCAL_TEST',tariff:{typeLabel:'Rapport',amountGnf:1500,durationDays:7},currency:'GNF',providers:[{code:'PAYCARD',label:'PayCard',available:true}]})};
    render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Renouveler l’accès'}));
    const pay=await screen.findByRole('button',{name:'Renouveler avec PayCard'});
    await waitFor(()=>expect(pay.hasAttribute('disabled')).toBe(false));
    expect(screen.getByText(/1.?500 GNF pour 7 jour/)).toBeTruthy();
    fireEvent.click(pay);await screen.findByText('En attente de confirmation');
    expect(api.start).toHaveBeenCalledWith(DOC,'PAYCARD',expect.any(String));
    expect(api.purchased).toHaveBeenCalledTimes(1);expect(screen.queryByRole('link',{name:'Lire le document'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Vérifier la confirmation du paiement'}));
    await waitFor(()=>expect(api.refresh).toHaveBeenCalledTimes(1));
    expect(api.purchased).toHaveBeenCalledTimes(1);
    api.purchased.mockResolvedValue(result([item({id:nextId,validUntil:'2099-12-09T14:00:00Z'})]));
    api.refresh.mockResolvedValue({...pending,status:'CONFIRME',validUntil:'2099-12-09T14:00:00Z'});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Vérifier la confirmation du paiement'}).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Vérifier la confirmation du paiement'}));
    await screen.findByRole('link',{name:'Lire le document'});
    expect(screen.getByText('09 déc. 2099, 14:00 UTC')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Renouveler l’accès'})).toBeNull();
    expect(screen.queryByRole('link',{name:/Télécharger/})).toBeNull();expect(screen.queryByRole('button',{name:/Télécharger/})).toBeNull();
});
it.each(['EN_COURS','REMBOURSE','INDISPONIBLE','A_VENIR'] as const)('la fiche %s ne propose pas de renouvellement d’accès expiré',async accessStatus=>{
    const api=client([item({accessStatus,canRead:accessStatus==='EN_COURS',documentAvailable:accessStatus!=='INDISPONIBLE'})]);
    render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi}/>);await screen.findByRole('article');
    expect(screen.queryByRole('button',{name:'Renouveler l’accès'})).toBeNull();
});
it('un renouvellement sans tarif publié ou avec prestataire indisponible reste désactivé',async()=>{
    const old=item({accessStatus:'EXPIRE',canRead:false,validUntil:'2020-01-01T00:00:00Z'});
    const api={...client([old]),latest:vi.fn().mockResolvedValue({payment:{...old,checkoutUrl:null}}),start:vi.fn()};
    const documents={offer:vi.fn().mockResolvedValue({mode:'DISABLED',tariff:null,currency:'GNF',providers:[{code:'PAYCARD',label:'PayCard',available:false,reason:'Non configuré'}]})};
    render(<ReaderPurchasesPage client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Renouveler l’accès'}));
    expect((await screen.findByRole('button',{name:'Renouveler avec PayCard'})).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/n’a pas encore été publié/)).toBeTruthy();expect(api.start).not.toHaveBeenCalled();
});


it('le lien de courriel conserve le document au retour de connexion et ne charge rien sans session',async()=>{
    session.reader=null;history.replaceState(null,'','/portail/renouveler/'+DOC);
    const api={...client(),purchasedDocument:vi.fn(),start:vi.fn()};
    render(<ReaderRenewalPage id={DOC} client={api as unknown as DocumentPaymentsApi}/>);
    await waitFor(()=>expect(location.pathname).toBe('/portail/connexion'));
    expect(new URLSearchParams(location.search).get('retour')).toBe('/portail/renouveler/'+DOC);
    expect(api.purchasedDocument).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
});
it('le lien ouvre le renouvellement du document exact sans lancer le paiement',async()=>{
    const old=item({accessStatus:'EXPIRE',canRead:false,validUntil:'2020-01-01T00:00:00Z'});
    const api={...client(),purchasedDocument:vi.fn().mockResolvedValue(result([old])),latest:vi.fn().mockResolvedValue({payment:{...old,checkoutUrl:null}}),start:vi.fn()};
    const documents={offer:vi.fn().mockResolvedValue({mode:'LOCAL_TEST',tariff:{typeLabel:'Rapport',amountGnf:1000,durationDays:30},currency:'GNF',providers:[{code:'PAYCARD',label:'PayCard',available:true}]})};
    render(<ReaderRenewalPage id={DOC} client={api as unknown as DocumentPaymentsApi} documents={documents as unknown as PublicDocumentsApi}/>);
    await screen.findByRole('button',{name:'Renouveler avec PayCard'});
    expect(api.purchasedDocument).toHaveBeenCalledWith(DOC,expect.any(AbortSignal));expect(api.purchased).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
    expect(screen.queryByRole('link',{name:/Télécharger/})).toBeNull();
});
it('un ancien courriel après renouvellement propose la lecture sans nouveau paiement',async()=>{
    const api={...client(),purchasedDocument:vi.fn().mockResolvedValue(result([item()])),start:vi.fn()};
    render(<ReaderRenewalPage id={DOC} client={api as unknown as DocumentPaymentsApi}/>);
    await screen.findByRole('link',{name:'Lire le document'});
    expect(screen.queryByRole('button',{name:/Renouveler/})).toBeNull();expect(api.start).not.toHaveBeenCalled();
});
it('le lien reçu par un autre lecteur ne révèle pas le document acheté',async()=>{
    const api={...client(),purchasedDocument:vi.fn().mockResolvedValue(result([]))};
    render(<ReaderRenewalPage id={DOC} client={api as unknown as DocumentPaymentsApi}/>);
    await screen.findByText('Aucun achat de ce document n’est rattaché à ce compte lecteur.');expect(screen.queryByRole('article')).toBeNull();
});
it('les adresses de renouvellement sont strictes et l API utilise uniquement la session',async()=>{
    expect(portalRoute('/portail/renouveler/'+DOC)).toEqual({screen:'renouveler',id:DOC});
    expect(portalRoute('/portail/renouveler/'+DOC+'/extra').screen).toBe('invalide');expect(portalRoute('/portail/renouveler/invalide').screen).toBe('invalide');
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(result([]))));await new DocumentPaymentsApi(fetcher).purchasedDocument(DOC);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/portal/document-payments/purchased-documents/'+DOC);
    expect(fetcher.mock.calls[0][1].method).toBe('GET');expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin');expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
});
