import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PreservationMonitor } from '../../src/core/types';
const fixture=vi.hoisted(() => ({ records:{ preservationMonitor:vi.fn() }, epoch:1, demo:false, scope:{institutionId:'institution-a',departmentId:null} }));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>fixture}));
import { PreservationMonitoring } from '../../src/ui/PreservationMonitoring';
const result=():PreservationMonitor=>({enabled:true,intervalDays:30,pollMs:60000,worker:{lastStartedAt:new Date().toISOString(),lastFinishedAt:new Date().toISOString(),lastHeartbeatAt:new Date().toISOString(),errorCode:null},
    summary:{total:2,blocked:1,unavailable:1,due:1,unscheduled:0},items:[
        {fileId:'one',documentId:'doc',documentReference:'DOC-1',filename:'archive.pdf',mediaType:'application/pdf',status:'BLOCKED',lastVerifiedAt:'2026-09-01T12:00:00Z',lastCheckedAt:'2026-09-30T12:00:00Z',nextCheckAt:'2026-10-01T12:00:00Z',consecutiveFailures:1},
        {fileId:'two',documentId:'doc',documentReference:'DOC-1',filename:'photo.jpg',mediaType:'image/jpeg',status:'UNAVAILABLE',lastVerifiedAt:'2026-09-01T12:00:00Z',lastCheckedAt:'2026-09-30T12:00:00Z',nextCheckAt:'2026-10-01T12:00:00Z',consecutiveFailures:2}],page:0,hasMore:true});
beforeEach(()=>{fixture.epoch=1;fixture.demo=false;fixture.scope.institutionId='institution-a';fixture.records.preservationMonitor.mockReset().mockResolvedValue(result());});
it('distingue une corruption bloquée d’une indisponibilité temporaire',async()=>{
    render(<PreservationMonitoring/>);
    await screen.findByText('Intégrité compromise — bloqué');
    expect(screen.getByText('Stockage indisponible — nouvel essai prévu')).toBeTruthy();
    expect(screen.getByText('Intervention requise')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('copie saine');
});
it('signale la désactivation et ne prétend pas avoir réalisé un premier passage',async()=>{
    fixture.records.preservationMonitor.mockResolvedValue({...result(),enabled:false});
    render(<PreservationMonitoring/>);
    await screen.findByText(/contrôles périodiques sont désactivés/);
});
it('signale un service sans activité récente',async()=>{
    fixture.records.preservationMonitor.mockResolvedValue({...result(),worker:{lastStartedAt:'2020-01-01T00:00:00Z',lastFinishedAt:'2020-01-01T00:01:00Z',lastHeartbeatAt:'2020-01-01T00:01:00Z',errorCode:null}});
    render(<PreservationMonitoring/>);
    await screen.findByText(/ne donne plus de nouvelles/);
});
it('n’affiche pas une liste vide lorsqu’une requête échoue',async()=>{
    fixture.records.preservationMonitor.mockRejectedValue(new Error('Service indisponible'));
    render(<PreservationMonitoring/>);
    await screen.findByRole('alert');
    expect(screen.queryByText('Aucun fichier suivi')).toBeNull();
});
it('pagine et remet la page à zéro après sélection du filtre',async()=>{
    render(<PreservationMonitoring/>);
    await screen.findByText('archive.pdf');
    fireEvent.click(screen.getByRole('button',{name:'Suivante'}));
    await waitFor(()=>expect(fixture.records.preservationMonitor.mock.calls.at(-1)?.[2]).toBe(1));
    await screen.findByText('archive.pdf');
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(()=>expect(fixture.records.preservationMonitor.mock.calls.at(-1)?.slice(2,4)).toEqual([0,true]));
});
it('retire les données et annule la requête lors d’un changement de périmètre',async()=>{
    let resolve!:(value:PreservationMonitor)=>void;
    fixture.records.preservationMonitor.mockReturnValue(new Promise<PreservationMonitor>(yes=>resolve=yes));
    const view=render(<PreservationMonitoring/>);
    const signal=fixture.records.preservationMonitor.mock.calls[0][4] as AbortSignal;
    fixture.scope.institutionId='institution-b';
    fixture.records.preservationMonitor.mockResolvedValue({...result(),items:[]});
    view.rerender(<PreservationMonitoring/>);
    expect(signal.aborted).toBe(true);
    await act(async()=>resolve(result()));
    await screen.findByText('Aucun fichier suivi');
    expect(screen.queryByText('archive.pdf')).toBeNull();
});
it('ne simule aucun contrôle automatique en mode démonstration',async()=>{
    fixture.demo=true;
    render(<PreservationMonitoring/>);
    await screen.findByText(/disponible en mode connecté/);
    expect(fixture.records.preservationMonitor).not.toHaveBeenCalled();
});
