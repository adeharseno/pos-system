export interface OpenCashDrawerInput{employeeId:string;openingBalance:number}
export interface CloseCashDrawerInput{employeeId:string;sessionId:string;actualClosingCash:number}
export interface CurrentCashDrawer{ id:string;employee_id:string;opening_balance:number;opened_at:string;is_open:boolean }
export interface OpenCashDrawerResult{sessionId:string;employeeId:string;openingBalance:number;openedAt:string;isOpen:true}
export interface CloseCashDrawerResult{sessionId:string;openingBalance:number;cashSales:number;cashRefunds:number;expectedCash:number;actualCash:number;difference:number;isOpen:false}
