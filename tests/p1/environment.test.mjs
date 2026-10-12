import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontendEnvironment as validate } from '../../scripts/environment-policy.mjs';
const base={VITE_DATA_MODE:'connected',VITE_AUTH_MODE:'oidc'};
test('local proxy allowed',()=>assert.equal(validate(base,'development','serve'),'http://127.0.0.1:8080'));
test('remote proxy needs confirmation',()=>assert.throws(()=>validate({...base,DEV_BACKEND_TARGET:'https://api.recette.example'},'development','serve')));
test('exact remote confirmation works',()=>assert.equal(validate({...base,DEV_BACKEND_TARGET:'https://api.recette.example',SNAE_CONFIRMED_RECETTE_ORIGIN:'https://api.recette.example'},'development','serve'),'https://api.recette.example'));
test('remote HTTP never allowed',()=>assert.throws(()=>validate({...base,DEV_BACKEND_TARGET:'http://api.recette.example',SNAE_CONFIRMED_RECETTE_ORIGIN:'http://api.recette.example'},'development','serve')));
test('server password forbidden in VITE',()=>assert.throws(()=>validate({...base,VITE_DB_PASSWORD:'synthetic-only'},'production','build')));
test('server role key forbidden in VITE',()=>assert.throws(()=>validate({...base,VITE_SERVICE_ROLE_KEY:'synthetic-only'},'production','build')));
test('secret key cannot hide behind public variable',()=>assert.throws(()=>validate({...base,VITE_SUPABASE_PUBLISHABLE_KEY:['sb','secret','synthetic'].join('_')},'production','build')));
test('JWT service role rejected',()=>{
 const token='eyJ'+'.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.synthetic';
 assert.throws(()=>validate({...base,VITE_SUPABASE_PUBLISHABLE_KEY:token},'production','build'));
});
test('JWT anon acceptable',()=>{
 const token='eyJ'+'.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.synthetic';
 assert.ok(validate({...base,VITE_SUPABASE_PUBLISHABLE_KEY:token},'production','build'));
});
test('demo cannot become connected production build',()=>assert.throws(()=>validate({...base,VITE_DATA_MODE:'demo'},'production','build')));
test('disabled auth cannot be a connected production build',()=>assert.throws(()=>validate({...base,VITE_AUTH_MODE:'disabled'},'production','build')));
test('explicit demo build accepted',()=>assert.ok(validate({VITE_AUTH_MODE:'disabled',VITE_DATA_MODE:'demo',VITE_DEMO_BUILD:'true'},'demo','build')));
test('URL credentials rejected',()=>assert.throws(()=>validate({...base,DEV_BACKEND_TARGET:'https://user:synthetic@api.recette.example'},'development','serve')));
test('URL query and path rejected',()=>assert.throws(()=>validate({...base,DEV_BACKEND_TARGET:'http://127.0.0.1:8080/admin?x=1'},'development','serve')));
