import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {defaults,today,validateTransaction,type Entry} from '../../../lib/business';
import {normalizeCapital,capitalOpening} from '../../../lib/capital';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 const config=env as any;const user=await getChatGPTUser();const secret=config.CAPITAL_IMPORT_TOKEN;const service=secret&&Date.now()<Number(config.CAPITAL_IMPORT_EXPIRES)&&req.headers.get('x-capital-import-key')===secret;
 if(!user&&!service)return Response.json({error:'Sign in required.'},{status:401});
 if(user&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin.'},{status:403});
 if(!env.DB)throw Error('Database unavailable.');const text=await req.text();if(text.length>300000)throw Error('Import is too large.');const input=JSON.parse(text);
 if(!/^[a-f0-9]{64}$/.test(input.sourceHash)||!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(input.sourceUrl))throw Error('Source fingerprint and Google Sheets URL are required.');
 const result=await env.DB.prepare('SELECT * FROM records ORDER BY created_at,id').all();const all=result.results.map((r:any)=>({...JSON.parse(r.payload),id:r.id,kind:r.kind})) as Entry[];
 const previous=all.find(e=>e.kind==='capital_import');if(previous){if(previous.sourceHash===input.sourceHash)return Response.json({imported:true,alreadyImported:true,id:previous.id,total:previous.capital.total,count:previous.capital.costs.length});throw Error('Capital history is already imported. Review the existing import before making any correction.');}
 const capital=normalizeCapital(input.sheets);const now=new Date().toISOString(),actor=user?.email||'Authorized capital workbook import';const settings={...defaults,...all.filter(e=>e.kind==='settings').at(-1)?.settings};
 if(settings.lockDate&&today()<=settings.lockDate)throw Error('Opening balance date is locked.');settings.partners=Array.from(new Set([...settings.partners,...capital.partners.map(p=>p.name)]));
 const record:any={id:crypto.randomUUID(),kind:'capital_import',capital,sheets:input.sheets,sourceHash:input.sourceHash,sourceUrl:input.sourceUrl,filename:input.filename,description:'Capital source: Expenses and Partner Summary only; reimbursement markings disregarded',asOf:today(),createdAt:now,actor};
 const opening:any={...capitalOpening(capital,today()),id:crypto.randomUUID(),createdAt:now,actor,importId:record.id};validateTransaction(opening,all,settings);record.openingId=opening.id;
 const setup={id:crypto.randomUUID(),kind:'settings',settings,description:'Partner names loaded from capital source',createdAt:now,actor};
 const first=env.DB.prepare('INSERT INTO records(id,kind,payload,created_at,actor,source_key) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM records)=?').bind(record.id,record.kind,JSON.stringify(record),now,actor,'capital:'+input.sourceHash,all.length);
 const linked=(r:any,key:string|null)=>env.DB!.prepare('INSERT INTO records(id,kind,payload,created_at,actor,source_key) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=?)').bind(r.id,r.kind,JSON.stringify(r),now,actor,key,record.id);
 const saved=await env.DB.batch([first,linked(opening,'capital-opening:'+input.sourceHash),linked(setup,null)]);if(!saved[0].meta.changes)return Response.json({error:'Records changed; refresh before retrying.'},{status:409});
 return Response.json({imported:true,id:record.id,openingId:opening.id,total:capital.total,count:capital.costs.length,partners:capital.partners,undated:capital.undated});
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}}
