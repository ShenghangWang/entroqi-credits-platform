import {constants} from 'node:fs';
import {lstat,open,readdir} from 'node:fs/promises';
import {join} from 'node:path';

export type ConsoleAssets={html:Buffer;files:ReadonlyMap<string,Buffer>};
// This is an immutable compiled build, not a user-uploaded file directory.
// Read before listening; no request-derived path reaches the filesystem.
export async function loadConsoleAssets(directory:string):Promise<ConsoleAssets>{
 const assets=join(directory,'assets');
 for(const path of [directory,assets]){const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid console build directory');}
 let total=0;
 const read=async(path:string,limit:number)=>{
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.size>limit||total+info.size>16*1024*1024)throw Error('Console build exceeds safe bounds');
   // Bound the read itself even if a trusted deployment file changes concurrently.
   const bytes=Buffer.alloc(info.size+1);let used=0;
   while(used<bytes.length){const part=await handle.read(bytes,used,bytes.length-used,null);if(!part.bytesRead)break;used+=part.bytesRead;}
   if(used!==info.size)throw Error('Console build changed during startup');total+=used;return bytes.subarray(0,used);
  }finally{await handle.close();}
 };
 const html=await read(join(directory,'index.html'),256*1024),names=await readdir(assets);
 if(names.length>128)throw Error('Too many console assets');
 const files=new Map<string,Buffer>();
 for(const name of names){if(/^[A-Za-z0-9_.-]+\.(js|css|svg|woff2?)$/.test(name))files.set(name,await read(join(assets,name),4*1024*1024));}
 return {html,files};
}
