import { cp, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.resolve(root, 'dist');
// Only replace this checkout's direct dist directory. A symlink must never
// redirect cleanup into another directory or a user's unrelated files.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unsafe build output path.');
const previous = await lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (previous?.isSymbolicLink() || (previous && !previous.isDirectory())) throw new Error('dist must be a normal directory.');
if (previous) await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
for (const file of ['index.html','navigator.html','src','assets','data','docs']) await cp(path.join(root,file), path.join(output,file), {recursive:true});
await mkdir(path.join(output, 'data-pipeline'), {recursive:true});
await cp(path.join(root, 'data-pipeline/README.md'), path.join(output, 'data-pipeline/README.md'));
console.log('Built a standalone static site in dist/.');
