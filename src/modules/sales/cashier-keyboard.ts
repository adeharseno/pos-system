export type CashierKeyboardContext = "cashier" | "checkout" | "success";

export type CashierKeyboardAction =
  | "suppress-repeat" | "focus-search"
  | "cart-edit-last" | "cart-previous" | "cart-next" | "cart-increase" | "cart-decrease" | "open-checkout" | "open-bpjs-checkout"
  | "category-bebas" | "category-umum" | "category-bpjs" | "method-cash" | "method-qris" | "method-transfer" | "method-tempo" | "focus-cash" | "submit-checkout" | "close-checkout"
  | "new-sale" | "print-receipt" | "view-receipt";

type KeyboardLike = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat">;

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

export function nextProductChoiceIndex(current: number, count: number, key: "ArrowUp" | "ArrowDown" | "PageUp" | "PageDown") {
  if (count <= 0) return -1;
  const delta = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : key === "PageDown" ? 5 : -5;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + delta));
}

export function cashierKeyboardAction(event: KeyboardLike, context: CashierKeyboardContext, editable = false): CashierKeyboardAction | null {
  if (event.metaKey) return null;
  if (event.repeat) {
    const initialAction = cashierKeyboardAction({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: false,
    }, context, editable);
    return initialAction ? "suppress-repeat" : null;
  }
  const key = event.key.toLowerCase();

  if (context === "success") {
    if (event.altKey || event.ctrlKey || event.shiftKey || editable) return null;
    if (key === "enter") return "new-sale";
    if (key === "f3") return "print-receipt";
    if (key === "f4") return "view-receipt";
    return null;
  }

  if (context === "checkout") {
    if (event.ctrlKey && !event.altKey && key === "enter") return "submit-checkout";
    if (!event.altKey && !event.ctrlKey && key === "escape") return "close-checkout";
    if (!event.altKey || event.ctrlKey) return null;
    return ({
      "1": "category-bebas", "2": "category-umum", "3": "category-bpjs",
      t: "method-cash", r: "method-qris", b: "method-transfer", o: "method-tempo", u: "focus-cash",
    } as Record<string, CashierKeyboardAction>)[key] ?? null;
  }

  if (event.altKey && !event.ctrlKey) {
    if (key === "q") return "cart-edit-last";
    if (key === "arrowup") return "cart-previous";
    if (key === "arrowdown") return "cart-next";
    return null;
  }
  if (event.altKey || event.ctrlKey) return null;
  if (key === "f2") return event.shiftKey ? "open-bpjs-checkout" : "open-checkout";
  if (editable) return null;
  if (key === "/" || key === "?") return "focus-search";
  if (key === "+" || key === "add") return "cart-increase";
  if (key === "-" || key === "subtract") return "cart-decrease";
  return null;
}

export function consumeCashierKeyboardAction(event: KeyboardLike & { preventDefault: () => void }, context: CashierKeyboardContext, editable = false) {
  const action = cashierKeyboardAction(event, context, editable);
  if (action) event.preventDefault();
  return action;
}

