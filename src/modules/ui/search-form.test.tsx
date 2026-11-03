import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchForm } from "./search-form";

test("SearchForm renders form attributes and children correctly", () => {
  const router: AppRouterInstance = {
    bfcacheId: "test",
    push() {},
    replace() {},
    refresh() {},
    back() {},
    forward() {},
    prefetch() {},
  };

  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <SearchForm action="/inventory" className="test-class">
        <input name="q" defaultValue="paracetamol" />
        <button type="submit">Cari</button>
      </SearchForm>
    </AppRouterContext.Provider>
  );

  assert.ok(html.includes('action="/inventory"'));
  assert.ok(html.includes('class="test-class"'));
  assert.ok(html.includes('value="paracetamol"'));
  assert.ok(html.includes("Cari"));
});
