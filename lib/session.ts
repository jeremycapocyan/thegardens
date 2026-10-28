import {createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export function digest(value:string){return createHash('sha256').update(value).digest('hex');}
export function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export async function hashPassword(password:string){if(password.length<12||password.length>256)throw Error('Use a password between 12 and 256 characters.');const salt=randomBytes(24).toString('hex');const hash=(await scrypt(password,salt,64) as Buffer).toString('hex');return {salt,hash};}
export async function verifyPassword(password:string,salt:string,hash:string){if(password.length>256)return false;const actual=(await scrypt(password,salt,64) as Buffer).toString('hex');return secureEqual(actual,hash);}
export type Session={email:string;version:string;expires:number};
export function signSession(payload:Session,secret:string){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const signature=createHmac('sha256',secret).update(body).digest('base64url');return body+'.'+signature;}
export function verifySession(token:string,secret:string,now=Date.now()):Session|null{try{if(token.length>2048)return null;const [body,signature,extra]=token.split('.');if(extra||!body||!signature)return null;const expected=createHmac('sha256',secret).update(body).digest('base64url');if(!secureEqual(signature,expected))return null;const s=JSON.parse(Buffer.from(body,'base64url').toString());return typeof s.email==='string'&&typeof s.version==='string'&&Number.isFinite(s.expires)&&s.expires>now?s:null;}catch{return null;}}
