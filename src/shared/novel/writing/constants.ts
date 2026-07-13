import optimizeDialoguePrompt from '@shared/novel/prompts/optimize_dialogue.md?raw'
import optimizeEnvironmentPrompt from '@shared/novel/prompts/optimize_environment.md?raw'
import optimizePsychologyPrompt from '@shared/novel/prompts/optimize_psychology.md?raw'
import optimizeRhythmPrompt from '@shared/novel/prompts/optimize_rhythm.md?raw'

export const STREAM_TIMEOUT_MS = 120_000
export const LONG_STREAM_TIMEOUT_MS = 1_800_000
export const CHAPTER_STREAM_IDLE_MS = 45_000
export const OUTLINE_GENERATION_TIMEOUT_MS = 300_000
export const OUTLINE_REPAIR_BATCH_SIZE = 6
export const OUTLINE_REPAIR_MAX_BATCHES = 12
export const OUTLINE_GENERATION_MAX_ROUNDS = 24
export const STREAM_EMIT_INTERVAL_MS = 48

export const OPTIMIZE_PROMPTS = {
  dialogue: optimizeDialoguePrompt,
  environment: optimizeEnvironmentPrompt,
  psychology: optimizePsychologyPrompt,
  rhythm: optimizeRhythmPrompt,
} as const

export const REFINEMENT_MAX_ATTEMPTS = 3

export const CONCEPT_SYNTHESIS_FOR_BLUEPRINT = `
你是出版级小说策划编辑。请根据灵感对话，撰写一份 800-1500 字的「故事概念策划案」（纯文本，不要 JSON）。
要求：
- 用第三人称、职业化 prose 整合全部已知设定，像给编辑部过会的梗概文档
- 必须涵盖：核心灵感、类型基调、文风、主角驱动力与缺陷、核心冲突与对立、催化事件、主题、预期篇幅
- **禁止粘贴或改写用户原句**，必须是你作为策划编辑重新组织、补全因果后的结果
- 不要问答格式，不要分条抄录 checklist
`
