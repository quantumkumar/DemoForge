import type { CategoryConfig, SKU } from '../config/types.js';

const EPSILON = 0.01;

export interface SKUValidationResult {
  valid: boolean;
  errors: string[];
  skuCount: number;
  formulationSums: Record<string, number>;
}

export function validateSKUs(config: CategoryConfig): SKUValidationResult {
  const errors: string[] = [];
  const ingredientNames = new Set(config.ingredients.map((i) => i.name));
  const formulationSums: Record<string, number> = {};

  for (const sku of config.skus) {
    // Check formulation sums to 100%
    const sum = sku.formulation.reduce((acc, entry) => acc + entry.percentageW, 0);
    formulationSums[sku.code] = sum;

    if (Math.abs(sum - 100) > EPSILON) {
      errors.push(`SKU ${sku.code} (${sku.name}): formulation sums to ${sum.toFixed(4)}%, expected 100%`);
    }

    // Check ingredient cross-references
    for (const entry of sku.formulation) {
      if (!ingredientNames.has(entry.ingredientName)) {
        errors.push(`SKU ${sku.code}: ingredient "${entry.ingredientName}" not found in library`);
      }
    }

    // Check for duplicate ingredients within a formulation
    const skuIngredients = new Set<string>();
    for (const entry of sku.formulation) {
      if (skuIngredients.has(entry.ingredientName)) {
        errors.push(`SKU ${sku.code}: duplicate ingredient "${entry.ingredientName}"`);
      }
      skuIngredients.add(entry.ingredientName);
    }

    // Check COGS is positive
    if (sku.estimatedCOGS <= 0) {
      errors.push(`SKU ${sku.code}: invalid COGS ${sku.estimatedCOGS}`);
    }
  }

  // Check for duplicate SKU codes
  const codes = new Set<string>();
  for (const sku of config.skus) {
    if (codes.has(sku.code)) {
      errors.push(`Duplicate SKU code: "${sku.code}"`);
    }
    codes.add(sku.code);
  }

  return {
    valid: errors.length === 0,
    errors,
    skuCount: config.skus.length,
    formulationSums,
  };
}

export function prepareSKUs(config: CategoryConfig): SKU[] {
  const result = validateSKUs(config);
  if (!result.valid) {
    throw new Error(`SKU validation failed:\n${result.errors.join('\n')}`);
  }
  return config.skus;
}

// Self-test when run directly
if (process.argv[1]?.endsWith('skus.ts') || process.argv[1]?.endsWith('skus.js')) {
  const { TOOTHPASTE_CONFIG } = await import('../config/categories/toothpaste.js');
  const result = validateSKUs(TOOTHPASTE_CONFIG);
  console.log(`SKUs: ${result.skuCount}`);
  console.log('Formulation sums:');
  for (const [code, sum] of Object.entries(result.formulationSums)) {
    const status = Math.abs(sum - 100) <= EPSILON ? '✓' : '✗';
    console.log(`  ${status} ${code}: ${sum.toFixed(4)}%`);
  }
  if (result.valid) {
    console.log('✓ All SKUs valid');
  } else {
    console.error('✗ Validation errors:', result.errors);
    process.exit(1);
  }
}
