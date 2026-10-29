import {sameOrigin} from '../../../lib/request';
import {hrConfig,verifyQrToken,reserveAttempt,verifyEmployee,credentials,selfStatus,employeeDayType} from '../../../lib/hr-access';
import {readLedger,appendRecords,StorageConflict} from '../../../lib/storage';
import {employees,openShifts} from '../../../lib/attendance';
import {prepareClock} from '../../../lib/clock';
import type {Entry} from '../../../lib/business';
export const dynamic='force-dynamic';
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function POST(req:Request){try{
 if(!sameOrigin(req))return response({error:'Invalid request origin.'},403);const body=await req.text();if(body.length>3000)return response({error:'Request is too large.'},400);const input=JSON.parse(body),config=(await hrConfig()).value;
 if(!verifyQrToken(input.token,config))return response({error:'This QR code has expired or was replaced. Scan the current QR displayed at the courts.',expired:true},401);
 const snapshot=await readLedger(),all=snapshot.entries;
 if(input.action==='list'){await reserveAttempt(req,'roster',Date.now(),true);const enabled=(await credentials()).value;return response({employees:employees(all).filter(e=>e.active&&enabled.some(c=>c.employeeId===e.employeeId)).map(e=>({id:e.employeeId,name:e.name}))});}
 const employeeId=String(input.employeeId||'');if(!employeeId||employeeId.length>100)return response({error:'Choose your name and enter your personal six-digit PIN.'},400);
 await reserveAttempt(req,employeeId);const credential=await verifyEmployee(employeeId,String(input.pin||''));if(!credential)return response({error:'Name or PIN is incorrect.'},401);
 const employee=employees(all).find(e=>e.employeeId===credential.employeeId);if(!employee||!employee.active)return response({error:'Your self-service attendance access is not active. Contact the administrator.'},403);
 if(input.action==='status')return response(selfStatus(employee,all));if(!['in','out','break_start','break_end'].includes(input.action)||!/^[a-f0-9-]{36}$/.test(input.requestId||''))return response({error:'Choose a valid attendance action.'},400);
 const prior=all.find(e=>e.id===input.requestId);if(prior){if(prior.kind!=='clock'||prior.employeeId!==employee.employeeId||prior.action!==input.action)return response({error:'Request conflict. Refresh and try again.'},409);return response({...selfStatus(employee,all),saved:true,duplicate:true});}
 const open=openShifts(all).find(e=>e.employeeId===employee.employeeId);
 const record=prepareClock({id:input.requestId,kind:'clock',action:input.action,employeeId:employee.employeeId,shiftId:open?.id,dayType:employeeDayType(employee,config),actor:'employee:'+employee.employeeId,createdAt:new Date().toISOString(),source:'self-service-qr'} as Entry,all,Date.now(),false);
 await appendRecords([record],snapshot);return response({...selfStatus(employee,[...all,record]),saved:true,recordedAt:record.at},201);
 }catch(e){const message=(e as Error).message;return response({error:message},e instanceof StorageConflict?409:message.startsWith('Too many attempts')?429:400);}}
