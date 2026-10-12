import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpTransport, ApiError } from '../.test-build/http.js';
import { ingestionMessage, sealHint } from '../.test-build/ingestion.js';
const versionId = '20000000-0000-4000-8000-000000000001';
const receipt = (status, resultCode) => ({ id:'10000000-0000-4000-8000-000000000001', versionId,
 status,resultCode,fileId:null,filename:'document.pdf',mediaType:'application/pdf',size:25,
 sha256:'a'.repeat(64),attempts:1,createdAt:'2026-09-29T00:00:00Z',updatedAt:'2026-09-29T00:00:00Z' });
const transport = (body,status) => new HttpTransport('/api/v1',async()=> 'token',()=>{},async()=>
 new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
const upload = t => t.upload(`/versions/${versionId}/content`,new File(['%PDF-1.7'],'document.pdf'),{role:'PIECE_JOINTE'},'upload-key');
test('Une panne antivirus conserve le reçu de téléversement et son explication',async()=>{
 const data=receipt('RETRYABLE','SCANNER_NOT_CONFIGURED');
 assert.deepEqual(await upload(transport(data,503)),data);
 assert.match(ingestionMessage(data),/antivirus.*configuré/);
});
test('Un rejet antivirus reste un rejet exploitable par la fenêtre de téléversement',async()=>{
 const data=receipt('REJECTED','SCAN_THREAT_DETECTED');
 assert.equal((await upload(transport(data,422))).status,'REJECTED');
 assert.match(ingestionMessage(data),/menace/);
});
test('Une erreur 503 ordinaire ou un faux reçu ne sont pas transformés en résultat',async()=>{
 for(const body of [{code:'STORAGE_UNAVAILABLE'}, {status:'RETRYABLE'}, receipt('COMPLETED',null)])
  await assert.rejects(upload(transport(body,503)), e=>e instanceof ApiError && e.status===503);
});
test('Les autres commandes continuent à refuser les réponses 503',async()=>{
 await assert.rejects(transport(receipt('RETRYABLE','SCAN_UNAVAILABLE'),503).request('/example',{method:'POST',body:{},idempotencyKey:'test-key'}),e=>e instanceof ApiError);
});

test('Un scellement refusé s’explique en clair, avec l’action qui permet d’avancer', () => {
    assert.equal(sealHint('INGESTION_PENDING').open, 'INGESTIONS');
    assert.match(sealHint('INGESTION_PENDING').text, /suivi des dépôts/);
    assert.equal(sealHint('WORKFLOW_PENDING').open, 'WORKFLOW');
    assert.equal(sealHint('MANDATORY_WORKFLOW_INCOMPLETE').open, 'WORKFLOW');
    assert.match(sealHint('VALIDATED_CONTENT_REQUIRED').text, /Maître de conservation/);
    assert.equal(sealHint('VALIDATED_CONTENT_REQUIRED').open, null);
    assert.equal(sealHint('MASTER_KIND_CONFLICT').open, null);
    assert.equal(sealHint('AUTRE_CODE'), null);
    assert.equal(sealHint(null), null);
    assert.equal(sealHint(undefined), null);
});
