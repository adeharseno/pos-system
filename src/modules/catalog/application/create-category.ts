import "server-only";

import { deleteCategory, deleteSubcategory, insertCategory, insertSubcategory, updateCategory, updateSubcategory } from "../data/category-repository";

export const createCategory = (name: string) => insertCategory(name);
export const createSubcategory = (categoryId: string, name: string) => insertSubcategory(categoryId, name);
export const editCategory = (id: string, name: string) => updateCategory(id, name);
export const removeCategory = (id: string) => deleteCategory(id);
export const editSubcategory = (id: string, categoryId: string, name: string) => updateSubcategory(id, categoryId, name);
export const removeSubcategory = (id: string) => deleteSubcategory(id);
