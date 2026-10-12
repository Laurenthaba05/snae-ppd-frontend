import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { HeritageAssetsPanel } from '../ui/HeritageAssets';
import { HeritageEntriesPanel } from '../ui/HeritageEntries';
import { PlacementsPanel } from '../ui/HeritagePlacement';
import { RecolementsPanel } from '../ui/HeritageRecolement';
import { ConservationQueuePanel } from '../ui/HeritageConservation';
import { MovementsPanel } from '../ui/HeritageMovements';
import { DigitizationOrdersPanel } from '../ui/HeritageDigitization';
import { DossiersPanel } from '../ui/HeritageDossiers';
import { DeaccessionsPanel } from '../ui/HeritageDeaccessions';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, formatDate } from '../ui/components';
import type { Place, HistoricalEvent, Subject } from '../core/types';

function CreatePlaceDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { heritage } = useSession();
    const [nom, setNom] = useState('');
    const [typeLieu, setTypeLieu] = useState('');
    const [description, setDescription] = useState('');
    const extra = useOptionalFields('place');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command('/places', { ...extra.payload(), nom: nom.trim(), typeLieu: typeLieu.trim() || null, description: description.trim() || null }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un lieu" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Nom" wide><input value={nom} onChange={e => setNom(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Type" hint="Optionnel"><input value={typeLieu} onChange={e => setTypeLieu(e.target.value)} maxLength={80} disabled={busy}/></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function CreateHistoricalEventDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { heritage } = useSession();
    const [titre, setTitre] = useState('');
    const [dateDebut, setDateDebut] = useState('');
    const [dateFin, setDateFin] = useState('');
    const [description, setDescription] = useState('');
    const extra = useOptionalFields('event');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command('/historical-events', { ...extra.payload(), titre: titre.trim(), dateDebut: dateDebut || null, dateFin: dateFin || null, description: description.trim() || null }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un événement historique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Titre" wide><input value={titre} onChange={e => setTitre(e.target.value)} required maxLength={500} disabled={busy}/></Field>
                <Field label="Date de début" hint="Optionnelle"><input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} disabled={busy}/></Field>
                <Field label="Date de fin" hint="Optionnelle"><input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} disabled={busy}/></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function CreateSubjectDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { heritage } = useSession();
    const [terme, setTerme] = useState('');
    const [vocabulaire, setVocabulaire] = useState('');
    const [definition, setDefinition] = useState('');
    const extra = useOptionalFields('subject');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command('/subjects', { ...extra.payload(), terme: terme.trim(), vocabulaire: vocabulaire.trim() || null, definition: definition.trim() || null }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un sujet" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Terme" wide><input value={terme} onChange={e => setTerme(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Vocabulaire" hint="Optionnel"><input value={vocabulaire} onChange={e => setVocabulaire(e.target.value)} maxLength={255} disabled={busy}/></Field>
                <Field label="Définition" wide><textarea value={definition} onChange={e => setDefinition(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

/** Référentiels nationaux : lieux, événements historiques, sujets. Chargés seulement quand l'onglet est ouvert. */
function HeritageCatalogues() {
    const { me, heritage, epoch } = useSession();
    const [creating, setCreating] = useState<'place' | 'event' | 'subject' | null>(null);
    const canManage = can(me, 'HERITAGE_CATALOG_MANAGE', {});
    const placesQ = useResource<Place[]>(s => heritage!.places(s), 'heritage-places:' + epoch);
    const eventsQ = useResource<HistoricalEvent[]>(s => heritage!.historicalEvents(s), 'heritage-events:' + epoch);
    const subjectsQ = useResource<Subject[]>(s => heritage!.subjects(s), 'heritage-subjects:' + epoch);
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Lieux</h3>{canManage && <button className="btn small secondary" onClick={() => setCreating('place')}>Créer un lieu</button>}</div>
            {placesQ.loading ? <Busy /> : placesQ.error ? <ErrorNotice error={placesQ.error} onRetry={placesQ.refresh}/> : placesQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Nom</th><th>Type</th><th>Coordonnées</th></tr></thead><tbody>{placesQ.data.map(p => <tr key={p.id}><td><strong>{p.nom}</strong></td><td>{p.typeLieu ?? '—'}</td><td>{p.latitude && p.longitude ? p.latitude + ', ' + p.longitude : '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun lieu" description="Créez le premier lieu du référentiel."/>}
        </div>
        <div className="panel">
            <div className="section-heading"><h3>Événements historiques</h3>{canManage && <button className="btn small secondary" onClick={() => setCreating('event')}>Créer un événement</button>}</div>
            {eventsQ.loading ? <Busy /> : eventsQ.error ? <ErrorNotice error={eventsQ.error} onRetry={eventsQ.refresh}/> : eventsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Titre</th><th>Début</th><th>Fin</th></tr></thead><tbody>{eventsQ.data.map(ev => <tr key={ev.id}><td><strong>{ev.titre}</strong></td><td>{ev.dateDebut ?? '—'}</td><td>{ev.dateFin ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun événement historique" description="Créez le premier événement du référentiel."/>}
        </div>
        <div className="panel">
            <div className="section-heading"><h3>Sujets</h3>{canManage && <button className="btn small secondary" onClick={() => setCreating('subject')}>Créer un sujet</button>}</div>
            {subjectsQ.loading ? <Busy /> : subjectsQ.error ? <ErrorNotice error={subjectsQ.error} onRetry={subjectsQ.refresh}/> : subjectsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Terme</th><th>Vocabulaire</th></tr></thead><tbody>{subjectsQ.data.map(s => <tr key={s.id}><td><strong>{s.terme}</strong></td><td>{s.vocabulaire ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun sujet" description="Créez le premier sujet du référentiel."/>}
        </div>
        {creating === 'place' && <CreatePlaceDialog onClose={() => setCreating(null)} onCreated={placesQ.refresh}/>}
        {creating === 'event' && <CreateHistoricalEventDialog onClose={() => setCreating(null)} onCreated={eventsQ.refresh}/>}
        {creating === 'subject' && <CreateSubjectDialog onClose={() => setCreating(null)} onCreated={subjectsQ.refresh}/>}
        </>;
}

/** Patrimoine historique et documentaire : les biens patrimoniaux (inventaire, description scientifique, provenance, valeur) et les référentiels qui les décrivent. */
export function HeritagePage({ initialAssetId }: { initialAssetId?: string } = {}) {
    const { me } = useSession();
    const [tab, setTab] = useState<'biens' | 'entrees' | 'localisation' | 'recolements' | 'conservation' | 'mouvements' | 'dossiers' | 'numerisation' | 'sorties' | 'referentiels'>('biens');
    const tabs: Array<[typeof tab, string]> = [['biens', 'Biens patrimoniaux'], ['entrees', 'Entrées et provenance']];
    // Où se trouve un objet précieux est une information sensible : l'onglet exige le droit de lire les archives physiques.
    if (can(me, 'PHYSICALARCHIVES_READ', {})) tabs.push(['localisation', 'Localisation et vérifications']);
    tabs.push(['recolements', 'Récolements'], ['conservation', 'Conservation'], ['mouvements', 'Mouvements'], ['dossiers', 'Prêts et expositions'], ['numerisation', 'Numérisation'], ['sorties', 'Sorties de collection'], ['referentiels', 'Lieux, événements et sujets']);
    return <><PageHead eyebrow="MODULE · PATRIMOINE" title="Patrimoine historique et documentaire" description="Inventaire des biens patrimoniaux, entrées et provenance, localisation, description scientifique et valeur ; référentiels des lieux, événements et sujets."/>
        <div role="tablist" className="asset-tabs page-tabs" aria-label="Sections du patrimoine">
            {tabs.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}
        </div>
        {tab === 'biens' ? <HeritageAssetsPanel initialAssetId={initialAssetId} /> : tab === 'entrees' ? <HeritageEntriesPanel /> : tab === 'localisation' ? <PlacementsPanel /> : tab === 'recolements' ? <RecolementsPanel /> : tab === 'conservation' ? <ConservationQueuePanel /> : tab === 'mouvements' ? <MovementsPanel /> : tab === 'dossiers' ? <DossiersPanel /> : tab === 'numerisation' ? <DigitizationOrdersPanel /> : tab === 'sorties' ? <DeaccessionsPanel /> : <HeritageCatalogues />}
    </>;
}

function TagPlaceDialog({ documentId, places, onClose, onTagged }: {
    documentId: string;
    places: Place[];
    onClose: () => void;
    onTagged: () => void;
}) {
    const { heritage } = useSession();
    const [placeId, setPlaceId] = useState('');
    const [roleLieu, setRoleLieu] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command(`/documents/${documentId}/places/${placeId}`, { roleLieu: roleLieu.trim() }, crypto.randomUUID(), 'POST');
            onTagged();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Associer un lieu" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Lieu" wide><select value={placeId} onChange={e => setPlaceId(e.target.value)} required disabled={busy}><option value="">Choisir un lieu</option>{places.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></Field>
                <Field label="Rôle" hint="Ex. LIEU_PRODUCTION, LIEU_EVENEMENT" wide><input value={roleLieu} onChange={e => setRoleLieu(e.target.value)} required maxLength={50} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !placeId}>Associer</button></footer>
        </form>
    </Modal>;
}

function TagHistoricalEventDialog({ documentId, events, onClose, onTagged }: {
    documentId: string;
    events: HistoricalEvent[];
    onClose: () => void;
    onTagged: () => void;
}) {
    const { heritage } = useSession();
    const [eventId, setEventId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command(`/documents/${documentId}/historical-events/${eventId}`, {}, crypto.randomUUID(), 'POST');
            onTagged();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Associer un événement historique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Événement" wide><select value={eventId} onChange={e => setEventId(e.target.value)} required disabled={busy}><option value="">Choisir un événement</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.titre}</option>)}</select></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !eventId}>Associer</button></footer>
        </form>
    </Modal>;
}

function TagSubjectDialog({ documentId, subjects, onClose, onTagged }: {
    documentId: string;
    subjects: Subject[];
    onClose: () => void;
    onTagged: () => void;
}) {
    const { heritage } = useSession();
    const [subjectId, setSubjectId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command(`/documents/${documentId}/subjects/${subjectId}`, {}, crypto.randomUUID(), 'POST');
            onTagged();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Associer un sujet" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Sujet" wide><select value={subjectId} onChange={e => setSubjectId(e.target.value)} required disabled={busy}><option value="">Choisir un sujet</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.terme}</option>)}</select></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !subjectId}>Associer</button></footer>
        </form>
    </Modal>;
}

function CreateTextDialog({ documentId, onClose, onCreated }: {
    documentId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { heritage } = useSession();
    const [langue, setLangue] = useState('');
    const [typeTexte, setTypeTexte] = useState('');
    const [contenu, setContenu] = useState('');
    const [estOriginal, setEstOriginal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await heritage!.command(`/documents/${documentId}/texts`, { langue: langue.trim(), typeTexte: typeTexte.trim(), contenu, estOriginal }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Ajouter un texte multilingue" onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Langue" hint="Code ISO, ex. fr, en"><input value={langue} onChange={e => setLangue(e.target.value)} required maxLength={20} disabled={busy}/></Field>
                <Field label="Type" hint="Ex. TRANSCRIPTION, TRADUCTION"><input value={typeTexte} onChange={e => setTypeTexte(e.target.value)} required maxLength={30} disabled={busy}/></Field>
                <Field label="Original ?"><select value={estOriginal ? 'oui' : 'non'} onChange={e => setEstOriginal(e.target.value === 'oui')} disabled={busy}><option value="non">Non</option><option value="oui">Oui</option></select></Field>
                <Field label="Contenu" wide><textarea value={contenu} onChange={e => setContenu(e.target.value)} required rows={8} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
        </form>
    </Modal>;
}

export function HeritagePanel({ documentId }: {
    documentId: string;
}) {
    const { me, heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManage = can(me, 'HERITAGE_TAG_MANAGE', scope);
    const [tagging, setTagging] = useState(false);
    const [taggingEvent, setTaggingEvent] = useState(false);
    const [taggingSubject, setTaggingSubject] = useState(false);
    const [addingText, setAddingText] = useState(false);
    const placesQ = useResource(s => heritage!.documentPlaces(documentId, s), 'document-places:' + documentId + epoch);
    const eventsQ = useResource(s => heritage!.documentHistoricalEvents(documentId, s), 'document-heritage-events:' + documentId + epoch);
    const subjectsQ = useResource(s => heritage!.documentSubjects(documentId, s), 'document-subjects:' + documentId + epoch);
    const textsQ = useResource(s => heritage!.documentTexts(documentId, s), 'document-texts:' + documentId + epoch);
    const allPlacesQ = useResource<Place[]>(s => heritage!.places(s), 'heritage-places:' + epoch);
    const allEventsQ = useResource<HistoricalEvent[]>(s => heritage!.historicalEvents(s), 'heritage-events:' + epoch);
    const allSubjectsQ = useResource<Subject[]>(s => heritage!.subjects(s), 'heritage-subjects:' + epoch);
    const places = placesQ.data ?? [];
    const events = eventsQ.data ?? [];
    const subjects = subjectsQ.data ?? [];
    const texts = textsQ.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Patrimoine</h3>{canManage && <div className="table-actions"><button className="btn small secondary" onClick={() => setTagging(true)}>Associer un lieu</button><button className="btn small secondary" onClick={() => setTaggingEvent(true)}>Associer un événement</button><button className="btn small secondary" onClick={() => setTaggingSubject(true)}>Associer un sujet</button></div>}</div>
        {placesQ.loading || eventsQ.loading || subjectsQ.loading ? <Busy /> : <div className="form-grid">
            <div><h4>Lieux</h4>{places.length ? <ul>{places.map(p => <li key={p.place.id}>{p.place.nom} — {p.roleLieu}</li>)}</ul> : <Empty title="Aucun lieu associé"/>}</div>
            <div><h4>Événements historiques</h4>{events.length ? <ul>{events.map(ev => <li key={ev.id}>{ev.titre}</li>)}</ul> : <Empty title="Aucun événement associé"/>}</div>
            <div><h4>Sujets</h4>{subjects.length ? <ul>{subjects.map(s => <li key={s.id}>{s.terme}</li>)}</ul> : <Empty title="Aucun sujet associé"/>}</div>
        </div>}
        <div className="section-heading"><h4>Textes multilingues</h4>{canManage && <button className="btn small secondary" onClick={() => setAddingText(true)}>Ajouter un texte</button>}</div>
        {textsQ.loading ? <Busy /> : textsQ.error ? <ErrorNotice error={textsQ.error} onRetry={textsQ.refresh}/> : texts.length ? <div className="table-scroll"><table><thead><tr><th>Langue</th><th>Type</th><th>Original</th><th>Créé le</th></tr></thead><tbody>{texts.map(t => <tr key={t.id}><td>{t.langue}</td><td>{t.typeTexte}</td><td>{t.estOriginal ? 'Oui' : 'Non'}</td><td>{formatDate(t.createdAt)}</td></tr>)}</tbody></table></div> : <Empty title="Aucun texte multilingue" description="Ajoutez une transcription ou une traduction."/>}
        {tagging && <TagPlaceDialog documentId={documentId} places={allPlacesQ.data ?? []} onClose={() => setTagging(false)} onTagged={placesQ.refresh}/>}
        {taggingEvent && <TagHistoricalEventDialog documentId={documentId} events={allEventsQ.data ?? []} onClose={() => setTaggingEvent(false)} onTagged={eventsQ.refresh}/>}
        {taggingSubject && <TagSubjectDialog documentId={documentId} subjects={allSubjectsQ.data ?? []} onClose={() => setTaggingSubject(false)} onTagged={subjectsQ.refresh}/>}
        {addingText && <CreateTextDialog documentId={documentId} onClose={() => setAddingText(false)} onCreated={textsQ.refresh}/>}
    </section>;
}
