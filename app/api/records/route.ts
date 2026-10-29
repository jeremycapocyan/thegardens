import {prepareClock} from '../../../lib/clock';
import { getUser,sameOrigin } from "../../../lib/auth";
import {readLedger,appendRecords,StorageConflict} from '../../../lib/storage';
import { defaults, current, validateTransaction, validDate, today, type Entry, type Settings } from "../../../lib/business";
import {settingsFor,dailySales,validatePolicy,allocateProfit,validateRegister,scheduleJournal,validateFiling,enforceFinancialRules} from '../../../lib/accounting';
import {hydrateTransaction,validateDefinition} from '../../../lib/catalog';
import {employees,openShifts,dayRecords,shiftDate,calculatePay,validateEmployee,payrollItems,dayTypes} from '../../../lib/attendance';
export const dynamic = "force-dynamic";
function settings(all:Entry[]){return settingsFor(all);}
export async function GET(){try{const user=await getUser();if(!user)return Response.json({error:"Sign in to view records."},{status:401});const {entries}=await readLedger();return Response.json({entries,settings:settings(entries)},{headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({error:(e as Error).message},{status:503});}}
export async function POST(req:Request){try{
 const user=await getUser();if(!user)return Response.json({error:"Sign in to save records."},{status:401});
 if(!sameOrigin(req))return Response.json({error:"Invalid request origin."},{status:403});
 const body=await req.text();if(body.length>150000)throw Error("Record is too large.");const input=JSON.parse(body);const snapshot=await readLedger();const all=snapshot.entries;const s=settings(all);
 if(!/^[a-f0-9-]{36}$/.test(input.requestId||""))throw Error("Refresh the app before saving.");
 const prior=all.find(e=>e.id===input.requestId);if(prior)return Response.json({record:prior});
 let t:Entry={...input,id:input.requestId,actor:user.email,createdAt:new Date().toISOString()};
 if(t.kind==='transaction'&&t.type!=='Reversal')t=hydrateTransaction(t,all);
 if(t.kind==='daily_sales'||t.type==='Daily sales')t=dailySales(t,all,s);
 if(t.kind==='profit_allocation'||t.subtype==='profit_allocation')t=allocateProfit(t,all,s);
 if(t.kind==='schedule_post'||t.subtype==='schedule')t=scheduleJournal(t,all);
 if(t.kind==="transaction"){
  enforceFinancialRules(t,all,s);
  validateTransaction(t,all,s);
  if(t.payrollKeys){
   if(t.type!=='Journal'||!Array.isArray(t.payrollKeys)||!t.payrollKeys.length||new Set(t.payrollKeys).size!==t.payrollKeys.length)throw Error('Invalid payroll posting.');
   const used=all.filter(x=>x.kind==='transaction'&&x.payrollKeys&&!all.some(r=>r.type==='Reversal'&&r.linkId===x.id)).flatMap(x=>x.payrollKeys);
   const excluded=all.filter(e=>e.kind==='financial_reset').flatMap(e=>e.excludedPayrollIds||[]);if(t.payrollKeys.some((id:string)=>excluded.includes(id)))throw Error('This historical payroll was archived at the financial reset.');
   const items=payrollItems(all,t.payrollMonth).filter(x=>t.payrollKeys.includes(x.id));
   if(items.length!==t.payrollKeys.length||t.payrollKeys.some((id:string)=>used.includes(id)))throw Error('Some payroll items are missing or already posted.');
   const gross=items.reduce((n,x)=>n+x.total,0);if(t.lines.length!==2||t.lines[0].account!=='6020'||t.lines[0].debit!==gross||t.lines[0].credit!==0||t.lines[1].account!=='2500'||t.lines[1].credit!==gross||t.lines[1].debit!==0)throw Error('Payroll journal must match the recorded gross shift earnings.');
  }
 }
 else if(['category_definition','type_definition'].includes(t.kind)){validateDefinition(t,all);}
 else if(t.kind==='profit_policy'){validatePolicy(t,all,s);}
 else if(t.kind==='register'){validateRegister(t,all);}
 else if(t.kind==='filing'){validateFiling(t,all,s);}
 else if(t.kind==='period_control'){
  if(typeof t.lockDate!=='string'||!['Close','Reopen'].includes(t.action)||!String(t.description||'').trim()||t.approved!==true||t.previousLock!==s.lockDate)throw Error('Review the current lock date and provide a reason.');
  if(t.lockDate&&(!validDate(t.lockDate)||t.lockDate>today()))throw Error('Choose a valid date.');
  if(t.action==='Close'&&(!t.lockDate||t.lockDate<=s.lockDate))throw Error('Closing must advance the lock date.');
  if(t.action==='Reopen'&&(!s.lockDate||t.lockDate>=s.lockDate))throw Error('Reopening must move the lock earlier.');
  if(t.action==='Reopen'&&all.some(e=>e.kind==='transaction'&&e.subtype==='profit_allocation'&&!all.some(r=>r.type==='Reversal'&&r.linkId===e.id)&&e.to>t.lockDate))throw Error('Reverse profit allocations before reopening their periods.');
 }
 else if(t.kind==='employee'){validateEmployee(t,all);if(!t.parentId&&employees(all).some(e=>e.employeeId===t.employeeId))throw Error('Employee already exists.');t.effectiveFrom=t.parentId?today():t.startDate;}
 else if(t.kind==='clock'){t=prepareClock(t,all);}
 else if(t.kind==='attendance_day'){
  const employee=employees(all).find(e=>e.employeeId===t.employeeId);if(!employee||!validDate(t.date)||t.date<employee.startDate||!['Absent','Paid leave','Unpaid leave','Rest day','Clear override'].includes(t.status))throw Error('Choose employee, valid date and attendance status.');
  if(t.status==='Absent'&&t.date>today())throw Error('Future dates cannot be marked absent.');
  if(all.some(e=>e.kind==='clock'&&e.action==='in'&&e.employeeId===t.employeeId&&e.date===t.date))throw Error('This date has a recorded shift.');
  const previous=dayRecords(all).find(e=>e.employeeId===t.employeeId&&e.date===t.date);if(previous?.id!==t.parentId)throw Error('Attendance day changed. Refresh and try again.');
  const posted=all.some(x=>x.kind==='transaction'&&x.payrollKeys?.includes(previous?.id)&&!all.some(r=>r.type==='Reversal'&&r.linkId===x.id));if(posted)throw Error('Reverse its payroll journal before changing a posted leave day.');
  t.employeeName=employee.name;t.payAmount=t.status==='Paid leave'?employee.rate:0;
 }
 else if(t.kind==="settings"){
  const v=t.settings as Settings;if(!v||typeof v.businessName!=="string"||!v.businessName.trim())throw Error("Enter the business details.");
  if(v.lockDate!==s.lockDate)throw Error('Use the audited period close/reopen controls to change accounting locks.');
  if(v.fiscalStartMonth!==undefined&&(!Number.isInteger(v.fiscalStartMonth)||v.fiscalStartMonth<1||v.fiscalStartMonth>12))throw Error('Choose a valid accounting year start month.');
  const forms=['2550Q','2551Q','1702Q','1702-RT','1702-MX','0619-E','1601-EQ','1604-E','1601-C','1604-C','0619-F','1601-FQ','1604-F'];
  if(v.registrationConfirmed!==undefined&&typeof v.registrationConfirmed!=="boolean")throw Error("Registration confirmation must be true or false.");
  if(v.taxTypes&&(!Array.isArray(v.taxTypes)||v.taxTypes.some(x=>!forms.includes(x))))throw Error('Choose supported registered tax forms.');
  if(v.registrationConfirmed===true&&(v.taxProfile==='Unconfirmed'||!v.tin||!v.rdo||!v.address||!v.books||v.books==='Unconfirmed'||!v.invoiceAuthority||!v.taxTypes?.length))throw Error('Complete COR details, books and invoice authority before confirming registration.');
  if(v.percentageRate!==undefined&&(!Number.isFinite(v.percentageRate)||v.percentageRate<0||v.percentageRate>100))throw Error('Enter the confirmed percentage tax rate.');
 if(!v||!String(v.businessName).trim()||!["Unconfirmed","VAT","Non-VAT"].includes(v.taxProfile))throw Error("Enter a business name and valid tax profile.");
  if(!Array.isArray(v.courts)||!Array.isArray(v.partners)||v.courts.length>30||v.partners.length>30||[...v.courts,...v.partners].some(x=>typeof x!=="string"||!x.trim()||x.length>100)||new Set(v.courts).size!==v.courts.length||new Set(v.partners).size!==v.partners.length)throw Error("Use unique court and partner names, one per line.");
  if(!/^\d{2}:\d{2}$/.test(v.open)||!/^\d{2}:\d{2}$/.test(v.close)||v.open>=v.close||v.close>"23:59")throw Error("Use opening and closing times within one day.");
  if(v.lockDate&&(!validDate(v.lockDate)||v.lockDate>today()))throw Error("Lock date must be valid and not in the future.");
  if(s.lockDate&&(!v.lockDate||v.lockDate<s.lockDate))throw Error("Closed periods cannot be reopened from this tracker.");
  const usedPartners=[...all.filter(x=>x.partner).map(x=>x.partner),...all.flatMap(x=>x.lines||[]).map((x:any)=>x.partner).filter(Boolean),...all.flatMap(x=>x.shares||[]).map((x:any)=>x.partner)];if(usedPartners.some(p=>!v.partners.includes(p)))throw Error("Keep partners who have historical records.");
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
  if(t.variance&&!String(t.description||'').trim())throw Error('Explain the variance or outstanding reconciling items.');
  if((b[t.cashAccount]?.balance||0)!==t.expected)throw Error("Account balance changed. Refresh before closing.");
 }else throw Error("Unsupported record type.");
 if(t.sourceKey&&all.some(x=>x.sourceKey===t.sourceKey))throw Error("This source record has already been imported.");
 await appendRecords([t],snapshot);
 return Response.json({record:t},{status:201});
 }catch(e){return Response.json({error:(e as Error).message},{status:e instanceof StorageConflict?409:400});}}
