// Le fichier unique des adresses des serveurs de SNAE-PPD (config/serveurs.env du dépôt du serveur d'application) : le serveur de développement de l'interface y lit où est le backend, sur quel
// port elle-même écoute et quel fournisseur d'identité utiliser, au lieu de ses propres réglages dispersés. Format : une ligne CLÉ=VALEUR, des lignes de commentaire commençant par « # », jamais de
// commentaire en fin de ligne ; que des adresses : une clé qui ressemble à un secret est refusée. Le serveur d'application lit le même fichier comme un « .properties » : pas d'antislash (chemins avec
// « / »), pas de guillemets, pas d'espace en fin de ligne.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = /^[A-Z][A-Z0-9_]*$/;
const SECRET = /(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|SERVICE_ROLE|API_KEY|CREDENTIAL)/;

/** Lit le texte d'un fichier d'adresses : `{ CLÉ: valeur }`. Une ligne invalide ou une clé de secret est une erreur, avec son numéro de ligne. */
export function parseServers(text, source = 'serveurs.env') {
  const result = {};
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const at = line.indexOf('=');
    const where = `${source}, ligne ${index + 1}`;
    if (at < 1) throw new Error(`${where} : « CLÉ=VALEUR » attendu.`);
    const key = line.slice(0, at).trim();
    if (!KEY.test(key)) throw new Error(`${where} : nom de clé invalide (« ${key} »).`);
    if (SECRET.test(key)) throw new Error(`${where} : « ${key} » ressemble à un secret ; ce fichier ne contient que des adresses (les secrets restent dans .env).`);
    // Le serveur d'application lit ce même fichier comme un fichier « .properties » : ce que ce format interprète autrement qu'ici est refusé, pour que tous les lecteurs voient la même valeur.
    if (/\s$/.test(raw.replace(/\r$/, ''))) throw new Error(`${where} : espace en fin de ligne (le serveur d'application le garderait dans la valeur).`);
    const value = line.slice(at + 1).trim();
    if (value.includes('\\')) throw new Error(`${where} : « \\ » interdit dans une valeur (écrire un chemin avec « / » : C:/dossier ou //serveur/partage).`);
    if (/^["']|["']$/.test(value)) throw new Error(`${where} : pas de guillemets autour d'une valeur (le serveur d'application les garderait).`);
    result[key] = value;
  });
  return result;
}

/** Où chercher le fichier : `SNAE_SERVERS_FILE` s'il est défini, sinon `config/serveurs.env` du dépôt du serveur d'application voisin de celui de l'interface. */
export function defaultServersPath(cwd, env = process.env) {
  return env.SNAE_SERVERS_FILE || join(cwd, '..', 'snae-ppd-backend-v12.1', 'config', 'serveurs.env');
}

/** Le contenu du fichier d'adresses, ou `null` s'il n'existe pas (une machine de construction n'en a pas). */
export function readServersFile(path) {
  return existsSync(path) ? parseServers(readFileSync(path, 'utf8'), path) : null;
}

function origin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} : adresse invalide (« ${value} »).`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} : une origine http(s) sans chemin est attendue (« ${value} »).`);
  return url;
}

/**
 * Ce que l'interface en tire pour le serveur de développement : l'adresse du backend (`DEV_BACKEND_TARGET`), son propre port (`DEV_SERVER_PORT`) et, selon le mode d'identité, l'adresse du
 * fournisseur (`VITE_OIDC_AUTHORITY` = l'émetteur des jetons ; `VITE_SUPABASE_URL` = l'émetteur Supabase sans son suffixe `/auth/v1`). Ces valeurs l'emportent sur celles de `.env.local`.
 */
export function frontendFromServers(servers, authMode) {
  const out = {};
  if (servers.SNAE_BACKEND_URL) out.DEV_BACKEND_TARGET = origin(servers.SNAE_BACKEND_URL, 'SNAE_BACKEND_URL').origin;
  if (servers.SNAE_FRONTEND_URL) {
    const url = origin(servers.SNAE_FRONTEND_URL, 'SNAE_FRONTEND_URL');
    if (url.port) out.DEV_SERVER_PORT = url.port;
  }
  const issuer = servers.SNAE_JWT_ISSUER;
  if (issuer) {
    if (authMode === 'oidc') out.VITE_OIDC_AUTHORITY = issuer;
    if (authMode === 'supabase' && issuer.endsWith('/auth/v1')) out.VITE_SUPABASE_URL = issuer.slice(0, -'/auth/v1'.length);
  }
  return out;
}
