import React from 'react';
import {act,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
vi.mock('../../src/auth/config',()=>({configIssue:()=>null,config:{demo:false,authMode:'supabase',apiBase:'/api/v1'}}));
vi.mock('../../src/auth/driver',()=>({createAuthDriver:async()=>({initialize:async()=>true,accessToken:async()=> 'test-token',signIn:async()=>{},signOut:async()=>{}})}));
vi.mock('../../src/ui/navigation',()=>({navigate:vi.fn()}));
import {SessionProvider,useSession} from '../../src/auth/session';
function Probe(){return <span>{useSession().me?'connecté':'déconnecté'}</span>;}
it('aucune relecture cachée, puis contrôle immédiat et refus d’un compte révoqué au retour',async()=>{
 const me={user:{id:'00000000-0000-4000-8000-000000000001',status:'ACTIF',accountType:'USER',scope:'NATIONAL',institutionId:null,departmentId:null},grants:[],truncated:false};
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(me),{status:200,headers:{'Content-Type':'application/json'}}));
 // Each fetch receives an independent response body.
 fetcher.mockImplementation(async()=>new Response(JSON.stringify(me),{status:200,headers:{'Content-Type':'application/json'}}));
 vi.stubGlobal('fetch',fetcher);vi.useFakeTimers();const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 try{
  render(<SessionProvider><Probe/></SessionProvider>);await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(screen.getByText('connecté')).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('hidden');await act(async()=>{await vi.advanceTimersByTimeAsync(180000);});expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockImplementation(async()=>new Response(JSON.stringify({code:'ACCESS_DENIED',message:'Compte révoqué'}),{status:403,headers:{'Content-Type':'application/json'}}));
  visibility.mockReturnValue('visible');await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(0);});
  expect(fetcher).toHaveBeenCalledTimes(2);expect(screen.getByText('déconnecté')).toBeTruthy();
 }finally{vi.useRealTimers();vi.unstubAllGlobals();visibility.mockRestore();}
});
