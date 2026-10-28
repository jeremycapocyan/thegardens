import {centavos,validDate,type Entry} from './business';
export type SourceSheet={name:string;rows:{row:number;cells:Record<string,any>;formulas:Record<string,any>}[]};
export function normalizeCapital(sheets:SourceSheet[]){
 if(sheets.length!==2||!sheets.some(s=>s.name==='Expenses')||!sheets.some(s=>s.name==='Partner Summary'))throw Error('Use only Expenses and Partner Summary.');
 const expenses=sheets.find(s=>s.name==='Expenses')!,summary=sheets.find(s=>s.name==='Partner Summary')!;
 const costs=expenses.rows.filter(r=>r.row>1&&typeof r.cells['B'+r.row]==='number').map(r=>{
  const c=r.cells,n=r.row;const serial=c['A'+n];const date=typeof serial==='number'?new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10):null;
  if(date&&!validDate(date))throw Error('Invalid source date.');const amount=centavos(c['B'+n]);if(amount<=0)throw Error('Capital costs must be positive.');
  return {row:n,date,amount,description:String(c['C'+n]||''),mode:String(c['D'+n]||''),payor:String(c['E'+n]||''),raw:c,formulas:r.formulas};
 });
 const partners=summary.rows.filter(r=>r.row>1&&r.cells['A'+r.row]&&r.cells['A'+r.row]!=='TOTAL').map(r=>({name:String(r.cells['A'+r.row]),paid:centavos(r.cells['B'+r.row]),share:centavos(r.cells['C'+r.row]),remaining:centavos(r.cells['D'+r.row])}));
 if(!costs.length||!partners.length||new Set(partners.map(p=>p.name)).size!==partners.length)throw Error('Missing or duplicated partner records.');
 const total=costs.reduce((s,c)=>s+c.amount,0);for(const p of partners){if(costs.filter(c=>c.payor===p.name).reduce((s,c)=>s+c.amount,0)!==p.paid)throw Error(`Source partner total does not match: ${p.name}`);if(p.share-p.paid!==p.remaining)throw Error(`Source remaining investment does not match: ${p.name}`);}
 if(partners.reduce((s,p)=>s+p.paid,0)!==total)throw Error('Source expenses include an unmapped payor.');
 const totalRow=summary.rows.find(r=>r.cells['A'+r.row]==='TOTAL');if(totalRow&&centavos(totalRow.cells['B'+totalRow.row])!==total)throw Error('Source total does not reconcile.');
 return {costs,partners,total,undated:costs.filter(c=>!c.date).length};
}
export function capitalOpening(capital:ReturnType<typeof normalizeCapital>,date:string):Partial<Entry>{return {kind:'transaction',type:'Journal',date,description:'Opening partner-funded capital costs from Expenses and Partner Summary — pending allocation',amount:capital.total,importedOpening:true,lines:[{account:'1490',debit:capital.total,credit:0},...capital.partners.map(p=>({account:'3000',debit:0,credit:p.paid,partner:p.name}))]};}
