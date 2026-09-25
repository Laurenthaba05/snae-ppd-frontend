import React from 'react';
const paths: Record<string, React.ReactNode> = {
    archive: <><path d="m3 7 9-5 9 5M4 9h16M4 21h16M7 12v6M12 12v6M17 12v6"/></>,
    home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h1m6 0h1M8 11h1m6 0h1M10 21v-6h4v6"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 6"/></>,
    tree: <><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5H5v5m7-5h7v5"/></>,
    shield: <><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="m8 12 3 3 5-6"/></>,
    key: <><circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    logout: <><path d="M9 3H3v18h6M10 12h11m-4-4 4 4-4 4"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    refresh: <><path d="M20 7a9 9 0 1 0 1 8M20 2v5h-5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></>,
    document: <><path d="M5 2h9l5 5v15H5Z"/><path d="M14 2v5h5M8 12h8M8 16h8"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
    alert: <><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1"/></>,
};
export function Icon({ name, size = 20 }: {
    name: string;
    size?: number;
}) { return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.document}</svg>; }
export function Brand({ dark = false }: {
    dark?: boolean;
}) { return <div className={'brand ' + (dark ? 'on-dark' : '')}><span className="brand-mark"><Icon name="archive" size={27}/></span><div><strong>SNAE<span>·</span>PPD</strong><small>Mémoire & administration</small></div></div>; }
