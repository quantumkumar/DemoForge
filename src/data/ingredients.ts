import type { CategoryConfig, Ingredient, IngredientCategory } from '../config/types.js';

const VALID_CATEGORIES: IngredientCategory[] = [
  'Abrasive', 'Fluoride Source', 'Surfactant', 'Humectant',
  'Binder / Thickener', 'Flavor / Sweetener', 'Preservative',
  'Active Ingredient', 'Colorant', 'pH Adjuster', 'Solvent',
  'Whitening Agent', 'Sensitivity Agent', 'Natural Extract',
];

export interface IngredientValidationResult {
  valid: boolean;
  errors: string[];
  ingredientCount: number;
  categoryCounts: Record<string, number>;
}

export function validateIngredients(ingredients: Ingredient[]): IngredientValidationResult {
  const errors: string[] = [];
  const names = new Set<string>();
  const categoryCounts: Record<string, number> = {};

  for (const ing of ingredients) {
    if (names.has(ing.name)) {
      errors.push(`Duplicate ingredient: "${ing.name}"`);
    }
    names.add(ing.name);

    if (!VALID_CATEGORIES.includes(ing.category)) {
      errors.push(`Invalid category "${ing.category}" for ingredient "${ing.name}"`);
    }

    if (ing.costPerKg <= 0) {
      errors.push(`Invalid cost ${ing.costPerKg} for ingredient "${ing.name}"`);
    }

    categoryCounts[ing.category] = (categoryCounts[ing.category] || 0) + 1;
  }

  return {
    valid: errors.length === 0,
    errors,
    ingredientCount: ingredients.length,
    categoryCounts,
  };
}

export function sortByCategory(ingredients: Ingredient[]): Ingredient[] {
  const order = new Map(VALID_CATEGORIES.map((c, i) => [c, i]));
  return [...ingredients].sort((a, b) => {
    const oa = order.get(a.category) ?? 99;
    const ob = order.get(b.category) ?? 99;
    return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
  });
}

export function prepareIngredients(config: CategoryConfig): Ingredient[] {
  const result = validateIngredients(config.ingredients);
  if (!result.valid) {
    throw new Error(`Ingredient validation failed:\n${result.errors.join('\n')}`);
  }
  return sortByCategory(config.ingredients);
}

// Self-test when run directly
if (process.argv[1]?.endsWith('ingredients.ts') || process.argv[1]?.endsWith('ingredients.js')) {
  const { TOOTHPASTE_CONFIG } = await import('../config/categories/toothpaste.js');
  const result = validateIngredients(TOOTHPASTE_CONFIG.ingredients);
  console.log(`Ingredients: ${result.ingredientCount}`);
  console.log('Categories:', result.categoryCounts);
  if (result.valid) {
    console.log('✓ All ingredients valid');
  } else {
    console.error('✗ Validation errors:', result.errors);
    process.exit(1);
  }
}
