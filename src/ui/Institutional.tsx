import React from 'react';
import { Icon } from './icons';

export function NationalFlag() {
    return <span className="national-flag" role="img" aria-label="Drapeau de la Guinée"><i /><i /><i /></span>;
}

export function RepublicIdentity({ compact = false }: { compact?: boolean }) {
    return <div className={'republic-identity' + (compact ? ' compact' : '')}>
        <NationalFlag />
        <div><strong>RÉPUBLIQUE DE GUINÉE</strong><small>Travail · Justice · Solidarité</small></div>
    </div>;
}

export function InstitutionalHeader({ children, compact = false }: { children?: React.ReactNode; compact?: boolean }) {
    return <header className={'institutional-header' + (compact ? ' compact' : '')}>
        <RepublicIdentity compact={compact} />
        <div className="institutional-product"><span>SNAE-PPD</span><p>Système national d’archivage électronique<br />et de préservation du patrimoine documentaire</p></div>
        <div className="institutional-utilities">{children}</div>
    </header>;
}

export function ArchiveMark() {
    return <span className="archive-mark" aria-hidden="true"><Icon name="archive" size={27} /></span>;
}
