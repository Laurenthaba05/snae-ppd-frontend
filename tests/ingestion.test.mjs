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
test('Un fichier trop gros pour l’antivirus est expliqué, avec la limite à relever',()=>{
 const message=ingestionMessage(receipt('RETRYABLE','SCAN_SIZE_LIMIT'));
 assert.match(message,/plus gros.*antivirus/);
 assert.match(message,/StreamMaxLength/);
});
test('Une analyse coupée par l’antivirus en cours d’envoi est expliquée, sans parler d’un service injoignable',()=>{
 const message=ingestionMessage(receipt('RETRYABLE','SCAN_STREAM_INTERRUPTED'));
 assert.match(message,/coupé la connexion/);
 assert.match(message,/StreamMaxLength/);
 assert.doesNotMatch(message,/injoignable/);
});
const capture = (body, status = 201) => { const seen = []; const fetcher = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }; return { seen, transport: new HttpTransport('/api/v1', async () => 'token', () => {}, fetcher) }; };
test('Un envoi en flux met le fichier lui-même dans le corps, sans multipart, avec son nom et son rôle en paramètres',async()=>{
 const data=receipt('COMPLETED',null);
 const { seen, transport: t } = capture({ ...data, status: 'COMPLETED', fileId: '00000000-0000-4000-8000-000000000009', resultCode: null });
 const file = new File(['contenu'], "L'entretien, n°1 [copie].mp4", { type: 'video/mp4' });
 const result = await t.uploadStream(`/versions/${versionId}/content/stream`, file, { role: 'MAITRE_CONSERVATION', filename: file.name }, 'stream-key');
 assert.equal(result.status, 'COMPLETED');
 const { url, init } = seen[0];
 assert.equal(init.method, 'PUT');
 assert.equal(init.body, file);                                                           // le fichier, pas un FormData
 assert.equal(init.headers['Content-Type'], 'video/mp4');
 assert.equal(init.headers['Idempotency-Key'], 'stream-key');
 assert.equal(init.headers.Authorization, 'Bearer token');
 const parsed = new URL(url, 'http://x');
 assert.equal(parsed.pathname, `/api/v1/versions/${versionId}/content/stream`);
 assert.equal(parsed.searchParams.get('filename'), "L'entretien, n°1 [copie].mp4");
 assert.equal(parsed.searchParams.get('role'), 'MAITRE_CONSERVATION');
});
test('Un envoi en flux ne se déguise jamais en formulaire : type inconnu ou de formulaire devient application/octet-stream',async()=>{
 for (const type of ['', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
  const { seen, transport: t } = capture(receipt('COMPLETED',null));
  await t.uploadStream(`/versions/${versionId}/content/stream`, new File(['x'], 'a.xyz', { type }), { filename: 'a.xyz' }, 'stream-key');
  assert.equal(seen[0].init.headers['Content-Type'], 'application/octet-stream', type);
 }
});
test('Un envoi en flux n’a pas de délai global : il ne s’arrête que par annulation',async()=>{
 const fetcher = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
 const t = new HttpTransport('/api/v1', async () => 'token', () => {}, fetcher, 5);          // délai ordinaire de 5 ms : un envoi n'en a pas
 const controller = new AbortController();
 let settled = false;
 const pending = t.uploadStream(`/versions/${versionId}/content/stream`, new File(['x'], 'a.xyz'), { filename: 'a.xyz' }, 'stream-key', controller.signal);
 pending.catch(() => { settled = true; });
 await new Promise(resolve => setTimeout(resolve, 150));                                     // bien plus que 5 ms
 assert.equal(settled, false, 'l’envoi ne doit pas être coupé par un délai');
 controller.abort();
 await assert.rejects(pending, error => error.name === 'AbortError');
});
test('Un envoi en flux refuse un chemin avec paramètres et une clé d’idempotence invalide',async()=>{
 const { transport: t } = capture(receipt('COMPLETED',null));
 const file = new File(['x'], 'a.xyz');
 await assert.rejects(t.uploadStream(`/versions/${versionId}/content/stream?x=1`, file, {}, 'stream-key'), /Chemin API interdit/);
 await assert.rejects(t.uploadStream(`/versions/${versionId}/../content/stream`, file, {}, 'stream-key'), /Chemin API interdit/);
 await assert.rejects(t.uploadStream(`/versions/${versionId}/content/stream`, file, {}, 'clé invalide'), /Idempotency-Key/);
});
test('Un envoi en flux refusé par le serveur rend le reçu rejeté exploitable',async()=>{
 const data=receipt('REJECTED','SCAN_STREAM_INTERRUPTED');
 const { transport: t } = capture(data, 422);
 const result = await t.uploadStream(`/versions/${versionId}/content/stream`, new File(['x'], 'a.xyz'), { filename: 'a.xyz' }, 'stream-key');
 assert.equal(result.status, 'REJECTED');
});
