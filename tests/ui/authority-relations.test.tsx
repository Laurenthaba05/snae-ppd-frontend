import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import { ArchivesApi } from '../../src/api/archives';
import { AuthorityRelationsDialog } from '../../src/ui/AuthorityRelations';
import type { AuthorityRef, RelationView } from '../../src/core/authorityRelations';

const INST = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A: AuthorityRef = { id: id(1), code: 'MIN-ENERGIE', name: 'Ministère de l’Énergie', kind: 'COLLECTIVITE' };
const B: AuthorityRef = { id: id(2), code: 'MIN-MINES', name: 'Ministère des Mines', kind: 'COLLECTIVITE' };
const C: AuthorityRef = { id: id(3), code: 'PRES', name: 'Présidence de la République', kind: 'COLLECTIVITE' };
const D: AuthorityRef = { id: id(4), code: 'MIN-EH', name: 'Ministère de l’Énergie et de l’Hydraulique', kind: 'COLLECTIVITE' };
const P: AuthorityRef = { id: id(5), code: 'KEITA-M', name: 'Mariam Keita', kind: 'PERSONNE' };
const F: AuthorityRef = { id: id(6), code: 'KEITA', name: 'Famille Keita', kind: 'FAMILLE' };
const all = [A, B, C, D, P, F];
let counter = 100;
const rel = (source: AuthorityRef, target: AuthorityRef, type: RelationView['input']['type'], dateStart: string | null = null, dateEnd: string | null = null, description: string | null = null, version = 0): RelationView =>
    ({ id: id(++counter), version, updatedAt: '2026-10-09T10:00:00Z', input: { institutionId: INST, sourceId: source.id, targetId: target.id, type, dateStart, dateEnd, description } });

const transport = { request: vi.fn() };
const api = new ArchivesApi(transport as never);
beforeEach(() => { transport.request.mockReset().mockResolvedValue({}); });

function open(authority: AuthorityRef, relations: RelationView[], canManage = true) {
    const onChanged = vi.fn(), onClose = vi.fn();
    render(<AuthorityRelationsDialog api={api} institution={INST} authority={authority} authorities={all} relations={relations} canManage={canManage} onClose={onClose} onChanged={onChanged} />);
    return { onChanged, onClose };
}
const dialog = () => screen.getByRole('dialog');

it('dit chaque relation depuis la notice, avec le nom de l’autre notice et sa période, sans jamais montrer d’identifiant', () => {
    open(A, [rel(A, C, 'TUTELLE', '2018', null, 'Tutelle administrative'), rel(D, A, 'SUCCESSION', '2021-09-06'), rel(A, B, 'SUCCESSION', '2012', '2017')]);
    const table = within(dialog()).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1).map(r => r.textContent ?? '');
    expect(rows[0]).toContain('Sous la tutelle de'); expect(rows[0]).toContain('Présidence de la République'); expect(rows[0]).toContain('depuis 2018'); expect(rows[0]).toContain('Tutelle administrative');
    expect(rows[1]).toContain('Succède à'); expect(rows[1]).toContain('Ministère des Mines'); expect(rows[1]).toContain('de 2012 à 2017'); expect(rows[1]).toContain('terminée');
    expect(rows[2]).toContain('Remplacée par'); expect(rows[2]).toContain('depuis 6 septembre 2021');
    expect(dialog().textContent).not.toContain('00000000-0000');
    expect(within(dialog()).getByText('Tutelle actuelle :').parentElement?.textContent).toContain('Présidence de la République');
});

it('montre la filiation dans l’ordre où les collectivités se sont succédé', () => {
    open(A, [rel(A, B, 'SUCCESSION', '2012', '2017'), rel(D, A, 'SUCCESSION', '2021')]);
    const lineage = within(dialog()).getByRole('region', { name: 'Filiation' });
    expect(within(lineage).getAllByRole('listitem').map(li => li.querySelector('strong')?.textContent)).toEqual(['Ministère des Mines', 'Ministère de l’Énergie', 'Ministère de l’Énergie et de l’Hydraulique']);
    expect(lineage.querySelector('[aria-current="true"]')?.textContent).toContain('cette notice');
});

it('sans le droit de décrire, la fenêtre se lit mais n’offre ni ajout, ni modification, ni suppression', () => {
    open(A, [rel(A, C, 'TUTELLE', '2018')], false);
    expect(screen.queryByRole('button', { name: 'Ajouter une relation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
});

it('une notice sans relation le dit et propose d’en ajouter', () => {
    open(B, []);
    expect(screen.getByText(/Aucune relation enregistrée pour cette notice/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajouter une relation' })).toBeTruthy();
});

it('enregistre une succession datée dans le sens du serveur, puis prévient l’écran appelant', async () => {
    const { onChanged } = open(D, []);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const form = screen.getByRole('form', { name: 'Nouvelle relation' });
    fireEvent.change(within(form).getByLabelText(/^Nature de la relation/), { target: { value: 'SUCCESSION_SOURCE' } });
    const options = within(form).getAllByRole('option').map(o => o.textContent);
    expect(options).toContain('Ministère de l’Énergie (MIN-ENERGIE)'); expect(options).not.toContain('Ministère de l’Énergie et de l’Hydraulique (MIN-EH)');   // pas elle-même
    expect(options.join()).not.toContain('Mariam Keita');                                                                                                      // ni une personne
    fireEvent.change(within(form).getByLabelText(/^Notice liée/), { target: { value: A.id } });
    fireEvent.change(within(form).getByLabelText(/^Depuis/), { target: { value: '2021-09' } });
    fireEvent.change(within(form).getByLabelText(/^Commentaire/), { target: { value: 'Décret D/2021/055' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer la relation' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [path, options2] = transport.request.mock.calls[0] as [string, { method: string; body: Record<string, unknown>; idempotencyKey: string }];
    expect(path).toBe('/archives/relations'); expect(options2.method).toBe('POST'); expect(options2.idempotencyKey).toBeTruthy();
    expect(options2.body).toEqual({ institutionId: INST, sourceId: D.id, targetId: A.id, type: 'SUCCESSION', dateStart: '2021-09', dateEnd: null, description: 'Décret D/2021/055' });
    expect(screen.getByText('Relation enregistrée.')).toBeTruthy();
});

it('« Exerce la tutelle sur » enregistre la notice courante comme cible', async () => {
    open(C, []);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const form = screen.getByRole('form', { name: 'Nouvelle relation' });
    fireEvent.change(within(form).getByLabelText(/^Nature de la relation/), { target: { value: 'TUTELLE_TARGET' } });
    fireEvent.change(within(form).getByLabelText(/^Notice liée/), { target: { value: A.id } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer la relation' }));
    await waitFor(() => expect(transport.request).toHaveBeenCalled());
    expect((transport.request.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toMatchObject({ sourceId: A.id, targetId: C.id, type: 'TUTELLE' });
});

it('refuse avant l’envoi une date impossible ou une fin avant le début, avec le motif', () => {
    open(A, []);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const form = screen.getByRole('form', { name: 'Nouvelle relation' });
    fireEvent.change(within(form).getByLabelText(/^Notice liée/), { target: { value: B.id } });
    fireEvent.change(within(form).getByLabelText(/^Depuis/), { target: { value: '2019-02-30' } });
    expect(within(form).getByRole('alert').textContent).toContain('ce jour n’existe pas');
    expect((within(form).getByRole('button', { name: 'Enregistrer la relation' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/^Depuis/), { target: { value: '2022' } });
    fireEvent.change(within(form).getByLabelText(/^Jusqu’à/), { target: { value: '2021' } });
    expect(within(form).getByRole('alert').textContent).toContain('début dépasse');
    fireEvent.change(within(form).getByLabelText(/^Jusqu’à/), { target: { value: '2023' } });
    expect((within(form).getByRole('button', { name: 'Enregistrer la relation' }) as HTMLButtonElement).disabled).toBe(false);
    expect(transport.request).not.toHaveBeenCalled();
});

it('un refus du serveur (boucle, doublon) s’affiche et laisse le formulaire ouvert pour corriger', async () => {
    transport.request.mockRejectedValue(new ApiError(422, 'ARCHIVAL_INVALID', 'Cette relation créerait une boucle valable à la même période (A relève de B, qui relève de A…). Datez les relations pour les distinguer.'));
    const { onChanged } = open(A, []);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const form = screen.getByRole('form', { name: 'Nouvelle relation' });
    fireEvent.change(within(form).getByLabelText(/^Notice liée/), { target: { value: B.id } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer la relation' }));
    expect(await screen.findByText(/créerait une boucle/)).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Nouvelle relation' })).toBeTruthy(); expect(onChanged).not.toHaveBeenCalled();
});

it('modifier une relation garde ses deux notices, envoie sa version et change ses dates', async () => {
    const existing = rel(A, B, 'SUCCESSION', '2018', null, null, 4);
    const { onChanged } = open(A, [existing]);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const form = screen.getByRole('form', { name: 'Modifier la relation' });
    expect((within(form).getByLabelText(/^Nature de la relation/) as HTMLSelectElement).disabled).toBe(true);
    expect((within(form).getByLabelText(/^Notice liée/) as HTMLSelectElement).value).toBe(B.id);
    fireEvent.change(within(form).getByLabelText(/^Jusqu’à/), { target: { value: '2021' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer la relation' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [path, options] = transport.request.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(path).toBe('/archives/relations/' + existing.id); expect(options.method).toBe('PUT');
    expect(options.body).toMatchObject({ sourceId: A.id, targetId: B.id, type: 'SUCCESSION', dateStart: '2018', dateEnd: '2021', version: 4 });
});

it('supprimer demande confirmation, envoie la version et prévient l’écran appelant', async () => {
    const existing = rel(A, C, 'TUTELLE', '2018', null, null, 2);
    const { onChanged } = open(A, [existing]);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(transport.request).not.toHaveBeenCalled();
    expect(screen.getByText('Supprimer cette relation ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Garder' }));
    expect(screen.queryByText('Supprimer cette relation ?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' }).at(-1)!);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [path, options] = transport.request.mock.calls[0] as [string, { method: string }];
    expect(path).toBe(`/archives/relations/${existing.id}/delete?institutionId=${INST}&version=2`); expect(options.method).toBe('POST');
    expect(screen.getByText('Relation supprimée.')).toBeTruthy();
});

it('une personne ne se voit proposer que la parenté et l’association', () => {
    open(P, []);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une relation' }));
    const form = screen.getByRole('form', { name: 'Nouvelle relation' });
    expect(within(within(form).getByLabelText(/^Nature de la relation/)).getAllByRole('option').map(o => o.textContent)).toEqual(['Est liée par la parenté à', 'Est associée à']);
    expect(within(within(form).getByLabelText(/^Notice liée/)).getAllByRole('option').map(o => o.textContent)).toEqual(['Choisir une notice', 'Famille Keita (KEITA)']);
});

it('une relation vers une notice devenue illisible est comptée sans être nommée', () => {
    const ghost = { ...B, id: id(99) };
    open(A, [rel(A, ghost, 'ASSOCIATIVE'), rel(A, C, 'ASSOCIATIVE')]);
    expect(screen.getByText('Une relation concerne une notice qui n’est plus lisible pour vous.')).toBeTruthy();
    expect(within(dialog()).getAllByRole('row')).toHaveLength(2);
});
