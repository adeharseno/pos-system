import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminProductFilters } from "./admin-product-filters";

test("admin product filters search, filter, and paginate deterministically",()=>{assert.deepEqual(parseAdminProductFilters({q:" Paracetamol ",status:"inactive",prescription:"required",page:"2"}),{q:"Paracetamol",status:"inactive",prescription:"required",page:2,limit:20});});
test("admin product filters default to active and reject malformed values",()=>{assert.deepEqual(parseAdminProductFilters({status:"removed",prescription:"yes",page:"-1"}),{q:"",status:"active",prescription:"all",page:1,limit:20});});
test("admin product search accepts SKU-like text and rejects query operators",()=>{assert.equal(parseAdminProductFilters({q:"SKU-001"}).q,"SKU-001");assert.equal(parseAdminProductFilters({q:"name,or(is_active.eq.true)"}).q,"");});
