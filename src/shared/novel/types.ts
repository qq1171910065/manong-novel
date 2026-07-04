export type WritingMode = 'simple' | 'full'

/** 项目来源：手动创建 或 txt 文件导入 */
export type ProjectSourceType = 'created' | 'txt_import'

export interface NovelProject {
  id: string
  title: string
  initial_prompt: string
  /** 项目来源；txt 导入需点击「智能解析」后才整理为系统蓝图 */
  source_type?: ProjectSourceType
  /** txt 导入是否已完成智能解析 */
  import_parsed?: boolean
  /** txt 导入的原始全文，用于重新分章与深度解析 */
  import_raw_text?: string
  /** 书写模式：简易版快速成书，工程版完整设定 */
  writing_mode?: WritingMode
  cover_url?: string
  /** 本书写作/对话模型；未设置时使用全局默认 */
  chat_model_id?: string
  /** 本书绘图模型；未设置时使用全局默认 */
  image_model_id?: string
  blueprint?: Blueprint
  chapters: Chapter[]
  conversation_history: ConversationMessage[]
  /** 全书共用的 AI 设定修改对话历史 */
  section_polish_history?: ConversationMessage[]
  /** AI 设定修改对话状态（不含 history，history 单独存） */
  section_polish_state?: Record<string, unknown>
  genre?: string
  updated_at?: string
}

export interface NovelProjectSummary {
  id: string
  title: string
  genre: string
  writing_mode?: WritingMode
  cover_url?: string
  last_edited: string
  completed_chapters: number
  total_chapters: number
}

export interface Blueprint {
  title?: string
  target_audience?: string
  genre?: string
  style?: string
  tone?: string
  one_sentence_summary?: string
  full_synopsis?: string
  world_setting?: WorldSetting
  characters?: Character[]
  relationships?: Relationship[]
  chapter_outline?: ChapterOutline[]
}

export interface WorldSetting {
  core_rules?: string
  key_locations?: WorldListItem[]
  factions?: WorldListItem[]
  [key: string]: unknown
}

export interface WorldListItem {
  id?: string
  name?: string
  title?: string
  description?: string
}

export interface Character {
  id?: string
  name: string
  description: string
  portrait_url?: string
  identity?: string
  personality?: string
  goals?: string
  abilities?: string
  relationship_to_protagonist?: string
  extra?: Record<string, unknown>
}

export interface Relationship {
  id?: string
  character_from?: string
  character_to?: string
  relationship_type?: string
  description?: string
}

export interface ChapterOutline {
  id?: string
  chapter_number: number
  title: string
  summary: string
  /** 本章规划字数（汉字计，不含空白） */
  target_word_count?: number
}

export interface Chapter {
  chapter_number: number
  title: string
  summary: string
  content: string | null
  versions: string[] | null
  evaluation: string | null
  generation_status:
    | 'not_generated'
    | 'generating'
    | 'evaluating'
    | 'selecting'
    | 'failed'
    | 'evaluation_failed'
    | 'waiting_for_confirm'
    | 'successful'
  word_count?: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ConverseResponse {
  ai_message: string
  ui_control: UIControl
  conversation_state: Record<string, unknown>
  is_complete: boolean
  ready_for_blueprint?: boolean
}

export interface SectionPolishMaterializeResponse {
  summary: string
  blueprint_updates: Partial<Blueprint>
  affected_sections: NovelSectionType[]
}

export interface SectionPolishResponse extends ConverseResponse {
  ready_to_apply?: boolean
  /** @deprecated 兼容旧协议，优先使用 blueprint_updates */
  section_update?: unknown
  blueprint_updates?: Partial<Blueprint>
  affected_sections?: NovelSectionType[]
}

export interface BlueprintGenerationResponse {
  blueprint: Blueprint
  ai_message: string
}

export interface UIControlOption {
  id: string
  label: string
  description?: string
}

export interface UIControl {
  type: 'single_choice' | 'multiple_choice' | 'text_input'
  options?: UIControlOption[]
  placeholder?: string
}

export interface DeleteNovelsResponse {
  status: string
  message: string
}

export type NovelSectionType =
  | 'overview'
  | 'world_setting'
  | 'characters'
  | 'relationships'
  | 'chapter_outline'
  | 'chapters'

export interface NovelSectionResponse {
  section: NovelSectionType
  data: Record<string, unknown>
}

export interface OptimizeRequest {
  project_id: string
  chapter_number: number
  dimension: 'dialogue' | 'environment' | 'psychology' | 'rhythm'
  additional_notes?: string
}

export interface OptimizeResponse {
  optimized_content: string
  optimization_notes: string
  dimension: string
}

export interface NovelStoreData {
  version: 1
  projects: Record<string, NovelProject>
}

export interface NovelStoreStats {
  projectCount: number
  chapterCount: number
  completedChapterCount: number
}

export type ArenaResult<T> = { ok: true; data: T } | { ok: false; error: string }
