import React, { useEffect, useRef, useState, useId } from 'react';
import { ApiError } from '../core/http';
import { Icon } from './icons';
import { display, typo } from '../core/format';
import { pageSummary } from '../core/i18n';
import { useLocale } from './i18n';
export function Badge({ value, label }: {
    value: string;
    /** Libellé à afficher à la place du libellé par défaut (ex. nom d'une étape de traitement). */
    label?: string;
}) { const { tr } = useLocale(); const names: Record<string, string> = { ACTIF: 'Actif', INACTIF: 'Inactif', SUSPENDU: 'Suspendu', ARCHIVE: 'Archivé', NATIONAL: 'National', INSTITUTION: 'Institution', DEPARTEMENT: 'Département', SERVICE: 'Technique', USER: 'Utilisateur', PENDING: 'À examiner', APPLIED: 'Appliquée', REJECTED: 'Rejetée', CANCELLED: 'Annulée', REVOQUE: 'Révoqué', EXPIRE: 'Expiré', BROUILLON: 'Brouillon', SEMI_ACTIF: 'Semi-actif', ARCHIVE_DEFINITIVE: 'Archive définitive', ELIMINATION_APPROUVEE: 'Élimination approuvée', DETRUIT: 'Détruit', NON_PUBLIE: 'Non publié', RESTREINT: 'Restreint', PUBLIC: 'Public', CONFIDENTIEL: 'Confidentiel', SECRET: 'Secret', VALIDEE: 'Validée', REJETEE: 'Rejetée', OBSOLETE: 'Obsolète', CLEAN: 'Sain', INFECTED: 'Infecté', QUARANTINED: 'En quarantaine', FAILED: 'Échec', PENDING_SCAN: 'Analyse en attente', VALIDE: 'Validé', REJETE: 'Rejeté', AUTEUR: 'Auteur', PRODUCTEUR: 'Producteur', SIGNATAIRE: 'Signataire', DESTINATAIRE: 'Destinataire', DONATEUR: 'Donateur', DEPOSANT: 'Déposant', DETENTEUR_ANTERIEUR: 'Détenteur antérieur', CONTRIBUTEUR: 'Contributeur', AUTRE: 'Autre', PLANIFIE: 'Planifiée', ECHEANCE: 'À échéance', EN_DECISION: 'En décision', CLOTURE: 'Clôturée', ANNULE: 'Annulée', PROPOSEE: 'Proposée', EXECUTEE: 'Exécutée', CONSERVER_DEFINITIVEMENT: 'Conserver définitivement', ELIMINER: 'Éliminer', TRANSFERER: 'Transférer', REEXAMINER: 'Réexaminer', CLOS: 'Clos', ACTIVE: 'Actif', INACTIVE: 'Inactif', EN_COURS: 'En cours', TERMINE: 'Terminé', SOUMISE: 'Soumise', APPROUVEE: 'Approuvée', NON_VALIDE: 'Non validé', LEVEE: 'Levée', EXPIREE: 'Expirée', ANNULEE: 'Annulée', RETIRE: 'Retiré', OUVERTE: 'Ouverte', CLOTUREE: 'Clôturée', TERMINEE: 'Terminée', DEPOSEE: 'Déposée', EN_INSTRUCTION: 'En instruction', AUTORISEE: 'Autorisée', REFUSEE: 'Refusée', DEMANDEE: 'Demandée', REMISE: 'Remise', RESTITUEE: 'Restituée', MIGRATION_FORMAT: 'Migration de format', VALIDATION_FORMAT: 'Validation de format', CONFORME: 'Conforme', NON_CONFORME: 'Non conforme', NON_ANALYSABLE: 'Non analysable', RAFRAICHISSEMENT_SUPPORT: 'Rafraîchissement de support', VERIFICATION_FIXITE: 'Vérification de fixité', NORMALISATION: 'Normalisation', SUCCES: 'Succès', ECHEC: 'Échec', PARTIEL: 'Partiel', DIAGNOSTIC: 'Diagnostic', A_VALIDER: 'À valider', MAINTENANCE: 'En maintenance', OUVERT: 'Ouvert', PRESENTE: 'Présente', VIDE: 'Blanche', MANQUANTE: 'Manquante', A_RESCANNER: 'À rescanner', RECEPTION: 'Réception', NUMERISATION: 'Numérisation', OCR_INDEXATION: 'OCR et indexation', CONTROLE_QUALITE: 'Contrôle qualité', METADONNEES: 'Métadonnées', VALIDATION: 'Validation' }; return <span className={'badge badge-' + value.toLowerCase()}><span />{tr(label ?? names[value] ?? display(value))}</span>; }
export function Busy({ label = 'Chargement des données…' }: {
    label?: string;
}) { const { tr } = useLocale(); return <div className="busy" role="status"><span className="spinner"/>{tr(label)}</div>; }
export function Empty({ title = 'Aucun résultat', description = 'Aucune donnée dans ce périmètre.', icon = 'archive' }: {
    title?: string;
    description?: string;
    icon?: string;
}) { const { tr } = useLocale(); return <div className="empty"><span className="empty-icon"><Icon name={icon} size={30}/></span><h3>{tr(title)}</h3><p>{tr(description)}</p></div>; }
export function ErrorNotice({ error, onRetry }: {
    error: unknown;
    onRetry?: () => void;
}) {
    const { tr } = useLocale();
    const e = error instanceof Error ? error : new Error('Une erreur est survenue.');
    const api = e instanceof ApiError ? e : null;
    return <div className="notice error" role="alert"><Icon name="alert"/><div><strong>{tr(api?.status === 403 ? 'Accès refusé' : api?.status === 409 ? 'Conflit de données' : 'Opération non aboutie')}</strong><p>{tr(typo(e.message))}</p>{api?.uncertain && <p>{tr('Ne créez pas une nouvelle intention à l’aveugle. Consultez l’état courant avant de répéter.')}</p>}{api?.code && <small>{api.code}</small>}{api?.correlationId && <small className="mono">{tr('Référence :')} {api.correlationId}</small>}{api && Object.entries(api.fieldErrors).map(([k, v]) => <small key={k}>{k} : {v}</small>)}{onRetry && <button className="btn small secondary" onClick={onRetry}>{tr('Réessayer la lecture')}</button>}</div></div>;
}
export function Notice({ children, tone = 'info' }: {
    children: React.ReactNode;
    tone?: string;
}) { return <div className={'notice ' + tone}><Icon name={tone === 'warning' ? 'alert' : 'info'}/><div>{children}</div></div>; }
export function Modal({ title, subtitle, children, onClose, wide = false, locked = false }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onClose: () => void;
    wide?: boolean;
    locked?: boolean;
}) {
    const titleId = useId();
    const { tr } = useLocale();
    const ref = useRef<HTMLDialogElement>(null);
    const initial = useRef<Element | null>(null);
    useEffect(() => { initial.current = document.activeElement; ref.current?.showModal(); return () => { (initial.current as HTMLElement)?.focus?.(); }; }, []);
    return <dialog ref={ref} className={'modal ' + (wide ? 'wide' : '')} aria-labelledby={titleId} onCancel={e => {
            e.preventDefault();
            if (!locked)
                onClose();
        }}><header><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label={tr('Fermer')} disabled={locked} onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>;
}
export function Field({ label, children, hint, error, wide = false }: {
    label: string;
    children: React.ReactNode;
    hint?: string;
    error?: string;
    wide?: boolean;
}) { return <label className={'field ' + (wide ? 'span2' : '')}><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <small className="field-error">{error}</small>}</label>; }
export function PageHead({ eyebrow, title, description, children }: {
    eyebrow: string;
    title: string;
    description: string;
    children?: React.ReactNode;
}) { return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></div>; }
export function Pagination({ page, hasMore, onChange, count }: {
    page: number;
    hasMore: boolean;
    onChange: (n: number) => void;
    count: number;
}) { const { locale, tr } = useLocale(); return <div className="pagination"><span>{pageSummary(locale, count, page + 1)}</span><div><button className="btn small secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>{tr('Précédente')}</button><button className="btn small secondary" disabled={!hasMore} onClick={() => onChange(page + 1)}>{tr('Suivante')}</button></div></div>; }
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
    const [state, setState] = useState<{
        key: string;
        data?: T;
        error?: unknown;
        loading: boolean;
    }>({ key, loading: true });
    const [revision, refresh] = useState(0);
    useEffect(() => {
        const c = new AbortController();
        setState({ key, loading: true });
        load(c.signal).then(data => {
            if (!c.signal.aborted)
                setState({ key, data, loading: false });
        }).catch(error => {
            if (!c.signal.aborted)
                setState({ key, error, loading: false });
        });
        return () => c.abort();
    }, [key, revision]);
    return { ...(state.key === key ? state : { loading: true, data: undefined, error: undefined }), refresh: () => refresh(x => x + 1) };
}
export function formatDate(value: string | null | undefined) {
    if (!value)
        return '—';
    const d = new Date(value);
    return Number.isNaN(d.valueOf()) ? 'Date invalide' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(d) + ' UTC';
}
export function CopyId({ value }: {
    value: string;
}) { const { tr } = useLocale(); const [copied, setCopied] = useState(false); return <button className="copy-id" title={value} onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => setCopied(false)); }}><code>{value.slice(0, 8)}…</code><Icon name={copied ? 'check' : 'copy'} size={13}/><span className="sr-only">{tr('Copier l’identifiant')}</span></button>; }
