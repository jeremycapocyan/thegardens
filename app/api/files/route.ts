import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {getUser,sameOrigin} from '../../../lib/auth';
import {getDocument,putDocument,storagePrefix} from '../../../lib/storage';
export const dynamic='force-dynamic';export const runtime='nodejs';
const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
export async function POST(req:Request){try{
 if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
  if(!await getUser())return new Response('Sign in required',{status:401});if(!sameOrigin(req))return new Response('Invalid origin',{status:403});
  const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||file.size>8*1024*1024||!allowed.includes(file.type))return new Response('Use a JPG, PNG, WebP or PDF up to 8 MB.',{status:400});
  const key=crypto.randomUUID();await putDocument(key,file,file.type);return Response.json({url:`/api/files?key=${key}`,name:file.name});
 }
 const body=await req.json() as HandleUploadBody;
 const result=await handleUpload({body,request:req,onBeforeGenerateToken:async pathname=>{
  if(!await getUser()||!sameOrigin(req))throw Error('Sign in required.');
  if(!new RegExp('^'+storagePrefix+'documents/[a-f0-9-]{36}$').test(pathname))throw Error('Invalid document path.');
  return {allowedContentTypes:allowed,maximumSizeInBytes:8*1024*1024,addRandomSuffix:false,validUntil:Date.now()+10*60000};
 },onUploadCompleted:async()=>{}});return Response.json(result);
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}}
export async function GET(req:Request){
 if(!await getUser())return new Response('Sign in required',{status:401});
 const params=new URL(req.url).searchParams;if(params.get('capabilities'))return Response.json({directUpload:process.env.APP_STORAGE!=='local'&&!!process.env.BLOB_READ_WRITE_TOKEN},{headers:{'Cache-Control':'no-store'}});
 const key=params.get('key')||'';if(!/^[a-f0-9-]{36}$/.test(key))return new Response('Not found',{status:404});const file=await getDocument(key);if(!file)return new Response('Not found',{status:404});
 return new Response(file.body instanceof Buffer?new Uint8Array(file.body):file.body,{headers:{'Content-Type':file.contentType,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
