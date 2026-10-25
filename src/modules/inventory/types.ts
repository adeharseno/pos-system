export interface StockOpnameActorInput { employeeId: string; sessionId: string }
export interface StartStockOpnameInput { employeeId: string; storageLocationId?: string }
export interface StockOpnameResult { sessionId: string; status: "in_progress" | "applied" | "cancelled"; itemCount?: number }
export interface UpdateStockOpnameItemInput { sessionId: string; itemId: string; physicalQuantity: number; notes?: string }
