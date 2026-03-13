import type { CategoryConfig, DatasetRow, InnovationProject, ProjectInput } from '../config/types.js';

// ============================================================
// Seeded PRNG (xoshiro128** for reproducibility)
// ============================================================

class SeededRandom {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    this.s[0] = seed >>> 0;
    this.s[1] = (seed * 1812433253 + 1) >>> 0;
    this.s[2] = (this.s[1] * 1812433253 + 1) >>> 0;
    this.s[3] = (this.s[2] * 1812433253 + 1) >>> 0;
    // Warm up
    for (let i = 0; i < 20; i++) this.next();
  }

  next(): number {
    const result = (this.rotl(this.s[1] * 5, 7) * 9) >>> 0;
    const t = this.s[1] << 9;
    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];
    this.s[2] ^= t;
    this.s[3] = this.rotl(this.s[3], 11);
    return result / 0x100000000;
  }

  private rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }

  /** Gaussian via Box-Muller transform */
  gaussian(): number {
    const u1 = Math.max(this.next(), 1e-10);
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================
// Latin Hypercube Sampling
// ============================================================

function latinHypercubeSample(
  inputs: ProjectInput[],
  n: number,
  rng: SeededRandom,
): Record<string, number>[] {
  const k = inputs.length;
  // Create stratified samples for each dimension
  const columns: number[][] = [];
  for (let dim = 0; dim < k; dim++) {
    const { min, max } = inputs[dim].range;
    const stratum: number[] = [];
    for (let j = 0; j < n; j++) {
      const low = min + (j / n) * (max - min);
      const high = min + ((j + 1) / n) * (max - min);
      stratum.push(low + rng.next() * (high - low));
    }
    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [stratum[i], stratum[j]] = [stratum[j], stratum[i]];
    }
    columns.push(stratum);
  }

  // Assemble rows
  const rows: Record<string, number>[] = [];
  for (let j = 0; j < n; j++) {
    const row: Record<string, number> = {};
    for (let dim = 0; dim < k; dim++) {
      row[inputs[dim].name] = columns[dim][j];
    }
    rows.push(row);
  }
  return rows;
}

// ============================================================
// Chemistry Correlation Transfer Functions
// ============================================================

function addNoise(value: number, pct: number, rng: SeededRandom): number {
  const sigma = Math.abs(value) * (pct / 100);
  return value + sigma * rng.gaussian();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeOutputsGeneric(
  inputs: Record<string, number>,
  project: InnovationProject,
  rng: SeededRandom,
): Record<string, number> {
  // Generic output generator: uses input values to produce correlated outputs
  // for any project/category. Each outcome gets a plausible value based on
  // a linear combination of inputs plus noise.
  const inputValues = Object.values(inputs);
  const inputSum = inputValues.reduce((a, b) => a + b, 0);
  const inputMean = inputSum / Math.max(inputValues.length, 1);

  const outputs: Record<string, number> = {};
  for (let i = 0; i < project.outcomes.length; i++) {
    const outcome = project.outcomes[i];
    let base: number;
    const target = outcome.targetValue;

    if (target != null && target > 0) {
      // Use target as center point with input-driven variation
      base = target * (0.85 + 0.3 * (inputValues[i % inputValues.length] ?? inputMean) / Math.max(inputMean, 1));
    } else {
      // Generate from input correlations
      base = inputValues.reduce((sum, v, j) => sum + v * ((j + i + 1) % 3 === 0 ? 0.5 : 0.2), 0);
    }

    const value = addNoise(base, 8, rng);

    // Clamp based on outcome type
    if (outcome.unit === '/10') {
      outputs[outcome.name] = clamp(value, 1, 10);
    } else if (outcome.unit === '%') {
      outputs[outcome.name] = clamp(value, 0, 100);
    } else if (outcome.unit === '$') {
      outputs[outcome.name] = clamp(value, 0.1, 10);
    } else if (outcome.unit === 'mL') {
      outputs[outcome.name] = clamp(value, 50, 500);
    } else if (outcome.unit === 'cP') {
      outputs[outcome.name] = clamp(value, 1000, 200000);
    } else if (outcome.unit === 'months') {
      outputs[outcome.name] = clamp(value, 3, 36);
    } else {
      outputs[outcome.name] = Math.max(0, value);
    }
  }
  return outputs;
}

function isToothpasteProject(project: InnovationProject, index: number): boolean {
  // Detect toothpaste-specific projects by their unique input names
  const inputNames = new Set(project.inputs.map((i) => i.name));
  switch (index) {
    case 0: return inputNames.has('Hydroxyapatite %') && inputNames.has('Activated Charcoal %');
    case 1: return inputNames.has('Hydrogen Peroxide %') && inputNames.has('Alumina %');
    case 2: return inputNames.has('Stannous Fluoride %') && inputNames.has('Calcium Carbonate %');
    case 3: return inputNames.has('Sodium Methyl Cocoyl Taurate %') && inputNames.has('PEG-8 %');
    default: return false;
  }
}

function computeOutputs(
  inputs: Record<string, number>,
  projectIndex: number,
  rng: SeededRandom,
  project?: InnovationProject,
): Record<string, number> {
  // Use generic generator for non-toothpaste projects
  if (project && !isToothpasteProject(project, projectIndex)) {
    return computeOutputsGeneric(inputs, project, rng);
  }

  const get = (name: string) => inputs[name] ?? 0;

  switch (projectIndex) {
    case 0: {
      // Project 1: Gen-Z Probiotic — new_audience
      const haP = get('Hydroxyapatite %');
      const charcoal = get('Activated Charcoal %');
      const aloe = get('Aloe Vera Extract %');
      const capb = get('Cocamidopropyl Betaine %');
      const glycerin = get('Glycerin %');
      const xanthan = get('Xanthan Gum %');
      const mixSpeed = get('Mixing Speed');
      const temp = get('Temperature');

      const remineralization = addNoise(30 + 6.5 * haP + 1.5 * aloe - 0.3 * charcoal, 7, rng);
      const sensory = addNoise(6.5 + 0.15 * haP + 0.3 * aloe + 0.2 * capb - 0.1 * charcoal + 0.02 * glycerin, 5, rng);
      const viscosity = addNoise(60000 + 25000 * xanthan + 500 * glycerin - 40 * mixSpeed, 8, rng);
      const pH = addNoise(7.0 + 0.05 * aloe - 0.02 * charcoal - 0.01 * (temp - 23), 3, rng);
      const cogs = addNoise(0.4 + 0.09 * haP + 0.02 * charcoal + 0.03 * aloe + 0.01 * capb + 0.005 * glycerin, 5, rng);
      const stability = addNoise(20 + 0.3 * glycerin - 0.15 * (temp - 22) + 0.5 * xanthan, 6, rng);

      return {
        'Remineralization Index': clamp(remineralization, 10, 98),
        'Overall Sensory Score': clamp(sensory, 1, 10),
        'Viscosity': clamp(viscosity, 20000, 200000),
        'pH': clamp(pH, 4, 10),
        'COGS per unit': clamp(cogs, 0.2, 3.0),
        'Shelf Stability': clamp(stability, 3, 36),
      };
    }

    case 1: {
      // Project 2: Whitening Boost — performance_optimization
      const h2o2 = get('Hydrogen Peroxide %');
      const alumina = get('Alumina %');
      const silica = get('Hydrated Silica %');
      const tspp = get('Tetrasodium Pyrophosphate %');
      const mixSpeed = get('Mixing Speed');
      const mixTime = get('Mixing Time');
      const temp = get('Temperature');

      const whitening = addNoise(0.5 + 0.7 * h2o2 + 0.25 * alumina + 0.05 * tspp, 8, rng);
      const rda = addNoise(40 + 1.8 * silica + 2.5 * alumina + 0.8 * h2o2 + 0.01 * mixSpeed, 5, rng);
      const fluoride = addNoise(900 - 10 * (h2o2 - 2.0) + 5 * mixTime - 2 * temp, 3, rng);
      const sensory = addNoise(8.0 - 0.02 * Math.max(0, rda - 100) - 0.2 * Math.max(0, h2o2 - 2.5), 5, rng);
      const enamelSafety = addNoise(9.0 - 0.03 * rda - 0.3 * h2o2, 5, rng);
      const viscosity = addNoise(80000 - 50 * mixSpeed + 200 * mixTime + 300 * silica, 7, rng);

      return {
        'Whitening Shade Change': clamp(whitening, 0.3, 5.0),
        'RDA': clamp(rda, 30, 250),
        'Fluoride Release': clamp(fluoride, 500, 1200),
        'Overall Sensory Score': clamp(sensory, 1, 10),
        'Enamel Safety Index': clamp(enamelSafety, 1, 10),
        'Viscosity': clamp(viscosity, 20000, 200000),
      };
    }

    case 2: {
      // Project 3: Cost Reduction — cost_reduction
      const snf2 = get('Stannous Fluoride %');
      const naf = get('Sodium Fluoride %');
      const silica = get('Hydrated Silica %');
      const caco3 = get('Calcium Carbonate %');
      const glycerin = get('Glycerin %');
      const sorbitol = get('Sorbitol %');
      const zincCitrate = get('Zinc Citrate %');
      const capb = get('Cocamidopropyl Betaine %');
      const sls = get('SLS %');
      const mixSpeed = get('Mixing Speed');

      // SnF2 costs $25/kg vs NaF at $8/kg — major cost driver
      const fluorideCost = snf2 * 25 + naf * 8;
      const abrasiveCost = silica * 3.5 + caco3 * 0.8;
      const baseCost = glycerin * 1.5 + sorbitol * 1.2;
      const surfactantCost = capb * 4.5 + sls * 2.0;
      const cogs = addNoise((fluorideCost + abrasiveCost + baseCost + surfactantCost + zincCitrate * 10) / 100 * 0.6 + 0.25, 5, rng);

      const fluorideRelease = addNoise(
        snf2 > 0.1 ? 900 + 300 * snf2 : 850 + 200 * naf + 50 * (mixSpeed - 700) / 100,
        4, rng,
      );
      const antiGingivitis = addNoise(
        snf2 > 0.1 ? 75 + 20 * snf2 + 3 * zincCitrate : 60 + 5 * zincCitrate + 3 * naf * 100,
        6, rng,
      );
      const sensory = addNoise(7.2 + 0.3 * capb - 0.2 * sls - 0.02 * caco3 + 0.01 * glycerin, 5, rng);
      const viscosity = addNoise(85000 + 1000 * silica - 30 * mixSpeed + 500 * glycerin, 7, rng);
      const stability = addNoise(24 + 0.2 * glycerin + 0.1 * sorbitol - 0.1 * (caco3 > 5 ? caco3 - 5 : 0), 5, rng);

      return {
        'COGS per unit': clamp(cogs, 0.15, 1.5),
        'Fluoride Release': clamp(fluorideRelease, 500, 1300),
        'Anti-gingivitis Efficacy': clamp(antiGingivitis, 40, 98),
        'Overall Sensory Score': clamp(sensory, 1, 10),
        'Viscosity': clamp(viscosity, 20000, 200000),
        'Shelf Stability': clamp(stability, 6, 36),
      };
    }

    case 3: {
      // Project 4: SLS-Free — ingredient_substitution
      const sls = get('SLS %');
      const capb = get('Cocamidopropyl Betaine %');
      const smct = get('Sodium Methyl Cocoyl Taurate %');
      const silica = get('Hydrated Silica %');
      const glycerin = get('Glycerin %');
      const peg8 = get('PEG-8 %');
      const mixSpeed = get('Mixing Speed');
      const temp = get('Temperature');

      const foamVolume = addNoise(80 + 80 * sls + 45 * capb + 35 * smct + 0.02 * mixSpeed, 6, rng);
      const sensory = addNoise(6.8 + 0.15 * capb + 0.2 * smct + 0.02 * glycerin + 0.01 * peg8 - 0.1 * Math.max(0, sls - 1), 5, rng);
      const fluoride = addNoise(850 + 5 * silica - 3 * (temp - 24), 3, rng);
      const viscosity = addNoise(75000 + 1500 * silica + 800 * glycerin - 30 * mixSpeed + 500 * peg8, 7, rng);
      const irritation = addNoise(2.0 + 3.0 * sls - 0.5 * capb - 0.3 * smct, 8, rng);
      const cogs = addNoise(0.35 + 0.01 * sls * 2 + 0.015 * capb * 4.5 + 0.02 * smct * 8 + 0.005 * silica * 3.5 + 0.003 * glycerin, 5, rng);

      return {
        'Foam Volume': clamp(foamVolume, 50, 350),
        'Overall Sensory Score': clamp(sensory, 1, 10),
        'Fluoride Release': clamp(fluoride, 500, 1100),
        'Viscosity': clamp(viscosity, 20000, 200000),
        'Skin Irritation Score': clamp(irritation, 1, 10),
        'COGS per unit': clamp(cogs, 0.2, 1.0),
      };
    }

    default:
      return project ? computeOutputsGeneric(inputs, project, rng) : {};
  }
}

// ============================================================
// Failed Experiment Injection
// ============================================================

function injectFailedExperiments(
  rows: DatasetRow[],
  count: number,
  rng: SeededRandom,
): void {
  const indices = new Set<number>();
  while (indices.size < count && indices.size < rows.length) {
    indices.add(Math.floor(rng.next() * rows.length));
  }

  for (const idx of indices) {
    const outputs = rows[idx].outputs;
    const failType = Math.floor(rng.next() * 3);

    switch (failType) {
      case 0: // Phase separation — extreme viscosity
        outputs['Viscosity'] = rng.next() > 0.5 ? 15000 : 250000;
        break;
      case 1: // pH out of bounds
        outputs['pH'] = rng.next() > 0.5 ? 4.5 : 9.5;
        break;
      case 2: // Poor shelf stability
        if ('Shelf Stability' in outputs) {
          outputs['Shelf Stability'] = 3 + rng.next() * 3;
        } else if ('Viscosity' in outputs) {
          outputs['Viscosity'] = 12000;
        }
        break;
    }
  }
}

// ============================================================
// Main Generator
// ============================================================

const ROW_COUNTS = [28, 32, 30, 25]; // per project
const FAILED_COUNTS = [2, 3, 2, 2];

export function generateProjectDatasets(
  config: CategoryConfig,
  seed = 42,
): InnovationProject[] {
  const rng = new SeededRandom(seed);

  return config.projects.map((project, idx) => {
    const n = ROW_COUNTS[idx] ?? 25;
    const failedCount = FAILED_COUNTS[idx] ?? 2;

    // Generate LHS input samples
    const inputSamples = latinHypercubeSample(project.inputs, n, rng);

    // Compute correlated outputs
    const dataset: DatasetRow[] = inputSamples.map((inputs) => ({
      inputs: roundRecord(inputs, 4),
      outputs: roundRecord(computeOutputs(inputs, idx, rng, project), 3),
    }));

    // Inject failed experiments
    injectFailedExperiments(dataset, failedCount, rng);

    return { ...project, dataset };
  });
}

function roundRecord(rec: Record<string, number>, decimals: number): Record<string, number> {
  const factor = 10 ** decimals;
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(rec)) {
    result[key] = Math.round(val * factor) / factor;
  }
  return result;
}

// ============================================================
// CSV Export
// ============================================================

export function datasetToCSV(project: InnovationProject): string {
  if (project.dataset.length === 0) return '';

  const inputNames = project.inputs.map((i) => i.name);
  const outputNames = project.outcomes.map((o) => o.name);
  const headers = [...inputNames, ...outputNames];

  const rows = project.dataset.map((row) => {
    const values = [
      ...inputNames.map((name) => row.inputs[name]?.toString() ?? ''),
      ...outputNames.map((name) => row.outputs[name]?.toString() ?? ''),
    ];
    return values.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ============================================================
// Validation
// ============================================================

export interface ProjectValidationResult {
  valid: boolean;
  errors: string[];
  projectCount: number;
  rowCounts: Record<string, number>;
}

export function validateProjects(projects: InnovationProject[]): ProjectValidationResult {
  const errors: string[] = [];
  const rowCounts: Record<string, number> = {};

  for (const project of projects) {
    rowCounts[project.name] = project.dataset.length;

    if (project.dataset.length < 20) {
      errors.push(`Project "${project.name}": only ${project.dataset.length} rows (expected ≥20)`);
    }

    // Check that all input names appear in dataset rows
    for (const input of project.inputs) {
      const missing = project.dataset.filter((row) => !(input.name in row.inputs));
      if (missing.length > 0) {
        errors.push(`Project "${project.name}": input "${input.name}" missing in ${missing.length} rows`);
      }
    }

    // Check that all outcome names appear in dataset rows
    for (const outcome of project.outcomes) {
      const missing = project.dataset.filter((row) => !(outcome.name in row.outputs));
      if (missing.length > 0) {
        errors.push(`Project "${project.name}": outcome "${outcome.name}" missing in ${missing.length} rows`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    projectCount: projects.length,
    rowCounts,
  };
}

// Self-test when run directly
if (process.argv[1]?.endsWith('projects.ts') || process.argv[1]?.endsWith('projects.js')) {
  const { TOOTHPASTE_CONFIG } = await import('../config/categories/toothpaste.js');
  const projects = generateProjectDatasets(TOOTHPASTE_CONFIG);
  const result = validateProjects(projects);

  console.log(`Projects: ${result.projectCount}`);
  console.log('Row counts:');
  for (const [name, count] of Object.entries(result.rowCounts)) {
    console.log(`  ${name}: ${count} rows`);
  }

  // Print sample row from first project
  if (projects[0]?.dataset?.[0]) {
    console.log('\nSample row (Project 1):');
    console.log('  Inputs:', projects[0].dataset[0].inputs);
    console.log('  Outputs:', projects[0].dataset[0].outputs);
  }

  if (result.valid) {
    console.log('\n✓ All projects valid');
  } else {
    console.error('\n✗ Validation errors:', result.errors);
    process.exit(1);
  }
}
