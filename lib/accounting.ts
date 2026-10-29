import {accounts,cashAccounts,defaults,expenseAccounts,isReversed,outstanding,partnerAccounts,posting,saleAccounts,today,trialBalance,validDate,type Entry,type Settings,type Line} from './business';

export function settingsFor(all:Entry[]):Settings {
 const s={...defaults,...all.filter(e=>e.kind==='settings').at(-1)?.settings};
 const control=all.filter(e=>e.kind==='period_control').at(-1);if(control)s.lockDate=control.lockDate;
 return s;
}
export function activeTransactions(all:Entry[]){return all.filter(e=>e.kind==='transaction'&&e.type!=='Reversal'&&!isReversed(e,all));}
const integer=(n:any)=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
const requireDate=(date:string)=>{if(!validDate(date)||date>today())throw Error('Use a valid date no later than today.');};
function uniqueKey(t:Entry,all:Entry[],key:string){if(activeTransactions(all).some(e=>(e.businessKey||e.sourceKey)===key))throw Error('This source has already been posted.');t.businessKey=key;t.sourceKey=key+':'+t.id;}
export function profitFor(all:Entry[],from:string,to:string){const b=trialBalance(all.filter(e=>e.kind==='transaction'&&e.date>=from&&e.date<=to),all);return -Object.entries(b).filter(([a])=>+a>=4000).reduce((n,[,b])=>n+b.balance,0);}
export function invoiceClaims(t:Entry):{series:string;from:number;to:number}[] {
 if(t.type==='Daily sales')return [{series:String(t.series).trim().toUpperCase(),from:t.invoiceFrom,to:t.invoiceTo}];
 if(['Sale','Apply deposit'].includes(t.type)&&t.invoice){const m=String(t.invoice).trim().match(/^(.*?)(\d+)$/);if(m)return [{series:String(t.invoiceSeries||m[1].replace(/[-\s]+$/,'')).trim().toUpperCase(),from:Number(m[2]),to:Number(m[2])}];}
 return [];
}
export function checkInvoiceOverlap(t:Entry,all:Entry[]){for(const c of invoiceClaims(t))for(const e of activeTransactions(all))for(const old of invoiceClaims(e))if(c.series===old.series&&c.from<=old.to&&c.to>=old.from)throw Error('Invoice number/range overlaps an existing sale. Reverse the earlier entry before replacing it.');}

export function dailySales(t:Entry,all:Entry[],s:Settings):Entry {
 requireDate(t.date);if(!String(t.series||'').trim()||String(t.series).length>50||!Number.isSafeInteger(t.invoiceFrom)||!Number.isSafeInteger(t.invoiceTo)||t.invoiceFrom<1||t.invoiceTo<t.invoiceFrom||t.invoiceTo-t.invoiceFrom>10000)throw Error('Enter the invoice booklet/series and a valid inclusive number range (maximum 10,001 numbers).');
 if(!Array.isArray(t.cancelled)||t.cancelled.some((n:any)=>!Number.isSafeInteger(n)||n<t.invoiceFrom||n>t.invoiceTo)||new Set(t.cancelled).size!==t.cancelled.length||t.cancelled.length>=t.invoiceTo-t.invoiceFrom+1)throw Error('Cancelled invoice numbers must be unique, within this range, with at least one issued invoice.');
 if(!Array.isArray(t.sales)||!t.sales.length||t.sales.length>6||new Set(t.sales.map((r:any)=>r.account)).size!==t.sales.length)throw Error('Enter each sales category once.');
 const lines:Line[]=[];let gross=0,vat=0;
 for(const row of t.sales){if(!saleAccounts.includes(row.account)||!integer(row.gross)||!integer(row.vat)||row.gross<=0||row.vat>=row.gross||!['Taxable','Exempt','Zero-rated','Non-VAT'].includes(row.taxClass))throw Error('Enter a valid gross amount, VAT amount and tax classification for each service category.');if(row.vat&&(s.taxProfile!=='VAT'||row.taxClass!=='Taxable'))throw Error('VAT requires confirmed VAT registration and taxable sales.');if(s.taxProfile!=='VAT'&&['Taxable','Zero-rated'].includes(row.taxClass))throw Error('Use Non-VAT or Exempt until VAT registration is confirmed.');lines.push({account:row.account,debit:0,credit:row.gross-row.vat});gross+=row.gross;vat+=row.vat;}
 if(!Array.isArray(t.tenders)||t.tenders.length!==3||new Set(t.tenders.map((r:any)=>r.account)).size!==3||t.tenders.some((r:any)=>!cashAccounts.includes(r.account)||!integer(r.gross)||!integer(r.fee)||r.fee>r.gross)||!integer(t.receivable)||!integer(t.withholding)||t.withholding>gross)throw Error('Enter valid gross collections, fees, unpaid sales and creditable withholding.');
 if(t.tenders.reduce((n:number,r:any)=>n+r.gross,0)+t.receivable+t.withholding!==gross)throw Error('Gross collections + unpaid sales + withheld tax must equal total invoiced sales. Log previous collections and deposits separately.');
 for(const row of t.tenders){if(row.gross-row.fee)lines.push({account:row.account,debit:row.gross-row.fee,credit:0});if(row.fee)lines.push({account:'6070',debit:row.fee,credit:0});}
 if(t.receivable)lines.push({account:'1100',debit:t.receivable,credit:0});if(t.withholding)lines.push({account:'1150',debit:t.withholding,credit:0});if(vat)lines.push({account:'2200',debit:0,credit:vat});
 t={...t,kind:'transaction',type:'Daily sales',amount:gross,vat,lines,payment:t.receivable?'On account':'Paid',counterparty:t.counterparty||'Daily sales summary',invoice:`${t.series}: ${t.invoiceFrom}–${t.invoiceTo}`,description:t.description||`Daily service sales · ${t.date}`};
 uniqueKey(t,all,'daily-sales:'+t.date);checkInvoiceOverlap(t,all);return t;
}

export function validatePolicy(t:Entry,all:Entry[],s:Settings){requireDate(t.effectiveFrom);if(s.lockDate&&t.effectiveFrom<=s.lockDate)throw Error('Profit-sharing policy must start in an open period.');if(!Array.isArray(t.shares)||t.shares.length!==s.partners.length||!t.shares.length||new Set(t.shares.map((x:any)=>x.partner)).size!==s.partners.length||t.shares.some((x:any)=>!s.partners.includes(x.partner)||!integer(x.basisPoints)||x.basisPoints>10000)||t.shares.reduce((n:number,x:any)=>n+x.basisPoints,0)!==10000)throw Error('Include every partner once with percentages totaling exactly 100%.');if(all.some(e=>e.kind==='profit_policy'&&e.effectiveFrom===t.effectiveFrom))throw Error('A policy already exists for that effective date.');}
export function allocationPreview(all:Entry[],from:string,to:string){
 if(!validDate(from)||!validDate(to)||from>to||to>today())throw Error('Choose a valid allocation period.');
 const policies=all.filter(e=>e.kind==='profit_policy'&&e.effectiveFrom<=from).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));const policy=policies.at(-1);
 if(!policy||all.some(e=>e.kind==='profit_policy'&&e.effectiveFrom>from&&e.effectiveFrom<=to))throw Error('Choose a period covered by one profit-sharing policy. Split the period at a policy change.');
 const profit=profitFor(all,from,to),absolute=Math.abs(profit),sign=profit<0?-1:1;if(!Number.isSafeInteger(profit))throw Error('Profit exceeds the supported precision.');
 const shares=policy.shares.map((x:any)=>({...x,amount:Number(BigInt(absolute)*BigInt(x.basisPoints)/BigInt(10000))}));
 let remainder=absolute-shares.reduce((n:number,x:any)=>n+x.amount,0);
 const order=policy.shares.map((x:any,i:number)=>({i,fraction:Number(BigInt(absolute)*BigInt(x.basisPoints)%BigInt(10000))})).sort((a:any,b:any)=>b.fraction-a.fraction||a.i-b.i);
 for(const {i} of order){if(!remainder)break;shares[i].amount++;remainder--;}
 for(const x of shares)x.amount*=sign;
 return {profit,shares,policyId:policy.id};
}
export function allocateProfit(t:Entry,all:Entry[],s:Settings):Entry {
 if(t.approved!==true)throw Error('Review and approve the after-tax profit allocation.');if(!s.lockDate||t.to>s.lockDate)throw Error('Close and review the allocation period first, including income tax adjustments.');
 if(activeTransactions(all).some(e=>e.subtype==='profit_allocation'&&e.from<=t.to&&e.to>=t.from))throw Error('This period overlaps a posted allocation.');
 const p=allocationPreview(all,t.from,t.to);if(!p.profit)throw Error('There is no profit or loss to allocate.');if(t.expectedProfit!==p.profit)throw Error('Profit changed. Refresh and review the allocation again.');
 const lines:Line[]=[{account:'3200',debit:Math.max(p.profit,0),credit:Math.max(-p.profit,0)},...p.shares.filter((x:any)=>x.amount).map((x:any)=>({account:'3010',partner:x.partner,debit:Math.max(-x.amount,0),credit:Math.max(x.amount,0)}))];
 return {...t,kind:'transaction',type:'Journal',subtype:'profit_allocation',description:`Approved after-tax profit/loss allocation ${t.from} to ${t.to}`,lines,allocation:p};
}
export function validateRegister(t:Entry,all:Entry[]){
 const source=activeTransactions(all).find(e=>e.id===t.sourceId&&e.type===(t.registerType==='Asset'?'Asset purchase':'Prepayment'));
 if(!['Asset','Prepayment'].includes(t.registerType)||!source||!String(t.name||'').trim()||!validDate(t.startDate)||t.startDate<source.date||!Number.isInteger(t.months)||t.months<1||t.months>600||!integer(t.residual)||t.residual>=source.amount-source.vat||!expenseAccounts.includes(t.expenseAccount)||(t.registerType==='Prepayment'&&t.residual!==0))throw Error('Choose a matching purchase, service start date, useful life (1–600 months), residual and expense account.');
 if(all.some(e=>e.kind==='register'&&e.sourceId===t.sourceId))throw Error('This purchase already has a register entry.');t.cost=source.amount-source.vat;
}
export function scheduleAmount(r:Entry,month:string){const index=(+month.slice(0,4)-+r.startDate.slice(0,4))*12+(+month.slice(5,7)-+r.startDate.slice(5,7));if(index<0||index>=r.months)return 0;const base=r.cost-r.residual;return Math.floor(base*(index+1)/r.months)-Math.floor(base*index/r.months);}
export function scheduleJournal(t:Entry,all:Entry[]):Entry {
 const r=all.find(e=>e.kind==='register'&&e.id===t.registerId);if(!r||!/^\d{4}-\d{2}$/.test(t.month)||!validDate(t.month+'-01'))throw Error('Choose a register entry and reporting month.');
 if(!activeTransactions(all).some(e=>e.id===r.sourceId))throw Error('The source purchase was reversed.');
 const amount=scheduleAmount(r,t.month);if(!amount||t.approved!==true)throw Error('Review a valid monthly depreciation/amortization amount.');
 const last=new Date(+t.month.slice(0,4),+t.month.slice(5,7),0).getDate(),date=t.month+'-'+last;if(date>today())throw Error('Post the schedule after the month ends.');
 uniqueKey(t,all,`schedule:${r.id}:${t.month}`);
 return {...t,kind:'transaction',type:'Journal',subtype:'schedule',date,description:`${r.registerType==='Asset'?'Depreciation':'Amortization'} · ${r.name} · ${t.month}`,lines:[{account:r.expenseAccount,debit:amount,credit:0},{account:r.registerType==='Asset'?'1590':'1400',debit:0,credit:amount}]};
}
export function validateFiling(t:Entry,all:Entry[],s:Settings){if(!s.registrationConfirmed||!s.taxTypes?.includes(t.form))throw Error('Confirm your registration and enable this tax form first.');if(!/^\d{4}-(Q[1-4]|0[1-9]|1[0-2]|Annual)$/.test(t.period)||!validDate(t.dueDate)||!['Pending','Filed','Paid'].includes(t.status)||!integer(t.amount)||!String(t.description||'').trim())throw Error('Enter form period, due date, status, amount and notes.');const prev=all.filter(e=>e.kind==='filing'&&e.form===t.form&&e.period===t.period).at(-1);if((prev?.id||undefined)!==(t.parentId||undefined))throw Error('Filing changed. Refresh and retry.');if(t.status!=='Pending'&&(!validDate(t.filedDate)||t.filedDate>today()||!t.confirmation))throw Error('Record the filing date and confirmation/reference.');if(t.status==='Paid'&&(!validDate(t.paidDate)||t.paidDate>today()||!t.paymentReference))throw Error('Record the payment date and reference.');}
export function financialReset(ledger:{schema:1;revision:number;entries:Entry[]},backupKey:string,checksum:string,now:string):typeof ledger {
 const keep=ledger.entries.filter(e=>['settings','employee','clock','attendance_day','financial_reset'].includes(e.kind));
 const s=settingsFor(ledger.entries);s.lockDate='';s.taxProfile='Unconfirmed';s.registrationConfirmed=false;
 const excludedPayrollIds=ledger.entries.filter(e=>(e.kind==='clock'&&e.action==='out')||(e.kind==='attendance_day'&&e.status==='Paid leave')).map(e=>e.id);
 const meta={actor:'controlled-migration',createdAt:now};
 return {schema:1,revision:ledger.revision+1,entries:[...keep,{...meta,id:crypto.randomUUID(),kind:'settings',settings:s},{...meta,id:crypto.randomUUID(),kind:'financial_reset',description:'Fresh accounting start requested by owner; capital, transactions and reconciliations archived privately.',backupKey,checksum,excludedPayrollIds,clearedCount:ledger.entries.length-keep.length,blockCapitalImport:true}]};
}
export function enforceFinancialRules(t:Entry,all:Entry[],s:Settings){
 if(activeTransactions(all).some(e=>e.subtype==='profit_allocation'&&t.date>=e.from&&t.date<=e.to))throw Error('Reverse the existing profit allocation before changing its underlying period.');
 if(t.type==='Sale'||t.type==='Apply deposit')checkInvoiceOverlap(t,all);
 if(['Partner loan repayment','Profit distribution'].includes(t.type)){const a=t.type==='Partner loan repayment'?'2410':'3010';const lines=all.filter(e=>e.kind==='transaction'&&e.date<=t.date).flatMap(e=>posting(e,all)).filter(l=>l.partner===t.partner);const available=lines.filter(l=>l.account===a).reduce((n,l)=>n+l.credit-l.debit,0)-(t.type==='Profit distribution'?lines.filter(l=>l.account==='3120').reduce((n,l)=>n+l.debit-l.credit,0):0);if(t.amount>available)throw Error('Amount exceeds this partner’s recorded loan or allocated undistributed profit.');}
 if(t.type==='Reversal'){if(all.some(e=>e.kind==='register'&&e.sourceId===t.linkId&&activeTransactions(all).some(j=>j.registerId===e.id)))throw Error('Reverse linked depreciation/amortization journals first.');const ref=all.find(e=>e.id===t.linkId);if(ref?.subtype==='profit_allocation'&&activeTransactions(all).some(e=>e.type==='Profit distribution'&&e.date>=ref.date))throw Error('Reverse subsequent profit distributions first.');}
 if(t.dueDate&&(!validDate(t.dueDate)||t.dueDate<t.date))throw Error('Due date must be valid and on or after the transaction date.');
 if(t.subtype==='opening_balance'){if(t.type!=='Journal'||t.lines?.some((l:Line)=>+l.account>=4000))throw Error('Opening balances must use balance sheet accounts.');if(activeTransactions(all).some(e=>e.subtype==='opening_balance'))throw Error('Opening balances already posted. Reverse them before replacement.');uniqueKey(t,all,'opening-balance');}
}
