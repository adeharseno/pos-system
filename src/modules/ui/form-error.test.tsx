import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormError } from "./components";

test("FormError renders an accessible red alert message", () => {
  const html = renderToStaticMarkup(<FormError id="opening-error">Saldo Kas Awal harus diisi.</FormError>);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('id="opening-error"'));
  assert.ok(html.includes("text-[var(--danger)]"));
  assert.ok(html.includes("Saldo Kas Awal harus diisi."));
});

test("FormError renders nothing without a message", () => {
  assert.equal(renderToStaticMarkup(<FormError />), "");
});
