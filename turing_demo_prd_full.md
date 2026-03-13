# Turing Labs Demo Auto-Setup: PRD & Claude Code Prompt

## CLAUDE CODE PROMPT

```
You are building a Playwright-based automation system that automatically sets up demo environments on the Turing Labs R&D formulation platform (staging.turingsaas.com). The system takes a product category (e.g., "Toothpaste") and demo objectives, then populates the platform with realistic ingredient libraries, SKU/recipe datasets, and configured innovation projects — all via browser automation.

Read the full PRD below carefully before writing any code. Build the system incrementally: start with the data layer, then login, then each setup module. Test each module independently before integrating.

The platform URL is staging.turingsaas.com. You will need to discover the UI by navigating it — use Playwright's screenshot and inspection capabilities to understand page structure before writing selectors. Build resilient selectors (prefer data-testid, aria-label, role-based selectors over fragile CSS paths).

Key constraints:
- This is a DEMO SETUP tool, not a test suite. Prioritize reliability and idempotency.
- The system must be configurable: swapping "Toothpaste" for "Shampoo" or "Sunscreen" should work with minimal changes (just swap the data config).
- Credential management via .env file, never hardcoded.
- Every action should have proper waits (networkidle, element visibility) — never arbitrary sleep().
- Screenshots at each major step for debugging.
- Comprehensive error handling with clear messages about what failed and where.

Build everything described in the PRD below.
```

---

## PRODUCT REQUIREMENTS DOCUMENT

### 1. Overview

#### 1.1 Problem Statement
Turing Labs sales engineers and solution consultants need to demonstrate the platform's R&D formulation capabilities to prospective customers in the consumer packaged goods (CPG) space. Setting up a realistic demo environment is time-consuming: it requires manually creating ingredient libraries, uploading SKU formulations, and configuring innovation projects with proper objectives, constraints, and goals. This process takes 2-4 hours per demo and is error-prone.

#### 1.2 Solution
An automated demo setup system that uses Playwright browser automation to populate a Turing Labs demo organization with category-specific data. The system accepts a product category and demo scenario configuration, then drives the platform UI to create all necessary artifacts for a compelling live demo.

#### 1.3 Success Criteria
- Full demo environment setup in under 15 minutes (vs. 2-4 hours manual)
- Supports multiple categories (Toothpaste as primary, extensible to Shampoo, Sunscreen, etc.)
- Creates realistic, industry-accurate formulation data
- Sets up all four demo scenarios: new audience targeting, performance optimization, cost reduction, and ingredient substitution
- Idempotent: can be re-run without creating duplicates
- Produces a setup report with screenshots for verification

---

### 2. System Architecture

#### 2.1 Project Structure

```
turing-demo-setup/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── .env.example                    # Template for credentials
├── .env                            # Actual credentials (gitignored)
│
├── src/
│   ├── index.ts                    # Main orchestrator / CLI entry point
│   ├── config/
│   │   ├── types.ts                # TypeScript interfaces for all data structures
│   │   └── categories/
│   │       ├── toothpaste.ts       # Toothpaste category config (primary)
│   │       ├── shampoo.ts          # Shampoo category config (example extension)
│   │       └── index.ts            # Category registry
│   │
│   ├── data/
│   │   ├── ingredients.ts          # Ingredient library generator
│   │   ├── skus.ts                 # SKU/recipe dataset generator
│   │   └── projects.ts             # Project configuration generator
│   │
│   ├── automation/
│   │   ├── browser.ts              # Browser setup, context, screenshot utils
│   │   ├── login.ts                # Authentication flow
│   │   ├── navigation.ts           # Common navigation helpers
│   │   ├── ingredient-setup.ts     # Ingredient library population
│   │   ├── recipe-setup.ts         # SKU/recipe/dataset creation
│   │   ├── project-setup.ts        # Innovation project configuration
│   │   └── selectors.ts            # Centralized UI selectors (easy to update)
│   │
│   ├── discovery/
│   │   └── ui-inspector.ts         # Tool to screenshot & inspect UI for selector discovery
│   │
│   └── utils/
│       ├── logger.ts               # Structured logging
│       ├── retry.ts                # Retry logic for flaky UI operations
│       └── report.ts               # Setup completion report generator
│
├── screenshots/                    # Auto-captured during setup
├── reports/                        # Generated setup reports
└── README.md
```

#### 2.2 Technology Stack
- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Browser Automation**: Playwright
- **CLI**: Commander.js or yargs
- **Logging**: Winston or pino
- **Environment**: dotenv for credential management

---

### 3. Data Layer Specification

This is the heart of the system. The data must be realistic, internally consistent, and representative of real CPG formulation work.

#### 3.1 TypeScript Interfaces

```typescript
// ===== INGREDIENTS =====

interface Ingredient {
  name: string;                    // e.g., "Sodium Fluoride"
  tradeName?: string;              // e.g., "Kohinoor NaF"
  inci: string;                    // INCI name (International Nomenclature)
  category: IngredientCategory;    // Functional category
  supplier?: string;               // e.g., "BASF", "Ashland"
  costPerKg: number;               // USD per kg
  properties: Record<string, string | number>;  // Custom properties
  regulatoryNotes?: string;        // e.g., "Max 0.32% w/w as NaF per FDA"
  description?: string;
}

type IngredientCategory =
  | "Abrasive"
  | "Fluoride Source"
  | "Surfactant"
  | "Humectant"
  | "Binder / Thickener"
  | "Flavor / Sweetener"
  | "Preservative"
  | "Active Ingredient"
  | "Colorant"
  | "pH Adjuster"
  | "Solvent"
  | "Whitening Agent"
  | "Sensitivity Agent"
  | "Natural Extract";

// ===== SKUs / RECIPES =====

interface SKU {
  name: string;                        // e.g., "FreshSmile Kids Bubblegum 4.2oz"
  code: string;                        // e.g., "FS-KIDS-BG-42"
  targetDemographic: string;           // e.g., "Children 3-12"
  targetGeo: string;                   // e.g., "North America"
  positioningStatement: string;        // e.g., "Fun, cavity-fighting paste for kids"
  formulation: FormulationEntry[];     // Ingredient list with percentages
  processingConditions: ProcessingCondition[];
  outcomes: OutcomeMetric[];
  estimatedCOGS: number;              // Cost of goods per unit (USD)
  retailPrice: number;                // Target retail price (USD)
}

interface FormulationEntry {
  ingredientName: string;             // Must match an Ingredient.name
  percentageW: number;                // Weight percentage (all must sum to 100)
  role: string;                       // Role in this specific formulation
}

interface ProcessingCondition {
  name: string;                       // e.g., "Mixing Speed", "Temperature", "Mixing Time"
  value: number;
  unit: string;                       // e.g., "RPM", "°C", "minutes"
  range?: { min: number; max: number };
}

interface OutcomeMetric {
  name: string;                       // e.g., "Fluoride Release (ppm)", "RDA", "Viscosity"
  value: number;
  unit: string;
  target?: { min?: number; max?: number; ideal?: number };
  higherIsBetter?: boolean;
}

// ===== PROJECTS =====

interface InnovationProject {
  name: string;                       // e.g., "Cost Optimization: FreshSmile Whitening"
  type: ProjectType;
  description: string;
  baseSKU?: string;                   // Reference SKU code for optimization projects

  inputs: ProjectInput[];             // Ingredients + processing conditions as variables
  outcomes: ProjectOutcome[];         // What we're measuring
  objectives: ProjectObjective[];     // What we want to achieve
  constraints: ProjectConstraint[];   // Hard limits

  // Dataset: rows of experimental data (real or synthetic)
  dataset: DatasetRow[];
}

type ProjectType =
  | "new_audience"
  | "performance_optimization"
  | "cost_reduction"
  | "ingredient_substitution";

interface ProjectInput {
  name: string;
  type: "ingredient_percentage" | "processing_condition";
  range: { min: number; max: number };
  unit?: string;
}

interface ProjectOutcome {
  name: string;
  unit: string;
  direction: "maximize" | "minimize" | "target";
  targetValue?: number;
  importance: "primary" | "secondary" | "tertiary";
}

interface ProjectObjective {
  description: string;
  metric: string;                     // References an outcome name
  goal: "maximize" | "minimize" | "target";
  targetValue?: number;
  priority: number;                   // 1 = highest priority
}

interface ProjectConstraint {
  description: string;
  type: "ingredient_limit" | "cost_limit" | "regulatory" | "processing" | "formulation";
  parameter: string;
  operator: "<=" | ">=" | "==" | "between";
  value: number | [number, number];
  unit?: string;
}

interface DatasetRow {
  inputs: Record<string, number>;     // ingredientName or conditionName -> value
  outputs: Record<string, number>;    // outcomeName -> measured value
}
```

#### 3.2 Toothpaste Ingredient Library (Complete Data)

The system must create the following ingredients. This is the FULL list — implement all of them.

**Abrasives:**
1. Hydrated Silica — Primary abrasive in most modern pastes. Cost: $3.50/kg. RDA contribution: moderate. Used at 15-25%.
2. Calcium Carbonate — Traditional abrasive, cost-effective. Cost: $0.80/kg. RDA contribution: moderate-high. Used at 20-40%.
3. Dicalcium Phosphate Dihydrate — Gentle abrasive, good compatibility. Cost: $2.20/kg. Used at 15-30%.
4. Alumina (Aluminum Oxide) — Premium abrasive for whitening. Cost: $5.00/kg. High cleaning efficacy. Used at 5-15%.
5. Perlite — Natural volcanic glass, eco-friendly positioning. Cost: $1.80/kg. Used at 5-10%.

**Fluoride Sources:**
6. Sodium Fluoride (NaF) — Standard fluoride source. Cost: $8.00/kg. Max 0.32% w/w per FDA (1000-1100 ppm F). Used at 0.22-0.32%.
7. Sodium Monofluorophosphate (MFP) — Compatible with calcium abrasives. Cost: $12.00/kg. Max 0.76% per FDA. Used at 0.7-0.76%.
8. Stannous Fluoride — Anti-gingivitis + anti-sensitivity + anti-cavity. Cost: $25.00/kg. Used at 0.454%. Premium ingredient.

**Surfactants:**
9. Sodium Lauryl Sulfate (SLS) — Standard foaming agent. Cost: $2.00/kg. Used at 1-2%. Can cause irritation.
10. Cocamidopropyl Betaine — Mild surfactant, SLS-free formulations. Cost: $4.50/kg. Used at 1-3%.
11. Sodium Methyl Cocoyl Taurate — Ultra-mild, premium. Cost: $8.00/kg. Used at 0.5-2%.

**Humectants:**
12. Glycerin — Primary humectant, prevents drying. Cost: $1.50/kg. Used at 20-40%.
13. Sorbitol (70% solution) — Humectant + sweetener. Cost: $1.20/kg. Used at 20-40%.
14. Propylene Glycol — Humectant, solvent. Cost: $2.00/kg. Used at 3-10%.
15. PEG-8 — Humectant for smooth texture. Cost: $3.00/kg. Used at 3-8%.

**Binders / Thickeners:**
16. Carboxymethyl Cellulose (CMC) — Standard binder. Cost: $4.00/kg. Used at 0.5-1.5%.
17. Xanthan Gum — Natural thickener, shear-thinning. Cost: $12.00/kg. Used at 0.3-1.0%.
18. Carbomer 956 — Synthetic thickener, excellent clarity. Cost: $18.00/kg. Used at 0.2-0.8%.
19. Hydroxyethyl Cellulose — Mild thickener. Cost: $6.00/kg. Used at 0.5-1.5%.
20. Cellulose Gum — Natural origin binder. Cost: $5.00/kg. Used at 0.5-1.0%.

**Flavors / Sweeteners:**
21. Peppermint Oil — Classic mint flavor. Cost: $25.00/kg. Used at 0.8-1.5%.
22. Spearmint Oil — Milder mint flavor. Cost: $20.00/kg. Used at 0.8-1.5%.
23. Bubblegum Flavor (artificial) — For kids products. Cost: $15.00/kg. Used at 0.5-1.0%.
24. Sodium Saccharin — Artificial sweetener. Cost: $10.00/kg. Used at 0.1-0.5%.
25. Stevia Extract — Natural sweetener. Cost: $35.00/kg. Used at 0.05-0.2%.
26. Cinnamint Flavor — Specialty flavor. Cost: $22.00/kg. Used at 0.8-1.2%.

**Preservatives:**
27. Sodium Benzoate — Preservative. Cost: $3.50/kg. Used at 0.1-0.5%.
28. Methylparaben — Traditional preservative. Cost: $12.00/kg. Used at 0.1-0.2%.
29. Phenoxyethanol — Paraben-free preservative. Cost: $8.00/kg. Used at 0.5-1.0%.

**Active / Specialty Ingredients:**
30. Potassium Nitrate — Sensitivity relief (5% required for claim). Cost: $6.00/kg.
31. Strontium Chloride — Sensitivity, older technology. Cost: $8.00/kg. Used at 10%.
32. Triclosan — Antibacterial (being phased out in some markets). Cost: $15.00/kg.
33. Zinc Citrate — Anti-tartar, fresh breath. Cost: $10.00/kg. Used at 0.5-2.0%.
34. Hydrogen Peroxide — Whitening active. Cost: $3.00/kg. Used at 1-3%.
35. Activated Charcoal — Trendy whitening ingredient. Cost: $8.00/kg. Used at 1-3%.
36. Hydroxyapatite (nano) — Remineralization, fluoride alternative in some markets. Cost: $45.00/kg. Used at 5-10%.
37. Aloe Vera Extract — Soothing, natural positioning. Cost: $15.00/kg. Used at 0.5-2%.
38. Tea Tree Oil — Natural antibacterial. Cost: $30.00/kg. Used at 0.3-1%.
39. Coenzyme Q10 — Gum health (premium). Cost: $200.00/kg. Used at 0.01-0.05%.
40. Baking Soda (Sodium Bicarbonate) — Whitening, freshness. Cost: $0.50/kg. Used at 20-50%.

**Colorants:**
41. Titanium Dioxide — White opacity. Cost: $5.00/kg. Used at 0.25-1.0%.
42. FD&C Blue No. 1 — Blue colorant. Cost: $40.00/kg. Used at 0.001-0.01%.
43. FD&C Red No. 40 — Red colorant. Cost: $35.00/kg. Used at 0.001-0.01%.
44. Mica (natural) — Shimmer effect. Cost: $12.00/kg. Used at 0.1-0.5%.

**pH Adjusters / Solvents:**
45. Sodium Hydroxide — pH adjuster. Cost: $0.80/kg. Used at 0.1-0.5%.
46. Citric Acid — pH adjuster, natural. Cost: $2.00/kg. Used at 0.1-0.3%.
47. Water (Aqua) — Solvent/base. Cost: $0.01/kg. Used at 15-35%.
48. Tetrasodium Pyrophosphate — Anti-tartar. Cost: $4.00/kg. Used at 1-3%.

#### 3.3 Toothpaste SKU Library (Complete Formulations)

Create these 10 SKUs with full formulations (all percentages must sum to 100%):

**SKU 1: FreshSmile Classic Clean 6.0oz**
- Code: FS-CC-60
- Demographic: General adult, mass market
- Geo: North America
- Positioning: "Reliable everyday cavity protection"
- Formulation: Water 28%, Sorbitol 22%, Hydrated Silica 18%, Glycerin 12%, Sodium Fluoride 0.24%, SLS 1.5%, CMC 1.0%, Peppermint Oil 1.0%, Sodium Saccharin 0.3%, Sodium Benzoate 0.3%, Titanium Dioxide 0.5%, Tetrasodium Pyrophosphate 2.0%, Sodium Hydroxide 0.16%, PEG-8 5.0%, FD&C Blue No. 1 0.005%, Cellulose Gum 0.5%, Propylene Glycol 7.495%
- Processing: Mixing speed 800 RPM, Temperature 25°C, Mixing time 45 min, Vacuum -0.5 bar
- Outcomes: Fluoride Release 850 ppm, RDA 75, Viscosity 85000 cP, pH 7.0, Overall Sensory Score 7.2/10, Shelf Stability 24 months
- COGS: $0.42/unit, Retail: $3.99

**SKU 2: FreshSmile Kids Bubblegum 4.2oz**
- Code: FS-KIDS-BG-42
- Demographic: Children 3-12
- Geo: North America
- Positioning: "Fun cavity-fighting paste kids actually love"
- Formulation: Water 30%, Sorbitol 25%, Hydrated Silica 15%, Glycerin 14%, Sodium Fluoride 0.11% (500 ppm F for kids), Cocamidopropyl Betaine 1.5%, Xanthan Gum 0.8%, Bubblegum Flavor 0.8%, Sodium Saccharin 0.4%, Phenoxyethanol 0.6%, FD&C Red No. 40 0.005%, Mica 0.3%, Cellulose Gum 0.5%, PEG-8 4.0%, Citric Acid 0.1%, Propylene Glycol 5.885%
- Processing: Mixing speed 600 RPM, Temperature 22°C, Mixing time 40 min, Vacuum -0.5 bar
- Outcomes: Fluoride Release 420 ppm, RDA 50, Viscosity 65000 cP, pH 6.8, Overall Sensory Score 8.5/10, Shelf Stability 18 months
- COGS: $0.55/unit, Retail: $4.49

**SKU 3: FreshSmile Sensitive Pro 4.0oz**
- Code: FS-SENS-40
- Demographic: Adults with sensitivity, 25-65
- Geo: North America, Europe
- Positioning: "Clinically proven sensitivity relief"
- Formulation: Water 25%, Glycerin 25%, Sorbitol 15%, Hydrated Silica 12%, Potassium Nitrate 5.0%, Sodium Fluoride 0.25%, Cocamidopropyl Betaine 1.2%, Xanthan Gum 0.6%, Spearmint Oil 1.0%, Sodium Saccharin 0.2%, Phenoxyethanol 0.5%, Titanium Dioxide 0.5%, CMC 0.8%, PEG-8 5.0%, Sodium Hydroxide 0.2%, Propylene Glycol 7.75%
- Processing: Mixing speed 500 RPM, Temperature 23°C, Mixing time 50 min, Vacuum -0.6 bar
- Outcomes: Fluoride Release 920 ppm, RDA 60, Viscosity 95000 cP, pH 7.2, Overall Sensory Score 7.8/10, Dentin Tubule Occlusion 78%, Shelf Stability 24 months
- COGS: $0.68/unit, Retail: $6.99

**SKU 4: FreshSmile Brilliant White 3.5oz**
- Code: FS-BW-35
- Demographic: Young adults 18-35, cosmetic-conscious
- Geo: North America
- Positioning: "Visibly whiter teeth in 2 weeks"
- Formulation: Water 22%, Glycerin 20%, Hydrated Silica 20%, Sorbitol 12%, Hydrogen Peroxide 2.0%, Alumina 5.0%, Sodium Fluoride 0.24%, SLS 1.5%, Carbomer 956 0.5%, Peppermint Oil 1.2%, Sodium Saccharin 0.3%, Sodium Benzoate 0.3%, Titanium Dioxide 0.8%, Sodium Hydroxide 0.4%, PEG-8 5.0%, Tetrasodium Pyrophosphate 2.0%, Propylene Glycol 6.76%
- Processing: Mixing speed 700 RPM, Temperature 20°C, Mixing time 35 min, Vacuum -0.7 bar
- Outcomes: Fluoride Release 880 ppm, RDA 120, Viscosity 78000 cP, pH 6.5, Overall Sensory Score 7.5/10, Whitening Shade Change 2.1 delta-E, Shelf Stability 18 months
- COGS: $0.82/unit, Retail: $7.99

**SKU 5: FreshSmile Natural Botanicals 5.5oz**
- Code: FS-NAT-55
- Demographic: Health-conscious adults 25-50
- Geo: North America, Western Europe
- Positioning: "Nature's way to a healthy smile"
- Formulation: Water 30%, Glycerin 22%, Calcium Carbonate 20%, Sorbitol 10%, Aloe Vera Extract 1.5%, Tea Tree Oil 0.5%, Hydroxyapatite 5.0%, Cocamidopropyl Betaine 1.5%, Xanthan Gum 0.8%, Peppermint Oil 1.0%, Stevia Extract 0.1%, Phenoxyethanol 0.6%, Cellulose Gum 0.5%, Citric Acid 0.2%, Sodium Hydroxide 0.1%, Propylene Glycol 5.7%
- Processing: Mixing speed 600 RPM, Temperature 22°C, Mixing time 55 min, Vacuum -0.5 bar
- Outcomes: Fluoride Release 0 ppm (fluoride-free), RDA 65, Viscosity 82000 cP, pH 7.5, Overall Sensory Score 7.0/10, Remineralization Index 72%, Shelf Stability 18 months
- COGS: $1.15/unit, Retail: $9.99

**SKU 6: FreshSmile Total Care 6.0oz**
- Code: FS-TC-60
- Demographic: Adults 30-60, premium mass market
- Geo: Global
- Positioning: "Complete protection for the whole family"
- Formulation: Water 26%, Glycerin 20%, Sorbitol 18%, Hydrated Silica 16%, Stannous Fluoride 0.454%, Zinc Citrate 1.5%, Cocamidopropyl Betaine 1.5%, CMC 1.0%, Spearmint Oil 1.0%, Sodium Saccharin 0.2%, Sodium Benzoate 0.3%, Titanium Dioxide 0.5%, PEG-8 5.0%, Sodium Hydroxide 0.3%, Cellulose Gum 0.5%, Tetrasodium Pyrophosphate 1.5%, Propylene Glycol 5.746%
- Processing: Mixing speed 700 RPM, Temperature 24°C, Mixing time 50 min, Vacuum -0.6 bar
- Outcomes: Fluoride Release 1050 ppm, RDA 80, Viscosity 90000 cP, pH 6.8, Overall Sensory Score 7.6/10, Anti-gingivitis Efficacy 82%, Shelf Stability 24 months
- COGS: $0.95/unit, Retail: $5.99

**SKU 7: FreshSmile Charcoal Detox 4.0oz**
- Code: FS-CHAR-40
- Demographic: Millennials/Gen-Z 18-30
- Geo: North America, Asia-Pacific
- Positioning: "Deep clean detox for a fresh start"
- Formulation: Water 28%, Glycerin 22%, Hydrated Silica 14%, Sorbitol 15%, Activated Charcoal 2.5%, Sodium Fluoride 0.24%, Cocamidopropyl Betaine 1.5%, Xanthan Gum 0.7%, Cinnamint Flavor 1.0%, Sodium Saccharin 0.2%, Phenoxyethanol 0.5%, PEG-8 4.0%, Cellulose Gum 0.5%, Citric Acid 0.15%, Propylene Glycol 9.21%
- Processing: Mixing speed 800 RPM, Temperature 23°C, Mixing time 40 min, Vacuum -0.5 bar
- Outcomes: Fluoride Release 860 ppm, RDA 95, Viscosity 72000 cP, pH 6.9, Overall Sensory Score 7.3/10, Stain Removal Index 85%, Shelf Stability 18 months
- COGS: $0.72/unit, Retail: $6.49

**SKU 8: FreshSmile Value Protect 8.0oz**
- Code: FS-VP-80
- Demographic: Budget-conscious families
- Geo: India, Southeast Asia, Latin America
- Positioning: "Trusted cavity protection for the whole family"
- Formulation: Water 32%, Sorbitol 25%, Calcium Carbonate 25%, Glycerin 8%, Sodium Monofluorophosphate 0.76%, SLS 1.5%, CMC 1.2%, Peppermint Oil 0.5%, Sodium Saccharin 0.3%, Sodium Benzoate 0.4%, Titanium Dioxide 0.3%, Cellulose Gum 0.5%, Sodium Hydroxide 0.1%, Propylene Glycol 4.44%
- Processing: Mixing speed 900 RPM, Temperature 25°C, Mixing time 35 min, Vacuum -0.4 bar
- Outcomes: Fluoride Release 780 ppm, RDA 90, Viscosity 70000 cP, pH 7.1, Overall Sensory Score 6.5/10, Shelf Stability 30 months
- COGS: $0.18/unit, Retail: $1.49

**SKU 9: FreshSmile Premium Repair 3.0oz**
- Code: FS-PR-30
- Demographic: Affluent adults 35-65
- Geo: Japan, South Korea, Western Europe
- Positioning: "Advanced enamel repair technology"
- Formulation: Water 22%, Glycerin 25%, Sorbitol 12%, Hydrated Silica 10%, Hydroxyapatite 8.0%, Coenzyme Q10 0.03%, Sodium Fluoride 0.25%, Sodium Methyl Cocoyl Taurate 1.5%, Carbomer 956 0.6%, Spearmint Oil 1.2%, Stevia Extract 0.1%, Phenoxyethanol 0.5%, Titanium Dioxide 0.3%, PEG-8 5.0%, Xanthan Gum 0.5%, Sodium Hydroxide 0.2%, Propylene Glycol 12.82%
- Processing: Mixing speed 500 RPM, Temperature 20°C, Mixing time 60 min, Vacuum -0.7 bar
- Outcomes: Fluoride Release 950 ppm, RDA 45, Viscosity 100000 cP, pH 7.3, Overall Sensory Score 8.2/10, Remineralization Index 88%, Enamel Hardness Improvement 12%, Shelf Stability 24 months
- COGS: $2.40/unit, Retail: $14.99

**SKU 10: FreshSmile Baking Soda Fresh 6.0oz**
- Code: FS-BS-60
- Demographic: Adults 40-70, traditional preferences
- Geo: North America
- Positioning: "Old-fashioned freshness, modern protection"
- Formulation: Water 20%, Glycerin 15%, Baking Soda 30%, Sorbitol 12%, Hydrated Silica 8%, Sodium Monofluorophosphate 0.76%, SLS 1.2%, CMC 1.0%, Peppermint Oil 0.8%, Sodium Saccharin 0.3%, Sodium Benzoate 0.3%, Hydrogen Peroxide 1.0%, Titanium Dioxide 0.5%, Cellulose Gum 0.5%, Propylene Glycol 8.64%
- Processing: Mixing speed 700 RPM, Temperature 23°C, Mixing time 40 min, Vacuum -0.5 bar
- Outcomes: Fluoride Release 800 ppm, RDA 110, Viscosity 68000 cP, pH 8.2, Overall Sensory Score 6.8/10, Whitening Shade Change 1.5 delta-E, Shelf Stability 24 months
- COGS: $0.35/unit, Retail: $3.49

#### 3.4 Innovation Projects (4 Projects)

**Project 1: New Audience — "Gen-Z Probiotic Toothpaste"**
- Type: new_audience
- Description: "Develop a new toothpaste SKU targeting Gen-Z consumers (18-25) who prioritize gut-health, microbiome-friendly, and 'clean beauty' positioning. Must be SLS-free, fluoride-optional, Instagram-worthy packaging appeal. Explore hydroxyapatite as fluoride alternative."
- Base SKU: None (new development)
- Inputs (variables to optimize):
  - Hydroxyapatite %: range 3-10%
  - Activated Charcoal %: range 0-3%
  - Aloe Vera Extract %: range 0.5-3%
  - Cocamidopropyl Betaine %: range 1-3%
  - Glycerin %: range 18-30%
  - Xanthan Gum %: range 0.3-1.2%
  - Mixing Speed: range 400-800 RPM
  - Temperature: range 18-28°C
- Outcomes to measure:
  - Remineralization Index (%) — maximize, primary
  - Overall Sensory Score (1-10) — maximize, primary
  - Viscosity (cP) — target 75000, secondary
  - pH — target 7.0, secondary
  - COGS per unit ($) — minimize, tertiary
  - Shelf Stability (months) — maximize, tertiary
- Objectives (priority ordered):
  1. Maximize Remineralization Index above 75%
  2. Achieve Sensory Score above 8.0
  3. Keep COGS below $1.50/unit
  4. Achieve shelf stability of at least 18 months
- Constraints:
  - Total formulation must sum to 100%
  - No SLS (0% Sodium Lauryl Sulfate)
  - Hydroxyapatite minimum 5% for efficacy claim
  - pH between 6.5 and 7.5
  - Viscosity between 60000 and 90000 cP
  - COGS ≤ $1.50/unit
- Dataset: Generate 25-30 synthetic experimental rows with realistic variance. Rows should show correlation patterns (e.g., more hydroxyapatite → higher remineralization but higher cost; higher mixing speed → better dispersion but can degrade actives).

**Project 2: Performance Optimization — "Whitening Boost for FreshSmile Brilliant White"**
- Type: performance_optimization
- Description: "Improve the whitening efficacy of the existing Brilliant White SKU (FS-BW-35) by at least 30% (from 2.1 to 2.7+ delta-E shade change) while maintaining or improving sensory scores and staying within regulatory limits."
- Base SKU: FS-BW-35
- Inputs (variables to optimize):
  - Hydrogen Peroxide %: range 1.0-3.0%
  - Alumina %: range 3-8%
  - Hydrated Silica %: range 15-25%
  - Tetrasodium Pyrophosphate %: range 1-4%
  - Mixing Speed: range 500-900 RPM
  - Mixing Time: range 25-50 min
  - Temperature: range 18-25°C
- Outcomes to measure:
  - Whitening Shade Change (delta-E) — maximize, primary
  - RDA (Radioactive Dentin Abrasion) — target ≤ 150 (regulatory limit), primary
  - Fluoride Release (ppm) — target ≥ 850, secondary
  - Overall Sensory Score (1-10) — maximize, secondary
  - Enamel Safety Index (1-10) — maximize, secondary
  - Viscosity (cP) — target 75000, tertiary
- Objectives (priority ordered):
  1. Maximize whitening shade change to ≥ 2.7 delta-E
  2. Keep RDA below 150 (hard regulatory limit; below 120 preferred)
  3. Maintain sensory score ≥ 7.5
  4. Maintain fluoride release ≥ 850 ppm
- Constraints:
  - Hydrogen Peroxide ≤ 3.0% (regulatory limit)
  - RDA ≤ 150 (ISO 11609)
  - pH between 5.5 and 7.0 (peroxide stability)
  - Total abrasive content (Hydrated Silica + Alumina) ≤ 30%
  - COGS increase ≤ 15% over current ($0.82 → max $0.94)
- Dataset: Generate 30-35 synthetic rows based on current formulation with variations showing trade-offs between whitening efficacy and abrasiveness.

**Project 3: Cost Reduction — "Value Engineering FreshSmile Total Care"**
- Type: cost_reduction
- Description: "Reduce the COGS of FreshSmile Total Care (FS-TC-60) by at least 20% (from $0.95 to ≤$0.76/unit) while maintaining all performance claims and sensory attributes within acceptable bounds."
- Base SKU: FS-TC-60
- Inputs (variables to optimize):
  - Stannous Fluoride %: range 0-0.454% (explore switching to NaF at 0.24%)
  - Sodium Fluoride %: range 0-0.32% (alternative to SnF2)
  - Hydrated Silica %: range 12-20%
  - Calcium Carbonate %: range 0-10% (cheaper abrasive substitute)
  - Glycerin %: range 15-25%
  - Sorbitol %: range 15-25%
  - Zinc Citrate %: range 0.5-2.0%
  - Cocamidopropyl Betaine %: range 0-2% (vs. switching to SLS)
  - SLS %: range 0-2% (cheaper surfactant option)
  - Mixing Speed: range 600-1000 RPM
- Outcomes to measure:
  - COGS per unit ($) — minimize, primary
  - Fluoride Release (ppm) — target ≥ 900, primary
  - Anti-gingivitis Efficacy (%) — maximize, secondary
  - Overall Sensory Score (1-10) — target ≥ 7.0, secondary
  - Viscosity (cP) — target 85000, tertiary
  - Shelf Stability (months) — target ≥ 24, tertiary
- Objectives (priority ordered):
  1. Minimize COGS to ≤ $0.76/unit
  2. Maintain fluoride release ≥ 900 ppm
  3. Maintain anti-gingivitis efficacy ≥ 75%
  4. Keep sensory score ≥ 7.0
- Constraints:
  - Must contain a fluoride source (regulatory requirement for cavity claim)
  - Fluoride release ≥ 850 ppm minimum
  - Anti-gingivitis efficacy ≥ 70% (minimum for marketing claim)
  - Sensory score ≥ 6.5 (hard minimum)
  - Shelf stability ≥ 18 months
  - Total formulation = 100%
- Dataset: Generate 30 rows exploring cost/performance trade-offs, especially around the SnF2→NaF switch and silica→calcium carbonate substitution.

**Project 4: Ingredient Substitution — "SLS-Free Reformulation of FreshSmile Classic Clean"**
- Type: ingredient_substitution
- Description: "Reformulate FreshSmile Classic Clean (FS-CC-60) to be SLS-free in response to consumer demand for gentler formulations. Evaluate Cocamidopropyl Betaine and Sodium Methyl Cocoyl Taurate as replacements. Maintain foaming performance, sensory experience, and cost within 10% of original."
- Base SKU: FS-CC-60
- Inputs (variables to optimize):
  - SLS %: range 0-1.5% (goal: reduce to 0)
  - Cocamidopropyl Betaine %: range 0-3%
  - Sodium Methyl Cocoyl Taurate %: range 0-2%
  - Hydrated Silica %: range 16-22%
  - Glycerin %: range 10-18%
  - PEG-8 %: range 3-7%
  - Mixing Speed: range 600-1000 RPM
  - Temperature: range 20-28°C
- Outcomes to measure:
  - Foam Volume (mL) — target ≥ 180 (current: 200), primary
  - Overall Sensory Score (1-10) — maximize, primary
  - Fluoride Release (ppm) — target ≥ 830, secondary
  - Viscosity (cP) — target 82000, secondary
  - Skin Irritation Score (1-10, lower is better) — minimize, secondary
  - COGS per unit ($) — minimize, tertiary
- Objectives (priority ordered):
  1. Achieve 0% SLS while maintaining foam volume ≥ 180 mL
  2. Keep sensory score ≥ 7.0 (current: 7.2)
  3. Minimize skin irritation score
  4. Keep COGS within 10% of current ($0.42 → max $0.46)
- Constraints:
  - SLS = 0% (hard constraint for "SLS-Free" claim)
  - Foam volume ≥ 150 mL (minimum acceptable)
  - COGS ≤ $0.50/unit (hard ceiling)
  - Fluoride release ≥ 800 ppm
  - pH between 6.5 and 7.5
  - Total surfactant load ≤ 4%
  - Total formulation = 100%
- Dataset: Generate 25 rows comparing SLS vs. alternatives with realistic foam/cost/irritation trade-offs.

---

### 4. Automation Layer Specification

#### 4.1 Browser & Authentication Module

```
Module: browser.ts
- Launch Playwright Chromium in headed mode (for demo visibility) with option for headless
- Set viewport to 1920x1080
- Enable request interception for debugging
- Screenshot utility: capture at each major step, save to screenshots/ with timestamp

Module: login.ts
- Navigate to staging.turingsaas.com
- Handle login flow (email/password from .env)
- Wait for dashboard to fully load
- Verify successful login by checking for expected dashboard elements
- Handle MFA if present (pause and prompt user)
```

#### 4.2 UI Discovery & Selector Strategy

**CRITICAL: The automation must discover the UI dynamically.**

The system should include a `ui-inspector.ts` discovery tool that:
1. Navigates to each major section of the platform
2. Takes full-page screenshots
3. Captures the DOM structure of key interactive elements
4. Outputs a selector map that the automation modules use

**Selector Priority (most to least robust):**
1. `data-testid` attributes
2. `aria-label` or `role` attributes
3. Text content selectors (`text=`, `has-text=`)
4. CSS class selectors (least preferred, most fragile)

**All selectors must be centralized in `selectors.ts`** so updating them when the UI changes requires editing only one file.

#### 4.3 Ingredient Library Setup

```
Module: ingredient-setup.ts

Flow:
1. Navigate to Ingredient Library section
2. For each ingredient in the category config:
   a. Click "Add Ingredient" (or equivalent)
   b. Fill in: name, INCI name, category, supplier, cost/kg
   c. Add custom properties
   d. Add regulatory notes if present
   e. Save
   f. Verify ingredient appears in library
   g. Screenshot
3. Handle duplicates: check if ingredient already exists before creating
4. Log progress: "Created ingredient 15/48: Sodium Fluoride"
```

#### 4.4 Recipe/SKU/Dataset Setup

```
Module: recipe-setup.ts

Flow:
1. Navigate to Recipe/Dataset section
2. For each SKU in the category config:
   a. Create new recipe/formulation
   b. Set metadata: name, code, description/positioning
   c. Add ingredients with percentages (link to library entries)
   d. Add processing conditions
   e. Add outcome metrics
   f. Save
   g. Verify recipe appears in list
   h. Screenshot
3. If the platform uses a "dataset" concept (table of experiments):
   a. Create dataset with columns matching inputs + outcomes
   b. Populate rows from each SKU + synthetic variations
```

#### 4.5 Project Setup

```
Module: project-setup.ts

Flow for each project:
1. Navigate to Projects section
2. Click "New Project"
3. Set project name and description
4. Configure Inputs:
   a. Add each input variable with name, type, range
   b. Link to ingredients from library where applicable
5. Configure Outcomes:
   a. Add each outcome metric with name, unit, direction
6. Configure Objectives:
   a. Add each objective with its goal (max/min/target)
   b. Set priority ordering
7. Configure Constraints:
   a. Add each constraint with parameter, operator, value
8. Upload/Enter Dataset:
   a. If the platform supports CSV upload: generate CSV from dataset rows, upload
   b. If manual entry: enter rows programmatically
9. Save project
10. Screenshot final configuration
11. Optionally: trigger optimization run
```

#### 4.6 Error Handling & Resilience

```
Module: retry.ts

- Wrap every UI action in retry logic (max 3 attempts)
- Between retries: refresh page, re-navigate to section
- On final failure: screenshot, log error with full context, continue to next item
- Never use arbitrary sleep() — always wait for specific conditions:
  - page.waitForLoadState('networkidle')
  - page.waitForSelector(selector, { state: 'visible' })
  - page.waitForResponse() for API calls
```

#### 4.7 Reporting

```
Module: report.ts

After setup completes, generate a markdown report:
- Summary: X ingredients, Y SKUs, Z projects created
- Per-section details with screenshots
- Any failures with error details
- Time taken per section and total
- Verification checklist
```

---

### 5. CLI Interface

```bash
# Full setup
npx ts-node src/index.ts setup --category toothpaste --headed

# Setup specific section only
npx ts-node src/index.ts setup --category toothpaste --only ingredients
npx ts-node src/index.ts setup --category toothpaste --only recipes
npx ts-node src/index.ts setup --category toothpaste --only projects

# Discovery mode (screenshot UI, suggest selectors)
npx ts-node src/index.ts discover --headed

# Cleanup (remove all demo data)
npx ts-node src/index.ts cleanup --category toothpaste

# Dry run (validate data, don't touch browser)
npx ts-node src/index.ts validate --category toothpaste
```

**Environment Variables (.env):**
```
TURING_URL=https://staging.turingsaas.com
TURING_EMAIL=demo@company.com
TURING_PASSWORD=secretpassword
HEADED=true
SCREENSHOT_DIR=./screenshots
SLOW_MO=100
```

---

### 6. Synthetic Dataset Generation Logic

For each project's dataset, generate realistic experimental data following these principles:

1. **Start from base formulation**: Use the base SKU formulation as the center point
2. **Latin Hypercube Sampling**: Distribute variations across the input space efficiently
3. **Realistic correlations**: Encode known chemistry relationships:
   - Higher abrasive % → higher RDA, higher whitening, higher COGS
   - More humectant → better shelf stability, lower viscosity
   - Hydroxyapatite % → higher remineralization, significantly higher COGS
   - Higher mixing speed → better dispersion (lower viscosity variance), can degrade heat-sensitive actives
   - Higher temperature → faster dissolution but can degrade peroxide/sensitive actives
   - SLS removal → lower foam volume, lower irritation
4. **Add realistic noise**: ±5-10% random variation on outcomes to simulate real lab measurements
5. **Include some "failed" experiments**: A few rows with out-of-spec results (e.g., phase separation indicated by extreme viscosity, poor stability)

---

### 7. Extensibility Design

The system must be designed so that creating a new category requires ONLY:

1. Creating a new file in `src/config/categories/` (e.g., `shampoo.ts`)
2. Defining the ingredient list, SKUs, and project configs using the same TypeScript interfaces
3. Registering it in the category index

No automation code should need to change. The automation layer reads from the data layer generically.

---

### 8. Testing Strategy

1. **Data validation tests**: Verify all formulations sum to 100%, all ingredient references resolve, all constraints are consistent
2. **Dry run mode**: Validate everything without browser
3. **Module-level tests**: Each automation module can be run independently
4. **Screenshot comparison**: Optional visual regression (store baseline screenshots, compare on subsequent runs)

---

### 9. Implementation Priority

1. **Phase 1**: Data layer (types, toothpaste config, dataset generation) — no browser needed
2. **Phase 2**: Browser setup + login + UI discovery
3. **Phase 3**: Ingredient library automation
4. **Phase 4**: Recipe/SKU automation
5. **Phase 5**: Project setup automation
6. **Phase 6**: CLI, reporting, error handling polish
7. **Phase 7**: Second category (shampoo) to validate extensibility
