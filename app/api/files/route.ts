import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(!await getChatGPTUser())return new Response("Sign in required",{status:401});
 if(req.headers.get("origin")!==new URL(req.url).origin)return new Response("Invalid origin",{status:403});
 if(!env.BUCKET)return new Response("Document storage unavailable",{status:503});
 const form=await req.formData();const file=form.get("file");
 if(!(file instanceof File)||file.size>8*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))return new Response("Use a JPG, PNG, WebP or PDF up to 8 MB.",{status:400});
 const key=crypto.randomUUID();await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{name:file.name}});
 return Response.json({url:`/api/files?key=${key}`,name:file.name});
}
export async function GET(req:Request){
 if(!await getChatGPTUser())return new Response("Sign in required",{status:401});if(!env.BUCKET)return new Response("Storage unavailable",{status:503});
 const key=new URL(req.url).searchParams.get("key")||"";if(!/^[a-f0-9-]{36}$/.test(key))return new Response("Not found",{status:404});const obj=await env.BUCKET.get(key);if(!obj)return new Response("Not found",{status:404});
 return new Response(obj.body,{headers:{"Content-Type":obj.httpMetadata?.contentType||"application/octet-stream","Content-Disposition":"inline","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
