import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { Database, Json } from "@/types/database.types";

type Functions = Database["public"]["Functions"];
export type CoreRpcName = Extract<keyof Functions,
  | "checkout_transaction"
  | "confirm_qris_payment"
  | "void_transaction"
  | "create_customer_return"
  | "create_product_with_base_unit"
  | "create_product_with_base_unit_and_initial_stock"
  | "create_supplier_return"
  | "receive_product_stock"
  | "start_stock_opname"
  | "apply_stock_opname"
  | "cancel_stock_opname">;
// Cash-drawer functions share the same trusted server-only RPC boundary.
export type CashDrawerRpcName = "open_cash_drawer" | "close_cash_drawer";
export type ServerRpcName = CoreRpcName | CashDrawerRpcName;
type GeneratedRpcArgs<Name extends ServerRpcName> = Functions[Name]["Args"];
export type CoreRpcArgs<Name extends ServerRpcName> = Name extends "create_customer_return"
  ? Omit<GeneratedRpcArgs<Name>, "p_cash_drawer_session_id"> & { p_cash_drawer_session_id: string | null }
  : GeneratedRpcArgs<Name>;

export async function callCoreRpc<Name extends ServerRpcName>(
  name: Name,
  args: CoreRpcArgs<Name>,
): Promise<Json> {
  const client = createAdminSupabaseClient();
  // Supabase's generated overload is exact per function; this generic wrapper
  // preserves the name/args relationship at its public boundary.
  const rpc = client.rpc.bind(client) as unknown as (
    rpcName: Name,
    rpcArgs: CoreRpcArgs<Name>,
  ) => Promise<{ data: Json | null; error: unknown }>;
  const { data, error } = await rpc(name, args);
  if (error) throw mapDatabaseError(error);
  if (data === null) throw mapDatabaseError(new Error("RPC returned no data"));
  return data;
}
