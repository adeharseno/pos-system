import assert from "node:assert/strict";
import test from "node:test";
import { cashierKeyboardAction, consumeCashierKeyboardAction, nextProductChoiceIndex } from "./sales/cashier-keyboard";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CartPanel } from "./sales/components/cart-panel";

const key = (value: string, overrides: Partial<KeyboardEvent> = {}) => ({ key: value, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...overrides } as KeyboardEvent);

test("cashier shortcuts map search, cart, and checkout entry actions", () => {
  assert.equal(cashierKeyboardAction(key("/"), "cashier"), "focus-search");
  assert.equal(cashierKeyboardAction(key("?"), "cashier"), "focus-search");
  assert.equal(cashierKeyboardAction(key("q", { altKey: true }), "cashier"), "cart-edit-last");
  assert.equal(cashierKeyboardAction(key("ArrowUp", { altKey: true }), "cashier"), "cart-previous");
  assert.equal(cashierKeyboardAction(key("ArrowDown", { altKey: true }), "cashier"), "cart-next");
  assert.equal(cashierKeyboardAction(key("+"), "cashier"), "cart-increase");
  assert.equal(cashierKeyboardAction(key("-"), "cashier"), "cart-decrease");
  assert.equal(cashierKeyboardAction(key("F2"), "cashier"), "open-checkout");
  assert.equal(cashierKeyboardAction(key("F2"), "cashier", true), "open-checkout");
  assert.equal(cashierKeyboardAction(key("F2", { shiftKey: true }), "cashier"), "open-bpjs-checkout");
});

test("search shortcut is prevented before input while normal editable typing remains untouched", () => {
  for (const character of ["/", "?"]) {
    let prevented = false;
    const event = { ...key(character), preventDefault: () => { prevented = true; } };
    assert.equal(consumeCashierKeyboardAction(event, "cashier"), "focus-search");
    assert.equal(prevented, true);
    prevented = false;
    assert.equal(consumeCashierKeyboardAction(event, "cashier", true), null);
    assert.equal(prevented, false);
  }
});

test("product arrows and page keys navigate available result bounds", () => {
  assert.equal(nextProductChoiceIndex(-1, 9, "ArrowDown"), 0);
  assert.equal(nextProductChoiceIndex(-1, 9, "ArrowUp"), 8);
  assert.equal(nextProductChoiceIndex(1, 9, "PageDown"), 6);
  assert.equal(nextProductChoiceIndex(6, 9, "PageUp"), 1);
  assert.equal(nextProductChoiceIndex(8, 9, "ArrowDown"), 8);
  assert.equal(nextProductChoiceIndex(0, 0, "ArrowDown"), -1);
});

test("typing and held keys do not trigger cashier shortcuts", () => {
  assert.equal(cashierKeyboardAction(key("/"), "cashier", true), null);
  assert.equal(cashierKeyboardAction(key("?", { shiftKey: true }), "cashier", true), null);
  assert.equal(cashierKeyboardAction(key("a"), "cashier"), null);
  assert.equal(cashierKeyboardAction(key("+"), "cashier", true), null);
  assert.equal(cashierKeyboardAction(key("F2", { repeat: true }), "cashier"), "suppress-repeat");
  assert.equal(cashierKeyboardAction(key("ArrowLeft", { altKey: true, repeat: true }), "cashier"), null);
  assert.equal(cashierKeyboardAction(key("ArrowDown", { altKey: true, repeat: true }), "cashier"), "suppress-repeat");
  assert.equal(cashierKeyboardAction(key("?", { ctrlKey: true }), "cashier"), null);
});

test("native repeat events retain prototype-backed keyboard properties", () => {
  const event=Object.create({key:"F2",altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,repeat:true}) as KeyboardEvent;
  assert.equal(cashierKeyboardAction(event,"cashier"),"suppress-repeat");
});

test("checkout shortcuts map categories, methods, cash, submit, and safe close", () => {
  assert.equal(cashierKeyboardAction(key("1", { altKey: true }), "checkout", true), "category-bebas");
  assert.equal(cashierKeyboardAction(key("2", { altKey: true }), "checkout"), "category-umum");
  assert.equal(cashierKeyboardAction(key("3", { altKey: true }), "checkout"), "category-bpjs");
  assert.equal(cashierKeyboardAction(key("t", { altKey: true }), "checkout"), "method-cash");
  assert.equal(cashierKeyboardAction(key("r", { altKey: true }), "checkout"), "method-qris");
  assert.equal(cashierKeyboardAction(key("b", { altKey: true }), "checkout"), "method-transfer");
  assert.equal(cashierKeyboardAction(key("o", { altKey: true }), "checkout"), "method-tempo");
  assert.equal(cashierKeyboardAction(key("u", { altKey: true }), "checkout"), "focus-cash");
  assert.equal(cashierKeyboardAction(key("Enter", { ctrlKey: true }), "checkout", true), "submit-checkout");
  assert.equal(cashierKeyboardAction(key("Escape"), "checkout", true), "close-checkout");
  assert.equal(cashierKeyboardAction(key("/"), "checkout"), null);
  assert.equal(cashierKeyboardAction(key("Enter", { ctrlKey: true, repeat: true }), "checkout", true), "suppress-repeat");
});

test("success shortcuts reject repeats and map receipt actions", () => {
  assert.equal(cashierKeyboardAction(key("Enter"), "success"), "new-sale");
  assert.equal(cashierKeyboardAction(key("F3"), "success"), "print-receipt");
  assert.equal(cashierKeyboardAction(key("F4"), "success"), "view-receipt");
  assert.equal(cashierKeyboardAction(key("F3", { repeat: true }), "success"), "suppress-repeat");
  assert.equal(cashierKeyboardAction(key("/"), "success"), null);
});

test("cart quantity exposes a stable keyboard focus target after add", () => {
  const html=renderToStaticMarkup(createElement(CartPanel,{cart:[{productId:"p",productName:"Obat",productUnitId:"u",unitLabel:"TAB",quantity:1,conversionToBase:1,displayedUnitPrice:1000,requiresPrescription:false,availableStockBase:10}],onChange:()=>undefined,onReview:()=>undefined}));
  assert.match(html,/data-cart-qty-index="0"/);
  assert.match(html,/data-cart-unit-id="u"/);
});
