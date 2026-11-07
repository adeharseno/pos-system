import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireManualReceivingSubmission,
  beginManualReceivingAttempt,
  ManualReceivingPayloadConflict,
  releaseManualReceivingSubmission,
  type ManualReceivingPayload,
} from "./manual-receiving-attempt";

const payload: ManualReceivingPayload = {
  product_id: "product-1",
  batches: [{ batch_number: "B-1", expired_date: "2030-01-01", quantity: 7, cost_price: 500 }],
};

test("payload supports an explicitly unknown expiry", () => {
  const withoutExpiry: ManualReceivingPayload = { ...payload, batches: [{ ...payload.batches[0], expired_date: null }] };
  const attempt = beginManualReceivingAttempt(null, withoutExpiry, () => "request-null");
  assert.equal(attempt.payload.batches[0].expired_date, null);
});

test("retry uses the same request ID and exact payload", () => {
  let generated = 0;
  const createId = () => `request-${++generated}`;
  const first = beginManualReceivingAttempt(null, payload, createId);
  const retry = beginManualReceivingAttempt(first, { ...payload, batches: payload.batches.map((batch) => ({ ...batch })) }, createId);
  assert.equal(retry, first);
  assert.equal(retry.requestId, "request-1");
  assert.equal(generated, 1);
});

test("same request ID rejects a changed payload", () => {
  const first = beginManualReceivingAttempt(null, payload, () => "request-1");
  assert.throws(
    () => beginManualReceivingAttempt(first, { ...payload, batches: [{ ...payload.batches[0], quantity: 8 }] }, () => "request-2"),
    ManualReceivingPayloadConflict,
  );
});

test("a confirmed next receipt receives a new request ID", () => {
  let generated = 0;
  const createId = () => `request-${++generated}`;
  const first = beginManualReceivingAttempt(null, payload, createId);
  const next = beginManualReceivingAttempt(null, payload, createId);
  assert.notEqual(next.requestId, first.requestId);
  assert.equal(next.requestId, "request-2");
});

test("submission lock rejects double-submit until the active request finishes", () => {
  const lock = { current: false };
  assert.equal(acquireManualReceivingSubmission(lock), true);
  assert.equal(acquireManualReceivingSubmission(lock), false);
  releaseManualReceivingSubmission(lock);
  assert.equal(acquireManualReceivingSubmission(lock), true);
});
