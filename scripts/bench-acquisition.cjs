/* BANC D'ESSAI UNIQUEMENT. Le composant est réel; API/identité simulées, aucun serveur métier.
   Exécuter: node scripts/bench-acquisition.cjs <dossier-sortie> */
const fs=require('fs'),path=require('path'),ROOT=path.resolve(__dirname,'..'),ts=require(ROOT+'/node_modules/typescript');
const out=path.resolve(process.argv[2]||path.join(ROOT,'artifacts/acquisition-bench'));fs.mkdirSync(out,{recursive:true});const modules={};
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){let f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(/\.tsx?$/.test(f)&&!f.endsWith('.d.ts')){let text=fs.readFileSync(f,'utf8').replaceAll('import.meta.env','({})').replaceAll('import.meta.url','"http://127.0.0.1/"').replaceAll('__DEMO_BUILD__','false');modules[path.relative(ROOT,f).replace(/\.tsx?$/,'')]=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}}}walk(ROOT+'/src');
function addJS(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(e.name==='cjs')addJS(f);}else if(f.endsWith('.js'))modules[path.relative(ROOT+'/node_modules',f)]=fs.readFileSync(f,'utf8');}}
for(const p of ['react','react-dom','scheduler'])addJS(ROOT+'/node_modules/'+p);
modules['src/auth/session']=String.raw`
 const {RecordsApi}=require('../api/records');const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 let batch=null,extraction=null;window.__acqCalls=[];
 const result=()=>({id:id(6),fileId:id(5),documentId:id(3),state:'TO_REVIEW',sourceSha256:'a'.repeat(64),documentVersion:0,options:{ocr:'AUTO',language:'fra+eng'},errorCode:null,review:null,result:{technical:{sizeBytes:123,mediaType:'application/pdf'},text:'RAPPORT DE RECETTE\nFait le 2 octobre 2026',pages:[{page:1,method:'NATIVE_PDF'}],candidates:[{field:'title',value:'Rapport de recette',page:1,evidence:'RAPPORT DE RECETTE',source:'NATIVE_PDF',ruleStrength:'LOW',rule:'FIRST_LINE',requiresReview:true},{field:'documentDate',value:'2026-10-02',page:1,evidence:'2 octobre 2026',source:'NATIVE_PDF',ruleStrength:'LOW',rule:'DATE_MENTION',requiresReview:true}],warnings:['Données fictives du banc de tests.']}});
 const transport={async request(p,o={}){window.__acqCalls.push({p,o});if(window.__failNext){window.__failNext=false;throw new Error('ERREUR API SIMULEE');}
 if(p==='/acquisition/capabilities')return {importsEnabled:true,extractionEnabled:true,workerEnabled:true,maxImportRows:500,maxImportBytes:5242880};
 if(p.startsWith('/documents?'))return {items:[{id:id(3),reference:'DOC-TEST',title:'Rapport de recette'}],page:0,size:20,hasMore:false};
 if(p==='/documents/'+id(3)+'/versions')return [{id:id(4),documentId:id(3),number:1,state:'BROUILLON',sealed:false}];
 if(p==='/versions/'+id(4)+'/files')return [{id:id(5),versionId:id(4),originalFilename:'rapport-test.pdf',mediaType:'application/pdf',state:'VALIDE',scanStatus:'CLEAN',validatedAt:'2026-10-02T12:00:00Z'}];
 if(p.endsWith('/extractions')&&o.method==='POST'){extraction=result();return extraction;}
 if(p==='/acquisition/extractions/'+id(6))return extraction;
 if(p.endsWith('/review')){extraction={...extraction,state:'REVIEWED',review:{decision:o.body.accept?'ACCEPTED':'REJECTED'}};return extraction;}
 if(p.endsWith('/commit')){batch={...batch,state:'COMMITTED',created:[{row:2,reference:'DOC-TEST',id:id(3),initialVersionId:id(4),fileName:'rapport-test.pdf'}]};return batch;}
 if(p.endsWith('/errors.csv')||p.includes('/templates/'))return new Blob(['reference;titre\nTEST;Rapport'],{type:'text/csv'});
 if(p.startsWith('/acquisition/imports/'))return batch;
 throw new Error('Contrat non simulé: '+p);},async upload(p,file,fields,key){window.__acqCalls.push({p,fields,key,file:file.name});if(window.__failNext){window.__failNext=false;throw new Error('ERREUR API SIMULEE');}
 if(p==='/acquisition/imports/preview'){batch={id:id(2),context:{kind:fields.kind,institutionId:fields.institutionId,departmentId:fields.departmentId??null},sourceSha256:'b'.repeat(64),state:'PREVIEW',expiresAt:'2099-01-01T00:00:00Z',valid:true,rows:[{number:2,values:{reference:'DOC-TEST',titre:'Rapport de recette',type_document_code:'RAPPORT',nom_fichier:'rapport-test.pdf'},issues:[]}],created:[]};return batch;}
 return {id:id(7),status:'COMPLETED',fileId:id(5),versionId:id(4),filename:file.name};}};
 const records=new RecordsApi(transport);exports.useSession=()=>({records,epoch:1,demo:false,me:null});
`;
modules['src/ui/workspace']=`exports.useWorkspace=()=>({scope:{institutionId:'10000000-0000-4000-8000-000000000001',departmentId:'10000000-0000-4000-8000-000000000010'}});`;
modules['src/main']=`const React=require('react');const {createRoot}=require('react-dom/client');const {AcquisitionPage}=require('./pages/Acquisition');createRoot(document.getElementById('root')).render(React.createElement(AcquisitionPage));`;
let bundle=`const process={env:{NODE_ENV:'production'}};const cache={};const modules={\n`+Object.entries(modules).map(([id,c])=>JSON.stringify(id)+':function(require,module,exports){\n'+c+'\n}').join(',\n')+'\n};\n';
bundle+=`function norm(s){const p=[];for(const x of s.split('/')){if(x==='..')p.pop();else if(x&&x!=='.')p.push(x);}return p.join('/');}function load(r,parent=''){if(r.endsWith('.css'))return {};if(r.includes('?url'))return '';const id=r.startsWith('.')?norm(parent.split('/').slice(0,-1).join('/')+'/'+r):r;const key=[id,id+'.js',id+'/index.js',id.replace(/\\.js$/,'')].find(x=>modules[x]);if(!key)throw new Error('Missing '+id);if(cache[key])return cache[key].exports;const m={exports:{}};cache[key]=m;modules[key](x=>load(x,key),m,m.exports);return m.exports;}load('src/main');`;
const css=['styles.css','institutional.css','archive-modules.css','design/f3.css','design/acquisition.css'].map(n=>fs.readFileSync(ROOT+'/src/'+n,'utf8')).join('\n');fs.writeFileSync(out+'/app.js',bundle);fs.writeFileSync(out+'/style.css',css+'\nbody{padding:24px;} .test-banner{background:#fff1cf;border:1px solid #b58a2d;padding:12px;margin-bottom:20px;}');
fs.writeFileSync(out+'/index.html','<!doctype html><html lang="fr"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div class="test-banner">BANC DE RECETTE LOCAL — API, identité et données simulées. Aucun serveur métier.</div><div id="root"></div><script src="/app.js"></script></body></html>');console.log(out);
