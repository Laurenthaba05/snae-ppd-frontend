import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ErrorNotice, Field, Modal } from './components';
import { Suggestions } from './PhysicalSuggestions';
import type { PhysicalArchive } from '../core/types';
import { describeBody, describeForm, describeProblems } from '../core/physicalDescribe';
import type { DescribeForm } from '../core/physicalDescribe';

/**
 * Corriger la description d'une archive : son intitulé (ce que l'on cherche), son support, son état, ses dates et sa quantité. La cote, l'emplacement, l'origine et le document
 * ont leurs propres gestes. Si quelqu'un a corrigé l'archive entre-temps, le serveur refuse : on rouvre la fiche pour voir les informations à jour.
 */
export function DescribeArchiveDialog({ archive, onClose, onSaved }: { archive: PhysicalArchive; onClose: () => void; onSaved: () => void }) {
    const { physicalArchives } = useSession();
    const [form, setForm] = useState<DescribeForm>(() => describeForm(archive));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = describeProblems(form);
    const set = (patch: Partial<DescribeForm>) => setForm(current => ({ ...current, ...patch }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true);
        setError(null);
        try {
            await physicalArchives!.command('/archives/' + archive.id + '/describe', describeBody(form, archive.versionLock), crypto.randomUUID(), 'POST');
            onSaved();
            onClose();
        }
        catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title="Décrire l’archive" subtitle={archive.cote} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé" hint="Le titre court sous lequel on la cherchera : « Registre des mariages de Conakry 1954-1958 »." wide><input value={form.intitule} onChange={e => set({ intitule: e.target.value })} maxLength={500} disabled={busy} /></Field>
                <Field label="Support" hint="Papier, parchemin, photographie…"><input value={form.support} onChange={e => set({ support: e.target.value })} maxLength={80} disabled={busy} list="describe-support" /></Field><Suggestions id="describe-support" field="SUPPORT" />
                <Field label="État physique"><input value={form.etatPhysique} onChange={e => set({ etatPhysique: e.target.value })} maxLength={40} disabled={busy} list="describe-etat" /></Field><Suggestions id="describe-etat" field="ETAT_PHYSIQUE" />
                <Field label="Date extrême de début"><input type="date" value={form.dateExtremeDebut} onChange={e => set({ dateExtremeDebut: e.target.value })} disabled={busy} /></Field>
                <Field label="Date extrême de fin"><input type="date" value={form.dateExtremeFin} onChange={e => set({ dateExtremeFin: e.target.value })} disabled={busy} /></Field>
                <Field label="Quantité" hint="Un nombre, par exemple 12 ou 0,5."><input inputMode="decimal" value={form.quantite} onChange={e => set({ quantite: e.target.value })} disabled={busy} /></Field>
                <Field label="Unité de la quantité" hint="Boîtes, mètres linéaires, pièces…"><input value={form.uniteQuantite} onChange={e => set({ uniteQuantite: e.target.value })} maxLength={30} disabled={busy} list="describe-unite" /></Field><Suggestions id="describe-unite" field="UNITE_QUANTITE" />
                <Field label="Description" wide><textarea value={form.description} onChange={e => set({ description: e.target.value })} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && <ul className="field-error" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
