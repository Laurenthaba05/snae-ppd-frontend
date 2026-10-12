export function validateFrontendEnvironment(env, mode, command) {
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && /(?:PASSWORD|SECRET|SERVICE_ROLE|PRIVATE_KEY|ACCESS_TOKEN)/i.test(key))
      throw new Error('Secret serveur interdit dans une variable VITE_.');
  }
  const target=new URL(env.DEV_BACKEND_TARGET||'http://127.0.0.1:8080');
  if (!['http:','https:'].includes(target.protocol)||target.username||target.password||target.search||target.hash||target.pathname!=='/')
    throw new Error('Origine API invalide.');
  const local=['127.0.0.1','localhost','[::1]'].includes(target.hostname);
  if (command==='serve' && !local) {
    if (target.protocol!=='https:' || env.SNAE_CONFIRMED_RECETTE_ORIGIN!==target.origin)
      throw new Error('Proxy distant refusé : confirmer explicitement une origine HTTPS de recette.');
  }
  if (mode!=='demo' && (env.VITE_DATA_MODE==='demo'||env.VITE_DEMO_BUILD==='true'))
    throw new Error('La démonstration exige --mode demo.');
  if (command==='build' && mode!=='demo' && !['oidc','supabase'].includes(env.VITE_AUTH_MODE))
    throw new Error('Un fournisseur d’identité explicite est requis pour un build connecté.');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const k=env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (k.startsWith('sb_secret_')) throw new Error('Clé secrète interdite dans le frontend.');
    if (k.split('.').length===3) {
      let payload; try {payload=JSON.parse(Buffer.from(k.split('.')[1],'base64url').toString());}
      catch {throw new Error('Clé JWT malformée.');}
      if (payload.role!=='anon') throw new Error('Seule la clé publique anon est admise côté navigateur.');
    }
  }
  return target.origin;
}
