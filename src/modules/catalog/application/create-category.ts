import "server-only";

import { deleteCategory, deleteSubcategory, insertCategory, insertSubcategory, updateCategory, updateSubcategory } from "../data/category-repository";

export const createCategory = (name: string) => insertCategory(name);
export const createSubcategory = (name: string) => insertSubcategory(name);
export const editCategory = (id: string, name: string) => updateCategory(id, name);
export const removeCategory = (id: string) => deleteCategory(id);
export const editSubcategory = (id: string, name: string) => updateSubcategory(id, name);
export const removeSubcategory = (id: string) => deleteSubcategory(id);
