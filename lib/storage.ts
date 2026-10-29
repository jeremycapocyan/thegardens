import {get,put,head,BlobPreconditionFailedError} from '@vercel/blob';
import {createHash,randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {Entry} from './business';
export class StorageConflict extends Error {constructor(){super('Another record changed. Refresh and retry; this entry was not saved.');this.name='StorageConflict';}}
const prefix='gardens/v1/';
function useBlob(){if(process.env.APP_STORAGE==='local'&&process.env.VERCEL!=='1')return false;if(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN)return true;if(process.env.NODE_ENV==='production')throw Error('Persistent storage is not configured.');return false;}
function blobOptions(){return {access:'private' as const,...(process.env.BLOB_READ_WRITE_TOKEN?{token:process.env.BLOB_READ_WRITE_TOKEN}:process.env.BLOB_STORE_ID?{storeId:process.env.BLOB_STORE_ID}:{})};}
function localPath(key:string){if(!/^[a-zA-Z0-9/_.-]+$/.test(key)||key.split('/').includes('..'))throw Error('Invalid storage key.');const root=path.resolve(process.env.LOCAL_DATA_PATH||'.local-data');return path.join(root,key);}
const fingerprint=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function readJson<T>(key:string):Promise<{value:T|null;etag:string|null}>{
 if(useBlob()){const result=await get(prefix+key,{...blobOptions(),useCache:false});if(!result)return {value:null,etag:null};if(!result.stream||result.statusCode!==200)throw Error('Unable to read persistent storage.');const body=await new Response(result.stream).text();let etag=result.blob.etag;
  // Compressed downloads can have a weak representation ETag. If-Match needs
  // the strong stored-object ETag, verified against the downloaded revision.
  if(etag.startsWith('W/')){const metadata=await head(prefix+key,{...blobOptions(),token:process.env.BLOB_READ_WRITE_TOKEN});if(metadata.etag!==etag.slice(2))throw new StorageConflict();etag=metadata.etag;}
  return {value:JSON.parse(body),etag};}
 try{const body=await fs.readFile(localPath(key),'utf8');return {value:JSON.parse(body),etag:fingerprint(body)}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {value:null,etag:null};throw e;}
}
export async function writeJson(key:string,value:unknown,expected:string|null){
 const body=JSON.stringify(value);
 if(useBlob()){try{await put(prefix+key,body,{...blobOptions(),addRandomSuffix:false,allowOverwrite:expected!==null,...(expected?{ifMatch:expected}:{}),contentType:'application/json',cacheControlMaxAge:60});return;}catch(e){if(e instanceof BlobPreconditionFailedError||/already exists|precondition/i.test((e as Error).message))throw new StorageConflict();throw e;}}
 const file=localPath(key);await fs.mkdir(path.dirname(file),{recursive:true});const lock=file+'.lock';let acquired=false;
 for(let i=0;i<40;i++){try{await fs.mkdir(lock);acquired=true;break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,25));}}
 if(!acquired)throw new StorageConflict();try{const current=await readJson(key);if(current.etag!==expected)throw new StorageConflict();const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,body,{mode:0o600});await fs.rename(temp,file);}finally{await fs.rmdir(lock);}
}
export type Ledger={schema:1;revision:number;entries:Entry[]};
export async function readLedger(){const snapshot=await readJson<Ledger>('records.json');const value=snapshot.value||{schema:1 as const,revision:0,entries:[]};if(value.schema!==1||!Array.isArray(value.entries))throw Error('Unsupported ledger format.');return {...snapshot,value,entries:value.entries};}
export async function appendRecords(incoming:Entry[],snapshot:Awaited<ReturnType<typeof readLedger>>){
 const ids=new Set(snapshot.entries.map(e=>e.id)),sourceKeys=new Set(snapshot.entries.map(e=>e.sourceKey).filter(Boolean));for(const e of incoming){if(ids.has(e.id)||(e.sourceKey&&sourceKeys.has(e.sourceKey)))throw new StorageConflict();ids.add(e.id);if(e.sourceKey)sourceKeys.add(e.sourceKey);}
 await writeJson('records.json',{schema:1,revision:snapshot.value.revision+1,entries:[...snapshot.entries,...incoming]},snapshot.etag);
}
export async function putDocument(key:string,data:Blob,contentType:string){if(useBlob()){await put(prefix+'documents/'+key,data,{...blobOptions(),addRandomSuffix:false,contentType});return;}const file=localPath('documents/'+key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,Buffer.from(await data.arrayBuffer()),{flag:'wx',mode:0o600});await fs.writeFile(file+'.meta',JSON.stringify({contentType}));}
export async function getDocument(key:string){if(useBlob()){const result=await get(prefix+'documents/'+key,{...blobOptions(),useCache:false});return result?.stream?{body:result.stream,contentType:result.blob.contentType||'application/octet-stream'}:null;}try{const file=localPath('documents/'+key);const [body,meta]=await Promise.all([fs.readFile(file),fs.readFile(file+'.meta','utf8')]);return {body,contentType:JSON.parse(meta).contentType};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
export {prefix as storagePrefix};
