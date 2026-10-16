import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import { visibilityText, levelLabel, type FindingAidCandidate, type FindingAidPreview, type FindingAidPublication } from '../core/findingAids';

/** Les instruments de recherche publiés sur le portail : la liste, la publication d'un fonds avec l'aperçu de ce que le public verrait, le retrait motivé. */
export function FindingAidsPanel({ institutionId }: { institutionId: string }) {
    const { dissemination, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [retiring, setRetiring] = useState<FindingAidPublication | null>(null);
    const [showRetired, setShowRetired] = useState(false);
    const list = useResource<FindingAidPublication[]>(s => dissemination!.findingAids(institutionId, showRetired, s), `finding-aids:${institutionId}:${showRetired}:${revision}:${epoch}`);
    const items = list.data ?? [];
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Instruments de recherche publiés">
        <div className="section-heading"><h3>Instruments de recherche publiés</h3>
            <button type="button" className="btn small primary" onClick={() => setPublishing(true)}>Publier un instrument de recherche</button></div>
        <div className="panel-padding">
            <p><small>Publier un fonds met son inventaire à la disposition du public sur le portail. Le public ne voit que les notices <strong>publiques et validées</strong> ; une notice qui ne l’est plus disparaît aussitôt, sans qu’il faille retoucher la publication.</small></p>
            <label><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Afficher les instruments retirés</label>
        </div>
        {list.loading && !list.data ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
            : items.length === 0 ? <Empty title="Aucun instrument de recherche publié" description="Publiez un fonds pour que son inventaire soit consultable par le public." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Niveau</th><th>Visible pour le public</th><th>Publié</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(p => <tr key={p.id}>
                        <td><strong>{p.title}</strong><small className="cell-sub">{p.code}</small></td>
                        <td>{levelLabel(p.level)}</td>
                        <td>{p.retiredAt ? '—' : visibilityText(p.visibleNodes, p.totalNodes)}</td>
                        <td>{formatDate(p.publishedAt)}{p.publishedByName && <small className="cell-sub">par {p.publishedByName}</small>}</td>
                        <td>{p.retiredAt ? <><Badge value="RETIRE" /><small className="cell-sub">{p.retireReason}</small></> : <Badge value="ACTIF" label="Publié" />}</td>
                        <td>{!p.retiredAt && <button type="button" className="btn small secondary" onClick={() => setRetiring(p)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {publishing && <PublishDialog institutionId={institutionId} onClose={() => setPublishing(false)} onDone={() => { setPublishing(false); reload(); }} />}
        {retiring && <ReasonPrompt title={`Retirer « ${retiring.title} »`} subtitle="Le public ne le verra plus ; vous pourrez le publier de nouveau." confirm="Retirer du portail"
            onClose={() => setRetiring(null)} onSubmit={async (reason, key) => { await dissemination!.retireFindingAid(retiring.id, reason, key); reload(); }} />}
    </section>;
}

function PublishDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { dissemination, epoch } = useSession();
    const [descriptionId, setDescriptionId] = useState('');
    const action = useAction();
    const candidates = useResource<FindingAidCandidate[]>(s => dissemination!.findingAidCandidates(institutionId, s), `finding-aid-candidates:${institutionId}:${epoch}`);
    const preview = useResource<FindingAidPreview | null>(s => descriptionId ? dissemination!.findingAidPreview(descriptionId, s) : Promise.resolve(null), `finding-aid-preview:${descriptionId}:${epoch}`);
    const p = preview.data;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!descriptionId || !p?.eligible) return;
        if (await action.run({ publish: descriptionId }, key => dissemination!.publishFindingAid(descriptionId, key))) onDone();
    };
    return <Modal title="Publier un instrument de recherche" subtitle="L’inventaire devient consultable par le public" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {candidates.loading && !candidates.data ? <Busy /> : candidates.error ? <ErrorNotice error={candidates.error} onRetry={candidates.refresh} />
                : (candidates.data ?? []).length === 0 ? <Notice>Aucune notice ne peut être publiée : une notice doit être <strong>publique</strong> (confidentialité « public ») et <strong>validée</strong> (état de rédaction « validée »).</Notice>
                    : <div className="form-grid">
                        <Field label="Fonds ou niveau à publier *" wide hint="Seules les notices publiques et validées, non encore publiées, sont proposées.">
                            <select value={descriptionId} onChange={e => setDescriptionId(e.target.value)} disabled={action.busy}>
                                <option value="">Choisir une notice…</option>
                                {(candidates.data ?? []).map(c => <option key={c.descriptionId} value={c.descriptionId}>{levelLabel(c.level)} — {c.code} — {c.title} ({visibilityText(c.visibleNodes, c.totalNodes)})</option>)}
                            </select></Field>
                    </div>}
            {descriptionId && (preview.loading && !p ? <Busy label="Calcul de l’aperçu…" /> : preview.error ? <ErrorNotice error={preview.error} onRetry={preview.refresh} />
                : p && <div className="panel-padding">
                    {!p.eligible && <Notice tone="warning"><ul>{p.problems.map(x => <li key={x}>{x}</li>)}</ul></Notice>}
                    <p>{visibilityText(p.visibleNodes, p.totalNodes)} au public.
                        {p.hiddenNotPublic > 0 && ` ${p.hiddenNotPublic} notice${p.hiddenNotPublic > 1 ? 's' : ''} non publique${p.hiddenNotPublic > 1 ? 's' : ''} restent masquée${p.hiddenNotPublic > 1 ? 's' : ''}.`}
                        {p.hiddenNotValidated > 0 && ` ${p.hiddenNotValidated} notice${p.hiddenNotValidated > 1 ? 's' : ''} non validée${p.hiddenNotValidated > 1 ? 's' : ''} restent masquée${p.hiddenNotValidated > 1 ? 's' : ''}.`}</p>
                    {p.alreadyPublished && <Notice>Cet instrument est déjà publié.</Notice>}
                </div>)}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !descriptionId || !p?.eligible || p.alreadyPublished}>Publier sur le portail</button></footer>
        </form>
    </Modal>;
}
