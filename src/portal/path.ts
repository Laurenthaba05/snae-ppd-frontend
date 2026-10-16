/** Une adresse du portail des lecteurs (/portail…) : reconnue sans charger le code du portail, que le personnel n'utilise pas. */
export const isPortalPath = (path: string): boolean => path === '/portail' || path.startsWith('/portail/') || path.startsWith('/portail?');
