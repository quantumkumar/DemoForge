import type { CategoryConfig } from '../types.js';

export const CATEGORY_REGISTRY: Record<string, () => Promise<CategoryConfig>> = {
  toothpaste: async () => (await import('./toothpaste.js')).TOOTHPASTE_CONFIG,
  shampoo: async () => (await import('./shampoo.js')).SHAMPOO_CONFIG,
};

export async function loadCategory(name: string): Promise<CategoryConfig> {
  const loader = CATEGORY_REGISTRY[name.toLowerCase()];
  if (!loader) {
    const available = Object.keys(CATEGORY_REGISTRY).join(', ');
    throw new Error(`Unknown category "${name}". Available: ${available}`);
  }
  return loader();
}
