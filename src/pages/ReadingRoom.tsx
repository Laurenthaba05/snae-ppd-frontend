import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Notice, PageHead } from '../ui/components';
import { useWorkspace } from '../ui/workspace';
import { ReadingRoomDesk, ReadingRoomReaders, ReadingRoomRooms } from '../ui/ReadingRoom';
import { ReadingRoomSlips } from '../ui/ReadingRoomSlips';
import { ReadingRoomOrders } from '../ui/ReadingRoomOrders';
import { ReadingRoomStatistics } from '../ui/ReadingRoomStatistics';

type Tab = 'accueil' | 'lecteurs' | 'bulletins' | 'reproductions' | 'statistiques' | 'salles';
const TABS: Array<[Tab, string]> = [
    ['accueil', 'Accueil'], ['lecteurs', 'Lecteurs'], ['bulletins', 'Bulletins de communication'], ['reproductions', 'Reproductions'], ['statistiques', 'Statistiques'], ['salles', 'Salles']
];

/** La salle de lecture d'une institution : accueil, lecteurs, bulletins, reproductions, statistiques annuelles. L'institution est celle du périmètre de travail. */
export function ReadingRoomPage() {
    const { me } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    const [tab, setTab] = useState<Tab>('accueil');
    const allowed = !!institutionId && ['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE'].some(code => can(me, code, { institutionId }));
    return <>
        <PageHead eyebrow="MODULE · ACCÈS" title="Salle de lecture" description="Inscription des lecteurs, réservations, présence, bulletins de communication jusqu’à la restitution, reproductions avec encaissement enregistré et statistiques annuelles." />
        {!institutionId ? <Notice tone="warning">Choisissez une institution dans le périmètre de travail : la salle de lecture est celle d’une institution d’archives.</Notice>
            : !allowed ? <Notice tone="warning">Cette section exige une habilitation de la salle de lecture pour cette institution.</Notice> : <>
                <div role="tablist" className="asset-tabs page-tabs" aria-label="Sections de la salle de lecture">
                    {TABS.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}
                </div>
                {tab === 'accueil' ? <ReadingRoomDesk institutionId={institutionId} />
                    : tab === 'lecteurs' ? <ReadingRoomReaders institutionId={institutionId} />
                        : tab === 'bulletins' ? <ReadingRoomSlips institutionId={institutionId} />
                            : tab === 'reproductions' ? <ReadingRoomOrders institutionId={institutionId} />
                                : tab === 'statistiques' ? <ReadingRoomStatistics institutionId={institutionId} />
                                    : <ReadingRoomRooms institutionId={institutionId} />}
            </>}
    </>;
}
