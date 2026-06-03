/**
 * Public barrel for task-intent routing, kept as a stable import path. The logic lives in
 * `task-classification.ts` (keyword/metadata → intents) and `rule-selection.ts`
 * (intent + token-budget narrowing over recommendation.json).
 */

export {
  ALL_INTENTS,
  type TaskIntent,
  classifyTaskIntents,
  computeRuleIntents,
} from './task-classification.js'

export { DEFAULT_CONTEXT_TOKEN_BUDGET, pickTaskRelevantRules } from './rule-selection.js'
