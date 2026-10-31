import assert from 'node:assert/strict';
import test from 'node:test';
import { ApprovalFlights } from '../src/approvalFlight.ts';
test('one approval stays in flight across view changes and unrelated requests can proceed',()=>{
 const flights=new ApprovalFlights();const first=flights.claim('original-owner-request')!;
 assert.equal(flights.claim('original-owner-request'),null);assert.ok(flights.claim('other-request'));
 assert.equal(flights.release('original-owner-request',Symbol('stale')),false);assert.equal(flights.claim('original-owner-request'),null);
 assert.equal(flights.release('original-owner-request',first),true);assert.ok(flights.claim('original-owner-request'));
});
