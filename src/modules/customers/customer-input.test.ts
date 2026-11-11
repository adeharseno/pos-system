import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerCreateBody, parseCustomerInput } from "./customer-input";
import { mapDatabaseError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { mapApiError } from "@/modules/shared/api/response";

test("parseCustomerInput trims fields and accepts optional blanks as null", () => {
  const result = parseCustomerInput({
    name: "  Ibu Sari  ",
    phone: "  0812-345-6789 ",
    address: "   ",
    notes: undefined,
  });

  assert.deepEqual(result, {
    name: "Ibu Sari",
    phone: "0812-345-6789",
    address: null,
    notes: null,
  });
});

test("parseCustomerInput rejects blank name or non-string fields", () => {
  assert.throws(() => parseCustomerInput({ name: "   " }), /Nama pelanggan wajib diisi/);
  assert.throws(() => parseCustomerInput({ name: "Budi", phone: 123 }), /Nomor telepon harus berupa teks/);
  assert.throws(() => parseCustomerInput([]), /Data pelanggan tidak valid/);
});

test("parseCustomerCreateBody preserves valid request_id or generates UUID", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const explicit = parseCustomerCreateBody({ name: "Apotek Mitra", request_id: requestId });
  assert.equal(explicit.requestId, requestId);

  const generated = parseCustomerCreateBody({ name: "Klinik Harapan" });
  assert.match(generated.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  assert.throws(() => parseCustomerCreateBody({ name: "Test", request_id: "not-a-uuid" }));
});

test("duplicate customer and conflict database errors map cleanly to HTTP 409 responses", async () => {
  const dup = mapDatabaseError({ message: "DUPLICATE_CUSTOMER" });
  assert.ok(dup instanceof PosDomainError);
  assert.equal(dup.code, "DUPLICATE_CUSTOMER");
  const dupRes = mapApiError(dup);
  assert.equal(dupRes.status, 409);
  const dupJson = (await dupRes.json()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(dupJson.ok, false);
  assert.equal(dupJson.error.code, "DUPLICATE_CUSTOMER");

  const conflict = mapDatabaseError({ message: "CUSTOMER_REQUEST_CONFLICT" });
  assert.equal(mapApiError(conflict).status, 409);
});
