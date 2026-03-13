import { loadCategory } from '../config/categories/index.js';
import { generateProjectDatasets, datasetToCSV } from '../data/projects.js';

async function main() {
  const tpConfig = await loadCategory('toothpaste');
  const projects = generateProjectDatasets(tpConfig, 42);

  for (const p of projects) {
    const csv = datasetToCSV(p);
    const lines = csv.split('\n');
    console.log(`${p.name}: ${lines.length - 1} rows, ${lines[0].split(',').length} columns`);
    console.log(`  Header: ${lines[0].slice(0, 140)}`);
    console.log(`  Row 1:  ${lines[1].slice(0, 140)}`);
  }

  const shConfig = await loadCategory('shampoo');
  const shProjects = generateProjectDatasets(shConfig, 137);
  for (const p of shProjects) {
    const csv = datasetToCSV(p);
    const lines = csv.split('\n');
    console.log(`${p.name}: ${lines.length - 1} rows, ${lines[0].split(',').length} columns`);
    console.log(`  Header: ${lines[0].slice(0, 140)}`);
  }
}

main().catch(console.error);
