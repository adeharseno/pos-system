/**
 * Shared UI labels for the two independent master lists.
 *
 * `categories` is presented as "Kategori"; `subcategories` as "Subkategori".
 * They are not parent/child; a product may pair any value from each list.
 */
export const CATEGORY_LABEL = "Kategori";
export const SUBCATEGORY_LABEL = "Subkategori";

/** Legacy default values. */
export const CATEGORY_VALUES = ["Obat Bebas", "Obat Resep", "Racik", "Psikotropika"] as const;
export const SUBCATEGORY_VALUES = ["Syrup", "Tablet", "Injeksi", "Infus", "Alkes", "Supp", "Cream", "Obat Tetes", "Bebas"] as const;
