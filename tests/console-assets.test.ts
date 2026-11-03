import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadConsoleAssets} from '../src/back-office/console-assets.js';
import {buildPrivateApp} from '../src/private-api.js';import type {Database} from '../src/db/pool.js';
const db:Database={query:()=>Promise.reject(Error('No financial read expected')),withTransaction:()=>Promise.reject(Error('No write expected')),close:async()=>{}};
async function fixture(){const directory=await mkdtemp(join(tmpdir(),'credits-assets-'));await mkdir(join(directory,'assets'));await writeFile(join(directory,'index.html'),'<html>original console</html>');await writeFile(join(directory,'assets','compiled.js'),'window.originalConsole=true;');return directory;}
it('serves an immutable original-console snapshot and never turns an HTTP path into a filesystem read',async()=>{
 const directory=await fixture();vi.stubEnv('CREDITS_CONSOLE_DIRECTORY',directory);
 const app=await buildPrivateApp(db,[{token:'s'.repeat(43),application:'simulation',issuer:'asset-fixture',onboarding:'self_service',permissions:['catalog']}],[],[{id:'owner',token:'o'.repeat(43),applications:['simulation']}]);
 try{
  expect((await app.inject('/back-office/login')).body).toContain('original console');
  await writeFile(join(directory,'index.html'),'replacement after startup');await rm(join(directory,'assets','compiled.js'));
  expect((await app.inject('/back-office/login')).body).toContain('original console');
  const asset=await app.inject('/console/assets/compiled.js');expect(asset.statusCode).toBe(200);expect(asset.body).toContain('originalConsole');expect(asset.headers['content-security-policy']).toContain("script-src 'self'");
  for(const path of ['missing.js','..%2Findex.html','%2e%2e%5csecret.js','compiled.js.map','%252e%252e%252fsecret.js'])expect((await app.inject('/console/assets/'+path)).statusCode).toBe(404);
 }finally{await app.close();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});}
});
it('refuses symlink files and asset directories before exposing any console content',async()=>{
 const directory=await fixture();try{
  const secret=join(directory,'private.txt');await writeFile(secret,'not a browser asset');await symlink(secret,join(directory,'assets','leak.js'));await expect(loadConsoleAssets(directory)).rejects.toThrow();
  await rm(join(directory,'assets'),{recursive:true});const other=join(directory,'elsewhere');await mkdir(other);await symlink(other,join(directory,'assets'));await expect(loadConsoleAssets(directory)).rejects.toThrow(/directory/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('bounds each file, aggregate startup bytes and asset count',async()=>{
 const directory=await fixture();try{
  await writeFile(join(directory,'assets','large.js'),Buffer.alloc(4*1024*1024+1));await expect(loadConsoleAssets(directory)).rejects.toThrow(/bounds/);await rm(join(directory,'assets','large.js'));
  for(let i=0;i<5;i++)await writeFile(join(directory,'assets',i+'.js'),Buffer.alloc(3500000));await expect(loadConsoleAssets(directory)).rejects.toThrow(/bounds/);
  await rm(join(directory,'assets'),{recursive:true});await mkdir(join(directory,'assets'));for(let i=0;i<129;i++)await writeFile(join(directory,'assets',i+'.js'),'');await expect(loadConsoleAssets(directory)).rejects.toThrow(/many/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
