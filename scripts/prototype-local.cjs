/* Banc visuel local : transpile les sources avec TypeScript, sans Vite natif.
   Uniquement démonstration. Ni intégration backend ni build de production. */
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'); const out=path.join(ROOT,'artifacts','prototype-local');fs.mkdirSync(out,{recursive:true});
const ts=require(ROOT+'/node_modules/typescript');
const modules={};
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(/\.tsx?$/.test(f)&&!f.endsWith('.d.ts')){let text=fs.readFileSync(f,'utf8').replaceAll('import.meta.env','({VITE_DATA_MODE:"demo",VITE_AUTH_MODE:"disabled",VITE_API_BASE:"/api/v1"})').replaceAll('import.meta.url','"http://localhost:8765/preview.js"').replaceAll('__DEMO_BUILD__','true').replaceAll('location.origin','"https://preview.invalid"');modules[path.relative(ROOT,f).replace(/\.tsx?$/,'')]=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}}}
walk(ROOT+'/src');
modules['src/ui/navigation']=`const React=require('react');let current='/connexion';const listeners=new Set();exports.navigate=function(p){if(!p.startsWith('/')||p.startsWith('//'))return;current=p;listeners.forEach(f=>f());window.scrollTo(0,0);};exports.usePath=function(){return React.useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>current);};`;
const packages=['react','react-dom','scheduler'];
function addJS(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(e.name==='cjs')addJS(f);}else if(f.endsWith('.js'))modules[path.relative(ROOT+'/node_modules',f)]=fs.readFileSync(f,'utf8');}}
for(const p of packages)addJS(ROOT+'/node_modules/'+p);
const pre=`/* PROTOTYPE LOCAL UNIQUEMENT : pas d'authentification ou de stockage distant. */
const process={env:{NODE_ENV:'production'}};if(!crypto.randomUUID)crypto.randomUUID=function(){return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}; const cache={};const modules={
`;
let bundle=pre+Object.entries(modules).map(([id,c])=>JSON.stringify(id)+':function(require,module,exports){\n'+c+'\n}').join(',\n')+'\n};\n';
bundle+=`function norm(s){const p=[];for(const x of s.split('/')){if(x==='..')p.pop();else if(x&&x!=='.')p.push(x);}return p.join('/');}\nfunction load(request,parent=''){if(request.endsWith('.css'))return {};if(request.includes('?url'))return '/preview-unavailable';let id=request.startsWith('.')?norm(parent.split('/').slice(0,-1).join('/')+'/'+request):request;let key=[id,id+'.js',id+'/index.js',id.replace(/\\.js$/,'')].find(x=>modules[x]);if(!key)throw new Error('Module non fourni dans le banc visuel: '+id);if(cache[key])return cache[key].exports;const m={exports:{}};cache[key]=m;modules[key](r=>load(r,key),m,m.exports);return m.exports;}\nload('src/main');`;
fs.writeFileSync(out+'/preview.js',bundle);
const css=['styles.css','institutional.css','archive-modules.css','design/f3.css'].map(n=>fs.readFileSync(ROOT+'/src/'+n,'utf8')).join('\n');fs.writeFileSync(out+'/preview.css',css);
fs.writeFileSync(out+'/index.html',`<!doctype html><html lang="fr"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>F3 — banc visuel local</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>`);
console.log(Object.keys(modules).length,'modules',bundle.length,'bytes');

fs.writeFileSync(path.join(out,'SNAE-PPD-F3-Prototype.html'),`<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>SNAE-PPD F3 — prototype local</title><style>${css}</style></head><body><div id="root"></div><script>${bundle.replaceAll('</script','<\\/script')}</script></body></html>`);
