import {getUser,sameOrigin} from '../../../lib/auth';import {readLedger,appendRecords,StorageConflict} from '../../../lib/storage';
import {defaults,today,validateTransaction,type Entry} from '../../../lib/business';import {normalizeCapital,capitalOpening} from '../../../lib/capital';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 const user=await getUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});if(!sameOrigin(req))return Response.json({error:'Invalid origin.'},{status:403});
 const body=await req.text();if(body.length>300000)throw Error('Import is too large.');const input=JSON.parse(body);if(!/^[a-f0-9]{64}$/.test(input.sourceHash)||!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(input.sourceUrl))throw Error('Invalid source.');
 const snapshot=await readLedger(),all=snapshot.entries,previous=all.find(e=>e.kind==='capital_import');if(previous){if(previous.sourceHash===input.sourceHash)return Response.json({alreadyImported:true,total:previous.capital.total,count:previous.capital.costs.length});throw Error('Capital history is already imported.');}
 const capital=normalizeCapital(input.sheets),now=new Date().toISOString(),actor=user.email;const settings={...defaults,...all.filter(e=>e.kind==='settings').at(-1)?.settings};settings.partners=Array.from(new Set([...settings.partners,...capital.partners.map(p=>p.name)]));
 const record:Entry={id:crypto.randomUUID(),kind:'capital_import',capital,sheets:input.sheets,sourceHash:input.sourceHash,sourceUrl:input.sourceUrl,filename:input.filename,asOf:today(),createdAt:now,actor,sourceKey:'capital:'+input.sourceHash};
 const opening={...capitalOpening(capital,today()),id:crypto.randomUUID(),kind:'transaction',createdAt:now,actor,importId:record.id,sourceKey:'capital-opening:'+input.sourceHash} as Entry;validateTransaction(opening,all,settings);record.openingId=opening.id;
 const setup={id:crypto.randomUUID(),kind:'settings',settings,createdAt:now,actor};await appendRecords([record,opening,setup],snapshot);return Response.json({imported:true,total:capital.total,count:capital.costs.length});
 }catch(e){return Response.json({error:(e as Error).message},{status:e instanceof StorageConflict?409:400});}}
