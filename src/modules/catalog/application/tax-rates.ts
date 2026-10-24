import "server-only";
import { createTaxRate, updateTaxRate } from "../data/tax-rate-repository";

export const createTax = (name: string, rate: number) => createTaxRate(name, rate);
export const editTax = (id: string, name: string, rate: number) => updateTaxRate(id, { name, rate });
export const setTaxActive = (id: string, isActive: boolean) => updateTaxRate(id, { is_active: isActive });
