import React, { createContext, useContext } from 'react';
import type { ScopeTarget } from '../core/types';
const Context = createContext<ScopeTarget>({});
/** Les boutons suivent le projet chargé, même si le filtre du bandeau vise une autre institution. */
export const useTreatmentProjectScope = () => useContext(Context);
export function TreatmentProjectScope({ scope, children }: { scope: ScopeTarget; children: React.ReactNode }) {
    return <Context.Provider value={scope}>{children}</Context.Provider>;
}
