import fs from 'node:fs/promises';
import path from 'node:path';
import {root,runtimeZip,extractZip,run} from './runtime.mjs';

if(process.arch!=='x64')throw new Error('The bundled development runtime currently targets x64.');
const destination=path.join(root,'.cache','desktop',process.platform);
const binary=path.join(destination,process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':process.platform==='win32'?'electron.exe':'electron');
try{await fs.access(binary);}catch{await extractZip(await runtimeZip(process.platform),destination);}
await run(binary,[root,...process.argv.slice(2)]);
