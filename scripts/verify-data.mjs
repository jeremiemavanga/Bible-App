import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(new URL('../public/data/kjv.json',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('../docs/kjv-integrity.json',import.meta.url)));
if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('KJV data checksum mismatch');
const books=JSON.parse(bytes);if(books.length!==66||books.reduce((a,b)=>a+b.chapters.length,0)!==1189||books.reduce((a,b)=>a+b.chapters.reduce((n,c)=>n+c.length,0),0)!==31102)throw Error('Incomplete KJV corpus');
console.log('KJV SHA-256 verified: 66 books, 1189 chapters, 31102 verses.');
