import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StockStatus } from "./components/product-presentation";

test("stock status follows product activity and minimum stock", () => {
  assert.match(renderToStaticMarkup(<StockStatus active quantity={0} minimum={5} />), />Habis</);
  assert.match(renderToStaticMarkup(<StockStatus active quantity={4} minimum={5} />), />Menipis</);
  assert.match(renderToStaticMarkup(<StockStatus active quantity={5} minimum={5} />), />Menipis</);
  assert.match(renderToStaticMarkup(<StockStatus active quantity={6} minimum={5} />), /Tersedia/);
  assert.match(renderToStaticMarkup(<StockStatus active quantity={1} minimum={0} />), /Tersedia/);
  assert.match(renderToStaticMarkup(<StockStatus active={false} quantity={20} minimum={5} />), /Nonaktif/);
});
