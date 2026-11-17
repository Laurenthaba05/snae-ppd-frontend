import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RoomClosureNotification } from '../../src/ui/RoomClosureNotification';

it('une adresse manquante ouvre les coordonnees sans annoncer un envoi',()=>{
    const contact=vi.fn();const retry=vi.fn();
    render(<RoomClosureNotification notice={{state:'ADRESSE_A_COMPLETER',recipient:null,sentAt:null}} mayDesk busy={false} onRetry={retry} onContact={contact}/>);
    fireEvent.click(screen.getByRole('button',{name:'Coordonnées du lecteur'}));
    expect(contact).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();expect(screen.queryByText('E-mail envoyé')).toBeNull();
});
it.each(['SMTP_DESACTIVE','A_PREPARER','A_ENVOYER','CADUQUE'])('ne propose pas de double envoi en etat %s',state=>{
    render(<RoomClosureNotification notice={{state,recipient:null,sentAt:null}} mayDesk busy={false} onRetry={vi.fn()} onContact={vi.fn()}/>);
    expect(screen.queryByRole('button',{name:'Reprendre l’alerte'})).toBeNull();expect(screen.queryByText('E-mail envoyé')).toBeNull();
});
it('un courrier envoye presente le destinataire masque et sa date',()=>{
    render(<RoomClosureNotification notice={{state:'ENVOYE',recipient:'l***@example.test',sentAt:'2026-11-10T10:00:00Z'}} mayDesk busy={false} onRetry={vi.fn()} onContact={vi.fn()}/>);
    expect(screen.getByText('E-mail envoyé')).toBeTruthy();expect(screen.getByText('l***@example.test')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();
});
it('la consultation seule ne permet pas de relancer une alerte',()=>{
    render(<RoomClosureNotification notice={{state:'ECHEC',recipient:null,sentAt:null}} mayDesk={false} busy={false} onRetry={vi.fn()} onContact={vi.fn()}/>);
    expect(screen.getByText('Échec d’envoi')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();
});
