import {employees,openShifts,dayRecords,shiftDate,calculatePay,dayTypes,manilaDate} from './attendance';
import type {Entry} from './business';
export function prepareClock(t:Entry,all:Entry[],now=Date.now(),allowManual=true){
const employee=employees(all).find(e=>e.employeeId===t.employeeId);if(!employee)throw Error('Choose an employee.');
  t.at=new Date(now).toISOString();const open=openShifts(all).find(e=>e.employeeId===t.employeeId);
  if(t.action==='in'){
   if(!employee.active||employee.startDate>manilaDate(now)||(employee.endDate&&employee.endDate<manilaDate(now)))throw Error('Employee is not currently active.');if(open)throw Error('This employee is already clocked in.');
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
    if(t.manualEnd){if(!allowManual)throw Error('Only the administrator can correct a timestamp.');if(!t.description||!Number.isFinite(Date.parse(t.manualEnd))||Date.parse(t.manualEnd)>now)throw Error('Manual clock-out needs a valid past time and correction reason.');if(events.some(e=>Date.parse(e.at)>Date.parse(t.manualEnd)))throw Error('Manual clock-out precedes a recorded event.');t.recordedAt=t.at;t.at=new Date(t.manualEnd).toISOString();}
    t.pay=calculatePay(open,t.at,events);t.clockIn=open.at;
   }else if(!['break_start','break_end'].includes(t.action))throw Error('Invalid clock action.');
  }
 
 return t;
}
