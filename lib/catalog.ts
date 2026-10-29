import {accounts,current,expenseAccounts,saleAccounts,types,type Entry} from './business';
export const categoryGroups=['Income','Expense','Asset','Prepayment'] as const;
export type CategoryGroup=typeof categoryGroups[number];
export const presetBehaviors=types.filter(t=>t!=='Journal');
export const parentAccounts=(group:string)=>group==='Income'?saleAccounts:group==='Expense'?expenseAccounts:group==='Asset'?['1500']:group==='Prepayment'?['1400']:[];
export function definitions(all:Entry[],kind:'category_definition'|'type_definition',includeArchived=false){return current(all,kind).filter(e=>includeArchived||e.active!==false);}
export function categoryOptions(all:Entry[],group:string){return [...parentAccounts(group).map(account=>({id:account,name:accounts[account],account,group,custom:false})),...definitions(all,'category_definition').filter(e=>e.group===group).map(e=>({id:e.entityId||e.id,name:e.name,account:e.account,group:e.group,custom:true}))];}
export function categoryGroup(type:string){return ['Sale','Apply deposit','Daily sales'].includes(type)?'Income':type==='Expense'?'Expense':type==='Asset purchase'?'Asset':type==='Prepayment'?'Prepayment':'';}
function definition(all:Entry[],kind:'category_definition'|'type_definition',id:string){return definitions(all,kind).find(e=>(e.entityId||e.id)===id);}
export function resolveCategory(all:Entry[],id:string,group:string){const builtin=parentAccounts(group).includes(id);if(builtin)return {id,name:accounts[id],account:id,group};const d=definition(all,'category_definition',id);if(!d||d.group!==group)throw Error('Choose an active category for this transaction.');return {id:d.entityId||d.id,name:d.name,account:d.account,group:d.group};}
export function validateDefinition(t:Entry,all:Entry[]){
 if(!['category_definition','type_definition'].includes(t.kind)||typeof t.name!=='string'||!t.name.trim()||t.name.trim().length>80||typeof t.active!=='boolean')throw Error('Enter a name (up to 80 characters) and active status.');
 t.name=t.name.trim().replace(/\s+/g,' ');const previous=t.parentId?all.find(e=>e.id===t.parentId&&e.kind===t.kind):undefined;
 if(t.parentId&&(!previous||!current(all,t.kind).some(e=>e.id===previous.id)))throw Error('This item changed. Refresh before editing.');
 t.entityId=previous?.entityId||previous?.id||t.id;
 const normalized=t.name.toLocaleLowerCase('en-PH');const duplicates=definitions(all,t.kind as any,true).filter(e=>(e.entityId||e.id)!==t.entityId&&e.name.toLocaleLowerCase('en-PH')===normalized&&(t.kind==='type_definition'||e.group===t.group));
 if(duplicates.length)throw Error('That name already exists. Rename or reactivate the existing item.');
 if(t.kind==='category_definition'){
  if(!categoryGroups.includes(t.group)||!parentAccounts(t.group).includes(t.account))throw Error('Choose a valid category group and parent category.');
  if(parentAccounts(t.group).some(a=>accounts[a].toLocaleLowerCase('en-PH')===normalized))throw Error('A built-in category already uses that name.');
 }else{
  if(!presetBehaviors.includes(t.baseType)||types.some(x=>x.toLocaleLowerCase('en-PH')===normalized))throw Error('Choose an existing behavior and a distinct preset name.');
  if(typeof t.defaultDescription!=='string'||t.defaultDescription.length>250)throw Error('Keep the default description within 250 characters.');
  if(t.defaultCategoryId&&t.active!==false)resolveCategory(all,t.defaultCategoryId,categoryGroup(t.baseType));
 }
}
export function hydrateTransaction(t:Entry,all:Entry[]){
 const out={...t};delete out.categorySnapshot;delete out.customTypeSnapshot;
 if(out.presetId){const p=definition(all,'type_definition',out.presetId);if(!p)throw Error('Choose an active transaction preset.');out.type=p.baseType;out.customTypeSnapshot={id:p.entityId||p.id,name:p.name,baseType:p.baseType};if(!out.description)out.description=p.defaultDescription;if(!out.categoryId&&!out.category&&p.defaultCategoryId)out.categoryId=p.defaultCategoryId;}
 if(out.categoryId){const c=resolveCategory(all,out.categoryId,categoryGroup(out.type));out.category=c.account;out.categorySnapshot=c;}
 return out;
}
