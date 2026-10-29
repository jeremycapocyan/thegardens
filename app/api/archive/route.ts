import {getUser} from '../../../lib/auth';
import {readLedger,readJson} from '../../../lib/storage';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{if(!await getUser())return Response.json({error:'Sign in required.'},{status:401});
 const id=new URL(req.url).searchParams.get('id');const {entries}=await readLedger();const reset=entries.find(e=>e.kind==='financial_reset'&&e.id===id);
 if(!reset||!/^archives\/fresh-start-[a-f0-9-]+\.json$/.test(reset.backupKey))return Response.json({error:'Backup not found.'},{status:404});
 const {value}=await readJson(reset.backupKey);if(!value)return Response.json({error:'Backup unavailable.'},{status:404});
 return Response.json(value,{headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="gardens-financial-recovery.json"'}});
 }catch{return Response.json({error:'Unable to read backup.'},{status:503});}
}
