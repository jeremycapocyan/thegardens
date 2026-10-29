import {createHmac,randomUUID} from 'node:crypto';
import {readJson,writeJson} from './storage';
import {digest,secureEqual,hashPassword,verifyPassword} from './session';
import {manilaDate,shiftDate,employees,openShifts} from './attendance';
import type {Entry} from './business';
export type HrConfig={nonce:string;rollover:0|6;day:string;dayType:string};
export type EmployeeCredential={employeeId:string;code:string;salt:string;hash:string;version:string;updatedAt:string};
export const hrConfigKey='security/hr-config.json',credentialKey='security/hr-credentials.json';
export async function hrConfig(){const r=await readJson<HrConfig>(hrConfigKey);return {...r,value:r.value||{nonce:'initial-v1',rollover:6 as const,day:'',dayType:'Regular'}};}
export function attendanceDay(now:number,rollover:number){return manilaDate(now-rollover*3600000);}
export function qrExpiry(day:string,rollover:number){return Date.parse(day+'T00:00:00+08:00')+(24+rollover)*3600000;}
function secret(){const s=process.env.SESSION_SECRET;if(!s||s.length<32)throw Error('Attendance security is not configured.');return s;}
export function createQrToken(config:HrConfig,now=Date.now()){
 const day=attendanceDay(now,config.rollover);const body=Buffer.from(JSON.stringify({purpose:'employee-clock',day,nonce:config.nonce,rollover:config.rollover})).toString('base64url');return body+'.'+createHmac('sha256',secret()).update('hr-qr:'+body).digest('base64url');
}
export function verifyQrToken(token:string,config:HrConfig,now=Date.now()){
 try{if(typeof token!=='string'||token.length>700)return false;const [body,signature,extra]=token.split('.');if(!body||!signature||extra)return false;const expected=createHmac('sha256',secret()).update('hr-qr:'+body).digest('base64url');if(!secureEqual(signature,expected))return false;const p=JSON.parse(Buffer.from(body,'base64url').toString());return p.purpose==='employee-clock'&&p.day===attendanceDay(now,config.rollover)&&p.nonce===config.nonce&&p.rollover===config.rollover&&now<qrExpiry(p.day,config.rollover);}catch{return false;}
}
export async function credentials(){const r=await readJson<EmployeeCredential[]>(credentialKey);return {...r,value:r.value||[]};}
export async function saveCredential(employeeId:string,code:string,pin:string,all:Entry[]){
 if(!employees(all).some(e=>e.employeeId===employeeId))throw Error('Choose an employee.');code=String(code||('EMP-'+employeeId.replaceAll('-','').slice(0,12))).trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)||!/^\d{6}$/.test(pin))throw Error('Use a 2–20 character employee code and a personal six-digit PIN.');
 const current=await credentials();if(current.value.some(e=>e.code===code&&e.employeeId!==employeeId))throw Error('Employee code is already assigned.');
 const hashed=await hashPassword('employee-pin:'+pin);const item={employeeId,code,...hashed,version:randomUUID(),updatedAt:new Date().toISOString()};await writeJson(credentialKey,[...current.value.filter(e=>e.employeeId!==employeeId),item],current.etag);return {employeeId,code};
}
export async function verifyEmployee(code:string,pin:string){const list=await credentials(),match=list.value.find(e=>e.employeeId===code);if(!match||!/^\d{6}$/.test(pin))return null;return await verifyPassword('employee-pin:'+pin,match.salt,match.hash)?match:null;}
// Reserve attempts before credential verification. Concurrent attempts cannot
// bypass the counter, and public attendance attempts never affect owner login.
export async function reserveAttempt(req:Request,code:string,now=Date.now(),roster=false){
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';
 for(const [scope,limit] of (roster?[[`roster-ip:${ip}`,120]]:[[`ip:${ip}`,60],[`code:${code}`,12]]) as [string,number][]){const key='security/hr-rate-'+digest(scope)+'.json';const r=await readJson<{start:number;count:number}>(key);const v=r.value&&now-r.value.start<600000?r.value:{start:now,count:0};if(v.count>=limit)throw Error('Too many attempts. Wait 10 minutes before trying again.');await writeJson(key,{start:v.start,count:v.count+1},r.etag);}
}
export function employeeDayType(employee:Entry,config:HrConfig,now=Date.now()){
 const date=attendanceDay(now,6),rest=!employee.workdays.includes(new Date(date+'T12:00:00+08:00').getUTCDay()),base=config.day===date?config.dayType:'Regular';
 if(base==='Regular holiday')return rest?'Regular holiday + rest day':base;if(base==='Special non-working day')return rest?'Special day + rest day':base;return rest?'Rest day':'Regular';
}
export function selfStatus(employee:Entry,all:Entry[],now=Date.now()){
 const open=openShifts(all).find(e=>e.employeeId===employee.employeeId),events=open?all.filter(e=>e.kind==='clock'&&e.shiftId===open.id):[],lastBreak=events.filter(e=>['break_start','break_end'].includes(e.action)).at(-1),out=all.filter(e=>e.kind==='clock'&&e.employeeId===employee.employeeId&&e.action==='out').at(-1);
 return {name:employee.name,active:!!open,onBreak:lastBreak?.action==='break_start',completedWorkday:!open&&all.some(e=>e.kind==='clock'&&e.action==='in'&&e.employeeId===employee.employeeId&&e.date===shiftDate(now)),shift:open?{at:open.at,date:open.date,shiftId:open.id}:null,lastShift:out?{at:out.at,date:out.date,gross:out.pay.total,regular:out.pay.regularPay,overtime:out.pay.overtimePay,night:out.pay.nightPay}:null,serverTime:new Date(now).toISOString()};
}
