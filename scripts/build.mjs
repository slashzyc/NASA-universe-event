import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root,'dist'), {recursive:true});
for (const file of ['index.html','src','assets','data','docs']) await cp(path.join(root,file), path.join(root,'dist',file), {recursive:true});
console.log('Built a standalone static site in dist/.');
