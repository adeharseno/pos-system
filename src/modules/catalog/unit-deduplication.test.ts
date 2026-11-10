import assert from "node:assert/strict";
import test from "node:test";
import { buildCashierProductResults, deduplicateCashierUnits } from "./search";
import { addCartItem, type CartCandidate } from "../sales/cart";

test("production case: NEUROBION PINK 5000 TAB collapses duplicate empty historical unit and keeps primary unit ID", () => {
  const neurobionProduct = {
    id: "3e26c0d8-8296-478c-93c5-79620faa4936",
    name: "NEUROBION PINK 5000 TAB",
    sku: "INT-02601",
    requires_prescription: false,
    product_units: [
      {
        id: "8c0079c8-592c-428d-aad0-42146dbaa00d",
        unit_name: "Tablet",
        conversion_to_base: 1,
        selling_price: 58000,
        barcode: null,
        is_base_unit: true,
      },
      {
        id: "9485037d-2d6e-43de-a682-1437878f47d9",
        unit_name: "",
        conversion_to_base: 1,
        selling_price: 58000,
        barcode: null,
        is_base_unit: false,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([neurobionProduct], [{ product_id: neurobionProduct.id, quantity: 50 }]);
  assert.equal(mapped.units.length, 1, "Only one unit should be presented to cashier");
  assert.equal(mapped.units[0].id, "8c0079c8-592c-428d-aad0-42146dbaa00d", "Primary base unit ID must be preserved");
  assert.equal(mapped.units[0].label, "Tablet");
  assert.equal(mapped.units[0].conversionToBase, 1);
  assert.equal(mapped.units[0].displayedUnitPrice, 58000);
});

test("production case: order-independent preservation of primary unit when historical unit comes first", () => {
  const neurobionReverseOrder = {
    id: "3e26c0d8-8296-478c-93c5-79620faa4936",
    name: "NEUROBION PINK 5000 TAB",
    sku: "INT-02601",
    requires_prescription: false,
    product_units: [
      {
        id: "9485037d-2d6e-43de-a682-1437878f47d9",
        unit_name: "",
        conversion_to_base: 1,
        selling_price: 58000,
        barcode: null,
        is_base_unit: false,
      },
      {
        id: "8c0079c8-592c-428d-aad0-42146dbaa00d",
        unit_name: "Tablet",
        conversion_to_base: 1,
        selling_price: 58000,
        barcode: null,
        is_base_unit: true,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([neurobionReverseOrder], [{ product_id: neurobionReverseOrder.id, quantity: 20 }]);
  assert.equal(mapped.units.length, 1);
  assert.equal(mapped.units[0].id, "8c0079c8-592c-428d-aad0-42146dbaa00d");
  assert.equal(mapped.units[0].label, "Tablet");
});

test("standalone product with a single empty-named unit remains sellable", () => {
  const singleNameless = {
    id: "prod-single",
    name: "Obat Tanpa Nama Satuan",
    sku: "SKU-001",
    requires_prescription: false,
    product_units: [
      {
        id: "unit-single",
        unit_name: "",
        conversion_to_base: 1,
        selling_price: 25000,
        barcode: "BAR-01",
        is_base_unit: true,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([singleNameless], [{ product_id: "prod-single", quantity: 15 }]);
  assert.equal(mapped.units.length, 1);
  assert.equal(mapped.units[0].id, "unit-single");
  assert.equal(mapped.units[0].label, "");
  assert.equal(mapped.units[0].displayedUnitPrice, 25000);

  // Verifying cart addition works without throwing
  const candidate: CartCandidate = {
    productId: mapped.id,
    productName: mapped.name,
    productUnitId: mapped.units[0].id,
    unitLabel: mapped.units[0].label,
    conversionToBase: mapped.units[0].conversionToBase,
    displayedUnitPrice: mapped.units[0].displayedUnitPrice,
    requiresPrescription: mapped.requiresPrescription,
  };
  const cart = addCartItem([], candidate);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].productUnitId, "unit-single");
  assert.equal(cart[0].displayedUnitPrice, 25000);
});

test("units with same price but different conversions are NOT merged", () => {
  const multiPackaging = [
    {
      id: "u-tablet",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 10000,
      barcode: null,
      is_base_unit: true,
    },
    {
      id: "u-strip",
      unit_name: "Strip",
      conversion_to_base: 10,
      selling_price: 10000,
      barcode: null,
      is_base_unit: false,
    },
  ];

  const result = deduplicateCashierUnits(multiPackaging);
  assert.equal(result.length, 2, "Both packaging units must be displayed because conversions differ");
  assert.equal(result[0].id, "u-tablet");
  assert.equal(result[1].id, "u-strip");
});

test("units with same conversion and same price but different valid names are NOT merged", () => {
  const distinctPacks = [
    {
      id: "u-tab",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 5000,
      barcode: null,
      is_base_unit: true,
    },
    {
      id: "u-kap",
      unit_name: "Kapsul",
      conversion_to_base: 1,
      selling_price: 5000,
      barcode: null,
      is_base_unit: false,
    },
  ];

  const result = deduplicateCashierUnits(distinctPacks);
  assert.equal(result.length, 2, "Distinct semantic packages must both be displayed");
  assert.equal(result[0].label, "Tablet");
  assert.equal(result[1].label, "Kapsul");
});

test("exact duplicate units with same name, conversion, and price are collapsed to the base unit", () => {
  const duplicates = [
    {
      id: "u-dup-1",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 5000,
      barcode: null,
      is_base_unit: false,
    },
    {
      id: "u-dup-base",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 5000,
      barcode: "12345",
      is_base_unit: true,
    },
  ];

  const result = deduplicateCashierUnits(duplicates);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u-dup-base");
  assert.equal(result[0].label, "Tablet");
  assert.equal(result[0].barcode, "12345");
});

test("multi-tier product: removes empty duplicate while preserving all distinct packaging tiers", () => {
  const productTiers = [
    {
      id: "tier-tab",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 58000,
      barcode: null,
      is_base_unit: true,
    },
    {
      id: "tier-hist",
      unit_name: "",
      conversion_to_base: 1,
      selling_price: 58000,
      barcode: null,
      is_base_unit: false,
    },
    {
      id: "tier-strip",
      unit_name: "Strip",
      conversion_to_base: 10,
      selling_price: 550000,
      barcode: "STRIP-BC",
      is_base_unit: false,
    },
    {
      id: "tier-box",
      unit_name: "Box",
      conversion_to_base: 100,
      selling_price: 5200000,
      barcode: "BOX-BC",
      is_base_unit: false,
    },
  ];

  const result = deduplicateCashierUnits(productTiers);
  assert.equal(result.length, 3, "Only the 3 real packaging tiers should remain");
  assert.deepEqual(
    result.map((r) => ({ id: r.id, label: r.label, conv: r.conversionToBase })),
    [
      { id: "tier-tab", label: "Tablet", conv: 1 },
      { id: "tier-strip", label: "Strip", conv: 10 },
      { id: "tier-box", label: "Box", conv: 100 },
    ]
  );
});

test("preserves barcode from duplicate if primary unit has no barcode", () => {
  const unitsWithBarcode = [
    {
      id: "u-primary",
      unit_name: "Tablet",
      conversion_to_base: 1,
      selling_price: 58000,
      barcode: null,
      is_base_unit: true,
    },
    {
      id: "u-legacy",
      unit_name: "",
      conversion_to_base: 1,
      selling_price: 58000,
      barcode: "8991234567890",
      is_base_unit: false,
    },
  ];

  const result = deduplicateCashierUnits(unitsWithBarcode);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u-primary");
  assert.equal(result[0].barcode, "8991234567890", "Barcode from duplicate should be inherited if primary was null");
});

