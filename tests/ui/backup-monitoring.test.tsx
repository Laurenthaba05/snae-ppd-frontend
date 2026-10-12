import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { BackupMonitor } from '../../src/core/types';
const fixture=vi.hoisted(()=>({records:{backupMonitor:vi.fn()},me:null,allowed:true,epoch:1,demo:false}));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/core/policy',()=>({can:()=>fixture.allowed}));
import { BackupMonitoring } from '../../src/ui/BackupMonitoring';
const result=():BackupMonitor=>({enabled:true,intervalHours:24,retentionCopies:30,nextRunAt:new Date(Date.now()+86400000).toISOString(),lastSuccessAt:null,running:false,errorCode:null,runs:[]});
beforeEach(()=>{fixture.allowed=true;fixture.epoch=1;fixture.demo=false;fixture.records.backupMonitor.mockReset().mockResolvedValue(result());});
it('ne demande aucune information globale sans autorisation',()=>{
    fixture.allowed=false;render(<BackupMonitoring/>);expect(fixture.records.backupMonitor).not.toHaveBeenCalled();
});
it('distingue une copie vérifiée d’une restauration échouée',async()=>{
    fixture.records.backupMonitor.mockResolvedValue({...result(),errorCode:'RESTORE_FAILED',runs:[{id:'one',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),status:'FAILED',objectCount:8,totalBytes:100,manifestVerified:true,restoreVerified:false,restoredObjects:null,errorCode:'RESTORE_FAILED'}]});
    render(<BackupMonitoring/>);await screen.findByRole('alert');
    expect(screen.getByRole('cell',{name:'Oui'})).toBeTruthy();expect(screen.getByRole('cell',{name:'Non confirmée'})).toBeTruthy();
    expect(screen.queryByRole('cell',{name:'Réussie'})).toBeNull();
});
it('montre une restauration confirmée et sa date de succès',async()=>{
    const time=new Date().toISOString();fixture.records.backupMonitor.mockResolvedValue({...result(),lastSuccessAt:time,runs:[{id:'one',startedAt:time,completedAt:time,status:'SUCCEEDED',objectCount:8,totalBytes:100,manifestVerified:true,restoreVerified:true,restoredObjects:1,errorCode:null}]});
    render(<BackupMonitoring/>);await screen.findByRole('cell',{name:'Réussie'});expect(screen.getByRole('cell',{name:'Terminé'})).toBeTruthy();
});
it('signale une échéance manquée et une désactivation',async()=>{
    fixture.records.backupMonitor.mockResolvedValue({...result(),nextRunAt:'2020-01-01T00:00:00Z'});
    const view=render(<BackupMonitoring/>);await screen.findByText(/sauvegarde prévue est en retard/);
    fixture.epoch++;fixture.records.backupMonitor.mockResolvedValue({...result(),enabled:false});view.rerender(<BackupMonitoring/>);
    await screen.findByText(/sauvegardes automatiques sont désactivées/);
});
it('retire les données et annule la lecture quand la session change',async()=>{
    fixture.records.backupMonitor.mockReturnValue(new Promise(()=>{}));const view=render(<BackupMonitoring/>);
    const signal=fixture.records.backupMonitor.mock.calls[0][0] as AbortSignal;
    fixture.allowed=false;fixture.epoch++;view.rerender(<BackupMonitoring/>);expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Sauvegardes et restaurations')).toBeNull();
});
it('ne transforme pas une erreur serveur en absence de sauvegardes',async()=>{
    fixture.records.backupMonitor.mockRejectedValue(new Error('Indisponible'));render(<BackupMonitoring/>);
    await screen.findByRole('alert');expect(screen.queryByText('Aucun cycle terminé')).toBeNull();
});
