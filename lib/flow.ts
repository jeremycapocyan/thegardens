import {accounts,cashAccounts,posting,trialBalance,type Entry,type Line} from './business';
export function cashGroup(e:Entry,all:Entry[]){const r=e.type==='Reversal'?all.find(x=>x.id===e.linkId)||e:e;return r.subtype==='opening_balance'?'Opening adjustments':r.type==='Asset purchase'?'Investing':/Partner|Loan|Profit distribution/.test(r.type)?'Financing':r.type==='Journal'?'Unclassified adjustments':'Operating';}
export function matchesCategory(e:Entry,id:string,all:Entry[]){if(!id)return true;const r=e.type==='Reversal'?all.find(x=>x.id===e.linkId)||e:e;return r.categorySnapshot?.id===id||r.category===id||r.sales?.some((x:any)=>(x.categorySnapshot?.id||x.account)===id)||posting(e,all).some(l=>l.account===id);}
export function flowSummary(all:Entry[],from:string,to:string,grouping:'Daily'|'Monthly'='Daily'){
 const tx=all.filter(e=>e.kind==='transaction'&&e.date<=to),period=tx.filter(e=>e.date>=from),before=tx.filter(e=>e.date<from),balances=trialBalance(tx,tx),opening=trialBalance(before,before);
 const points=new Map<string,{date:string;income:number;expenses:number;net:number}>();
 const categories=new Map<string,{id:string;name:string;group:string;amount:number}>();
 const movements:Record<string,{received:number;paid:number}>={};let income=0,expenses=0,received=0,paid=0;
 const add=(id:string,name:string,group:string,amount:number)=>{const key=group+':'+id;const row=categories.get(key)||{id,name,group,amount:0};row.amount+=amount;categories.set(key,row);};
 for(const e of period){const key=grouping==='Monthly'?e.date.slice(0,7):e.date;const p=points.get(key)||{date:key,income:0,expenses:0,net:0};const original=e.type==='Reversal'?tx.find(x=>x.id===e.linkId)||e:e;const sign=e.type==='Reversal'?-1:1;
  for(const l of posting(e,tx)){
   if(+l.account>=4000&&+l.account<5000){const n=l.credit-l.debit;income+=n;p.income+=n;if(original.type!=='Daily sales')add(original.categorySnapshot?.id||l.account,original.categorySnapshot?.name||accounts[l.account],'Income',n);}
   if(+l.account>=5000){const n=l.debit-l.credit;expenses+=n;p.expenses+=n;add(original.category===l.account?original.categorySnapshot?.id||l.account:l.account,original.category===l.account?original.categorySnapshot?.name||accounts[l.account]:accounts[l.account],'Expense',n);}
  }
  if(original.type==='Daily sales')for(const row of original.sales||[])add(row.categorySnapshot?.id||row.account,row.categorySnapshot?.name||accounts[row.account],'Income',sign*(row.gross-row.vat));
  p.net=p.income-p.expenses;points.set(key,p);
  const delta=posting(e,tx).filter(l=>cashAccounts.includes(l.account)).reduce((n,l)=>n+l.debit-l.credit,0);if(delta){const group=cashGroup(e,tx);movements[group]??={received:0,paid:0};if(delta>0){received+=delta;movements[group].received+=delta;}else{paid-=delta;movements[group].paid-=delta;}}
 }
 // Include quiet days/months so a gap is not presented as continuous activity.
 for(let date=new Date(from+'T00:00:00Z');date.toISOString().slice(0,10)<=to;date.setUTCDate(date.getUTCDate()+1)){const key=date.toISOString().slice(0,grouping==='Monthly'?7:10);if(!points.has(key))points.set(key,{date:key,income:0,expenses:0,net:0});}
 const sum=(b:ReturnType<typeof trialBalance>)=>cashAccounts.reduce((n,a)=>n+(b[a]?.balance||0),0);
 return {income,expenses,profit:income-expenses,received,paid,netCash:received-paid,openingCash:sum(opening),closingCash:sum(balances),balances,points:[...points.values()].sort((a,b)=>a.date.localeCompare(b.date)),categories:[...categories.values()].filter(c=>c.amount!==0).sort((a,b)=>b.amount-a.amount),movements};
}
