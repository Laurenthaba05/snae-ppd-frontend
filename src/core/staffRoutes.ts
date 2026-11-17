/** Les services aux lecteurs sont regroupés dans le portail, avec l'identité des agents. */
export const readerManagementModules = ['consultations', 'communications', 'salle-lecture', 'portail'] as const;
export type ReaderManagementModule = typeof readerManagementModules[number];
export const isReaderManagementModule = (value: string): value is ReaderManagementModule => readerManagementModules.some(module => module === value);
export const isReaderManagementPath = (path: string) => /^\/portail\/gestion(?:[/?#]|$)/.test(path);
export function readerManagementSection(path: string): ReaderManagementModule | '' | null {
    const pathname = path.split(/[?#]/)[0];
    if (pathname === '/portail/gestion' || pathname === '/portail/gestion/') return '';
    const route = pathname?.slice('/portail/gestion/'.length);
    if (!isReaderManagementPath(path)) return null;
    return route === 'lecteurs' ? 'portail' : route && isReaderManagementModule(route) && route !== 'portail' ? route : null;
}
/** Adresse commune au menu, aux favoris et aux anciens raccourcis. */
export function staffHref(route: string): string {
    const [module] = route.split(/[?#]/);
    if (module === 'espace-lecteurs') return '/portail/gestion' + route.slice(module.length);
    if (module && isReaderManagementModule(module)) return '/portail/gestion/' + (module === 'portail' ? 'lecteurs' : module) + route.slice(module.length);
    return '/app' + (route ? '/' + route : '');
}
export function canonicalStaffPath(path: string): string {
    return path.startsWith('/app/') ? staffHref(path.slice('/app/'.length)) : path;
}
