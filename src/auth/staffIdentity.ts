import { createContext, useContext } from 'react';
import type { Me } from '../core/types';
/** Identité seule : le portail public n'importe ni transport ni fournisseur SSO. */
export const StaffIdentityContext = createContext<Me | null>(null);
export const useStaffIdentity = () => useContext(StaffIdentityContext);
