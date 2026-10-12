import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { ReasonPrompt, saveBlob, useAction } from './ReadingRoomParts';
import {
    COLOR_MODE_LABELS, FINDING_LABELS, PROFILE_BITS, PROFILE_COLOR_MODES, PROFILE_FORMATS, STATUS_LABELS, emptyProfileForm, mixFileName, profilePayload, profileProblems, requirementLines,
    pdfaRows, technicalRows, type ConformityReport, type ImageTechnical, type PdfaDeclaration, type ProfileForm, type ScanProfile
} from '../core/scanProfiles';

/**
 * Les caractéristiques techniques d'une image (ce que contient le fichier), leur export MIX, et leur conformité à un profil de numérisation de l'institution. La conformité compare des
 * en-têtes à des exigences : elle ne mesure ni la netteté ni les couleurs, ce n'est pas une certification.
 */
export function ImageTechnicalDialog({ fileId, fileName, institutionId, onClose }: { fileId: string; fileName: string; institutionId: string | null; onClose: () => void }) {
    const { digitization, epoch } = useSession();
    const [profileId, setProfileId] = useState('');
    const [report, setReport] = useState<ConformityReport | null>(null);
    const action = useAction();
    const technical = useResource<ImageTechnical>(s => digitization!.imageTechnical(fileId, s), `image-technical:${fileId}:${epoch}`);
    const profiles = useResource<ScanProfile[]>(s => digitization!.scanProfiles(institutionId, false, s), `scan-profiles-active:${institutionId ?? 'national'}:${epoch}`);
    const evaluate = async (id: string) => {
        setProfileId(id); setReport(null);
        if (!id) return;
        const result = await action.run({ fileId, profileId: id }, () => digitization!.imageConformity(fileId, id));
        if (result) setReport(result);
    };
    const exportMix = async () => {
        const blob = await action.run({ mix: fileId }, () => digitization!.imageMix(fileId));
        if (blob) saveBlob(blob, mixFileName(fileName));
    };
    const rows = technical.data ? technicalRows(technical.data.metadata) : [];
    const available = profiles.data ?? [];
    return <Modal wide title="Caractéristiques de l’image" subtitle={fileName} onClose={onClose} locked={action.busy}>
        {technical.loading && !technical.data ? <Busy /> : technical.error ? <ErrorNotice error={technical.error} onRetry={technical.refresh} /> : <>
            <div className="table-scroll"><table><tbody>
                {rows.map(r => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}
            </tbody></table></div>
            <p><small>Ces valeurs sont lues dans les en-têtes du fichier ; une valeur absente est dite « non renseignée », jamais supposée.{technical.data && <> Lues le {formatDate(technical.data.extractedAt)}.</>}</small></p>
            <div className="form-grid">
                <Field label="Profil de numérisation" wide hint="Compare l’image aux exigences du profil choisi : résolution, profondeur, mode, format, compression, profil ICC.">
                    <select value={profileId} onChange={e => void evaluate(e.target.value)} disabled={action.busy || profiles.loading && !profiles.data}>
                        <option value="">{available.length ? 'Choisir un profil' : 'Aucun profil défini'}</option>
                        {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
            </div>
            {report && <div aria-live="polite">
                <Notice tone={report.conform ? 'info' : 'warning'}><strong>{report.conform ? `Conforme au profil « ${report.profileName} »` : `Non conforme au profil « ${report.profileName} »`}</strong></Notice>
                <div className="table-scroll"><table><thead><tr><th>Exigence</th><th>Résultat</th><th>Constat</th></tr></thead><tbody>
                    {report.findings.map(f => <tr key={f.code}><td>{FINDING_LABELS[f.code] ?? f.code}</td><td><Badge value={f.ok ? 'CONFORME' : 'NON_CONFORME'} label={f.ok ? 'Conforme' : 'Non conforme'} /></td><td>{f.message}</td></tr>)}
                </tbody></table></div>
                <p><small>La conformité compare les en-têtes du fichier aux exigences du profil. Elle ne mesure ni la netteté ni l’exactitude des couleurs : ce n’est pas une certification FADGI ou Metamorfoze.</small></p>
            </div>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
        </>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
            <button type="button" className="btn primary" onClick={() => void exportMix()} disabled={action.busy || !technical.data}>Exporter en MIX (XML)</button></footer>
    </Modal>;
}

/** Les profils de numérisation de l'institution du périmètre (et les nationaux) : définir, retirer. Réservé à qui détient l'habilitation de les gérer. */
/** La déclaration PDF/A d'un fichier PDF : ce que le fichier dit de lui-même dans ses métadonnées XMP. Elle n'est jamais présentée comme une validation. */
export function PdfaDialog({ fileId, fileName, onClose }: { fileId: string; fileName: string; onClose: () => void }) {
    const { digitization, epoch } = useSession();
    const q = useResource<PdfaDeclaration>(s => digitization!.pdfaDeclaration(fileId, s), `pdfa:${fileId}:${epoch}`);
    return <Modal title="Déclaration PDF/A du fichier" subtitle={fileName} onClose={onClose}>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data && <>
            <Notice tone={q.data.declared ? 'info' : 'warning'}><strong>{q.data.declared ? `Le fichier se déclare ${q.data.label}.` : 'Le fichier ne déclare pas de conformité PDF/A.'}</strong></Notice>
            <div className="table-scroll"><table><tbody>
                {pdfaRows(q.data).map(r => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}
            </tbody></table></div>
            <p><small>{q.data.notice} Lue le {formatDate(q.data.extractedAt)}.</small></p>
        </>}
        <footer className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

export function ScanProfilesSection() {
    const { me, digitization, epoch, demo } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const mayInstitution = !!institutionId && can(me, 'SCAN_PROFILE_MANAGE', { institutionId });
    const mayNational = can(me, 'SCAN_PROFILE_MANAGE', {});
    const allowed = !demo && !!digitization && (mayInstitution || mayNational);
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [retiring, setRetiring] = useState<ScanProfile | null>(null);
    const [showRetired, setShowRetired] = useState(false);
    const last = useRef<ScanProfile[]>([]);
    const list = useResource<ScanProfile[]>(s => allowed ? digitization!.scanProfiles(institutionId, showRetired, s) : Promise.resolve([]), `scan-profiles:${institutionId ?? 'national'}:${showRetired}:${revision}:${epoch}`);
    if (list.data) last.current = list.data;
    if (!allowed) return null;
    const items = list.data ?? last.current;
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Profils de numérisation">
        <div className="section-heading"><h3>Profils de numérisation</h3>
            <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Définir un profil</button></div>
        <div className="panel-padding">
            <p><small>Un profil dit ce que l’institution exige d’une image numérisée. Aucun profil n’est livré avec l’application. Les exigences d’un profil ne se modifient pas : on le retire et on en définit un autre, pour que les évaluations passées restent lisibles.</small></p>
            <label><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Afficher les profils retirés</label>
        </div>
        {list.loading && !items.length ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
            : items.length === 0 ? <Empty title="Aucun profil de numérisation" description="Définissez les exigences de vos numérisations pour pouvoir contrôler les images." icon="scanner" />
                : <div className="table-scroll"><table><thead><tr><th>Profil</th><th>Exigences</th><th>Périmètre</th><th>État</th><th /></tr></thead>
                    <tbody>{items.map(p => <tr key={p.id}>
                        <td><strong>{p.name}</strong><small className="cell-sub">{p.code}</small>{p.description && <small className="cell-sub">{p.description}</small>}{p.source && <small className="cell-sub">Source : {p.source}</small>}</td>
                        <td><ul className="plain-list">{requirementLines(p).map(line => <li key={line}>{line}</li>)}</ul></td>
                        <td>{p.institutionId ? 'Institution' : 'Nationale'}</td>
                        <td><Badge value={p.status} label={STATUS_LABELS[p.status]} />{p.retireReason && <small className="cell-sub">{p.retireReason}</small>}</td>
                        <td>{p.status === 'ACTIF' && (p.institutionId ? mayInstitution : mayNational) && <button type="button" className="btn small secondary" onClick={() => setRetiring(p)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {creating && <ProfileDialog institutionId={institutionId} mayInstitution={mayInstitution} mayNational={mayNational} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
        {retiring && <ReasonPrompt title={`Retirer « ${retiring.name} »`} subtitle="Le profil ne pourra plus servir à évaluer de nouvelles images." confirm="Retirer le profil" onClose={() => setRetiring(null)}
            onSubmit={async (reason, key) => { await digitization!.command(`/scan-profiles/${retiring.id}/retire`, { reason }, key); reload(); }} />}
    </section>;
}

function ProfileDialog({ institutionId, mayInstitution, mayNational, onClose, onDone }: { institutionId: string | null; mayInstitution: boolean; mayNational: boolean; onClose: () => void; onDone: () => void }) {
    const { digitization } = useSession();
    const [national, setNational] = useState(!mayInstitution);
    const [form, setForm] = useState<ProfileForm>(emptyProfileForm());
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = profileProblems(form);
    const toggle = (field: 'colorModes' | 'formats', value: string) =>
        setForm(f => ({ ...f, [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value] }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = profilePayload(form, national ? null : institutionId);
        if (await action.run(body, key => digitization!.command('/scan-profiles', body, key))) onDone();
    };
    return <Modal wide title="Définir un profil de numérisation" subtitle="Les exigences ne se modifient plus une fois le profil défini" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {mayInstitution && mayNational && <Field label="Périmètre" wide><select value={national ? 'NATIONAL' : 'INSTITUTION'} onChange={e => setNational(e.target.value === 'NATIONAL')} disabled={action.busy}>
                    <option value="INSTITUTION">Institution du périmètre de travail</option><option value="NATIONAL">Nationale (toutes les institutions)</option></select></Field>}
                <Field label="Nom *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Code *" hint="Majuscules, chiffres et souligné : par exemple NUM_ARCHIVES_400."><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} maxLength={60} disabled={action.busy} /></Field>
                <Field label="Résolution minimale (ppp) *"><input type="number" min={50} max={9600} value={form.ppiMin} onChange={e => setForm({ ...form, ppiMin: e.target.value })} disabled={action.busy} /></Field>
                <Field label="Profondeur minimale *"><select value={form.bitsMin} onChange={e => setForm({ ...form, bitsMin: Number(e.target.value) })} disabled={action.busy}>
                    {PROFILE_BITS.map(b => <option key={b} value={b}>{b} {b > 1 ? 'bits' : 'bit'} par composante</option>)}</select></Field>
                <fieldset className="span2 checklist" disabled={action.busy}><legend>Modes colorimétriques acceptés</legend>
                    <small>Aucun coché : tout mode est accepté.</small>
                    <div style={{ display: 'grid', gap: 6, padding: '4px 2px' }}>{PROFILE_COLOR_MODES.map(m => <label key={m} className="field asset-flag">
                        <input type="checkbox" checked={form.colorModes.includes(m)} onChange={() => toggle('colorModes', m)} /><span>{COLOR_MODE_LABELS[m]}</span></label>)}</div>
                </fieldset>
                <fieldset className="span2 checklist" disabled={action.busy}><legend>Formats acceptés</legend>
                    <small>Aucun coché : tout format d’image est accepté.</small>
                    <div style={{ display: 'grid', gap: 6, padding: '4px 2px' }}>{PROFILE_FORMATS.map(f => <label key={f.value} className="field asset-flag">
                        <input type="checkbox" checked={form.formats.includes(f.value)} onChange={() => toggle('formats', f.value)} /><span>{f.label}</span></label>)}</div>
                </fieldset>
                <fieldset className="span2 checklist" disabled={action.busy}><legend>Autres exigences</legend>
                    <div style={{ display: 'grid', gap: 6, padding: '4px 2px' }}>
                        <label className="field asset-flag"><input type="checkbox" checked={form.lossless} onChange={e => setForm({ ...form, lossless: e.target.checked })} /><span>Compression sans perte</span></label>
                        <label className="field asset-flag"><input type="checkbox" checked={form.iccRequired} onChange={e => setForm({ ...form, iccRequired: e.target.checked })} /><span>Profil colorimétrique ICC embarqué</span></label>
                    </div>
                </fieldset>
                <Field label="Source de l’exigence" wide hint="La directive, la norme ou la décision dont vient ce profil."><input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} maxLength={500} disabled={action.busy} /></Field>
                <Field label="Description" wide><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Définir le profil</button></footer>
        </form>
    </Modal>;
}
