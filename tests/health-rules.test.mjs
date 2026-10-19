import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateOperationalHealth,REQUIRED_HEALTH_TASKS} from '../src/tbsHealthRules.js';

const rows=status=>REQUIRED_HEALTH_TASKS.map(task_key=>({task_key,status}));

test('Incomplete or absent checklist never produces a numeric score',()=>{
 assert.equal(calculateOperationalHealth({hasClose:false,tasks:rows('DONE'),openRequests:0,openReviews:0}).score,null);
 for(let i=0;i<REQUIRED_HEALTH_TASKS.length;i++){
   const incomplete=rows('DONE').filter((_,j)=>i!==j);
   const result=calculateOperationalHealth({hasClose:true,tasks:incomplete,openRequests:0,openReviews:0});
   assert.equal(result.score,null);
   assert.equal(result.sufficient,false);
 }
});
test('Nine completed tasks with no follow-ups yield exactly 100/100',()=>{
 const result=calculateOperationalHealth({hasClose:true,tasks:rows('DONE'),openRequests:0,openReviews:0});
 assert.equal(result.score,100);
 assert.equal(result.breakdown.reduce((n,r)=>n+r.max,0),100);
});
test('Nine present but pending tasks receive follow-up points only (35/100)',()=>{
 const result=calculateOperationalHealth({hasClose:true,tasks:rows('PENDING'),openRequests:0,openReviews:0});
 assert.equal(result.score,35);
 assert.equal(result.sufficient,true);
});
test('Reconciliation and categorization each contribute once',()=>{
 const list=rows('DONE');
 list.find(x=>x.task_key==='reconciliation').status='PENDING';
 list.find(x=>x.task_key==='uncategorized').status='PENDING';
 const result=calculateOperationalHealth({hasClose:true,tasks:list,openRequests:0,openReviews:0});
 assert.equal(result.score,65);
 assert.equal(result.breakdown[1].points,0);
 assert.equal(result.breakdown[2].points,0);
});
test('Open requests and reviews are penalized, each component floors at zero',()=>{
 const r=calculateOperationalHealth({hasClose:true,tasks:rows('DONE'),openRequests:2,openReviews:3});
 assert.equal(r.score,75);
 assert.equal(r.breakdown[3].points,5);
 assert.equal(r.breakdown[4].points,5);
 const many=calculateOperationalHealth({hasClose:true,tasks:rows('DONE'),openRequests:5000,openReviews:5000});
 assert.equal(many.score,65);
});
test('Invalid follow-up counts never silently produce misleading scores',()=>{
 for(const val of [undefined,null,-1,0.2,Infinity,NaN]){
  assert.throws(()=>calculateOperationalHealth({hasClose:true,tasks:rows('DONE'),openRequests:val,openReviews:0}));
  assert.throws(()=>calculateOperationalHealth({hasClose:true,tasks:rows('DONE'),openRequests:0,openReviews:val}));
 }
});
