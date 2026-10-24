import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";

export async function insertCategory(name: string) {
  const result = await createAdminSupabaseClient().from("categories").insert({ name }).select("id,name").single();
  if (result.error) {
    if (String(result.error.message).includes("uq_categories_normalized_name")) throw new PosDomainError("DUPLICATE_CATEGORY");
    throw mapDatabaseError(result.error);
  }
  return result.data;
}

export async function insertSubcategory(categoryId: string, name: string) {
  const client = createAdminSupabaseClient();
  const category = await client.from("categories").select("id").eq("id", categoryId).maybeSingle();
  if (category.error) throw mapDatabaseError(category.error);
  if (!category.data) throw new PosDomainError("CATEGORY_NOT_FOUND");
  const result = await client.from("subcategories").insert({ category_id: categoryId, name }).select("id,category_id,name").single();
  if (result.error) {
    if (isDuplicateSubcategoryError(result.error)) throw new PosDomainError("DUPLICATE_SUBCATEGORY");
    throw mapDatabaseError(result.error);
  }
  return result.data;
}

function isDuplicateCategoryError(error: { message?: string }) {
  return String(error.message).includes("uq_categories_normalized_name");
}

function isDuplicateSubcategoryError(error: { message?: string }) {
  return String(error.message).includes("uq_subcategories_normalized_category_name")
    || String(error.message).includes("subcategories_category_id_name_key");
}

function isCategoryUsageError(error: { message?: string }) {
  const message = String(error.message);
  return message.includes("subcategories_category_id_fkey") || message.includes("fk_products_subcategory_category");
}

export async function updateCategory(id: string, name: string) {
  const result = await createAdminSupabaseClient().from("categories").update({ name }).eq("id", id).select("id,name").maybeSingle();
  if (result.error) {
    if (isDuplicateCategoryError(result.error)) throw new PosDomainError("DUPLICATE_CATEGORY");
    throw mapDatabaseError(result.error);
  }
  if (!result.data) throw new PosDomainError("CATEGORY_NOT_FOUND");
  return result.data;
}

export async function deleteCategory(id: string) {
  const client = createAdminSupabaseClient();
  const category = await client.from("categories").select("id").eq("id", id).maybeSingle();
  if (category.error) throw mapDatabaseError(category.error);
  if (!category.data) throw new PosDomainError("CATEGORY_NOT_FOUND");

  const [subcategories, products] = await Promise.all([
    client.from("subcategories").select("id").eq("category_id", id).limit(1),
    client.from("products").select("id").eq("category_id", id).limit(1),
  ]);
  if (subcategories.error) throw mapDatabaseError(subcategories.error);
  if (products.error) throw mapDatabaseError(products.error);
  if (subcategories.data?.length || products.data?.length) throw new PosDomainError("CATEGORY_IN_USE");

  const result = await client.from("categories").delete().eq("id", id).select("id").maybeSingle();
  if (result.error) {
    if (isCategoryUsageError(result.error)) throw new PosDomainError("CATEGORY_IN_USE");
    throw mapDatabaseError(result.error);
  }
  if (!result.data) throw new PosDomainError("CATEGORY_NOT_FOUND");
  return result.data;
}

export async function updateSubcategory(id: string, categoryId: string, name: string) {
  const client = createAdminSupabaseClient();
  const current = await client.from("subcategories").select("id,category_id").eq("id", id).maybeSingle();
  if (current.error) throw mapDatabaseError(current.error);
  if (!current.data) throw new PosDomainError("SUBCATEGORY_NOT_FOUND");
  const category = await client.from("categories").select("id").eq("id", categoryId).maybeSingle();
  if (category.error) throw mapDatabaseError(category.error);
  if (!category.data) throw new PosDomainError("CATEGORY_NOT_FOUND");

  if (current.data.category_id !== categoryId) {
    const products = await client.from("products").select("id").eq("subcategory_id", id).limit(1);
    if (products.error) throw mapDatabaseError(products.error);
    if (products.data?.length) throw new PosDomainError("SUBCATEGORY_IN_USE");
  }

  const result = await client.from("subcategories").update({ category_id: categoryId, name }).eq("id", id).select("id,category_id,name").maybeSingle();
  if (result.error) {
    if (isDuplicateSubcategoryError(result.error)) throw new PosDomainError("DUPLICATE_SUBCATEGORY");
    throw mapDatabaseError(result.error);
  }
  if (!result.data) throw new PosDomainError("SUBCATEGORY_NOT_FOUND");
  return result.data;
}

export async function deleteSubcategory(id: string) {
  const client = createAdminSupabaseClient();
  const subcategory = await client.from("subcategories").select("id").eq("id", id).maybeSingle();
  if (subcategory.error) throw mapDatabaseError(subcategory.error);
  if (!subcategory.data) throw new PosDomainError("SUBCATEGORY_NOT_FOUND");

  const products = await client.from("products").select("id").eq("subcategory_id", id).limit(1);
  if (products.error) throw mapDatabaseError(products.error);
  if (products.data?.length) throw new PosDomainError("SUBCATEGORY_IN_USE");

  const result = await client.from("subcategories").delete().eq("id", id).select("id").maybeSingle();
  if (result.error) {
    if (isCategoryUsageError(result.error)) throw new PosDomainError("SUBCATEGORY_IN_USE");
    throw mapDatabaseError(result.error);
  }
  if (!result.data) throw new PosDomainError("SUBCATEGORY_NOT_FOUND");
  return result.data;
}
