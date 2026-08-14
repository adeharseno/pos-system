export interface StockOpnameActorInput { employeeId: string; sessionId: string }
export interface StartStockOpnameInput { employeeId: string; storageLocationId?: string }
export interface StockOpnameResult { sessionId: string; status: "in_progress" | "applied" | "cancelled"; itemCount?: number }
