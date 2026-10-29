export type Entry = { id: string; kind: string; createdAt: string; actor: string; sourceKey?: string; [key: string]: any };
export type Settings = { businessName: string; courts: string[]; partners: string[]; taxProfile: string; tin: string; address: string; rdo: string; books: string; invoiceAuthority: string; lockDate: string; open: string; close: string; registeredName?:string; fiscalStartMonth?:number; taxTypes?:string[]; registrationConfirmed?:boolean; percentageRate?:number };
export const defaults: Settings = {businessName:"The Gardens Pickleball Courts",courts:[],partners:[],taxProfile:"Unconfirmed",tin:"",address:"",rdo:"",books:"Unconfirmed",invoiceAuthority:"",lockDate:"",open:"06:00",close:"22:00"};
export const accounts: Record<string,string> = {
 "1000":"Cash", "1010":"GCash", "1020":"Bank", "1100":"Accounts receivable", "1150":"Creditable withholding tax", "1200":"Inventory", "1300":"Input VAT — subject to review", "1490":"Historical capital costs — pending allocation", "1500":"Court improvements & equipment", "1590":"Accumulated depreciation", "2000":"Accounts payable", "2100":"Customer deposits", "2200":"Output VAT", "2300":"Withholding tax payable", "2400":"Loans payable", "2500":"Wages payable", "3000":"Partner capital", "3100":"Partner drawings", "3200":"Opening equity / retained earnings", "4000":"Court rental", "4010":"Open play", "4020":"Coaching & events", "4030":"Equipment rental", "4040":"Retail sales", "4090":"Other operating income", "5000":"Cost of goods sold", "6000":"Rent", "6010":"Utilities", "6020":"Salaries & wages", "6030":"Repairs & maintenance", "6040":"Supplies & cleaning", "6050":"Marketing", "6060":"Permits & professional fees", "6070":"Payment processing fees", "6080":"Insurance", "6090":"Other operating expense", "6100":"Depreciation", "6200":"Interest expense", "6300":"Taxes & licenses"
};
Object.assign(accounts,{'1400':'Prepaid expenses','2410':'Partner loans payable','3010':'Allocated partner profits / losses','3120':'Partner profit distributions','6110':'Prepayment amortization','6400':'Income tax expense'});
export const partnerAccounts=['2410','3000','3010','3100','3120'];
export const cashAccounts = ["1000","1010","1020"];
export const saleAccounts = ["4000","4010","4020","4030","4040","4090"];
export const expenseAccounts = Object.keys(accounts).filter(a=>+a>=5000);
export const types = ["Sale","Expense","Collection","Supplier payment","Customer deposit","Apply deposit","Deposit refund","Partner contribution","Partner withdrawal","Partner loan received","Partner loan repayment","Profit distribution","Asset purchase","Prepayment","Inventory purchase","Loan received","Loan repayment","Transfer","Payroll payment","Journal"];
export type Line = {account:string; debit:number; credit:number; partner?:string};
export function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export function peso(cents:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format((cents||0)/100);}
export function centavos(v:any){const n=Number(v); if(!Number.isFinite(n)||Math.abs(n)>1e10||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error("Use a valid amount with at most two decimal places."); return Math.round(n*100);}
export function posting(t:Entry, all:Entry[]=[]):Line[]{
 if(t.type==="Reversal"){const original=all.find(x=>x.id===t.linkId);if(!original||original.type==="Reversal")return [];return posting(original,all).map(l=>({...l,debit:l.credit,credit:l.debit}));}
 if(t.type==="Journal"||t.type==='Daily sales')return t.lines||[];
 const a=t.amount||0,v=t.vat||0,w=t.withholding||0,c=t.cashAccount||"1000",cat=t.category,p=t.partner;
 const lines:Line[]=[];const dr=(account:string,debit:number)=>{if(debit)lines.push({account,debit,credit:0,...(p?{partner:p}:{})});};const cr=(account:string,credit:number)=>{if(credit)lines.push({account,debit:0,credit,...(p?{partner:p}:{})});};
 switch(t.type){
 case "Sale":dr(t.payment==="On account"?"1100":c,a-w);dr("1150",w);cr(cat,a-v);cr("2200",v);break;
 case "Expense":case "Asset purchase":case "Prepayment":case "Inventory purchase":dr(t.type==="Asset purchase"?"1500":t.type==='Prepayment'?'1400':t.type==="Inventory purchase"?"1200":cat,a-v);dr("1300",v);cr(t.payment==="On account"?"2000":c,a-w);cr("2300",w);break;
 case "Collection":dr(c,a-w);dr("1150",w);cr("1100",a);break;
 case "Supplier payment":dr("2000",a);cr(c,a);break;
 case "Customer deposit":dr(c,a);cr("2100",a);break;
 case "Apply deposit":dr("2100",a);cr(cat,a-v);cr("2200",v);break;
 case "Deposit refund":dr("2100",a);cr(c,a);break;
 case "Partner contribution":dr(c,a);cr("3000",a);break;
 case "Partner withdrawal":dr("3100",a);cr(c,a);break;
 case 'Partner loan received':dr(c,a);cr('2410',a);break;
 case 'Partner loan repayment':dr('2410',a);cr(c,a);break;
 case 'Profit distribution':dr('3120',a);cr(c,a-w);cr('2300',w);break;
 case "Loan received":dr(c,a);cr("2400",a);break;
 case "Loan repayment":dr("2400",a);cr(c,a);break;
 case "Payroll payment":dr("2500",a);cr(c,a);break;
 case "Transfer":dr(t.destination,a);cr(c,a);break;
 }return lines;
}
export function trialBalance(entries:Entry[], context:Entry[]=entries){const out:Record<string,{debit:number;credit:number;balance:number}>={};for(const e of entries.filter(e=>e.kind==="transaction"))for(const l of posting(e,context)){out[l.account]??={debit:0,credit:0,balance:0};out[l.account].debit+=l.debit;out[l.account].credit+=l.credit;out[l.account].balance+=l.debit-l.credit;}return out;}
export function current(entries:Entry[],kind:string){const rows=entries.filter(e=>e.kind===kind);const amended=new Set(rows.map(e=>e.parentId).filter(Boolean));return rows.filter(e=>!amended.has(e.id));}
export function isReversed(t:Entry,all:Entry[]){return all.some(x=>x.type==="Reversal"&&x.linkId===t.id);}
export function outstanding(t:Entry,all:Entry[]){if(isReversed(t,all))return 0;const account=['Sale','Daily sales'].includes(t.type)?"1100":t.type==="Customer deposit"?"2100":"2000";const original=posting(t,all).filter(l=>l.account===account).reduce((s,l)=>s+Math.abs(l.debit-l.credit),0);const used=all.filter(e=>e.kind==="transaction"&&e.linkId===t.id&&e.type!=="Reversal"&&!isReversed(e,all)).reduce((s,e)=>s+(e.amount||0),0);return original-used;}
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function validateTransaction(t:Entry,all:Entry[],s:Settings){
 if(!validDate(t.date)||t.date>today())throw Error("Enter a valid transaction date, no later than today.");
 if(s.lockDate&&t.date<=s.lockDate)throw Error("This accounting period is locked.");
 if(!String(t.description||"").trim())throw Error("Add a description.");
 if(t.type==="Reversal"){
  const original=all.find(e=>e.id===t.linkId&&e.kind==="transaction");
  if(!original||original.type==="Reversal"||isReversed(original,all))throw Error("This entry cannot be reversed.");
  if(t.date<original.date)throw Error("Reversal date cannot precede the original entry.");
  if(all.some(e=>e.linkId===original.id&&e.type!=="Reversal"&&!isReversed(e,all)))throw Error("Reverse the linked payments or deposit applications first.");
  return;
 }
 if(!types.includes(t.type)&&t.type!=='Daily sales')throw Error("Invalid transaction type.");
 if(t.type==="Journal"||t.type==='Daily sales'){
  if(!Array.isArray(t.lines)||t.lines.length<2||t.lines.length>100)throw Error("Journal needs 2–100 lines.");
  let d=0,c=0;for(const l of t.lines){if(!accounts[l.account]||!Number.isSafeInteger(l.debit)||!Number.isSafeInteger(l.credit)||l.debit<0||l.credit<0||(l.debit>0)===(l.credit>0))throw Error("Each journal line needs a valid account and either a debit or credit.");if(partnerAccounts.includes(l.account)&&!s.partners.includes(l.partner))throw Error("Partner journal lines need a configured partner.");d+=l.debit;c+=l.credit;}if(d!==c)throw Error("Journal debits and credits must balance.");return;
 }
 if(!Number.isSafeInteger(t.amount)||t.amount<=0||t.amount>1e12)throw Error("Enter a positive amount.");
 if(!cashAccounts.includes(t.cashAccount))throw Error("Choose a money account.");
 for(const v of [t.vat,t.withholding])if(!Number.isSafeInteger(v)||v<0||v>t.amount)throw Error("Tax amounts must be between zero and the gross amount.");
 if(t.vat&&s.taxProfile!=="VAT")throw Error("Confirm VAT registration in Setup before recording VAT.");
 if(t.vat+t.withholding>t.amount)throw Error("Tax components exceed the gross amount.");
 if(!["Sale","Apply deposit","Expense","Asset purchase","Prepayment","Inventory purchase"].includes(t.type)&&t.vat)throw Error("VAT is recorded on the underlying sale or purchase.");
 if(!["Sale","Expense","Asset purchase","Prepayment","Inventory purchase","Collection","Profit distribution"].includes(t.type)&&t.withholding)throw Error("Withholding is not available for this entry type.");
 if(["Sale","Apply deposit"].includes(t.type)&&!saleAccounts.includes(t.category))throw Error("Choose a sales category.");
 if(t.type==="Expense"&&!expenseAccounts.includes(t.category))throw Error("Choose an expense category.");
 if(["Sale","Expense","Asset purchase","Prepayment","Inventory purchase"].includes(t.type)&&!["Paid","On account"].includes(t.payment))throw Error("Choose paid or on account.");
 if((t.type.startsWith("Partner")||t.type==='Profit distribution')&&!s.partners.includes(t.partner))throw Error("Add and select the partner in Setup.");
 if(t.type==="Transfer"&&(!cashAccounts.includes(t.destination)||t.destination===t.cashAccount))throw Error("Choose a different destination account.");
 if(["Sale","Apply deposit"].includes(t.type)&&t.invoice&&all.some(e=>["Sale","Apply deposit"].includes(e.type)&&e.invoice===t.invoice&&!isReversed(e,all)))throw Error("Invoice reference already exists.");
 const links:Record<string,string[]>={Collection:["Sale","Daily sales"],"Supplier payment":["Expense","Asset purchase","Prepayment","Inventory purchase"],"Apply deposit":["Customer deposit"],"Deposit refund":["Customer deposit"]};
 if(links[t.type]){const ref=all.find(e=>e.id===t.linkId&&links[t.type].includes(e.type));if(!ref||isReversed(ref,all)||outstanding(ref,all)<t.amount)throw Error("Choose a matching open item with sufficient remaining balance.");if(t.date<ref.date)throw Error("Settlement date cannot precede the original entry.");}
 const lines=posting(t,all);if(lines.reduce((n,l)=>n+l.debit-l.credit,0)!==0)throw Error("Entry does not balance.");
}
