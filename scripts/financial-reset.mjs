// Authorized one-time production migration. Run with an ignored, securely pulled
// production env file. The original ledger is archived and verified before CAS.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readLedger,readJson,writeJson} from '../lib/storage.ts';
import {financialReset} from '../lib/accounting.ts';
import {trialBalance} from '../lib/business.ts';
const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot=await readLedger();
if(snapshot.entries.some(e=>e.kind==='financial_reset')){console.log(JSON.stringify({alreadyReset:true,revision:snapshot.value.revision}));process.exit(0);}
const adminBefore=await readJson('security/admin.json');
const key='archives/fresh-start-'+randomUUID()+'.json';
const hash=checksum(snapshot.value),now=new Date().toISOString();
const documentKeys=[...new Set(JSON.stringify(snapshot.value).match(/\/api\/files\?key=[a-f0-9-]{36}/g)||[])];
const backup={schema:1,purpose:'Owner-authorized fresh financial start',createdAt:now,checksum:hash,ledger:snapshot.value,documentReferences:documentKeys,documentsRetainedPrivately:true};
await writeJson(key,backup,null);
const saved=await readJson(key);assert.equal(checksum(saved.value.ledger),hash,'Recovery backup checksum mismatch; reset aborted');
if(!process.argv.includes('--apply')){console.log(JSON.stringify({backupVerified:true,backupKey:key,checksum:hash,financialRecords:snapshot.entries.filter(e=>['transaction','capital_import','close'].includes(e.kind)).length,applied:false}));process.exit(0);}
const next=financialReset(snapshot.value,key,hash,now);
assert.deepEqual(trialBalance(next.entries),{});
const preservedKinds=['employee','clock','attendance_day'];
for(const kind of preservedKinds)assert.deepEqual(next.entries.filter(e=>e.kind===kind),snapshot.entries.filter(e=>e.kind===kind));
await writeJson('records.json',next,snapshot.etag); // rejects any concurrent change
const after=await readLedger();assert.equal(checksum(after.value),checksum(next));
assert.equal(checksum((await readJson('security/admin.json')).value),checksum(adminBefore.value));
console.log(JSON.stringify({resetComplete:true,backupVerified:true,backupKey:key,checksum:hash,zeroFinancialBalances:true,administratorPreserved:true,attendancePreserved:true,revision:next.revision}));
