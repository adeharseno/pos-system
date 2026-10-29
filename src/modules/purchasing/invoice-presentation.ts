export const formatInvoiceAmount = (amount: number) => `Rp ${amount.toLocaleString("id-ID", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
