import React from 'react';
import { useQuerySelection } from './useQuerySelection';
import { BordereauDialog } from './Bordereaux';
import { TransferDialog } from './ArchiveTransfers';
/** Read directly by ID: notifications may concern a different institution from the workspace. */
export function RetentionNotificationDetail() {
    const [bordereau, setBordereau] = useQuerySelection('bordereau');
    const [transfer, setTransfer] = useQuerySelection('transfert');
    return <>{bordereau ? <BordereauDialog key={bordereau} id={bordereau} institutionId="" departmentId={null} onClose={() => setBordereau(null)} onChanged={() => {}} />
        : transfer ? <TransferDialog key={transfer} id={transfer} workspaceInstitutionId="" departmentId={null} onClose={() => setTransfer(null)} onChanged={() => {}} /> : null}</>;
}
