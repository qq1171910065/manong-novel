export interface CreationWorkflowPrefs {
  /** AI 接管：每章生成后暂停，等待用户确认再继续 */
  autoWritePauseBeforeConfirm: boolean
  /** AI 接管：启用多版本生成与 AI 评审（更慢但更稳） */
  autoWriteMultiVersion: boolean
  /** 严格顺序：上一章须确认后才能生成下一章 */
  strictChapterOrder: boolean
  /** 规则宪法检查未通过时，追加 LLM 深度合规分析 */
  enableConstitutionLlmCheck: boolean
  /** 章节生成时显示流式正文预览 */
  showStreamPreview: boolean
  /** 记录 AI 调用详情到创作流水线 */
  enablePipelineLog: boolean
}

const STORAGE_KEY = 'novel_creation_workflow_prefs_v1'

const DEFAULT_PREFS: CreationWorkflowPrefs = {
  autoWritePauseBeforeConfirm: false,
  autoWriteMultiVersion: false,
  strictChapterOrder: true,
  enableConstitutionLlmCheck: true,
  showStreamPreview: true,
  enablePipelineLog: true,
}

function readRaw(): CreationWorkflowPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<CreationWorkflowPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

let cached = readRaw()

export function getCreationWorkflowPrefs(): CreationWorkflowPrefs {
  return { ...cached }
}

export function saveCreationWorkflowPrefs(patch: Partial<CreationWorkflowPrefs>): CreationWorkflowPrefs {
  cached = { ...cached, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  return { ...cached }
}

export function resetCreationWorkflowPrefs(): CreationWorkflowPrefs {
  cached = { ...DEFAULT_PREFS }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  return { ...cached }
}
