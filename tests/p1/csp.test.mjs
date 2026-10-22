import test from 'node:test';
import assert from 'node:assert/strict';
import { connectOrigins, contentSecurityPolicy } from '../../scripts/csp-policy.mjs';

const directive = (policy, name) => policy.split('; ').find(part => part === name || part.startsWith(name + ' '));

test('aucun script en ligne ni script d’un autre site, jamais unsafe-eval', () => {
  const policy = contentSecurityPolicy({});
  assert.equal(directive(policy, 'script-src'), "script-src 'self' 'wasm-unsafe-eval'");
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(policy));
  assert.equal(directive(policy, 'default-src'), "default-src 'self'");
  assert.equal(directive(policy, 'base-uri'), "base-uri 'self'");
  assert.equal(directive(policy, 'form-action'), "form-action 'self'");
});

test('connect-src : l’application et le fournisseur d’identité déclaré, rien d’autre', () => {
  assert.deepEqual(connectOrigins({}), ["'self'"]);
  assert.deepEqual(connectOrigins({ VITE_OIDC_AUTHORITY: 'https://sso.exemple.gn/realms/snae', VITE_API_BASE: '/api/v1' }), ["'self'", 'https://sso.exemple.gn']);
  assert.deepEqual(connectOrigins({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_OIDC_AUTHORITY: 'https://abc.supabase.co/auth/v1' }), ["'self'", 'https://abc.supabase.co']);
  assert.equal(directive(contentSecurityPolicy({ VITE_OIDC_AUTHORITY: 'https://sso.exemple.gn' }), 'connect-src'), "connect-src 'self' https://sso.exemple.gn");
});

test('une valeur qui n’est pas une adresse web est ignorée, jamais recopiée dans la politique', () => {
  assert.deepEqual(connectOrigins({ VITE_OIDC_AUTHORITY: "javascript:alert(1)", VITE_SUPABASE_URL: "'; script-src *; '", VITE_API_BASE: 'data:text/html,x' }), ["'self'"]);
  const policy = contentSecurityPolicy({ VITE_OIDC_AUTHORITY: 'https://sso.exemple.gn; script-src *' });
  assert.ok(!policy.includes('script-src *'));
});
