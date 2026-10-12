import { readFileSync } from 'node:fs';
const p=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
if (process.versions.node!==p.engines.node) throw new Error(`Node ${p.engines.node} requis pour le build P1.`);
const match=/npm\/([^ ]+)/.exec(process.env.npm_config_user_agent??'');
if (!match || match[1]!==p.engines.npm) throw new Error(`npm ${p.engines.npm} requis pour le build P1.`);
