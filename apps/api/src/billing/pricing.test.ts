import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyFee, breakerState, PLAN_PRICING } from './pricing.js';

test('monthlyFee applies the floor on low spend', () => {
  assert.equal(monthlyFee('free', 100), 29); // max(7, 29) — Grow floor $29
  assert.equal(monthlyFee('pro', 0), 49);   // Scale subscription $49 (floor met by sub)
});

test('monthlyFee = subscription + rate% of spend above the floor', () => {
  assert.equal(monthlyFee('free', 1000), 70);  // 0 + 1000*7%
  assert.equal(monthlyFee('pro', 1000), 109);  // 49 + 1000*6%
});

// Guards QA-1 BUG-2: free must freeze at 30% of fee, pro at 40%.
test('breaker freeze threshold is plan-specific (BUG-2 regression guard)', () => {
  assert.equal(PLAN_PRICING.free.breakerFreezePct, 30);
  assert.equal(PLAN_PRICING.pro.breakerFreezePct, 40);

  // At 30% of fee: free freezes, pro does not (it degrades).
  assert.equal(breakerState('free', 100, 30), 'freeze');
  assert.equal(breakerState('pro', 100, 30), 'degrade');

  // pro only freezes at its own 40% threshold.
  assert.equal(breakerState('pro', 100, 40), 'freeze');
});

test('breaker degrade/ok bands', () => {
  assert.equal(breakerState('free', 100, 20), 'ok'); // < 25
  assert.equal(breakerState('free', 100, 25), 'degrade'); // 25..30
  assert.equal(breakerState('free', 100, 29), 'degrade');
});

test('breaker with no fee: any AI cost freezes', () => {
  assert.equal(breakerState('free', 0, 1), 'freeze');
  assert.equal(breakerState('free', 0, 0), 'ok');
});
