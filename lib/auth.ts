import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {readJson,writeJson} from './storage';
import {signSession,verifySession,digest} from './session';
export type Admin={email:string;salt:string;hash:string;version:string;createdAt:string};
export const cookieName='gardens_session';
export function ownerEmail(){const email=process.env.OWNER_EMAIL?.trim().toLowerCase();if(!email)throw Error('Administrator login is not configured.');return email;}
function sessionSecret(){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw Error('Session security is not configured.');return secret;}
export async function getAdmin(){return readJson<Admin>('security/admin.json');}
export async function getUser(){const token=(await cookies()).get(cookieName)?.value;if(!token)return null;const session=verifySession(token,sessionSecret());if(!session||session.email!==ownerEmail())return null;const admin=(await getAdmin()).value;if(!admin||admin.email!==session.email||admin.version!==session.version)return null;return {userId:admin.email,email:admin.email,displayName:admin.email};}
export async function requireUser(){const user=await getUser();if(!user)redirect('/login');return user;}
export async function setSession(admin:Admin){const value=signSession({email:admin.email,version:admin.version,expires:Date.now()+7*86400000},sessionSecret());(await cookies()).set(cookieName,value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});}
export {sameOrigin} from './request';
export async function loginRateLimit(req:Request,failed:boolean|null){const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';const key='security/rate-'+digest(ip)+'.json';const current=await readJson<{start:number;count:number}>(key);const now=Date.now();const value=current.value&&now-current.value.start<600000?current.value:{start:now,count:0};if(failed===null){if(value.count>=10)throw Error('Too many attempts. Try again in 10 minutes.');return;}await writeJson(key,{start:value.start,count:failed?value.count+1:0},current.etag);}
