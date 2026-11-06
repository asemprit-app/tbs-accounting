import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleSupplierInvoices,consolidateSupplierInvoices} from '../src/tbsConsolidatedSupplierCheck.js';
const invoice=(id,number,netPay,extra={})=>({id,employeeName:'Vendor LLC',resourceType:'service_provider',status:'FINAL',invoiceNumber:number,netPay,...extra});
test('one check for several invoices sums exact cents and preserves invoice advice',()=>{
 const c=consolidateSupplierInvoices([invoice('1','A-12',10.10),invoice('2','B-13',20.20)],'Vendor LLC');
 assert.equal(c.amount,30.30);assert.equal(c.invoices.length,2);
 assert.equal(c.voucherDetail.rows[1].label,'Invoice B-13');
 assert.equal(c.voucherDetail.rows.reduce((n,v)=>n+Math.round(v.amount*100),0),3030);
});
test('rejects mixed suppliers, duplicate invoice numbers and duplicate IDs',()=>{
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',10),invoice('2','Y',12,{employeeName:'Another'})],'Vendor LLC'),/same supplier/);
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',10),invoice('2','x',12)],'Vendor LLC'),/more than once/);
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',10),invoice('1','Y',12)],'Vendor LLC'),/more than once/);
});
test('requires final, positive, recorded supplier invoices and at least two',()=>{
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',10)],'Vendor LLC'),/at least two/);
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',0),invoice('2','Y',2)],'Vendor LLC'),/positive/);
 assert.throws(()=>consolidateSupplierInvoices([invoice('1','X',1,{status:'DRAFT'}),invoice('2','Y',2)],'Vendor LLC'),/FINAL/);
 assert.equal(eligibleSupplierInvoices([invoice('1','X',1),invoice('2','Y',2,{paidCheckId:'ch-1'}),invoice('3','Z',3,{resourceType:'employee'})]).length,1);
});
