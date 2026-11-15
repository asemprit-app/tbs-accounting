import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExecutiveClientRecipient} from '../src/tbsExecutiveClientRecipient.js';

const client='linked-one';
test('prefills the email from the linked TBS customer profile',()=>{
 assert.deepEqual(resolveExecutiveClientRecipient([
  {linked_client_id:'other',email:'other@example.com'},
  {linked_client_id:client,email:' Customer@Example.com '}
 ],client),{email:'customer@example.com',status:'found'});
});
test('duplicate customer profiles sharing the same email are safe to prefill',()=>{
 assert.deepEqual(resolveExecutiveClientRecipient([
  {linked_client_id:client,email:'customer@example.com'},
  {linked_client_id:client,email:'CUSTOMER@example.com'}
 ],client),{email:'customer@example.com',status:'found'});
});
test('missing and invalid addresses are never silently used',()=>{
 assert.deepEqual(resolveExecutiveClientRecipient([],client),{email:'',status:'missing'});
 assert.deepEqual(resolveExecutiveClientRecipient([{linked_client_id:client,email:''}],client),{email:'',status:'missing'});
 assert.deepEqual(resolveExecutiveClientRecipient([{linked_client_id:client,email:'not-an-email'}],client),{email:'',status:'invalid'});
});
test('conflicting linked customer profile emails require manual review',()=>{
 assert.deepEqual(resolveExecutiveClientRecipient([
  {linked_client_id:client,email:'person1@example.com'},
  {linked_client_id:client,email:'person2@example.com'}
 ],client),{email:'',status:'ambiguous'});
});
