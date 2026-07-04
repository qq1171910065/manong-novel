import type { GatewayModelInfo } from '@renderer/services/gateway-api'

export interface ModelCatalogEntry {
  id: string
  label: string
  vendor: string
  desc: string
  endpointTypes?: string[]
}

const LABEL_BY_ID: Record<string, string> = {
  doubao: '豆包',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'deepseek-chat': 'DeepSeek Chat',
  kimi: 'Kimi',
  'gemini-pro': 'Gemini Pro',
  'mimo-v2.5-pro': 'MiMo V2.5 Pro',
  'mimo-v2.5-tts': 'MiMo V2.5 TTS',
  'mimo-v2-flash': 'MiMo V2 Flash',
  flux: 'Flux',
  'dall-e-3': 'DALL·E 3',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-2-c': 'GPT Image 2',
  'midjourney': 'Midjourney',
  'stable-diffusion': 'Stable Diffusion',
}

const VENDOR_BY_ID: Record<string, string> = {
  doubao: 'ByteDance',
  'gpt-4o': 'OpenAI',
  'gpt-4o-mini': 'OpenAI',
  'claude-3-5-sonnet': 'Anthropic',
  'deepseek-chat': 'DeepSeek',
  kimi: 'Moonshot',
  'gemini-pro': 'Google',
}

const DESC_BY_ID: Record<string, string> = {
  doubao: '默认中文模型，响应快，适合日常写作与润色。',
  'gpt-4o': '综合能力均衡，适合信息整合与稳定输出。',
  'gpt-4o-mini': '轻量快速，适合草稿与批量生成。',
  'claude-3-5-sonnet': '表达细腻，适合长文与谨慎推理。',
  'deepseek-chat': '推理成本友好，适合大规模章节生成。',
  kimi: '长上下文表现好，适合大纲整理与设定维护。',
  'gemini-pro': '适合开放式创作与多轮讨论。',
  'mimo-v2.5-pro': '默认对话模型，适合写作、润色与多轮讨论。',
  'mimo-v2.5-tts': '默认语音合成模型，适合朗读播报。',
  'mimo-v2-flash': 'MiMo 快速语音模型。',
  flux: '高质量文生图，适合角色立绘与封面。',
  'dall-e-3': 'OpenAI 文生图，风格多样。',
  'gpt-image-1': 'OpenAI 新一代图像模型。',
  'gpt-image-2-c': '默认绘图模型，适合角色立绘与封面。',
  midjourney: '艺术风格强，适合封面与概念图。',
  'stable-diffusion': '开源文生图，风格可控。',
}

export const SIMPLE_CHAT_MODEL_RECOMMENDED = [
  'mimo-v2.5-pro',
  'gpt-4o-mini',
  'deepseek-chat',
  'doubao',
  'gpt-4o',
  'kimi',
]

export const CHARACTER_MODEL_RECOMMENDED = [
  'mimo-v2.5-pro',
  'doubao',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'deepseek-chat',
  'kimi',
  'gemini-pro',
]

export const TTS_MODEL_RECOMMENDED = ['mimo-v2.5-tts', 'mimo-v2-flash']

export const IMAGE_MODEL_RECOMMENDED = ['gpt-image-2-c', 'flux', 'dall-e-3', 'gpt-image-1', 'midjourney', 'stable-diffusion']

function displayLabel(id: string): string {
  if (LABEL_BY_ID[id]) return LABEL_BY_ID[id]
  const tail = id.split('/').pop() || id
  return tail.length > 28 ? tail.slice(0, 26) + '…' : tail
}

export function entryFromGateway(raw: GatewayModelInfo): ModelCatalogEntry {
  const vendor = raw.tags[0] || VENDOR_BY_ID[raw.id] || 'Gateway'
  const endpoints = raw.endpointTypes.filter(Boolean)
  const knownDesc = DESC_BY_ID[raw.id]
  return {
    id: raw.id,
    label: displayLabel(raw.id),
    vendor,
    desc: knownDesc || (endpoints.length ? `网关对话模型 · ${endpoints.join(' / ')}` : '网关可用对话模型'),
    endpointTypes: endpoints,
  }
}

export function resolveModelInfo(id: string, vendorHint?: string): ModelCatalogEntry {
  return {
    id,
    label: displayLabel(id),
    vendor: vendorHint || VENDOR_BY_ID[id] || 'Gateway',
    desc: DESC_BY_ID[id] || '来自网关模型列表。',
  }
}

export function modelPickerTitle(model: ModelCatalogEntry): string {
  return `${model.label}\n${model.id}\n${model.vendor}\n${model.desc}`
}

export function pickRecommendedFromGateway(
  all: ModelCatalogEntry[],
  preferredIds: string[],
  limit = 6
): ModelCatalogEntry[] {
  const byId = new Map(all.map((item) => [item.id, item]))
  const picked: ModelCatalogEntry[] = []
  for (const id of preferredIds) {
    const item = byId.get(id)
    if (item) picked.push(item)
  }
  if (picked.length >= limit) return picked.slice(0, limit)
  for (const item of all) {
    if (picked.some((row) => row.id === item.id)) continue
    picked.push(item)
    if (picked.length >= limit) break
  }
  return picked
}
