import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { PageHead } from '../ui/components';
import { CashierPanel, PlansPanel, ReadersPanel, SubscriptionsPanel } from '../ui/PortalAdmin';
import { MailStatusPanel } from '../ui/MailMonitoring';

type Tab = 'caisse' | 'abonnements' | 'lecteurs' | 'formules';

/** L'administration du portail des lecteurs : caisse, abonnements, comptes lecteurs, formules. Chaque section n'apparaît que pour la personne qui a le droit de la lire. */
export function PortalAdminPage() {
    const { me } = useSession();
    const holds = (...codes: string[]) => codes.some(code => can(me, code, {}));
    const tabs: Array<[Tab, string]> = [];
    if (holds('PORTAL_CASHIER', 'PORTAL_READ', 'PORTAL_SUPERVISE')) tabs.push(['caisse', 'Caisse'], ['abonnements', 'Abonnements']);
    if (holds('PORTAL_READ', 'PORTAL_READER_MANAGE', 'PORTAL_CASHIER', 'PORTAL_SUPERVISE')) tabs.push(['lecteurs', 'Lecteurs']);
    if (holds('PORTAL_READ', 'PORTAL_PLAN_MANAGE')) tabs.push(['formules', 'Formules']);
    const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? 'caisse');
    const current = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
    return <>
        <PageHead eyebrow="MODULE · ACCÈS" title="Portail des lecteurs" description="Comptes des lecteurs, formules d’abonnement, caisse et abonnements. Le catalogue public reste ouvert à tous ; la lecture des pages exige un abonnement." />
        <div role="tablist" className="asset-tabs page-tabs" aria-label="Sections du portail">
            {tabs.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={current === key} className={current === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}
        </div>
        {current === 'caisse' ? <CashierPanel /> : current === 'abonnements' ? <SubscriptionsPanel /> : current === 'lecteurs' ? <><ReadersPanel /><MailStatusPanel /></> : current === 'formules' ? <PlansPanel /> : null}
    </>;
}
