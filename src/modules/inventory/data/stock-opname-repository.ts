import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PosDomainError, mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

type OpnameStatus = "in_progress" | "applied" | "cancelled";

export type StockOpnameItemDetail = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string | null;
  batchId: string;
  batchNumber: string;
  expiredDate: string;
  systemQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  notes: string | null;
};

export type StockOpnameSessionDetail = {
  id: string;
  status: OpnameStatus;
  storageLocation: { id: string; fullCode: string } | null;
  startedBy: { id: string; name: string };
  startedAt: string;
  items: StockOpnameItemDetail[];
};

export type UpdateStockOpnameItemData = {
  sessionId: string;
  itemId: string;
  physicalQuantity: number;
  notes?: string;
};

const fail = <T>(error: { message: string } | null, data: T): T => {
  if (error) throw mapDatabaseError(error);
  return data;
};

export async function getStockOpnameSession(sessionId: string): Promise<StockOpnameSessionDetail | null> {
  const admin = createAdminSupabaseClient();
  const sessionResult = await admin
    .from("stock_opname_sessions")
    .select("id,status,storage_location_id,created_by,created_at")
    .eq("id", sessionId)
    .maybeSingle();
  const session = fail(sessionResult.error, sessionResult.data);
  if (!session) return null;

  const itemsResult = await admin
    .from("stock_opname_items")
    .select("id,product_id,batch_id,system_quantity,physical_quantity,variance,notes")
    .eq("session_id", session.id)
    .order("created_at")
    .order("id");
  const items = fail(itemsResult.error, itemsResult.data ?? []);

  const productIds = [...new Set(items.map((item) => item.product_id))];
  const batchIds = [...new Set(items.map((item) => item.batch_id))];
  const [employeeResult, locationResult, productsResult, batchesResult] = await Promise.all([
    admin.from("employees").select("id,full_name").eq("id", session.created_by).maybeSingle(),
    session.storage_location_id
      ? admin.from("storage_locations").select("id,full_code").eq("id", session.storage_location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    productIds.length > 0
      ? admin.from("products").select("id,name,sku").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length > 0
      ? admin.from("product_batches").select("id,batch_number,expired_date").in("id", batchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const employee = fail(employeeResult.error, employeeResult.data);
  const location = fail(locationResult.error, locationResult.data);
  const products = fail(productsResult.error, productsResult.data ?? []);
  const batches = fail(batchesResult.error, batchesResult.data ?? []);
  const barcodesResult = productIds.length > 0
    ? await admin.from("product_units").select("product_id,barcode").in("product_id", productIds).eq("is_base_unit", true)
    : { data: [], error: null };
  const barcodes = fail(barcodesResult.error, barcodesResult.data ?? []);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const barcodeByProductId = new Map(barcodes.map((unit) => [unit.product_id, unit.barcode]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));

  return {
    id: session.id,
    status: session.status as OpnameStatus,
    storageLocation: location ? { id: location.id, fullCode: location.full_code } : null,
    startedBy: { id: session.created_by, name: employee?.full_name ?? "—" },
    startedAt: session.created_at,
    items: items.map((item) => {
      const product = productsById.get(item.product_id);
      const batch = batchesById.get(item.batch_id);
      return {
        id: item.id,
        productId: item.product_id,
        productName: product?.name ?? "—",
        productSku: product?.sku ?? "—",
        productBarcode: barcodeByProductId.get(item.product_id) ?? null,
        batchId: item.batch_id,
        batchNumber: batch?.batch_number ?? "—",
        expiredDate: batch?.expired_date ?? "",
        systemQuantity: item.system_quantity,
        physicalQuantity: item.physical_quantity,
        variance: item.variance,
        notes: item.notes,
      };
    }),
  };
}

export async function getActiveStockOpnameSession(): Promise<StockOpnameSessionDetail | null> {
  const result = await createAdminSupabaseClient()
    .from("stock_opname_sessions")
    .select("id")
    .eq("status", "in_progress")
    .maybeSingle();
  const session = fail(result.error, result.data);
  return session ? getStockOpnameSession(session.id) : null;
}

export async function updateStockOpnameItem(data: UpdateStockOpnameItemData) {
  const admin = createAdminSupabaseClient();
  const sessionResult = await admin
    .from("stock_opname_sessions")
    .select("id,status")
    .eq("id", data.sessionId)
    .maybeSingle();
  const session = fail(sessionResult.error, sessionResult.data);
  if (!session) throw new PosDomainError("STOCK_OPNAME_NOT_FOUND");
  if (session.status !== "in_progress") throw new PosDomainError("INVALID_STOCK_OPNAME_STATE");

  const result = await admin
    .from("stock_opname_items")
    .update({
      physical_quantity: data.physicalQuantity,
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    })
    .eq("id", data.itemId)
    .eq("session_id", data.sessionId)
    .select("id,session_id,system_quantity,physical_quantity,variance,notes")
    .maybeSingle();
  const item = fail(result.error, result.data);
  if (!item) throw new PosDomainError("STOCK_OPNAME_ITEM_NOT_FOUND");

  return {
    itemId: item.id,
    sessionId: item.session_id,
    systemQuantity: item.system_quantity,
    physicalQuantity: item.physical_quantity,
    variance: item.variance,
    notes: item.notes,
  };
}
