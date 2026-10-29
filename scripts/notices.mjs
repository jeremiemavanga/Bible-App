import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const roots=readdirSync('node_modules').flatMap(n=>n.startsWith('@')?readdirSync(join('node_modules',n)).map(s=>join('node_modules',n,s)):[join('node_modules',n)]);
const notices=[];
for(const root of roots){const p=join(root,'package.json');if(!existsSync(p))continue;const pkg=JSON.parse(readFileSync(p,'utf8'));const files=readdirSync(root).filter(f=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(f));for(const f of files){const file=join(root,f);try{notices.push(`${pkg.name} ${pkg.version} (${pkg.license??'see notice'})\n${readFileSync(file,'utf8')}`)}catch{}}}
writeFileSync('public/THIRD-PARTY-NOTICES.txt',notices.join('\n\n'+'='.repeat(72)+'\n\n'));
