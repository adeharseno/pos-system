export type ManualReceivingPayload = {
  product_id: string;
  batches: Array<{
    batch_number: string;
    expired_date: string | null;
    quantity: number;
    cost_price: number;
    received_date?: string;
  }>;
};

export type ManualReceivingAttempt = {
  requestId: string;
  payload: ManualReceivingPayload;
};

export class ManualReceivingPayloadConflict extends Error {
  constructor() {
    super("Data penerimaan berubah. Coba lagi dengan data yang sama.");
    this.name = "ManualReceivingPayloadConflict";
  }
}

const samePayload = (left: ManualReceivingPayload, right: ManualReceivingPayload) =>
  JSON.stringify(left) === JSON.stringify(right);

export function beginManualReceivingAttempt(
  current: ManualReceivingAttempt | null,
  payload: ManualReceivingPayload,
  createRequestId: () => string,
): ManualReceivingAttempt {
  if (!current) return { requestId: createRequestId(), payload };
  if (!samePayload(current.payload, payload)) throw new ManualReceivingPayloadConflict();
  return current;
}

export function acquireManualReceivingSubmission(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseManualReceivingSubmission(lock: { current: boolean }) {
  lock.current = false;
}
