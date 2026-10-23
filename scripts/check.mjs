import fs from 'node:fs/promises';
import path from 'node:path';
import {root,run} from './runtime.mjs';
const files=['engine.mjs','server.mjs','platform.mjs','http-policy.mjs','desktop.cjs','public/app.js','extension/background.js','extension/options.js'];
for(const directory of ['scripts','test'])for(const name of await fs.readdir(path.join(root,directory)))if(/\.(mjs|cjs|js)$/.test(name))files.push(directory+'/'+name);
for(const file of files)await run(process.execPath,['--check',path.join(root,file)]);
for(const file of ['package.json','package-lock.json','extension/manifest.json'])JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
console.log('Syntax and JSON checks passed.');
