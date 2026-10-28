import {cookies} from 'next/headers';
import {randomUUID} from 'node:crypto';
import {cookieName,getAdmin,ownerEmail,sameOrigin,setSession,loginRateLimit} from '../../../../lib/auth';
import {writeJson} from '../../../../lib/storage';
import {hashPassword,verifyPassword,digest,secureEqual} from '../../../../lib/session';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{action:string}>}){const {action}=await params;if(action!=='status')return new Response('Not found',{status:404});return Response.json({setupRequired:!(await getAdmin()).value},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){try{
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403});const {action}=await params;
 if(action==='logout'){(await cookies()).delete(cookieName);return Response.json({ok:true});}
 if(!['login','setup'].includes(action))return new Response('Not found',{status:404});
 const raw=await req.text();if(raw.length>4096)throw Error('Invalid login request.');const input=JSON.parse(raw);const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
 if(action==='setup'){
  const expected=process.env.OWNER_SETUP_HASH;if(!expected||!input.setupToken||!secureEqual(digest(String(input.setupToken)),expected)||email!==ownerEmail())throw Error('This setup link or administrator email is invalid.');
  const current=await getAdmin();if(current.value)throw Error('Administrator is already configured. Sign in instead.');const credential=await hashPassword(password);const admin={email,...credential,version:randomUUID(),createdAt:new Date().toISOString()};await writeJson('security/admin.json',admin,null);await setSession(admin);return Response.json({ok:true});
 }
 await loginRateLimit(req,null);const admin=(await getAdmin()).value;
 if(!admin||email!==ownerEmail()||email!==admin.email||!await verifyPassword(password,admin.salt,admin.hash)){await loginRateLimit(req,true);return Response.json({error:'Email or password is incorrect.'},{status:401});}
 await loginRateLimit(req,false);await setSession(admin);return Response.json({ok:true});
 }catch(e){return Response.json({error:(e as Error).message},{status:/Too many/.test((e as Error).message)?429:400});}}
