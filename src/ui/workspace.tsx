import React, { createContext, useContext, useState } from 'react';
import type { ScopeTarget } from '../core/types';
import { useSession } from '../auth/session';
interface Workspace {
    scope: ScopeTarget;
    setScope: (scope: ScopeTarget) => void;
}
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: {
    children: React.ReactNode;
}) { const { me } = useSession(); const [scope, setScope] = useState<ScopeTarget>({ institutionId: me!.user.institutionId, departmentId: me!.user.departmentId }); return <Context.Provider value={{ scope, setScope }}>{children}</Context.Provider>; }
export function useWorkspace() { return useContext(Context)!; }
