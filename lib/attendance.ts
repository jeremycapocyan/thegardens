import {current,today,validDate,type Entry} from './business';
export const dayTypes:Record<string,{regular:number;ot:number}>={Regular:{regular:1,ot:1.25},'Rest day':{regular:1.3,ot:1.69},'Special non-working day':{regular:1.3,ot:1.69},'Special day + rest day':{regular:1.5,ot:1.95},'Regular holiday':{regular:2,ot:2.6},'Regular holiday + rest day':{regular:2.6,ot:3.38}};
export const employeeDefaults={rate:65000,shiftStart:'15:30',shiftEnd:'23:30',standardMinutes:480,nightPercent:10,workdays:[1,2,3,4,5,6],active:true};
export function manilaDate(at:string|number){return new Date(new Date(at).getTime()+8*3600000).toISOString().slice(0,10);}
export function shiftDate(at:string|number){const ms=new Date(at).getTime();return manilaDate(new Date(ms+8*3600000).getUTCHours()<6?ms-86400000:ms);}
export function scheduledEnd(date:string,e:any){let end=new Date(`${date}T${e.shiftEnd}:00+08:00`).getTime();if(e.shiftEnd<=e.shiftStart)end+=86400000;return end;}
export function employees(all:Entry[]){return current(all,'employee');}
export function dayRecords(all:Entry[]){return current(all,'attendance_day');}
export function openShifts(all:Entry[]){return all.filter(e=>e.kind==='clock'&&e.action==='in'&&!all.some(c=>c.kind==='clock'&&c.action==='out'&&c.shiftId===e.id));}
export function calculatePay(start:Entry,endAt:string,events:Entry[]){
 const employee=start.employeeSnapshot||employeeDefaults;const stop=new Date(endAt).getTime(),begin=new Date(start.at).getTime();if(!Number.isFinite(stop)||stop<=begin||stop-begin>24*3600000)throw Error('A shift must end after clock-in and within 24 hours. Use a manual correction for a forgotten clock-out.');
 const breaks=events.filter(e=>e.shiftId===start.id&&['break_start','break_end'].includes(e.action)).sort((a,b)=>a.at.localeCompare(b.at));
 const segments:{start:number;end:number}[]=[];let cursor=begin,onBreak=false;
 for(const event of breaks){const time=Math.max(begin,Math.min(stop,new Date(event.at).getTime()));if(event.action==='break_start'&&!onBreak){if(time>cursor)segments.push({start:cursor,end:time});onBreak=true;}else if(event.action==='break_end'&&onBreak){cursor=time;onBreak=false;}}
 if(!onBreak&&cursor<stop)segments.push({start:cursor,end:stop});
 const multipliers=dayTypes[start.dayType]||dayTypes.Regular;const hourRate=employee.rate/(employee.standardMinutes/60);const overtimeAt=scheduledEnd(start.date,employee);
 let worked=0,regularMinutes=0,overtimeMinutes=0,nightMinutes=0,regularPay=0,overtimePay=0,nightPay=0;
 for(const seg of segments){let time=seg.start;while(time<seg.end){const statutory=worked>=employee.standardMinutes;const overtime=statutory||time>=overtimeAt;let edge=Math.min(seg.end,(Math.floor(time/60000)+1)*60000);if(!overtime)edge=Math.min(edge,overtimeAt,time+(employee.standardMinutes-worked)*60000);if(edge<=time)edge=Math.min(seg.end,time+1);const minutes=(edge-time)/60000;const hour=new Date(time+8*3600000).getUTCHours();const isNight=hour>=22||hour<6;const factor=overtime?multipliers.ot:multipliers.regular;const pay=hourRate*minutes/60*factor;if(overtime){overtimeMinutes+=minutes;overtimePay+=pay;}else{regularMinutes+=minutes;regularPay+=pay;}if(isNight){nightMinutes+=minutes;nightPay+=pay*employee.nightPercent/100;}worked+=minutes;time=edge;}}
 regularPay=Math.round(regularPay);overtimePay=Math.round(overtimePay);nightPay=Math.round(nightPay);
 return {workedMinutes:worked,breakMinutes:(stop-begin)/60000-worked,regularMinutes,overtimeMinutes,nightMinutes,regularPay,overtimePay,nightPay,total:regularPay+overtimePay+nightPay,rate:employee.rate,dayType:start.dayType,nightPercent:employee.nightPercent};
}
export function attendanceCounts(employee:Entry,all:Entry[],month:string,now=Date.now()){
 let present=0,absent=0,paidLeave=0,unpaidLeave=0;const length=new Date(+month.slice(0,4),+month.slice(5),0).getDate();
 for(let d=1;d<=length;d++){const date=`${month}-${String(d).padStart(2,'0')}`;if(date<employee.startDate||(employee.endDate&&date>employee.endDate)||date>manilaDate(now))continue;
  const clocks=all.filter(e=>e.kind==='clock'&&e.employeeId===employee.employeeId&&e.action==='in'&&e.date===date);const override=dayRecords(all).find(e=>e.employeeId===employee.employeeId&&e.date===date);
  if(clocks.length){present++;continue;}if(override&&override.status!=='Clear override'){if(override.status==='Absent')absent++;if(override.status==='Paid leave')paidLeave++;if(override.status==='Unpaid leave')unpaidLeave++;continue;}
  const versions=all.filter(e=>e.kind==='employee'&&e.employeeId===employee.employeeId&&(e.effectiveFrom||e.startDate)<=date);const effective=versions.at(-1)||employee;
  const weekday=new Date(date+'T12:00:00+08:00').getUTCDay();if(effective.workdays.includes(weekday)&&scheduledEnd(date,effective)<now)absent++;
 }return {present,absent,paidLeave,unpaidLeave};
}
export function validateEmployee(t:Entry,all:Entry[]){if(!String(t.name||'').trim()||t.name.length>100||!Number.isSafeInteger(t.rate)||t.rate<=0||t.rate>10000000||!validDate(t.startDate)||!/^\d{2}:\d{2}$/.test(t.shiftStart)||!/^\d{2}:\d{2}$/.test(t.shiftEnd)||t.shiftStart>'23:59'||t.shiftEnd>'23:59'||t.shiftStart===t.shiftEnd||t.standardMinutes!==480||![0,10].includes(t.nightPercent)||!Array.isArray(t.workdays)||!t.workdays.length||t.workdays.some((d:any)=>!Number.isInteger(d)||d<0||d>6)||!t.employeeId)throw Error('Enter employee details, daily rate, workdays and valid shift times.');if(t.parentId&&!employees(all).some(e=>e.id===t.parentId&&e.employeeId===t.employeeId))throw Error('Employee changed. Refresh and try again.');if(t.endDate&&(!validDate(t.endDate)||t.endDate<t.startDate))throw Error('End date must follow the employment start date.');}
export function payrollItems(all:Entry[],month:string){return [...all.filter(e=>e.kind==='clock'&&e.action==='out'&&e.date.startsWith(month)).map(e=>({id:e.id,employeeId:e.employeeId,name:e.employeeName,date:e.date,total:e.pay.total,pay:e.pay,label:'Shift'})),...dayRecords(all).filter(e=>e.status==='Paid leave'&&e.date.startsWith(month)&&e.date<=today()).map(e=>({id:e.id,employeeId:e.employeeId,name:e.employeeName,date:e.date,total:e.payAmount,pay:null,label:'Paid leave'}))];}
