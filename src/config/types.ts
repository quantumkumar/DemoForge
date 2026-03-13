// ===== INGREDIENTS =====

export type IngredientCategory =
  | 'Abrasive'
  | 'Fluoride Source'
  | 'Surfactant'
  | 'Humectant'
  | 'Binder / Thickener'
  | 'Flavor / Sweetener'
  | 'Preservative'
  | 'Active Ingredient'
  | 'Colorant'
  | 'pH Adjuster'
  | 'Solvent'
  | 'Whitening Agent'
  | 'Sensitivity Agent'
  | 'Natural Extract';

export interface Ingredient {
  name: string;
  tradeName?: string;
  inci: string;
  category: IngredientCategory;
  supplier?: string;
  costPerKg: number;
  properties: Record<string, string | number>;
  regulatoryNotes?: string;
  description?: string;
}

// ===== SKUs / RECIPES =====

export interface FormulationEntry {
  ingredientName: string;
  percentageW: number;
  role: string;
}

export interface ProcessingCondition {
  name: string;
  value: number;
  unit: string;
  range?: { min: number; max: number };
}

export interface OutcomeMetric {
  name: string;
  value: number;
  unit: string;
  target?: { min?: number; max?: number; ideal?: number };
  higherIsBetter?: boolean;
}

export interface SKU {
  name: string;
  code: string;
  targetDemographic: string;
  targetGeo: string;
  positioningStatement: string;
  formulation: FormulationEntry[];
  processingConditions: ProcessingCondition[];
  outcomes: OutcomeMetric[];
  estimatedCOGS: number;
  retailPrice: number;
}

// ===== PROJECTS =====

export type ProjectType =
  | 'new_audience'
  | 'performance_optimization'
  | 'cost_reduction'
  | 'ingredient_substitution';

export interface ProjectInput {
  name: string;
  type: 'ingredient_percentage' | 'processing_condition';
  range: { min: number; max: number };
  unit?: string;
}

export interface ProjectOutcome {
  name: string;
  unit: string;
  direction: 'maximize' | 'minimize' | 'target';
  targetValue?: number;
  importance: 'primary' | 'secondary' | 'tertiary';
}

export interface ProjectObjective {
  description: string;
  metric: string;
  goal: 'maximize' | 'minimize' | 'target';
  targetValue?: number;
  priority: number;
}

export interface ProjectConstraint {
  description: string;
  type: 'ingredient_limit' | 'cost_limit' | 'regulatory' | 'processing' | 'formulation';
  parameter: string;
  operator: '<=' | '>=' | '==' | 'between';
  value: number | [number, number];
  unit?: string;
}

export interface DatasetRow {
  inputs: Record<string, number>;
  outputs: Record<string, number>;
}

export interface InnovationProject {
  name: string;
  type: ProjectType;
  description: string;
  baseSKU?: string;
  inputs: ProjectInput[];
  outcomes: ProjectOutcome[];
  objectives: ProjectObjective[];
  constraints: ProjectConstraint[];
  dataset: DatasetRow[];
}

// ===== SYSTEM =====

export interface CategoryConfig {
  name: string;
  ingredients: Ingredient[];
  skus: SKU[];
  projects: InnovationProject[];
}

export interface SetupResult {
  section: string;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  screenshotPaths: string[];
  durationMs: number;
}
