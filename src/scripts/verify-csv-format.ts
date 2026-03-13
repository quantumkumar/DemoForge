/**
 * Quick verification that the new CSV format has FormulationID and Type columns.
 */
import { TOOTHPASTE_CONFIG as toothpaste } from '../config/categories/toothpaste.js';
import { SHAMPOO_CONFIG as shampoo } from '../config/categories/shampoo.js';

function skuToCSV(sku: typeof toothpaste.skus[0], variationCount = 5): string {
  const ingredientNames = sku.formulation.map(f => f.ingredientName);
  const processingNames = sku.processingConditions.map(p => p.name);
  const outcomeNames = sku.outcomes.map(o => o.name);
  const headers = ['FormulationID', 'Type', ...ingredientNames, ...processingNames, ...outcomeNames];

  const rows: string[] = [];
  const baseRow = [
    `${sku.code}-001`, 'Benchmark',
    ...sku.formulation.map(f => String(f.percentageW)),
    ...sku.processingConditions.map(p => String(p.value)),
    ...sku.outcomes.map(o => String(o.value)),
  ];
  rows.push(baseRow.join(','));

  for (let v = 0; v < variationCount; v++) {
    const seed = v * 7 + 13;
    const ingValues = sku.formulation.map((f, idx) => {
      const noise = 1 + ((Math.sin(seed + idx * 3.7) * 0.15));
      return Math.max(0, f.percentageW * noise);
    });
    const sum = ingValues.reduce((a, b) => a + b, 0);
    const normalized = ingValues.map(v => (v / sum) * 100);

    const procValues = sku.processingConditions.map((p, idx) => {
      const noise = 1 + (Math.sin(seed + idx * 5.3) * 0.1);
      const val = p.value * noise;
      if (p.range) return Math.max(p.range.min, Math.min(p.range.max, val));
      return val;
    });

    const outcomeValues = sku.outcomes.map((o, idx) => {
      const noise = 1 + (Math.sin(seed + idx * 4.1) * 0.08);
      return o.value * noise;
    });

    const row = [
      `${sku.code}-${String(v + 2).padStart(3, '0')}`, 'Past formulation',
      ...normalized.map(v => v.toFixed(4)),
      ...procValues.map(v => v.toFixed(2)),
      ...outcomeValues.map(v => v.toFixed(3)),
    ];
    rows.push(row.join(','));
  }

  return [headers.join(','), ...rows].join('\n');
}

// Test first toothpaste and first shampoo SKU
for (const [catName, category] of [['Toothpaste', toothpaste], ['Shampoo', shampoo]] as const) {
  const sku = category.skus[0];
  const csv = skuToCSV(sku);
  const lines = csv.split('\n');
  console.log(`\n=== ${catName}: ${sku.name} (${sku.code}) ===`);
  console.log(`Columns: ${lines[0].split(',').length}`);
  console.log(`Rows: ${lines.length} (1 header + ${lines.length - 1} data)`);
  console.log(`First 2 headers: ${lines[0].split(',').slice(0, 2).join(', ')}`);
  console.log('');
  lines.forEach((line, idx) => {
    const cols = line.split(',');
    if (idx === 0) {
      console.log(`  HEADERS: ${cols.slice(0, 5).join(', ')} ... ${cols.slice(-2).join(', ')}`);
    } else {
      console.log(`  ROW ${idx}: ID=${cols[0]}, Type=${cols[1]}, first3=[${cols.slice(2, 5).join(',')}]`);
    }
  });
}
