import {test} from 'node:test';
import assert from 'node:assert/strict';
import {posting,trialBalance,outstanding,validateTransaction,defaults,centavos,current} from '../lib/business.ts';
const settings={...defaults,taxProfile:'VAT',partners:['Jeremy']};
const tx=(type,amount,extra={})=>({id:crypto.randomUUID(),kind:'transaction',type,amount,date:'2026-01-15',description:type,cashAccount:'1000',category:'4000',payment:'Paid',vat:0,withholding:0,...extra});
test('sale, collection and withheld tax balance without duplicating earned revenue',()=>{
 const sale=tx('Sale',112000,{payment:'On account',vat:12000});const collection=tx('Collection',112000,{linkId:sale.id,withholding:2000});const all=[sale,collection];
 validateTransaction(collection,[sale],settings);const tb=trialBalance(all);assert.equal(tb['4000'].balance,-100000);assert.equal(tb['1000'].balance,110000);assert.equal(tb['1150'].balance,2000);assert.equal(tb['1100'].balance,0);assert.equal(outstanding(sale,all),0);assert.equal(Object.values(tb).reduce((s,b)=>s+b.balance,0),0);
});
test('deposits stay liabilities until used, and withdrawals are not expenses',()=>{
 const deposit=tx('Customer deposit',100000);const apply=tx('Apply deposit',60000,{linkId:deposit.id});const refund=tx('Deposit refund',40000,{linkId:deposit.id});const drawing=tx('Partner withdrawal',10000,{partner:'Jeremy'});const tb=trialBalance([deposit,apply,refund,drawing]);
 assert.equal(tb['2100'].balance,0);assert.equal(tb['4000'].balance,-60000);assert.equal(tb['3100'].balance,10000);assert.equal(outstanding(deposit,[deposit,apply,refund]),0);assert.ok(!Object.keys(tb).some(a=>+a>=5000));
});
test('purchase withholding and payable settlements preserve gross purchase',()=>{
 const expense=tx('Expense',112000,{payment:'On account',category:'6000',vat:12000,withholding:5000});const payment=tx('Supplier payment',107000,{linkId:expense.id});validateTransaction(payment,[expense],settings);const tb=trialBalance([expense,payment]);assert.equal(tb['6000'].balance,100000);assert.equal(tb['1300'].balance,12000);assert.equal(tb['2300'].balance,-5000);assert.equal(tb['2000'].balance,0);assert.equal(outstanding(expense,[expense,payment]),0);
});
test('cross-month reversals resolve original posting and preserve correction trail',()=>{
 const sale=tx('Sale',50000);const rev=tx('Reversal',0,{date:'2026-02-01',linkId:sale.id});const feb=trialBalance([rev],[sale,rev]);assert.equal(feb['4000'].balance,50000);assert.equal(trialBalance([sale,rev])['4000'].balance,0);assert.equal(outstanding(sale,[sale,rev]),0);
});
test('reject overpayments, unconfirmed VAT, locked periods and invalid journals',()=>{
 const sale=tx('Sale',10000,{payment:'On account'});assert.throws(()=>validateTransaction(tx('Collection',11000,{linkId:sale.id}),[sale],settings),/sufficient/);
 assert.throws(()=>validateTransaction(tx('Sale',11200,{vat:1200}),[],defaults),/VAT registration/);
 assert.throws(()=>validateTransaction(sale,[],{...settings,lockDate:'2026-01-31'}),/locked/);
 assert.throws(()=>validateTransaction(tx('Journal',0,{lines:[{account:'1000',debit:100,credit:0},{account:'3200',debit:0,credit:99}]}),[],settings),/balance/);
});
test('do not reverse a sale with unreversed linked settlements',()=>{
 const sale=tx('Sale',10000,{payment:'On account'}),payment=tx('Collection',5000,{linkId:sale.id});assert.throws(()=>validateTransaction(tx('Reversal',0,{linkId:sale.id}),[sale,payment],settings),/linked payments/);
});
test('assets and inventory stay on balance sheet, transfers do not earn revenue',()=>{
 const tb=trialBalance([tx('Asset purchase',200000),tx('Inventory purchase',50000),tx('Transfer',30000,{destination:'1020'})]);assert.equal(tb['1500'].balance,200000);assert.equal(tb['1200'].balance,50000);assert.equal(tb['1020'].balance,30000);assert.ok(!Object.keys(tb).some(a=>+a>=4000));
});
test('integer centavos reject ambiguous precision; amendments retain only latest active state',()=>{
 assert.equal(centavos('123.45'),12345);assert.throws(()=>centavos('1.001'));assert.throws(()=>centavos('bad'));
 const a={id:'a',kind:'booking'},b={id:'b',kind:'booking',parentId:'a'},c={id:'c',kind:'booking',parentId:'b'};assert.deepEqual(current([a,b,c],'booking'),[c]);
});
