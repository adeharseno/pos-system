import { SUBCATEGORY_LABEL } from "./master-data-labels";

export type SubcategoryFormErrors = { name?: string };

/**
 * Validation for the independent "Subkategori" form. There is no category
 * field, so a missing name is always attributed to the name field only.
 */
export function subcategoryFormError(name: string): SubcategoryFormErrors {
  return name.trim() ? {} : { name: `Nama ${SUBCATEGORY_LABEL.toLowerCase()} wajib diisi.` };
}
