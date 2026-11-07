# Step 7C.3 — Excel Import Data Readiness

**Source:** `data/legacy/produk_final.xlsx`  
**Source unchanged:** yes  
**Application code/schema changed:** no  
**Database state changed:** no  
**Scope:** analysis and recommendations only

## Artifacts

- Row-level report: `data/legacy/produk_final_validation_report.csv` (3,696 data rows + header)
- Supplier decision list: `data/legacy/produk_final_supplier_summary.csv`
- Missing-unit evidence list: `data/legacy/produk_final_missing_unit_summary.csv`

## 1. Validation summary

The workbook has one sheet (`Produk`) with 3,696 data rows and these columns:

`No.`, `Nama`, `Harga`, `SKU`, `Satuan Dasar`, `Sub kategori`, `Klasifikasi`, `Stok`, `Supplier`

There is no `Harga Modal` column. That is acceptable because it is optional and must default to numeric `0`.

| Field | Rows affected | Current effect |
|---|---:|---|
| Missing SKU | 1,679 | error |
| Missing Satuan Dasar | 1,679 | error |
| Missing Sub kategori | 1,679 | error |
| Missing Klasifikasi | 1,680 | error |
| Blank Supplier | 1,958 | allowed; stored as NULL |
| Unknown Supplier | 1,594 | error |
| Missing Harga Modal | 3,696 | allowed; stored as 0 |
| Invalid Harga | 0 | — |
| Invalid Stok | 0 | — |
| Duplicate SKU in file | 0 | — |
| Duplicate product name | 6 rows / 3 pairs | warning/review |
| Unknown Klasifikasi value | 0 | — |
| Unknown Sub kategori value | 0 | — |

### Row segments

The file splits into four clear groups:

| Segment | Rows | Description |
|---|---:|---|
| Fully populated master fields | 422 | Current policy passes these |
| Complete master fields, unknown supplier | 1,594 | Only supplier blocks validation |
| Missing SKU + unit + category + subcategory | 1,679 | All four identity fields blank; supplier also blank; price/stock valid |
| Missing classification only | 1 | Row 2008, `INCLOVIR 500 MG` |

`1,679 + 1,594 + 422 + 1 = 3,696`

## 2. Safe automatic mappings

### Category (`Klasifikasi`)

All nonblank values map exactly to active master data after case/whitespace normalization:

| Excel value | Rows | Master |
|---|---:|---|
| `OBAT RESEP` | 1,506 | `Obat Resep` |
| `OBAT BEBAS` | 505 | `Obat Bebas` |
| `RACIK` | 4 | `Racik` |
| `PSIKOTROPIKA` | 1 | `Psikotropika` |

No new category is needed for values that are present.

### Subcategory (`Sub kategori`)

All nonblank values map exactly to active master data after case/whitespace normalization:

| Excel value | Rows | Master |
|---|---:|---|
| `TABLET` | 669 | `Tablet` |
| `BEBAS` | 374 | `Bebas` |
| `SYRUP` | 276 | `Syrup` |
| `CREAM` | 220 | `Cream` |
| `INJEKSI` | 193 | `Injeksi` |
| `OBAT TETES` | 131 | `Obat Tetes` |
| `ALKES` | 94 | `Alkes` |
| `SUPP` | 33 | `Supp` |
| `INFUS` | 27 | `Infus` |

No new subcategory is needed for values that are present.

### Supplier

Current active supplier master contains only **Asa Medika**.

- `ASA MEDIKA`: 144 rows match exactly to `Asa Medika`.
- 1,958 rows are blank: allowed, store NULL.
- 1,594 rows reference 38 other supplier strings: unknown.
- 37 of the unknown rows use non-supplier-like values: `PASIEN` (17), `GUDANG` (8), `BPJS` (7), `RETUR` (3), `BAPAK` (1), `LUKMAN` (1).
- Possible same-entity variants must be confirmed, not auto-merged: e.g. `PT COMBI PUTRA` vs `COMBI PUTRA`, and `SAWAH BESAR` vs `PT SAWAH BESAR PRIMA`.

**Safe automatic action:** exact case-insensitive match only. Do not auto-create suppliers and do not guess aliases.

### Harga Modal

Missing in all 3,696 rows. Store numeric `0` exactly as required. This is not a validation failure.

## 3. Why missing SKU is currently rejected

The rejection is an implementation policy, not an unavoidable database limitation:

- `products.sku` is `NOT NULL UNIQUE`, so a value must eventually be supplied.
- The 7C.2 initial importer adds the validation message `SKU wajib diisi.` and does not generate a replacement.
- The older legacy product importer already handles optional SKU by generating `N-00001`, `N-00002`, etc.
- The 7C.2 bulk RPC also requires a non-empty `sku` in its payload.

Therefore, to honor the original optional-SKU requirement, the importer should generate an internal SKU **before** calling the existing RPC. The RPC can continue requiring a non-empty value.

### Recommended internal SKU strategy

Use a clearly internal, deterministic prefix:

```text
INT-<Excel row number padded to 5 digits>
```

Examples:

```text
row 4    -> INT-00004
row 2008 -> INT-02008
```

Properties:

- Distinct from every real numeric SKU in the file (`00200710`, etc.).
- Deterministic for a fixed source file.
- Unique because each source row has exactly one row number.
- Easy to audit because the number maps directly to the source workbook row.
- Collision check against all real SKUs in the file and all existing product SKUs before insert.
- If an unexpected collision exists, append a deterministic suffix such as `-2`; never silently reuse a real SKU.
- Keep the generated mapping in the row-level CSV/audit artifact: `source_row`, `name`, `generated_sku`, `original_sku_blank=yes`.

If row numbers must remain stable after future reordering of the workbook, the alternative is `INT-` plus a hash of normalized name/unit/category, with a deterministic duplicate counter. For a one-time initial import, the row-number scheme is simpler and more transparent.

## 4. Missing units

There is no unit master table. `Satuan Dasar` is free text stored in `products.base_unit` and `product_units.unit_name`. Existing seeded products mostly use full names (`Tablet`, `Botol`, `Kapsul`), while this workbook uses abbreviations (`TAB`, `PCS`, `BTL`). That naming convention is an administrator decision.

Present unit distribution:

| Unit | Rows |
|---|---:|
| `PCS` | 1,175 |
| `TAB` | 603 |
| `BTL` | 149 |
| `CAP` | 16 |
| `BOX` | 15 |
| `SCT` | 14 |
| `BKS` | 10 |
| `STRIP` | 10 |
| `AMP` | 7 |
| `TUBE` | 7 |
| `LBR` | 3 |
| `DUS` | 3 |
| `PEN` | 2 |
| `POT` | 1 |
| `SPRAY` | 1 |
| `SUPP` | 1 |
| **Missing** | **1,679** |

Analysis of the 1,679 missing-unit rows:

| Evidence category | Rows |
|---|---:|
| Name contains explicit `TAB`/`TABLET` | 826 |
| Explicit but ambiguous unit token | 142 |
| No explicit unit token | 711 |

Observed convention among rows where the unit is present:

| Token | Observed units | Assessment |
|---|---|---|
| `TAB` | TAB 435, PCS 21, STRIP 3, LBR 1, CAP 1 | Strong evidence for `TAB` (~94%), but not absolute |
| `TABLET` | TAB 14, PCS 3 | Supports `TAB`, smaller support |
| `INJ` | PCS 142, AMP 5, TAB 2 | Dataset convention is mostly PCS, but semantically ambiguous |
| `CAP` | PCS 18, CAP 6, TAB 4, BTL 2 | Ambiguous |
| `SACHET` | PCS 7, SCT 3 | Insufficient evidence |
| `SUPP` | PCS 11, TAB 1, SUPP 1 | Insufficient evidence |
| `BOTOL` | PCS 4, BTL 1 | Insufficient evidence |
| `TUBE` | PCS 1 | Insufficient evidence |
| `SPRAY` | PCS 5, BTL 3, SPRAY 1 | Ambiguous |
| `PEN` | PCS 3, PEN 2 | Insufficient evidence |
| `POT`, `BOX` | 0–1 observed rows | Insufficient evidence |

**Recommendation:** do not assume `PCS`, `TAB`, or `STRIP` automatically. The only evidence-backed automatic proposal is:

- `TAB`/`TABLET` in the product name -> propose `TAB`, subject to administrator approval and review of the observed exceptions.

All other 853 missing-unit rows must be decided manually. `PCS` must not be used as a silent default.

## 5. Uncategorized products and unknown suppliers

### Uncategorized products

The 1,679 fully missing rows have no category, subcategory, or classification. They also have no SKU or unit.

Do not invent category values. Recommended handling:

1. Preserve the original raw values (even when blank) in a per-row import staging record or audit CSV.
2. Either:
   - require the administrator to complete category, subcategory, and classification before import; or
   - allow `category_id` and `subcategory_id` to remain `NULL` (schema already permits this after migration 0032) under an explicit administrator policy, and use a review workflow/filter for uncategorized products.
3. `drug_classification` is `NOT NULL`. Do not silently default these rows to `otc`. Either require a real classification, or add an explicit review state in a future schema change.
4. Never create a fake category/subcategory unless the administrator explicitly requests a named holding value such as “Belum Dikategorikan”.

### Unknown suppliers

Do not auto-create suppliers. Recommended handling:

1. Export and review the 39 distinct supplier strings in `produk_final_supplier_summary.csv`.
2. Create/verify supplier master records for genuine suppliers, then use exact normalized name matching.
3. For non-supplier-like values (`PASIEN`, `GUDANG`, `BPJS`, `RETUR`, `BAPAK`, `LUKMAN`), decide whether to store `NULL`, map to an internal supplier, or preserve only as legacy text.
4. Preserve the original supplier text in a staging/audit field so setting `default_supplier_id = NULL` does not lose information.
5. Do not auto-merge possible variants such as `PT COMBI PUTRA`/`COMBI PUTRA` or `SAWAH BESAR`/`PT SAWAH BESAR PRIMA` without administrator confirmation.

## 6. Importability estimates

| Scenario | Rows importable | Conditions |
|---|---:|---|
| Current strict 7C.2 policy | **422** | No data or policy changes |
| Supplier master prepared/approved | **2,016** | Resolves all 1,594 unknown-supplier rows; no other policy change |
| Internal SKU generation approved | **2,016** | No additional gain because the 1,679 SKU-missing rows also lack unit/category |
| Classification/category policy approved | **2,017** | Adds the single classification-only row, but the 1,679 rows still lack units |
| `TAB`/`TABLET` unit proposal approved | **2,843** | Adds 826 rows; assumes supplier, SKU, category, and classification policies above |
| Remaining 853 units decided manually | **3,696** | Full file; 3,693 if the 3 incomplete duplicate-name rows are dropped |

Important: the 2,843 and 3,696 figures require explicit administrator approval for at least one of:

- generated internal SKUs;
- uncategorized products with `NULL` category/subcategory;
- a classification policy for the 1,679 uncategorized rows;
- `TAB` unit inference.

Without those decisions, the safe automatic maximum remains **422** rows, or **2,016** after supplier master preparation.

## 7. Duplicate names and one-off classification

Three duplicate-name pairs need a decision:

| Rows | Name | Situation |
|---|---|---|
| 250, 251 | `AK PGA 2-0` | Both completely blank identity fields; likely duplicate |
| 895, 896 | `CENDO OCULENTA` | One complete row + one blank duplicate |
| 2717, 2718 | `OMEVEL INF` | One complete row + one blank duplicate with different price |

Do not auto-delete or auto-merge these. Administrator must choose keep-both, merge, or drop the incomplete duplicate.

One row is complete except for classification:

- Excel row 2008, `INCLOVIR 500 MG`, SKU `00201751`, unit `TAB`, subcategory `TABLET`, supplier blank.
- Administrator must choose its classification.

## 8. Recommended mapping policy (concise)

1. **Category:** exact normalized match to active master only. Never create a category automatically.
2. **Subcategory:** exact normalized match to active master only. Never create a subcategory automatically.
3. **Supplier:** exact normalized match only. Prepare the supplier master first. Preserve original text if storing NULL. Never auto-create or auto-merge supplier aliases.
4. **Unit:** preserve present values as-is unless the administrator approves a canonical naming map. Do not default missing units to `PCS`. Only `TAB`/`TABLET` has enough evidence for a proposed automatic fill, and only with approval.
5. **SKU:** preserve real SKUs as text. Generate `INT-<source_row:05d>` for missing SKUs after approval, with collision checks and an audit mapping.
6. **Missing category/subcategory:** do not invent. Either require completion or allow NULL under an explicit review policy. Preserve raw source values in staging/audit.
7. **Missing classification:** do not silently default to `otc`. Require a real value or introduce a future review state.
8. **Harga Modal:** missing -> numeric `0`.
9. **Duplicate names:** administrator decides; do not auto-drop.
10. **Import behavior:** keep all-or-nothing import. Unresolved rows must be reported, never silently skipped.

## 9. Business decisions needed

1. Approve or reject internal SKU generation using `INT-<row:05d>` for 1,679 rows.
2. Approve the supplier master plan: which of the 38 unknown supplier strings are real suppliers, which are aliases, and which are non-supplier values.
3. Decide whether the 1,679 uncategorized rows may have `NULL` category/subcategory, or must be completed manually.
4. Decide the classification policy for those 1,679 rows plus row 2008.
5. Decide unit handling: only `TAB`/`TABLET` auto-proposal, or full manual entry; and whether to keep abbreviations or normalize to full names.
6. Decide the three duplicate-name pairs.
7. Confirm that missing `Harga Modal` remains `0` for all rows.

**Stop:** no application code, migration, database state, or original Excel file was changed.
