import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// L'origine d'une activité des modules nationaux : l'institution et, si on la connaît, la direction ou le service. Une direction ne se choisit que dans une institution, changer d'institution
// efface la direction, un champ vide part en `null`, l'origine s'affiche par ses noms, et le rattachement d'une activité déjà créée se fait dans une fenêtre qui garde la saisie en cas de refus.
const picked = vi.hoisted(() => ({ institution: 'i-1', department: 'd-1' }));
vi.mock('../../src/auth/session', () => ({ useSession: () => ({ me: null }) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/ui/ReferencePicker', () => ({
    ReferencePicker: ({ kind, label, value, onChange, disabled, scope }: { kind: string; label: string; value: string; onChange: (id: string) => void; disabled?: boolean; scope?: { institutionId?: string | null } }) =>
        <div><span data-testid={'scope-' + kind}>{scope?.institutionId ?? ''}</span><button type="button" aria-label={label} disabled={disabled} onClick={() => onChange(kind === 'institutions' ? picked.institution : picked.department)}>{value || 'vide'}</button>
            <button type="button" aria-label={'Vider ' + label} disabled={disabled} onClick={() => onChange('')}>vider</button></div>
}));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ kind, id }: { kind: string; id: string }) => <span>{(kind === 'institutions' ? 'Institution ' : 'Direction ') + id}</span> }));
import { OriginDialog, OriginFields, OriginText, originPayload } from '../../src/ui/Origin';

function Harness({ onSeen }: { onSeen?: (v: { institution: string; department: string }) => void }) {
    const [institution, setInstitution] = useState('');
    const [department, setDepartment] = useState('');
    onSeen?.({ institution, department });
    return <OriginFields institutionId={institution} departmentId={department} onChange={(i, d) => { setInstitution(i); setDepartment(d); }} />;
}

beforeEach(() => { picked.institution = 'i-1'; picked.department = 'd-1'; });

it('la direction se choisit après l’institution, dans cette institution', () => {
    render(<Harness />);
    const unit = screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }) as HTMLButtonElement;
    expect(unit.disabled).toBe(true);
    expect(screen.getByText('Choisissez d’abord l’institution.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));
    expect((screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('scope-departments').textContent).toBe('i-1');
    expect(screen.getByText('Facultatif : une direction ou un service de cette institution.')).toBeTruthy();
});

it('changer d’institution efface la direction, re-choisir la même la garde', () => {
    let seen = { institution: '', department: '' };
    render(<Harness onSeen={v => { seen = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }));
    expect(seen).toEqual({ institution: 'i-1', department: 'd-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));      // la même institution
    expect(seen).toEqual({ institution: 'i-1', department: 'd-1' });
    picked.institution = 'i-2';
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));      // une autre
    expect(seen).toEqual({ institution: 'i-2', department: '' });
});

it('vider l’institution efface aussi la direction', () => {
    let seen = { institution: '', department: '' };
    render(<Harness onSeen={v => { seen = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vider Sélectionner une institution' }));
    expect(seen).toEqual({ institution: '', department: '' });
});

it('les libellés des champs sont ceux de l’appelant, par exemple pour l’institution versante d’un versement', () => {
    render(<OriginFields institutionId="" departmentId="" onChange={() => {}} institutionLabel="Institution versante" unitLabel="Direction ou service versant" hint="Facultatif : qui verse." />);
    expect(screen.getByText('Institution versante')).toBeTruthy();
    expect(screen.getByText('Direction ou service versant')).toBeTruthy();
    expect(screen.getByText('Facultatif : qui verse.')).toBeTruthy();
});

it('l’origine envoyée au serveur : un champ vide devient null, une direction sans institution est ignorée', () => {
    expect(originPayload('', '')).toEqual({ institutionId: null, departmentId: null });
    expect(originPayload('i-1', '')).toEqual({ institutionId: 'i-1', departmentId: null });
    expect(originPayload('i-1', 'd-1')).toEqual({ institutionId: 'i-1', departmentId: 'd-1' });
    expect(originPayload('', 'd-1')).toEqual({ institutionId: null, departmentId: null });
    expect(originPayload('i-1', 'd-1', { institution: 'sourceInstitutionId', department: 'sourceDepartmentId' })).toEqual({ sourceInstitutionId: 'i-1', sourceDepartmentId: 'd-1' });
});

it('l’origine s’affiche par ses noms, et « non rattaché » quand il n’y en a pas', () => {
    const first = render(<OriginText institutionId={null} departmentId={null} />);
    expect(screen.getByText('Non rattaché')).toBeTruthy();
    first.unmount();
    const second = render(<OriginText institutionId="i-1" departmentId={undefined} />);
    expect(screen.getByText('Institution i-1')).toBeTruthy();
    expect(screen.queryByText(/Direction/)).toBeNull();
    second.unmount();
    render(<OriginText institutionId="i-1" departmentId="d-1" />);
    expect(screen.getByText('Institution i-1')).toBeTruthy();
    expect(screen.getByText('Direction d-1')).toBeTruthy();
});

it('la fenêtre de rattachement part de l’origine actuelle, l’enregistre, puis se ferme', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined); const onClose = vi.fn();
    render(<OriginDialog title="Origine du projet" subject="Registres 1950" institutionId="i-1" departmentId={null} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Origine du projet')).toBeTruthy(); expect(screen.getByText('Registres 1950')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sélectionner une institution' }).textContent).toBe('i-1');
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('i-1', 'd-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('détacher une activité envoie deux null', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OriginDialog title="Origine de l’archive" subject="ARCH-1" institutionId="i-1" departmentId="d-1" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vider Sélectionner une institution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null, null));
});

it('un refus du serveur est dit, la fenêtre reste ouverte avec la saisie et on peut réessayer', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Cette unité n’existe pas dans cette institution.')).mockResolvedValue(undefined); const onClose = vi.fn();
    render(<OriginDialog title="Origine du projet" subject="P" institutionId="i-1" departmentId="d-1" onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Cette unité n’existe pas dans cette institution.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sélectionner une institution' }).textContent).toBe('i-1');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(2);
});

async function violations(container: HTMLElement): Promise<string[]> {
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    return result.violations.map(v => v.id + ' (' + v.impact + ') : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '));
}
it('la fenêtre de rattachement n’a aucune violation d’accessibilité', async () => {
    render(<OriginDialog title="Origine du projet" subject="P" institutionId="i-1" departmentId={null} onSave={async () => {}} onClose={() => {}} />);
    expect(await violations(screen.getByRole('dialog'))).toEqual([]);
});
