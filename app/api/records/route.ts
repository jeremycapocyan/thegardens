import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { defaults, current, validateTransaction, validDate, today, type Entry, type Settings } from "../../../lib/business";
import {employees,openShifts,dayRecords,shiftDate,calculatePay,validateEmployee,payrollItems,dayTypes} from '../../../lib/attendance';
export const dynamic = "force-dynamic";
function db(){if(!env.DB)throw Error("Database is unavailable. Your entry has not been saved.");return env.DB;}
async function rows(){const r=await db().prepare("SELECT * FROM records ORDER BY created_at, id").all();return r.results.map((r:any)=>({...JSON.parse(r.payload),id:r.id,kind:r.kind,createdAt:r.created_at,actor:r.actor,sourceKey:r.source_key})) as Entry[];}
function settings(all:Entry[]){return {...defaults,...all.filter(e=>e.kind==="settings").at(-1)?.settings} as Settings;}
export async function GET(){try{const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to view records."},{status:401});const entries=await rows();return Response.json({entries,settings:settings(entries)},{headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({error:(e as Error).message},{status:503});}}
export async function POST(req:Request){try{
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to save records."},{status:401});
 if(req.headers.get("origin")!==new URL(req.url).origin)return Response.json({error:"Invalid request origin."},{status:403});
 const body=await req.text();if(body.length>150000)throw Error("Record is too large.");const input=JSON.parse(body);const all=await rows();const s=settings(all);
 if(!/^[a-f0-9-]{36}$/.test(input.requestId||""))throw Error("Refresh the app before saving.");
 const prior=all.find(e=>e.id===input.requestId);if(prior)return Response.json({record:prior});
 let t:Entry={...input,id:input.requestId,actor:user.email,createdAt:new Date().toISOString()};
 if(t.kind==="transaction"){
  validateTransaction(t,all,s);
  if(t.payrollKeys){
   if(t.type!=='Journal'||!Array.isArray(t.payrollKeys)||!t.payrollKeys.length||new Set(t.payrollKeys).size!==t.payrollKeys.length)throw Error('Invalid payroll posting.');
   const used=all.filter(x=>x.kind==='transaction'&&x.payrollKeys&&!all.some(r=>r.type==='Reversal'&&r.linkId===x.id)).flatMap(x=>x.payrollKeys);
   const items=payrollItems(all,t.payrollMonth).filter(x=>t.payrollKeys.includes(x.id));
   if(items.length!==t.payrollKeys.length||t.payrollKeys.some((id:string)=>used.includes(id)))throw Error('Some payroll items are missing or already posted.');
   const gross=items.reduce((n,x)=>n+x.total,0);if(t.lines.length!==2||t.lines[0].account!=='6020'||t.lines[0].debit!==gross||t.lines[0].credit!==0||t.lines[1].account!=='2500'||t.lines[1].credit!==gross||t.lines[1].debit!==0)throw Error('Payroll journal must match the recorded gross shift earnings.');
  }
 }
 else if(t.kind==='employee'){validateEmployee(t,all);if(!t.parentId&&employees(all).some(e=>e.employeeId===t.employeeId))throw Error('Employee already exists.');t.effectiveFrom=t.parentId?today():t.startDate;}
 else if(t.kind==='clock'){
  const employee=employees(all).find(e=>e.employeeId===t.employeeId);if(!employee)throw Error('Choose an employee.');
  t.at=new Date().toISOString();const open=openShifts(all).find(e=>e.employeeId===t.employeeId);
  if(t.action==='in'){
   if(!employee.active||employee.startDate>today()||(employee.endDate&&employee.endDate<today()))throw Error('Employee is not currently active.');if(open)throw Error('This employee is already clocked in.');
   if(!dayTypes[t.dayType])throw Error('Choose the day classification.');t.date=shiftDate(t.at);if(t.date<employee.startDate)throw Error('The work date precedes employment.');
   if(!employee.workdays.includes(new Date(t.date+'T12:00:00+08:00').getUTCDay())&&t.dayType==='Regular')throw Error('This is a scheduled rest day. Choose the appropriate rest-day classification.');
   if(all.some(e=>e.kind==='clock'&&e.action==='in'&&e.employeeId===t.employeeId&&e.date===t.date))throw Error('A shift is already recorded for this work date. Review it before adding another.');
   const day=dayRecords(all).find(e=>e.employeeId===t.employeeId&&e.date===t.date&&e.status!=='Clear override');if(day)throw Error('Clear the absence or leave record before clocking in.');
   t.employeeSnapshot=employee;t.employeeName=employee.name;t.shiftId=t.id;
  }else{
   if(!open||open.id!==t.shiftId)throw Error('No matching active shift. Refresh and try again.');t.date=open.date;t.employeeName=open.employeeName;
   const events=all.filter(e=>e.kind==='clock'&&e.shiftId===open.id);const lastBreak=events.filter(e=>['break_start','break_end'].includes(e.action)).at(-1);const onBreak=lastBreak?.action==='break_start';
   if(t.action==='break_start'&&onBreak)throw Error('Break already started.');if(t.action==='break_end'&&!onBreak)throw Error('No active break.');
   if(t.action==='out'){
    if(t.manualEnd){if(!t.description||!Number.isFinite(Date.parse(t.manualEnd))||Date.parse(t.manualEnd)>Date.now())throw Error('Manual clock-out needs a valid past time and correction reason.');if(events.some(e=>Date.parse(e.at)>Date.parse(t.manualEnd)))throw Error('Manual clock-out precedes a recorded event.');t.recordedAt=t.at;t.at=new Date(t.manualEnd).toISOString();}
    t.pay=calculatePay(open,t.at,events);t.clockIn=open.at;
   }else if(!['break_start','break_end'].includes(t.action))throw Error('Invalid clock action.');
  }
 }
 else if(t.kind==='attendance_day'){
  const employee=employees(all).find(e=>e.employeeId===t.employeeId);if(!employee||!validDate(t.date)||t.date<employee.startDate||!['Absent','Paid leave','Unpaid leave','Rest day','Clear override'].includes(t.status))throw Error('Choose employee, valid date and attendance status.');
  if(t.status==='Absent'&&t.date>today())throw Error('Future dates cannot be marked absent.');
  if(all.some(e=>e.kind==='clock'&&e.action==='in'&&e.employeeId===t.employeeId&&e.date===t.date))throw Error('This date has a recorded shift.');
  const previous=dayRecords(all).find(e=>e.employeeId===t.employeeId&&e.date===t.date);if(previous?.id!==t.parentId)throw Error('Attendance day changed. Refresh and try again.');
  const posted=all.some(x=>x.kind==='transaction'&&x.payrollKeys?.includes(previous?.id)&&!all.some(r=>r.type==='Reversal'&&r.linkId===x.id));if(posted)throw Error('Reverse its payroll journal before changing a posted leave day.');
  t.employeeName=employee.name;t.payAmount=t.status==='Paid leave'?employee.rate:0;
 }
 else if(t.kind==="settings"){
  const v=t.settings as Settings;if(!v||!String(v.businessName).trim()||!["Unconfirmed","VAT","Non-VAT"].includes(v.taxProfile))throw Error("Enter a business name and valid tax profile.");
  if(!Array.isArray(v.courts)||!Array.isArray(v.partners)||v.courts.length>30||v.partners.length>30||[...v.courts,...v.partners].some(x=>typeof x!=="string"||!x.trim()||x.length>100)||new Set(v.courts).size!==v.courts.length||new Set(v.partners).size!==v.partners.length)throw Error("Use unique court and partner names, one per line.");
  if(!/^\d{2}:\d{2}$/.test(v.open)||!/^\d{2}:\d{2}$/.test(v.close)||v.open>=v.close||v.close>"23:59")throw Error("Use opening and closing times within one day.");
  if(v.lockDate&&(!validDate(v.lockDate)||v.lockDate>today()))throw Error("Lock date must be valid and not in the future.");
  if(s.lockDate&&(!v.lockDate||v.lockDate<s.lockDate))throw Error("Closed periods cannot be reopened from this tracker.");
  const usedPartners=all.filter(x=>x.partner).map(x=>x.partner);if(usedPartners.some(p=>!v.partners.includes(p)))throw Error("Keep partners who have historical records.");
 }
 else if(t.kind==="booking"){
  if(!validDate(t.date)||!s.courts.includes(t.court)||!/^\d{2}:\d{2}$/.test(t.start)||!/^\d{2}:\d{2}$/.test(t.end)||t.start>=t.end||t.start<s.open||t.end>s.close||!String(t.customer||"").trim()||!["Reserved","Completed","Cancelled","No-show"].includes(t.status)||!Number.isSafeInteger(t.price)||t.price<0)throw Error("Enter a customer, configured court, valid hours and booking amount.");
  const bookings=current(all,"booking");if(t.parentId&&!bookings.some(x=>x.id===t.parentId))throw Error("Booking has changed. Refresh and try again.");
  if(!["Cancelled","No-show"].includes(t.status)&&bookings.some(b=>b.id!==t.parentId&&!["Cancelled","No-show"].includes(b.status)&&b.date===t.date&&b.court===t.court&&t.start<b.end&&t.end>b.start))throw Error("This court already has a booking in that time slot.");
 }
 else if(t.kind==="operation"){
  if(!["Maintenance","Cleaning","Incident","Inventory count","Staff shift","Compliance","Other"].includes(t.category)||!validDate(t.date)||!String(t.description||"").trim()||!["Open","In progress","Done"].includes(t.status))throw Error("Complete the operations log fields.");
  if(t.parentId&&!current(all,"operation").some(x=>x.id===t.parentId))throw Error("Log has changed. Refresh and try again.");
 }
 else if(t.kind==="close"){
  if(!validDate(t.date)||t.date>today()||!Number.isSafeInteger(t.counted)||t.counted<0||!Number.isSafeInteger(t.expected)||!Number.isSafeInteger(t.variance)||t.variance!==t.counted-t.expected)throw Error("Enter a valid cash count.");
  if(s.lockDate&&t.date<=s.lockDate)throw Error("This period is locked.");
  // Calculate independently; all cash postings through the selected day are reconciled.
  const {trialBalance,cashAccounts}=await import("../../../lib/business");const b=trialBalance(all.filter(x=>x.kind!=="transaction"||x.date<=t.date));
  if(!cashAccounts.includes(t.cashAccount))throw Error("Choose a money account to reconcile.");
  if((b[t.cashAccount]?.balance||0)!==t.expected)throw Error("Account balance changed. Refresh before closing.");
 }else throw Error("Unsupported record type.");
 if(t.sourceKey&&all.some(x=>x.sourceKey===t.sourceKey))throw Error("This source record has already been imported.");
 // Optimistic revision gate makes overlapping writes retry against a fresh snapshot.
 const result=await db().prepare("INSERT INTO records (id,kind,payload,created_at,actor,source_key) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM records)=?").bind(t.id,t.kind,JSON.stringify(t),t.createdAt,t.actor,t.sourceKey||null,all.length).run();
 if(!result.meta.changes)return Response.json({error:"Another record was saved. Refresh and try again; this entry was not saved."},{status:409});
 return Response.json({record:t},{status:201});
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}}
