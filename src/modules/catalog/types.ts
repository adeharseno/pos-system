export interface CashierProductUnit{ id:string;label:string;conversionToBase:number;displayedUnitPrice:number;barcode:string|null }
export interface CashierProductResult{ id:string;name:string;sku:string;requiresPrescription:boolean;availableStockBase:number;units:CashierProductUnit[] }
