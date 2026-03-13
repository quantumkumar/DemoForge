/**
 * Centralized UI selector map.
 *
 * This file is the SINGLE SOURCE OF TRUTH for all UI selectors.
 * Selectors are populated after running the UI discovery tool:
 *   npx tsx src/index.ts discover --headed
 *
 * Review screenshots in screenshots/discovery-* and update values below.
 * All automation modules import from this file — when the UI changes,
 * only this file needs updating.
 *
 * Selector priority (most to least robust):
 *   1. data-testid attributes
 *   2. aria-label / role-based selectors
 *   3. Text content selectors (text=, has-text=)
 *   4. CSS class selectors (least preferred)
 */

export const SELECTORS = {
  // ── Login ──────────────────────────────────────────────
  login: {
    emailInput: '',
    passwordInput: '',
    submitButton: '',
    dashboardIndicator: '',
  },

  // ── Navigation ─────────────────────────────────────────
  nav: {
    ingredientLibrary: '',
    recipes: '',
    projects: '',
    datasets: '',
  },

  // ── Ingredient Library ─────────────────────────────────
  ingredients: {
    addButton: '',
    nameInput: '',
    inciInput: '',
    categorySelect: '',
    supplierInput: '',
    costInput: '',
    descriptionInput: '',
    propertiesSection: '',
    addPropertyButton: '',
    propertyKeyInput: '',
    propertyValueInput: '',
    regulatoryNotesInput: '',
    saveButton: '',
    cancelButton: '',
    searchInput: '',
    listItem: '',
    listContainer: '',
  },

  // ── Recipes / SKUs ─────────────────────────────────────
  recipes: {
    addButton: '',
    nameInput: '',
    codeInput: '',
    descriptionInput: '',
    demographicInput: '',
    geoInput: '',
    addIngredientButton: '',
    ingredientSearchInput: '',
    ingredientPercentageInput: '',
    ingredientConfirmButton: '',
    addConditionButton: '',
    conditionNameInput: '',
    conditionValueInput: '',
    conditionUnitInput: '',
    addOutcomeButton: '',
    outcomeNameInput: '',
    outcomeValueInput: '',
    outcomeUnitInput: '',
    cogsInput: '',
    retailPriceInput: '',
    saveButton: '',
    cancelButton: '',
    searchInput: '',
    listItem: '',
  },

  // ── Projects ───────────────────────────────────────────
  projects: {
    addButton: '',
    nameInput: '',
    typeSelect: '',
    descriptionInput: '',
    baseSKUSelect: '',
    // Inputs section
    addInputButton: '',
    inputNameInput: '',
    inputTypeSelect: '',
    inputMinInput: '',
    inputMaxInput: '',
    inputUnitInput: '',
    // Outcomes section
    addOutcomeButton: '',
    outcomeNameInput: '',
    outcomeUnitInput: '',
    outcomeDirectionSelect: '',
    outcomeTargetInput: '',
    outcomeImportanceSelect: '',
    // Objectives section
    addObjectiveButton: '',
    objectiveDescriptionInput: '',
    objectiveMetricSelect: '',
    objectiveGoalSelect: '',
    objectiveTargetInput: '',
    objectivePriorityInput: '',
    // Constraints section
    addConstraintButton: '',
    constraintDescriptionInput: '',
    constraintTypeSelect: '',
    constraintParameterInput: '',
    constraintOperatorSelect: '',
    constraintValueInput: '',
    // Dataset
    uploadDatasetButton: '',
    datasetFileInput: '',
    datasetTableContainer: '',
    // Actions
    saveButton: '',
    cancelButton: '',
    searchInput: '',
    listItem: '',
  },

  // ── Common ─────────────────────────────────────────────
  common: {
    loadingSpinner: '',
    toastSuccess: '',
    toastError: '',
    modalOverlay: '',
    modalCloseButton: '',
    confirmDialog: '',
    confirmButton: '',
    paginationNext: '',
    paginationPrev: '',
  },
};
