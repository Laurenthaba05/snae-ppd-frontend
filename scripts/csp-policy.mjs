/**
 * La politique de sécurité du contenu (CSP) de l'application, calculée à la construction. Elle ne laisse s'exécuter que les scripts de l'application elle-même : une injection de
 * contenu dans une page n'y exécuterait rien, et ne pourrait pas envoyer le jeton de connexion à un autre site. Le jeton de session n'est gardé qu'en mémoire (jamais dans le stockage
 * du navigateur), cette politique en est la seconde garde.
 *
 * - `script-src 'self' 'wasm-unsafe-eval'` : aucun script en ligne ; WebAssembly pour le lecteur de codes (zxing) et le décodeur PDF.
 * - `style-src 'self' 'unsafe-inline'` : les documents imprimables (cadre invisible, même politique) portent leur feuille de style en ligne.
 * - `connect-src` : le serveur de l'application (même origine) et l'origine du fournisseur d'identité (OIDC ou Supabase Auth), rien d'autre.
 * - `img-src` / `frame-src` / `object-src` : les pages et PDF affichés viennent de blob: (créés par l'application), jamais d'un autre site.
 *
 * `frame-ancestors` (interdire d'être affiché dans le cadre d'un autre site) ne s'écrit pas dans une balise `<meta>` : il se pose en en-tête HTTP sur le serveur web
 * (`deploy/nginx-location-example.conf`).
 */
export function connectOrigins(env) {
  const origins = new Set(["'self'"]);
  for (const value of [env.VITE_OIDC_AUTHORITY, env.VITE_SUPABASE_URL, env.VITE_API_BASE]) {
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { continue; }
    if (url.protocol === 'https:' || url.protocol === 'http:') origins.add(url.origin);
  }
  return [...origins];
}

export function contentSecurityPolicy(env) {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    'connect-src ' + connectOrigins(env).join(' '),
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    "media-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}
