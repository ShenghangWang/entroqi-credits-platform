import {rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
// A deleted panel must not survive as a stale executable in the release output.
await rm(new URL('../dist',import.meta.url),{recursive:true,force:true});
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],{stdio:'inherit'});
process.exitCode=result.status??1;
