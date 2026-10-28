export function sameOrigin(req:Request){
 try{
  const origin=new URL(req.headers.get('origin')||'');
  const host=(req.headers.get('x-forwarded-host')||req.headers.get('host')||new URL(req.url).host).split(',')[0].trim();
  return origin.host===host&&['http:','https:'].includes(origin.protocol)&&(process.env.VERCEL!=='1'||origin.protocol==='https:');
 }catch{return false;}
}
