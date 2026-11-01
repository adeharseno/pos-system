import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RupiahInput } from "./rupiah-input";

test("RupiahInput groups digits and shows the Rp prefix without a separate box", () => {
  const html = renderToStaticMarkup(
    <RupiahInput id="opening_balance" name="opening_balance" defaultValue={100000000} />,
  );
  assert.ok(html.includes('value="100.000.000"'));
  assert.ok(html.includes('name="opening_balance"'));
  assert.ok(html.includes('value="100000000"'));
  assert.ok(html.includes("Rp"));
  assert.ok(/inputmode="numeric"/i.test(html));
});

test("RupiahInput left-aligns partial typing without thousand separators", () => {
  const html = renderToStaticMarkup(<RupiahInput defaultValue={500000} />);
  assert.ok(html.includes('value="500.000"'));
});

test("RupiahInput has no placeholder and suppresses the inner focus outline", () => {
  const html = renderToStaticMarkup(<RupiahInput name="amount" />);
  assert.ok(!html.includes("Contoh:"));
  assert.ok(!html.includes("placeholder="));
  assert.ok(html.includes("focus-visible:outline-none"));
  assert.ok(html.includes('name="amount" value=""'));
});
