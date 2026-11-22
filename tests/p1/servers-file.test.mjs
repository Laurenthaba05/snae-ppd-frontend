import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultServersPath, frontendFromServers, parseServers, readServersFile } from '../../scripts/servers-file.mjs';

// Le fichier unique des adresses des serveurs : ce que le serveur de développement de l'interface en lit.
const sample = `# Les adresses des serveurs
SNAE_BACKEND_URL=http://127.0.0.1:8081
SNAE_FRONTEND_URL=http://127.0.0.1:5174

SNAE_JWT_ISSUER=https://projet.supabase.co/auth/v1
SNAE_SEARCH_BASE_URL=http://localhost:9200/?a=b=c
`;

test('Un fichier d’adresses se lit : commentaires et lignes vides ignorés, « = » et « # » de la valeur conservés', () => {
  const servers = parseServers(sample);
  assert.equal(servers.SNAE_BACKEND_URL, 'http://127.0.0.1:8081');
  assert.equal(servers.SNAE_JWT_ISSUER, 'https://projet.supabase.co/auth/v1');
  assert.equal(servers.SNAE_SEARCH_BASE_URL, 'http://localhost:9200/?a=b=c');
  assert.equal(Object.keys(servers).length, 4);
  assert.deepEqual(parseServers('A_B=1\r\nC=2\r\n'), { A_B: '1', C: '2' });
  assert.equal(parseServers('A=http://h/#frag\n').A, 'http://h/#frag');                    // un « # » dans la valeur n'est pas un commentaire
  assert.equal(parseServers('A = b\n').A, 'b');                                             // espaces autour du « = » : comme un .properties
});

test('Ce qu’un fichier « .properties » lirait autrement est refusé : antislash, guillemets, espace en fin de ligne', () => {
  assert.throws(() => parseServers('# c\nSNAE_STORAGE_LOCAL_ROOT=C:\\snae\\objets\n'), /ligne 2 : « \\ » interdit/);
  assert.throws(() => parseServers('SNAE_STORAGE_LOCAL_ROOT=\\\\serveur\\partage\n'), /interdit/);
  assert.throws(() => parseServers('SNAE_JWT_ISSUER="https://x/auth/v1"\n'), /pas de guillemets/);
  assert.throws(() => parseServers("SNAE_JWT_ISSUER='https://x'\n"), /pas de guillemets/);
  assert.throws(() => parseServers('SNAE_DB_HOST=127.0.0.1 \n'), /ligne 1 : espace en fin de ligne/);
  assert.equal(parseServers('SNAE_STORAGE_LOCAL_ROOT=//serveur/partage/objets\n').SNAE_STORAGE_LOCAL_ROOT, '//serveur/partage/objets');
});

test('Une ligne invalide ou une clé de secret est refusée avec son numéro de ligne', () => {
  assert.throws(() => parseServers('SNAE_BACKEND_URL\n'), /ligne 1 : « CLÉ=VALEUR » attendu/);
  assert.throws(() => parseServers('# c\nminuscule=1\n'), /ligne 2 : nom de clé invalide/);
  assert.throws(() => parseServers('SNAE_SEARCH_PASSWORD=x\n'), /ressemble à un secret/);
  for (const key of ['DB_PASSWORD', 'SNAE_JWT_SECRET', 'API_KEY', 'SNAE_MAIL_TOKEN', 'SERVICE_ROLE_KEY', 'PRIVATE_KEY'])
    assert.throws(() => parseServers(`${key}=x\n`), /secret/, key);
});

test('L’interface en tire l’adresse du backend et son propre port, et l’identité selon son mode', () => {
  const servers = parseServers(sample);
  assert.deepEqual(frontendFromServers(servers, 'disabled'), { DEV_BACKEND_TARGET: 'http://127.0.0.1:8081', DEV_SERVER_PORT: '5174' });
  assert.equal(frontendFromServers(servers, 'supabase').VITE_SUPABASE_URL, 'https://projet.supabase.co');
  assert.equal(frontendFromServers(servers, 'oidc').VITE_OIDC_AUTHORITY, 'https://projet.supabase.co/auth/v1');
  assert.equal(frontendFromServers(servers, 'supabase').VITE_OIDC_AUTHORITY, undefined);
  assert.deepEqual(frontendFromServers({}, 'oidc'), {});                                    // rien de défini : rien n'est imposé
  assert.equal(frontendFromServers({ SNAE_JWT_ISSUER: 'https://idp.exemple.gn/realms/snae' }, 'supabase').VITE_SUPABASE_URL, undefined);   // pas un émetteur Supabase
});

test('Une adresse mal formée est refusée plutôt que mal utilisée', () => {
  assert.throws(() => frontendFromServers({ SNAE_BACKEND_URL: 'pas une adresse' }), /SNAE_BACKEND_URL : adresse invalide/);
  assert.throws(() => frontendFromServers({ SNAE_BACKEND_URL: 'ftp://x:1' }), /origine http/);
  assert.throws(() => frontendFromServers({ SNAE_BACKEND_URL: 'http://u:p@127.0.0.1:8081' }), /origine http/);
  assert.throws(() => frontendFromServers({ SNAE_BACKEND_URL: 'http://127.0.0.1:8081/api' }), /origine http/);
  assert.throws(() => frontendFromServers({ SNAE_FRONTEND_URL: 'http://127.0.0.1:5174?x=1' }), /origine http/);
});

test('Le fichier se cherche dans SNAE_SERVERS_FILE, sinon chez le serveur d’application voisin ; absent, il est ignoré', () => {
  assert.equal(defaultServersPath('/dev/snae-ppd-frontend', { SNAE_SERVERS_FILE: '/etc/snae/serveurs.env' }), '/etc/snae/serveurs.env');
  assert.match(defaultServersPath('/dev/snae-ppd-frontend', {}).split(String.fromCharCode(92)).join('/'), /\/dev\/snae-ppd-backend-v12\.1\/config\/serveurs\.env$/);
  const dir = mkdtempSync(join(tmpdir(), 'snae-servers-'));
  assert.equal(readServersFile(join(dir, 'absent.env')), null);
  writeFileSync(join(dir, 'serveurs.env'), sample);
  assert.equal(readServersFile(join(dir, 'serveurs.env')).SNAE_FRONTEND_URL, 'http://127.0.0.1:5174');
});
