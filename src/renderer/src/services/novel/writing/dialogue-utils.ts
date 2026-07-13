// Renderer dialogue helpers (concept / section-polish)
import type { UIControl } from '@shared/novel/types'
import { CHARACTER_JSON_EXAMPLE } from '@shared/novel/blueprint-material-schemas'
import { parseLlmJsonObject, resolveDisplayAiMessage } from '../json-utils'
import { extractOptionsFromMessage, normalizeUiControl } from '@renderer/novel/utils/chat-options'

const JSON_RESPONSE_INSTRUCTION = `
IMPORTANT: 你的回复必须是合法的 JSON 对象，并严格包含以下字段：
{
  "ai_message": "string",
  "ui_control": {
    "type": "single_choice | multiple_choice | text_input | info_display",
    "options": [
      {"id": "1", "label": "选项标题", "description": "选项具体说明（可选）"}
    ],
    "placeholder": "string"
  },
  "conversation_state": {
    "concept_brief": "2-5段整体故事概念综述，整合全部已知设定，连贯 prose",
    "checklist": { "spark": true, "genre_tone": false },
    "checklist_answers": { "spark": "内部结构化备份" }
  },
  "is_complete": false
}
ui_control 规则：
- ai_message 中不要重复列出 A/B/C 选项文字，选项只放在 ui_control.options 里
- 根据对话需要灵活决定 ui_control.type：开放性问题用 text_input；需要用户从若干方向中选一个用 single_choice；允许多选组合（如类型混搭、多重特质）用 multiple_choice
- options 数量与内容应贴合当前问题，2-8 个均可，不要机械凑满固定数量；id 用简短序号即可
- conversation_state.concept_brief：**每轮必填**。对照整段对话**整体改写**故事概念（2-5 段连贯 prose，像策划案梗概）。这是用户左侧唯一可见的设定板：禁止粘贴用户原话、禁止问答式分条罗列
- conversation_state.checklist / checklist_answers：内部进度与结构化备份，每轮同步更新；**每项 checklist_answers 必须是提炼后的 1-2 句，且写入语义正确的键**（类型≠主角，冲突≠火花）。用户一句透露多项时须同时更新多个键
- 用户补充或修改设定时，应合并进 concept_brief 整体叙述，并拆解到对应 checklist 键，而非把整段用户发言塞进当前追问项
- 主动引导用户补齐尚未完成的设定项，但左侧展示的内容必须是你提炼后的结果
不要输出额外的文本或解释。
`

const JSON_RESPONSE_INSTRUCTION_PARTIAL = `
IMPORTANT: 你的回复必须是合法的 JSON 对象，并严格包含以下字段：
{
  "ai_message": "string",
  "ui_control": { "type": "text_input | single_choice | multiple_choice | info_display", "options": [], "placeholder": "string" },
  "conversation_state": {
    "concept_brief": "可与上一版相同；仅局部改写本轮变更项相关段落",
    "checklist": { "spark": true },
    "checklist_answers": { "spark": "仅更新本轮变更字段" }
  },
  "is_complete": false
}
局部更新规则（必须遵守）：
- **禁止通篇重写** concept_brief；未涉及的段落必须与上一版一致
- 优先更新 checklist_answers 中与用户本轮诉求相关的字段；concept_brief 可只做最小改动
- 已锁定设定不得擅自修改；用户未提及的项保持 checklist_answers 原值
- ai_message 聚焦本轮变更，不要重复已确定的全书综述
不要输出额外的文本或解释。
`

const SECTION_POLISH_JSON_INSTRUCTION = `
IMPORTANT: 你的回复必须是合法的 JSON 对象，并严格包含以下字段：
{
  "ai_message": "string",
  "ui_control": {
    "type": "single_choice | multiple_choice | text_input | info_display",
    "options": [{"id": "1", "label": "选项标题", "description": "选项具体说明（可选）"}],
    "placeholder": "string"
  },
  "conversation_state": {},
  "is_complete": false,
  "ready_to_apply": false,
  "blueprint_updates": null,
  "affected_sections": []
}
规则：
- 对话进行中：ready_to_apply 为 false，blueprint_updates 为 null，affected_sections 为 []
- 默认 ui_control.type 为 text_input；仅在需要用户在少量方案间取舍或用户索要选项时用 single_choice（2–3 个选项）
- 用户确认应用时：ready_to_apply 为 true，is_complete 为 true
- blueprint_updates 为 Partial Blueprint，只含需变更的字段/板块（可跨板块）
- affected_sections 列出本次变更涉及的板块标识
- **用户给出可执行的清晰指令时，同一轮必须 ready_to_apply=true 且输出 blueprint_updates，禁止只回复「收到/好的/已修改」**
- **无 blueprint_updates 时，ai_message 禁止写完成态（已修改/已更新/收到指令/已写入）**
不要输出额外的文本或解释。
`

const MATERIALIZE_POLISH_INSTRUCTION = `
IMPORTANT: 仅输出合法 JSON 对象，不要 Markdown 代码块，不要额外解释。
格式示例（新增角色）：
${CHARACTER_JSON_EXAMPLE}

规则：
- blueprint_updates 必须是**对象**，内含 characters / relationships 等字段；禁止写成数组
- affected_sections 必须是有效板块标识数组，如 ["characters"]，禁止空字符串
- 用户以自然语言描述意图，你负责填入内置数据结构；**禁止**要求用户提供 JSON 字段名
- 根据对话中**已确认**的修改或新增意图，基于当前全书蓝图生成 blueprint_updates
- 修改前通读全书蓝图，带着全局一致性思维处理人物、关系、场景/地点的联动
- 保留角色 id、未提及字段；角色改名时输出**完整 characters 数组**，并同步输出**完整 relationships 数组**（更新 character_from / character_to 中的姓名）
- **新增角色/关系/章节/地点**时：在对应数组中追加新条目（可只输出新增项，系统会合并）；保留原有条目不变
- **分批补齐角色**时：按用户指定批次输出；每批 characters 为非空数组，每项字段简洁（20~80字）避免 JSON 截断
- 用户从「项目概览」等 Tab 进入时，仍可在 blueprint_updates 中修改 characters / relationships 等任意板块
- 改地点/场景时联动检查 world_setting.key_locations 与相关 chapter_outline
- affected_sections 必须列出所有实际变更的板块（含联动项），不可只列入入口 Tab
- 不要输出 ready_to_apply、ai_message 等对话字段
`

function parseJsonBlock(text: string): Record<string, unknown> | null {
  return parseLlmJsonObject(text)
}

function resolveAiMessage(raw: string, parsed: Record<string, unknown>): string {
  return resolveDisplayAiMessage(
    typeof parsed.ai_message === 'string' && parsed.ai_message.trim()
      ? String(parsed.ai_message)
      : raw
  )
}

function parseUiControl(raw: unknown, fallbackMessage: string): UIControl {
  const normalized = normalizeUiControl(raw, fallbackMessage)
  if (normalized) return normalized
  return buildUiControl(fallbackMessage)
}

function buildUiControl(message: string): UIControl {
  const extracted = extractOptionsFromMessage(message)
  if (extracted.length >= 2) {
    return { type: 'single_choice', options: extracted }
  }
  return { type: 'text_input', placeholder: '请输入你的想法…' }
}
export const CONCEPT_DIALOGUE_JSON_INSTRUCTION = JSON_RESPONSE_INSTRUCTION
export const CONCEPT_DIALOGUE_JSON_INSTRUCTION_PARTIAL = JSON_RESPONSE_INSTRUCTION_PARTIAL
export { SECTION_POLISH_JSON_INSTRUCTION, MATERIALIZE_POLISH_INSTRUCTION }

export { parseJsonBlock, resolveAiMessage, parseUiControl }
