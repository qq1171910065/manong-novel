import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcPath = path.join(root, 'src/renderer/src/services/novel/writing-service.ts')
const outDir = path.join(root, 'src/renderer/src/services/novel/writing')

const lines = fs.readFileSync(srcPath, 'utf8').split('\n')
const importBlock = lines.slice(0, 229).join('\n')

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n')
}

const modules = {
  'types.ts': `// Auto-split from writing-service.ts
${slice(239, 248)}

${slice(2152, 2158)}

${slice(2272, 2294)}
`,

  'constants.ts': `// Auto-split from writing-service.ts
${slice(230, 237)}

${slice(562, 567)}

${slice(715, 715)}

${slice(2296, 2303)}
`,

  'dialogue-utils.ts': `// Auto-split from writing-service.ts
import type { ConversationMessage, UIControl } from '@shared/novel/types'
import {
  parseBestConversationJsonObject,
  resolveDisplayAiMessage,
  extractLooseConversationState,
} from '../json-utils'
import { resolveUiControl } from '@renderer/novel/utils/chat-options'
import { CHARACTER_JSON_EXAMPLE } from '@shared/novel/blueprint-material-schemas'
import type { ConceptConversationState } from '@shared/novel/concept-checklist'

${slice(550, 560)}

${slice(593, 662)}

${slice(686, 702)}

export function resolveModelConceptState(
  raw: string,
  parsed: Record<string, unknown>
): ConceptConversationState {
  const fromParsed = parsed.conversation_state
  if (fromParsed && typeof fromParsed === 'object' && !Array.isArray(fromParsed)) {
    return fromParsed as ConceptConversationState
  }
  return extractLooseConversationState(raw) as ConceptConversationState
}
`,

  'chat-core.ts': `// Auto-split from writing-service.ts
${importBlock}
import { STREAM_TIMEOUT_MS, STREAM_EMIT_INTERVAL_MS } from './constants'
import type { ChatStreamHandlers, ChatStreamStatus } from './types'

${slice(250, 271)}

export function buildGatewayMessages(
  systemPrompt: string,
  conversation: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  const system = systemPrompt.trim()
  const turns = conversation
    .filter((m) => m && m.role && String(m.content ?? '').trim())
    .map((m) => ({ role: String(m.role), content: String(m.content).trim() }))

  if (!system) return turns
  if (!turns.length) return [{ role: 'user', content: system }]

  const [first, ...rest] = turns
  if (first.role === 'user') {
    return [{ role: 'user', content: \`\${system}\\n\\n---\\n\\n\${first.content}\` }, ...rest]
  }

  return [{ role: 'user', content: system }, first, ...rest]
}

${slice(294, 548)}

${slice(569, 591)}
`,
}

// concept-dialogue - needs custom imports
modules['concept-dialogue.ts'] = `// Auto-split from writing-service.ts
import conceptPrompt from '@shared/novel/prompts/concept.md?raw'
import { gatewayChatCompletion } from '@renderer/services/gateway-api'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import { resolveProjectChatModelId } from '../project-model'
import {
  parseLlmJsonObjectValidated,
} from '../json-utils'
import type {
  ConverseResponse,
  ConversationMessage,
  NovelProject,
} from '@shared/novel/types'
import {
  CONCEPT_REFINEMENT_SYSTEM,
  CONCEPT_GATEWAY_TOOLS,
  assertConceptRefinementSucceeded,
  buildConceptRefinementRetrySystem,
  buildConceptRefinementUserPrompt,
  extractConceptToolCallsFromModelOutput,
  executeConceptToolCalls,
  listMissingConceptFields,
  normalizeConceptToolCalls,
  parseNativeGatewayConceptToolCalls,
  type ConceptToolCall,
} from '@shared/novel/concept-refinement'
import {
  appendConceptCommit,
  countConceptTurns,
  createConceptCommit,
  projectConceptStateFromCommits,
  resolveProjectConceptState,
} from '@shared/novel/story-system'
import { resolveWritingMode, SIMPLE_CONCEPT_SUPPLEMENT } from '@shared/novel/writing-mode'
import {
  deriveLockedFields,
  detectUserEditTopics,
  normalizeChecklist,
  resolvePendingTopicAfterResponse,
  collectUserTextsFromHistory,
  type ConceptChecklistKey,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import { buildConceptMaterialPromptSupplement } from '../material-library-apply'
import { LONG_STREAM_TIMEOUT_MS, REFINEMENT_MAX_ATTEMPTS } from './constants'
import { chat, buildGatewayMessages, projectChatOpts } from './chat-core'
import type { ConversationRequestOptions } from './types'
import {
  CONCEPT_DIALOGUE_JSON_INSTRUCTION,
  parseJsonBlock,
  resolveAiMessage,
  parseUiControl,
  resolveModelConceptState,
} from './dialogue-utils'

${slice(717, 822)}

${slice(824, 882)}

${slice(884, 1052)}
`

// section-polish
modules['section-polish.ts'] = `// Auto-split from writing-service.ts
import blueprintReinspirationPrompt from '@shared/novel/prompts/blueprint_reinspiration.md?raw'
import sectionPolishPrompt from '@shared/novel/prompts/section_polish.md?raw'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import {
  extractAllLlmJsonObjects,
  parseChapterOutlineFromLlm,
} from '../json-utils'
import type {
  Blueprint,
  Character,
  ConversationMessage,
  NovelProject,
  SectionPolishResponse,
  SectionPolishMaterializeResponse,
} from '@shared/novel/types'
import type { SectionPolishContext } from '@renderer/novel/utils/section-polish'
import {
  applyCharacterBatchResult,
  buildCharacterBatchMaterializeInstruction,
  buildCharacterBatchRanges,
  extractCharacterBatchTargetFromHistory,
  isCharacterBatchContinuationRequest,
  resolveCharacterBatchIntent,
  resolveBaseCharactersForBatchContinuation,
  resolveEffectiveCharacterCountForBatch,
  type CharacterBatchIntent,
} from '@renderer/novel/utils/section-polish-batch'
import { sanitizeMaterialCharacters } from '@shared/novel/blueprint-material-schemas'
import {
  buildCharacterBatchSystemPrompt,
  CHARACTER_MATERIALIZE_JSON_EXAMPLE,
  parseMaterializePayloadRobust,
} from '@renderer/novel/utils/section-polish-materialize-parse'
import { polishDebug, polishDebugWarn } from '@renderer/novel/utils/section-polish-debug'
import {
  buildPolishMaterializeChoiceControl,
  coalescePolishBlueprintUpdates,
  extractLastPolishUserText,
  extractPolishAssistantPlanFromHistory,
  hasValidPolishBlueprintUpdates,
  isPolishSystemHintMessage,
  isVaguePolishUserRequest,
  looksLikePolishAppliedClaim,
  normalizeAffectedSections,
  polishVagueInputHintForSection,
  normalizePolishScopeMode,
  POLISH_SCOPE_LABELS,
  POLISH_WORKFLOW_LABELS,
  resolvePolishScopeMode,
  shouldAutoMaterializePolish,
  type PolishScopeMode,
  type PolishWorkflowMode,
} from '@renderer/novel/utils/section-polish'
import { cloneJson } from '@shared/clone-json'
import { isUnresolvedPolishAiMessage } from '../json-utils'
import { chat, projectChatOpts } from './chat-core'
import type { ConversationRequestOptions } from './types'
import {
  SECTION_POLISH_JSON_INSTRUCTION,
  MATERIALIZE_POLISH_INSTRUCTION,
  parseJsonBlock,
  resolveAiMessage,
  parseUiControl,
} from './dialogue-utils'

${slice(664, 684)}

${slice(1054, 1339)}

${slice(1341, 1912)}
`

// blueprint-generation
modules['blueprint-generation.ts'] = `// Auto-split from writing-service.ts
import screenwritingPrompt from '@shared/novel/prompts/screenwriting.md?raw'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import { parseBlueprintFromLlm } from '../json-utils'
import type {
  Blueprint,
  BlueprintGenerationResponse,
  ConversationMessage,
  NovelProject,
} from '@shared/novel/types'
import {
  countPlaceholderChapterOutlines,
  countSubstantiveChapterOutlines,
  findFirstOutlineGap,
  isSubstantiveChapterOutline,
  normalizeChapterOutlineEntry,
  splitSynopsisIntoChapterSummaries,
} from '@shared/novel/chapter-outline-quality'
import {
  assertStoryWriteGate,
  recordBlueprintCommit,
  runStorySystemPreflight,
} from '@shared/novel/story-system'
import { resolveWritingMode, SIMPLE_BLUEPRINT_SUPPLEMENT } from '@shared/novel/writing-mode'
import { applyWordCountPlanToBlueprint } from '@shared/novel/chapter-length-plan'
import { removeThinkTags, stripAuthoringMetaCommentary } from '../json-utils'
import {
  buildBlueprintConceptSupplement,
  enrichBlueprintFromConcept,
  rebuildChecklistFromHistory,
  resolveBlueprintExpectedChapterCount,
  resolveFinalConceptAnswers,
} from '@shared/novel/concept-checklist'
import { buildConceptMaterialPromptSupplement } from '../material-library-apply'
import { resolveProjectConceptState } from '@shared/novel/story-system'
import {
  LONG_STREAM_TIMEOUT_MS,
  OUTLINE_REPAIR_BATCH_SIZE,
  OUTLINE_REPAIR_MAX_BATCHES,
  OUTLINE_GENERATION_MAX_ROUNDS,
  CONCEPT_SYNTHESIS_FOR_BLUEPRINT,
} from './constants'
import { chat, projectChatOpts } from './chat-core'
import type {
  BlueprintGenerationPhase,
  BlueprintGenerationProgress,
  BlueprintProgressStep,
  RegeneratePlaceholderOutlineResult,
} from './types'
import { generateChapterOutline } from './chapter-postprocess'

${slice(1914, 2270)}

${slice(2305, 2694)}
`

// chapter-pipeline
modules['chapter-pipeline.ts'] = `// Auto-split from writing-service.ts
import chapterPlanPrompt from '@shared/novel/prompts/chapter_plan.md?raw'
import constitutionCheckPrompt from '@shared/novel/prompts/constitution_check.md?raw'
import writingPrompt from '@shared/novel/prompts/writing_v2.md?raw'
import type { NovelProject } from '@shared/novel/types'
import {
  buildChapterPlanPayload,
  buildFallbackChapterMission,
  buildForbiddenCharacterNames,
  buildContinuityBridgeBlock,
  buildForeshadowingWritingHints,
  buildRollingRecapSummaries,
  buildTrimmedBlueprintSnapshot,
  formatChapterMissionBlock,
  formatForbiddenCharactersBlock,
  formatRollingRecapBlock,
  formatTrimmedBlueprintBlock,
  parseChapterMissionFromLlm,
  resolvePriorChapterContext,
  type ChapterMission,
  type PriorChapterContext,
} from '@shared/novel/chapter-writing-context'
import {
  countChapterChars,
  resolveChapterGenerationMaxTokens,
  resolveChapterMaxOutputChars,
  resolveChapterMinAcceptableChars,
  resolveChapterStreamHardLimitChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  buildChapterRewriteHint,
  extractBannedPhrases,
  formatInternalRepetitionRewriteHint,
  hasInternalRepetitionNeedingRewrite,
  sanitizeChapterContent,
  stripAuthoringMetaCommentary,
  truncateChapterToMaxChars,
  VERNACULAR_PROSE_HINT,
} from '@shared/novel/chapter-content-guard'
import {
  buildNovelConstitutionText,
  formatConstitutionRewriteHint,
  mergeLlmConstitutionViolations,
  needsConstitutionRewrite,
  runChapterConstitutionCheck,
} from '@shared/novel/chapter-constitution-check'
import { extractSingleChapterContent } from '../chapter-splitter'
import {
  patchChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import { isChapterContentTooShort } from '@shared/novel/chapter-length-plan'
import { STREAM_TIMEOUT_MS, LONG_STREAM_TIMEOUT_MS, CHAPTER_STREAM_IDLE_MS } from './constants'
import { chat, projectChatOpts } from './chat-core'
import { parseJsonBlock } from './dialogue-utils'

export function chapterOutlineEntry(project: NovelProject, chapterNumber: number) {
  return project.blueprint?.chapter_outline?.find((c) => c.chapter_number === chapterNumber)
}

${slice(2700, 3153)}
`

// chapter-generation
modules['chapter-generation.ts'] = `// Auto-split from writing-service.ts
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import type { Chapter, NovelProject } from '@shared/novel/types'
import {
  assertChapterGenerationAllowed,
  resolvePriorChapterContext,
  buildRollingRecapSummaries,
} from '@shared/novel/chapter-writing-context'
import {
  countChapterChars,
  formatRecentWordCountStats,
  formatWordCountPlanHint,
  resolveChapterMaxOutputChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  assertStoryWriteGate,
  recordChapterCommit,
} from '@shared/novel/story-system'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import {
  CHAPTER_VERSION_STYLE_HINTS,
  resolveChapterVersionCount,
} from '@shared/novel/chapter-version-count'
import {
  getChapterGenProgressSnapshot,
  patchChapterGenProgress,
  setChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import {
  chapterOutlineEntry,
  generateChapterMission,
  generatePolishedChapterVersion,
  buildChapterGenerationUserMessage,
  runConstitutionGateAndRewrite,
  buildRecentWordCountEntries,
} from './chapter-pipeline'
import { proofreadChapterContent } from './chapter-postprocess'

${slice(3177, 3505)}
`

// chapter-postprocess
modules['chapter-postprocess.ts'] = `// Auto-split from writing-service.ts
import outlinePrompt from '@shared/novel/prompts/outline_generation.md?raw'
import evaluationPrompt from '@shared/novel/prompts/evaluation.md?raw'
import chapterProofreadPrompt from '@shared/novel/prompts/chapter_proofread.md?raw'
import extractionPrompt from '@shared/novel/prompts/extraction.md?raw'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import {
  parseChapterOutlineFromLlm,
  removeThinkTags,
} from '../json-utils'
import type { Chapter, NovelProject, OptimizeResponse } from '@shared/novel/types'
import {
  countChapterChars,
  CHAPTER_ABSOLUTE_MIN_CHARS,
  resolveChapterMinAcceptableChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  detectRepetitionIssues,
  stripAuthoringMetaCommentary,
} from '@shared/novel/chapter-content-guard'
import {
  resolvePriorChapterContext,
} from '@shared/novel/chapter-writing-context'
import {
  isSubstantiveChapterOutline,
  normalizeChapterOutlineEntry,
} from '@shared/novel/chapter-outline-quality'
import { applyWordCountPlanToBlueprint } from '@shared/novel/chapter-length-plan'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import {
  getChapterGenProgressSnapshot,
  patchChapterGenProgress,
  setChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'
import {
  LONG_STREAM_TIMEOUT_MS,
  OUTLINE_GENERATION_TIMEOUT_MS,
  OPTIMIZE_PROMPTS,
} from './constants'
import { chat, projectChatOpts } from './chat-core'
import { parseJsonBlock } from './dialogue-utils'
import { chapterOutlineEntry } from './chapter-pipeline'
import { buildOutlineGenerationPayload } from './blueprint-generation'

${slice(3507, 3814)}
`

// blueprint-generation needs to export buildOutlineGenerationPayload for chapter-postprocess
// Add export to the sliced content - the function buildOutlineGenerationPayload is in slice 2030-2063

modules['index.ts'] = `export * from './types'
export * from './constants'
export * from './chat-core'
export * from './dialogue-utils'
export * from './concept-dialogue'
export * from './section-polish'
export * from './blueprint-generation'
export * from './chapter-pipeline'
export * from './chapter-generation'
export * from './chapter-postprocess'
`

fs.mkdirSync(outDir, { recursive: true })
for (const [name, content] of Object.entries(modules)) {
  fs.writeFileSync(path.join(outDir, name), content)
  console.log('Wrote', name)
}

// writing-service.ts becomes re-export only
fs.writeFileSync(
  path.join(root, 'src/renderer/src/services/novel/writing-service.ts'),
  "export * from './writing'\n"
)
console.log('Updated writing-service.ts')
