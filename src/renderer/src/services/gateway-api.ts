import { normalizeTtsAudioBuffer } from '@renderer/services/reading-tts-audio'
import { getRuntimeConfig } from '@renderer/composables/runtime-config'
import { portalApi } from './portal-api'
import { ensureLocalImageDataUrl } from './image-storage'
import {
  extractGatewayResponseError,
  shouldRetryImageWithoutResponseFormat,
} from './gateway-image-error'
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_SYSTEM_ROLE_MODEL_ID, IMAGE_GENERATION_TIMEOUT_MS, MIMO_TTS_MODEL_ID } from '@shared/gateway/constants'
import { formatGatewayApiError } from '@shared/gateway/format-error'
import type { PortalGatewayConfig } from './portal-api'

const GATEWAY_KEY_STORAGE = 'wb_gateway_api_key'

let gatewayKeyCache: string | null = null
let gatewayKeyHydrated = false

async function hydrateGatewayKeyFromSecureStore(): Promise<void> {
  if (gatewayKeyHydrated) return
  gatewayKeyHydrated = true
  if (typeof window.api?.gatewayGetStoredKey === 'function') {
    try {
      const result = await window.api.gatewayGetStoredKey()
      if (result.ok && result.key) {
        gatewayKeyCache = result.key
        return
      }
    } catch {
      // 降级到 legacy localStorage
    }
  }
  const legacy = localStorage.getItem(GATEWAY_KEY_STORAGE)
  if (legacy) {
    gatewayKeyCache = legacy
    if (typeof window.api?.gatewaySetStoredKey === 'function') {
      try {
        await window.api.gatewaySetStoredKey(legacy)
        localStorage.removeItem(GATEWAY_KEY_STORAGE)
      } catch {
        // 保留 legacy 副本直至下次成功写入
      }
    }
  }
}

export async function initGatewayKeyStorage(): Promise<void> {
  await hydrateGatewayKeyFromSecureStore()
}

export interface GatewayEndpointConfig {
  configured: boolean
  mode: 'direct' | 'proxy'
  baseUrl: string
  chatBaseUrl: string
  pricingUrl: string
  hint?: string
}

export interface GatewayModelInfo {
  id: string
  tags: string[]
  endpointTypes: string[]
}

export interface ModelTestResult {
  model: string
  ok: boolean
  latencyMs?: number
  message?: string
  replyPreview?: string
}

export interface GatewayTokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface GatewayToolCall {
  id?: string
  type?: string
  function?: {
    name: string
    arguments: string
  }
}

export interface GatewayChatResult {
  content: string
  /** 推理模型可能将思考过程放在此字段，正文 content 为空时需从中提取 */
  reasoning?: string
  usage?: GatewayTokenUsage
  tool_calls?: GatewayToolCall[]
}

export interface GatewayConnectivityReport {
  ok: boolean
  baseUrl: string
  modelCount: number
  testedCount: number
  successCount: number
  results: ModelTestResult[]
  message?: string
}

let modelsCache: { expires: number; models: GatewayModelInfo[] } | null = null
let endpointCache: { expires: number; config: GatewayEndpointConfig } | null = null

function mapGatewayConfig(cfg: PortalGatewayConfig): GatewayEndpointConfig {
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '')
  return {
    configured: Boolean(cfg.configured && baseUrl),
    mode: cfg.mode === 'proxy' ? 'proxy' : 'direct',
    baseUrl,
    chatBaseUrl: String(cfg.chatBaseUrl || (baseUrl ? `${baseUrl}/v1` : '')).replace(/\/+$/, ''),
    pricingUrl: String(cfg.pricingUrl || (baseUrl ? `${baseUrl}/api/pricing` : '')).replace(/\/+$/, ''),
    hint: cfg.hint,
  }
}

export async function resolveGatewayEndpoints(force = false): Promise<GatewayEndpointConfig> {
  const now = Date.now()
  if (!force && endpointCache && endpointCache.expires > now) {
    return endpointCache.config
  }
  const raw = await portalApi.gatewayConfig()
  const config = mapGatewayConfig(raw)
  if (!config.configured) {
    throw new Error('模型网关未配置，请在账户后台「New API → 网关配置」中启用')
  }
  endpointCache = { expires: now + 5 * 60_000, config }
  return config
}

/** 上游 New API 根地址（Platform 配置） */
export function getGatewayRootUrl(): string {
  return endpointCache?.config.baseUrl || ''
}

/** OpenAI 兼容对话基址，通常为 {baseUrl}/v1 */
export function getGatewayBaseUrl(): string {
  return endpointCache?.config.chatBaseUrl || ''
}

export function getStoredGatewayKey(): string {
  return gatewayKeyCache || localStorage.getItem(GATEWAY_KEY_STORAGE) || ''
}

export function setStoredGatewayKey(key: string): void {
  const k = String(key || '').trim()
  gatewayKeyCache = k || null
  localStorage.removeItem(GATEWAY_KEY_STORAGE)
  if (typeof window.api?.gatewaySetStoredKey === 'function') {
    void window.api.gatewaySetStoredKey(k)
  } else if (k) {
    localStorage.setItem(GATEWAY_KEY_STORAGE, k)
  }
}

export function clearStoredGatewayKey(): void {
  gatewayKeyCache = null
  localStorage.removeItem(GATEWAY_KEY_STORAGE)
  if (typeof window.api?.gatewayClearStoredKey === 'function') {
    void window.api.gatewayClearStoredKey()
  }
  modelsCache = null
}

export function invalidateGatewayModelCache(): void {
  modelsCache = null
  endpointCache = null
}

export function getAppKeyName(): string {
  return getRuntimeConfig().appId
}

export function isInvalidGatewayTokenError(status?: number, error?: string): boolean {
  if (status === 401 || status === 403) return true
  return /无效的令牌|invalid\s*(api[_\s-]?)?key|invalid\s*token|unauthorized|authentication|api key.*invalid|令牌.*无效/i.test(
    String(error || '')
  )
}

export async function ensureGatewayKey(appKeyName = getAppKeyName(), forceRefresh = false): Promise<string> {
  await hydrateGatewayKeyFromSecureStore()
  if (!forceRefresh) {
    const existing = getStoredGatewayKey()
    if (existing) return existing
  } else {
    clearStoredGatewayKey()
    invalidateGatewayModelCache()
  }

  const ensured = await portalApi.ensureDefaultKey(appKeyName)
  const plain = String(ensured.keyPlaintext || '').trim()
  if (!plain) throw new Error('获取 API Key 失败，请在用户中心手动创建')
  setStoredGatewayKey(plain)
  return plain
}

function buildGatewayUrl(subPath: string, endpoints: GatewayEndpointConfig): string {
  const normalized = subPath.replace(/^\/+/, '')
  if (normalized === 'api/pricing') return endpoints.pricingUrl
  return `${endpoints.chatBaseUrl}/${normalized}`
}

async function gatewayFetch(
  subPath: string,
  opts: {
    method?: 'GET' | 'POST'
    body?: unknown
    auth?: boolean
    timeoutMs?: number
  } = {}
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  let endpoints: GatewayEndpointConfig
  try {
    endpoints = await resolveGatewayEndpoints()
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e instanceof Error ? e.message : '获取模型网关配置失败',
    }
  }

  const method = opts.method || 'GET'
  const url = buildGatewayUrl(subPath, endpoints)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (opts.auth !== false) {
    const key = await ensureGatewayKey()
    headers.Authorization = `Bearer ${key}`
  }

  const result = await window.api.fetchUrl(
    url,
    method,
    headers,
    method === 'POST' && opts.body != null ? JSON.stringify(opts.body) : undefined,
    { timeoutMs: opts.timeoutMs ?? 120_000 }
  )

  if (!result.success) {
    return { ok: false, status: result.status ?? 0, data: null, error: result.error || '请求失败' }
  }

  let data: unknown = result.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      data = result.data
    }
  }
  const status = result.status ?? 200
  if (status === 402) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message || '钱包余额不足，请先充值'
    return { ok: false, status, data, error: msg }
  }
  const bodyError = extractGatewayResponseError(data)
  if (status === 401 || isInvalidGatewayTokenError(status, bodyError || undefined)) {
    return {
      ok: false,
      status: status === 200 ? 401 : status,
      data,
      error: bodyError || 'API Key 无效，请在用户中心重新创建',
    }
  }
  if (status >= 400) {
    const msg =
      bodyError ||
      (data as { error?: { message?: string }; message?: string })?.error?.message ||
      (data as { message?: string })?.message ||
      (status === 503
        ? '模型网关暂时不可用（503），请确认账户后台「New API → 网关配置」上游已启动，且对应模型渠道已启用'
        : `HTTP ${status}`)
    return { ok: false, status, data, error: msg }
  }
  if (bodyError) {
    return { ok: false, status, data, error: bodyError }
  }
  return { ok: true, status, data }
}

function parsePricingRows(data: unknown): GatewayModelInfo[] {
  const rows: GatewayModelInfo[] = []
  if (!data || typeof data !== 'object') return rows
  const obj = data as Record<string, unknown>
  const candidates = [obj.data, obj.models, obj]
  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const id = String(rec.model_name || rec.model || rec.id || '').trim()
        if (!id) continue
        const tagsRaw = rec.tags
        const tags =
          typeof tagsRaw === 'string'
            ? tagsRaw
                .split(/[,，;；|]/)
                .map((t) => t.trim())
                .filter(Boolean)
            : Array.isArray(tagsRaw)
              ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
              : []
        const endpointRaw = rec.supported_endpoint_types ?? rec.endpoint_types
        const endpointTypes = Array.isArray(endpointRaw)
          ? endpointRaw.map((t) => String(t).trim()).filter(Boolean)
          : []
        rows.push({ id, tags, endpointTypes })
      }
      if (rows.length) break
    }
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      for (const [id] of Object.entries(c as Record<string, unknown>)) {
        const name = String(id || '').trim()
        if (name) rows.push({ id: name, tags: [], endpointTypes: [] })
      }
      if (rows.length) break
    }
  }
  const seen = new Set<string>()
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export async function listGatewayModels(force = false): Promise<GatewayModelInfo[]> {
  const now = Date.now()
  if (!force && modelsCache && modelsCache.expires > now) {
    return modelsCache.models
  }
  const res = await gatewayFetch('api/pricing', { auth: false, timeoutMs: 30_000 })
  if (!res.ok) throw new Error(res.error || '获取模型列表失败')
  const models = parsePricingRows(res.data)
  modelsCache = { expires: now + 5 * 60_000, models }
  return models
}

export async function listGatewayModelIds(force = false): Promise<string[]> {
  const models = await listGatewayModels(force)
  return models.map((m) => m.id)
}

export async function listChatGatewayModels(force = false): Promise<GatewayModelInfo[]> {
  const models = await listGatewayModels(force)
  return models.filter(isLikelyChatModel)
}

export async function listTtsGatewayModels(force = false): Promise<GatewayModelInfo[]> {
  const models = await listGatewayModels(force)
  return models.filter(isLikelyTtsModel)
}

export async function listImageGatewayModels(force = false): Promise<GatewayModelInfo[]> {
  const models = await listGatewayModels(force)
  return models.filter(isLikelyImageModel)
}

/** 从网关可用模型中解析模型 ID。
 * 优先级：explicit（项目/玩法已选）> preferred > 设置中的默认模型（兜底）> 内置常量 > 网关列表 */
export interface ResolveModelOptions {
  /** 项目或角色已绑定的模型 ID，优先级最高 */
  explicit?: string
  /** 额外候选，排在 explicit 之后、默认模型之前 */
  preferred?: string[]
}

/** @deprecated 使用 ResolveModelOptions */
export type ResolveChatModelOptions = ResolveModelOptions

export async function resolveChatModelId(
  options?: string[] | ResolveModelOptions
): Promise<string> {
  let explicit: string | undefined
  let preferred: string[] | undefined
  if (Array.isArray(options)) {
    preferred = options
  } else if (options) {
    explicit = options.explicit?.trim() || undefined
    preferred = options.preferred
  }

  let fallbackDefault: string
  try {
    const { settingsService } = await import('./app-settings')
    fallbackDefault = await settingsService.getDefaultModelId()
  } catch {
    fallbackDefault = DEFAULT_SYSTEM_ROLE_MODEL_ID
  }

  const chatModels = await listChatGatewayModels()
  if (!chatModels.length) {
    throw new Error('网关暂无可用对话模型，请在「模型概览」中确认连接与余额')
  }
  const available = chatModels.map((m) => m.id)
  const availableSet = new Set(available)
  const dedupe = (ids: string[]) => {
    const seen = new Set<string>()
    return ids.filter((id) => {
      const key = id.trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const candidates = dedupe([
    ...(explicit ? [explicit] : []),
    ...(preferred || []),
    fallbackDefault,
    DEFAULT_SYSTEM_ROLE_MODEL_ID,
    ...available.slice(0, 8),
  ])

  for (const id of candidates) {
    if (availableSet.has(id)) return id
  }

  for (const id of candidates) {
    const needle = id.toLowerCase()
    const hit = available.find(
      (modelId) =>
        modelId.toLowerCase() === needle ||
        modelId.toLowerCase().endsWith(`/${needle}`) ||
        modelId.toLowerCase().includes(needle)
    )
    if (hit) return hit
  }

  // 项目/用户显式指定的模型优先于兜底列表（网关可能接受但尚未出现在缓存列表中）
  if (explicit) return explicit

  return available[0]!
}

/** 将网关 content_filter 类错误转为更易理解的提示 */
export { formatGatewayContentFilterError, formatGatewayApiError } from '@shared/gateway/format-error'

export function isLikelyChatModel(model: GatewayModelInfo): boolean {
  const hay = `${model.id} ${model.tags.join(' ')} ${model.endpointTypes.join(' ')}`.toLowerCase()
  if (/image|video|audio|tts|whisper|embedding|rerank|dall|midjourney|flux|sdxl|suno/.test(hay)) {
    return false
  }
  return true
}

export function isLikelyTtsModel(model: GatewayModelInfo): boolean {
  const hay = `${model.id} ${model.tags.join(' ')} ${model.endpointTypes.join(' ')}`.toLowerCase()
  if (/whisper|transcri|asr|stt/.test(hay)) return false
  return /tts|speech|voice|mimo.*tts|audio.*generat/.test(hay)
}

export function isLikelyImageModel(model: GatewayModelInfo): boolean {
  const hay = `${model.id} ${model.tags.join(' ')} ${model.endpointTypes.join(' ')}`.toLowerCase()
  if (/video|tts|whisper|transcri|asr|stt|embedding|rerank|audio|suno/.test(hay)) return false
  if (
    /image|dall|midjourney|flux|sdxl|stable.?diffusion|gpt-image|seedream|ideogram|imagen|recraft|playground|文生图|绘图|mj-|sd-/.test(
      hay
    )
  ) {
    return true
  }
  return model.endpointTypes.some((type) => /image|dall|midjourney|flux|sd|文生图|绘图/i.test(type))
}

export async function resolveImageModelId(options?: string[] | ResolveModelOptions): Promise<string> {
  let explicit: string | undefined
  let preferred: string[] | undefined
  if (Array.isArray(options)) {
    preferred = options
  } else if (options) {
    explicit = options.explicit?.trim() || undefined
    preferred = options.preferred
  }

  let fallbackDefault: string
  try {
    const { settingsService } = await import('./app-settings')
    fallbackDefault = await settingsService.getDefaultImageModelId()
  } catch {
    fallbackDefault = DEFAULT_IMAGE_MODEL_ID
  }

  const imageModels = await listImageGatewayModels()
  const available = imageModels.map((m) => m.id)
  const availableSet = new Set(available)
  const dedupe = (ids: string[]) => {
    const seen = new Set<string>()
    return ids.filter((id) => {
      const key = id.trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const candidates = dedupe([
    ...(explicit ? [explicit] : []),
    ...(preferred || []),
    fallbackDefault,
    DEFAULT_IMAGE_MODEL_ID,
    ...available.slice(0, 8),
  ])

  if (!available.length) {
    if (explicit) return explicit
    return fallbackDefault || DEFAULT_IMAGE_MODEL_ID
  }

  for (const id of candidates) {
    if (availableSet.has(id)) return id
  }

  for (const id of candidates) {
    const needle = id.toLowerCase()
    const hit = available.find(
      (modelId) =>
        modelId.toLowerCase() === needle ||
        modelId.toLowerCase().endsWith(`/${needle}`) ||
        modelId.toLowerCase().includes(needle)
    )
    if (hit) return hit
  }

  if (explicit) return explicit

  return available[0]!
}

export interface GatewayImageOptions {
  prompt: string
  model?: string
  size?: string
}

function parseImageGenerationData(data: unknown): string {
  if (!data || typeof data !== 'object') throw new Error('绘图响应格式异常')
  const root = data as Record<string, unknown>

  const bodyError = extractGatewayResponseError(data)
  if (bodyError) throw new Error(bodyError)

  const asImage = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const text = value.trim()
    if (!text) return null
    if (text.startsWith('data:image')) return text
    if (text.startsWith('http')) return text
    if (/^[A-Za-z0-9+/=_-]+$/.test(text.slice(0, 80))) {
      return text.startsWith('data:') ? text : `data:image/png;base64,${text}`
    }
    return null
  }

  const items = root.data
  if (Array.isArray(items) && items.length) {
    const first = items[0] as { url?: string; b64_json?: string; image?: string }
    const hit = asImage(first.b64_json) || asImage(first.url) || asImage(first.image)
    if (hit) return hit
  }

  const rootCandidates = [root.b64_json, root.url, root.image, root.output]
  for (const candidate of rootCandidates) {
    const hit = asImage(candidate)
    if (hit) return hit
  }

  const nested = (root.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content
  const nestedHit = asImage(nested)
  if (nestedHit) return nestedHit

  throw new Error('响应中未找到图像数据')
}

/** OpenAI 兼容文生图，返回本地可持久化的 data URL */
export async function gatewayImageGenerate(options: GatewayImageOptions): Promise<string> {
  const prompt = String(options.prompt || '').trim()
  if (!prompt) throw new Error('绘图提示词为空')

  const model = options.model || (await resolveImageModelId())
  const baseBody = {
    model,
    prompt,
    n: 1,
    size: options.size || '1024x1024',
  }

  let res = await gatewayFetch('images/generations', {
    method: 'POST',
    timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
    body: { ...baseBody, response_format: 'b64_json' },
  })

  if (!res.ok && shouldRetryImageWithoutResponseFormat(res)) {
    res = await gatewayFetch('images/generations', {
      method: 'POST',
      timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
      body: baseBody,
    })
  }

  if (!res.ok) throw new Error(res.error || '图像生成失败')

  const bodyError = extractGatewayResponseError(res.data)
  if (bodyError) throw new Error(bodyError)

  const raw = parseImageGenerationData(res.data)
  return ensureLocalImageDataUrl(raw)
}

export interface GatewayTtsOptions {
  text: string
  voice: string
  styleInstruction?: string
  model?: string
}

function normalizeBase64(input: string): string {
  let s = input.trim()
  const match = s.match(/^data:[^;,]+;base64,(.+)$/is)
  if (match) s = match[1]
  s = s.replace(/\s/g, '')
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return s
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = normalizeBase64(base64)
  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  } catch {
    throw new Error('语音数据解码失败，网关返回格式异常')
  }
}

function decodeBase64AudioField(value: unknown): ArrayBuffer | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return base64ToArrayBuffer(value)
  } catch {
    return null
  }
}

function decodeGatewayAudioObject(value: unknown): ArrayBuffer | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  return (
    decodeBase64AudioField(obj.data) ??
    decodeBase64AudioField(obj.b64) ??
    decodeBase64AudioField(obj.base64) ??
    decodeBase64AudioField(obj.audio)
  )
}

function decodeGatewayAudio(data: unknown): ArrayBuffer | null {
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>

  const rootDataAudio = decodeBase64AudioField(root.data) ?? decodeGatewayAudioObject(root.data)
  if (rootDataAudio) return rootDataAudio

  const rootAudio =
    decodeBase64AudioField(root.audio) ??
    decodeGatewayAudioObject(root.audio) ??
    decodeGatewayAudioObject(root.output)
  if (rootAudio) return rootAudio

  const choice = (root.choices as Array<{ message?: Record<string, unknown> }> | undefined)?.[0]
  const message = choice?.message
  if (!message) return null

  const messageAudio =
    decodeBase64AudioField(message.audio) ?? decodeGatewayAudioObject(message.audio)
  if (messageAudio) return messageAudio

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue
      const rec = part as Record<string, unknown>
      const partAudio =
        decodeBase64AudioField(rec.data) ??
        decodeGatewayAudioObject(rec.input_audio) ??
        decodeGatewayAudioObject(rec.audio)
      if (partAudio) return partAudio
    }
  }

  if (typeof message.content === 'string') {
    const content = message.content.trim()
    if (content.startsWith('data:audio')) {
      const comma = content.indexOf(',')
      if (comma >= 0) return base64ToArrayBuffer(content.slice(comma + 1))
    }
    if (/^[A-Za-z0-9+/=_-]+$/.test(content.replace(/\s/g, '')) && content.length > 128) {
      const decoded = decodeBase64AudioField(content)
      if (decoded) return decoded
    }
  }
  return null
}

/** MiMo-V2.5-TTS 非流式合成，返回 WAV ArrayBuffer */
export async function gatewayTtsSynthesize(options: GatewayTtsOptions): Promise<ArrayBuffer> {
  const text = String(options.text || '').trim()
  if (!text) throw new Error('TTS 文本为空')

  const res = await gatewayFetch('chat/completions', {
    method: 'POST',
    timeoutMs: 90_000,
    body: {
      model: options.model || MIMO_TTS_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: options.styleInstruction || '用自然清晰的中文语调朗读以下内容，语速偏快，节奏紧凑。',
        },
        { role: 'assistant', content: text },
      ],
      audio: {
        format: 'wav',
        voice: options.voice,
      },
    },
  })

  if (!res.ok) throw new Error(res.error || '语音合成失败')
  const raw = decodeGatewayAudio(res.data)
  if (!raw) {
    const hint = (res.data as { error?: { message?: string } })?.error?.message
    throw new Error(hint || '语音合成响应缺少音频数据，请确认网关已启用 mimo-v2.5-tts')
  }
  return normalizeTtsAudioBuffer(raw)
}

export async function testGatewayImageModel(
  model: string,
  opts: { prompt?: string; size?: string } = {}
): Promise<ModelTestResult> {
  const started = Date.now()
  const prompt = opts.prompt || '一只简笔画风格的小猫，白色背景，无文字、无水印'
  try {
    await gatewayImageGenerate({
      model,
      prompt,
      size: opts.size || '1024x1024',
    })
    return {
      model,
      ok: true,
      latencyMs: Date.now() - started,
      replyPreview: '图像生成成功',
    }
  } catch (e) {
    return {
      model,
      ok: false,
      latencyMs: Date.now() - started,
      message: e instanceof Error ? e.message : '图像生成失败',
    }
  }
}

export async function testGatewayModel(
  model: string,
  opts: { prompt?: string; maxTokens?: number } = {}
): Promise<ModelTestResult> {
  const started = Date.now()
  const prompt = opts.prompt || 'ping'
  const maxTokens = opts.maxTokens ?? 8
  try {
    const res = await gatewayFetch('chat/completions', {
      method: 'POST',
      timeoutMs: 45_000,
      body: {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: maxTokens,
      },
    })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      return { model, ok: false, latencyMs, message: res.error || '调用失败' }
    }
    const choice = (res.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
    const replyPreview = String(choice?.message?.content || '').slice(0, 120)
    return { model, ok: true, latencyMs, replyPreview: replyPreview || '(空回复)' }
  } catch (e) {
    return {
      model,
      ok: false,
      latencyMs: Date.now() - started,
      message: e instanceof Error ? e.message : '调用失败',
    }
  }
}

export async function testGatewayConnectivity(
  modelIds?: string[],
  maxCount = 3
): Promise<GatewayConnectivityReport> {
  let endpoints: GatewayEndpointConfig
  try {
    endpoints = await resolveGatewayEndpoints()
  } catch (e) {
    return {
      ok: false,
      baseUrl: '',
      modelCount: 0,
      testedCount: 0,
      successCount: 0,
      results: [],
      message: e instanceof Error ? e.message : '获取模型网关配置失败',
    }
  }

  let models: GatewayModelInfo[] = []
  try {
    models = await listGatewayModels()
  } catch (e) {
    return {
      ok: false,
      baseUrl: endpoints.baseUrl,
      modelCount: 0,
      testedCount: 0,
      successCount: 0,
      results: [],
      message: e instanceof Error ? e.message : '获取模型列表失败',
    }
  }

  const chatModels = models.filter(isLikelyChatModel)
  const pool = modelIds?.length
    ? modelIds.filter((id) => models.some((m) => m.id === id))
    : chatModels.map((m) => m.id)
  const targets = pool.slice(0, Math.max(1, maxCount))
  const results: ModelTestResult[] = []

  for (const model of targets) {
    results.push(await testGatewayModel(model))
  }

  const successCount = results.filter((r) => r.ok).length
  return {
    ok: successCount > 0,
    baseUrl: endpoints.baseUrl,
    modelCount: models.length,
    testedCount: results.length,
    successCount,
    results,
    message:
      successCount === 0
        ? '所选模型均不可用，请检查 Key、余额或网关配置'
        : undefined,
  }
}

function normalizeChatMessages(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('对话消息为空，请重试')
  }

  const normalized = messages
    .filter((m) => m && m.role)
    .map((m) => ({
      role: String(m.role),
      content: String(m.content ?? '').trim(),
    }))
    .filter((m) => m.content)

  if (!normalized.some((m) => m.role === 'user')) {
    normalized.push({ role: 'user', content: '开始对话' })
  }

  if (!normalized.length) {
    throw new Error('对话消息内容为空，请重试')
  }

  return normalized
}

export async function gatewayChatCompletion(
  model: string,
  messages: Array<{ role: string; content: string }>,
  params?: import('@shared/gateway/constants').GatewayGenerationParams
): Promise<GatewayChatResult> {
  const normalizedMessages = normalizeChatMessages(messages)
  const body: Record<string, unknown> = { model, messages: normalizedMessages, stream: false }
  if (params?.temperature != null) body.temperature = params.temperature
  if (params?.top_p != null) body.top_p = params.top_p
  if (params?.presence_penalty != null) body.presence_penalty = params.presence_penalty
  if (params?.frequency_penalty != null) body.frequency_penalty = params.frequency_penalty
  if (params?.max_tokens != null) body.max_tokens = params.max_tokens
  if (params?.tools?.length) body.tools = params.tools
  if (params?.tool_choice != null) body.tool_choice = params.tool_choice

  const fetchOnce = () =>
    gatewayFetch('chat/completions', {
      method: 'POST',
      body,
      timeoutMs: params?.timeoutMs,
    })

  let res = await fetchOnce()
  if (!res.ok && isInvalidGatewayTokenError(res.status, res.error)) {
    await ensureGatewayKey(getAppKeyName(), true)
    res = await fetchOnce()
  }
  if (!res.ok) {
    throw new Error(
      formatGatewayApiError(
        res.error ||
          (isInvalidGatewayTokenError(res.status, res.error)
            ? 'API Key 无效或已过期，请在用户中心重新创建'
            : '对话失败')
      )
    )
  }
  const data = res.data as {
    choices?: Array<{ message?: Record<string, unknown> }>
    usage?: GatewayTokenUsage
  }
  const choice = data?.choices?.[0]
  const message = choice?.message
  const content = readStreamTextField(message?.content)
  const reasoning =
    readStreamTextField(message?.reasoning_content) ||
    readStreamTextField(message?.reasoning) ||
    readStreamTextField(message?.thinking) ||
    readStreamTextField(message?.reasoning_summary)
  const toolCallsRaw = message?.tool_calls
  const tool_calls = Array.isArray(toolCallsRaw)
    ? (toolCallsRaw as GatewayToolCall[]).filter(
        (item) => item && typeof item === 'object' && item.function?.name
      )
    : undefined
  return {
    content,
    reasoning: reasoning || undefined,
    usage: data?.usage,
    tool_calls,
  }
}

export type StreamChatHandlers = {
  onChunk: (text: string) => void
  onReasoningChunk?: (text: string) => void
  onUsage?: (usage: GatewayTokenUsage) => void
  onEnd: () => void
  onError: (err: string) => void
}

type StreamChoicePayload = {
  choices?: Array<{
    delta?: Record<string, unknown>
    message?: Record<string, unknown>
    text?: string
    finish_reason?: string | null
  }>
  usage?: GatewayTokenUsage
}

function readStreamTextField(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && typeof (item as { text?: string }).text === 'string') {
          return (item as { text: string }).text
        }
        return ''
      })
      .join('')
  }
  return ''
}

function extractStreamDeltaParts(parsed: StreamChoicePayload): {
  content: string
  reasoning: string
  finishReason: string | null
} {
  const choice = parsed.choices?.[0]
  const delta = choice?.delta
  const message = choice?.message
  const content =
    readStreamTextField(delta?.content) ||
    readStreamTextField(message?.content) ||
    readStreamTextField(choice?.text)
  const reasoning =
    readStreamTextField(delta?.reasoning_content) ||
    readStreamTextField(delta?.reasoning) ||
    readStreamTextField(delta?.thinking) ||
    readStreamTextField(delta?.reasoning_summary) ||
    readStreamTextField(message?.reasoning_content) ||
    readStreamTextField(message?.reasoning) ||
    readStreamTextField(message?.thinking) ||
    readStreamTextField(message?.reasoning_summary)
  const finishReason =
    typeof choice?.finish_reason === 'string' ? choice.finish_reason : null
  return { content, reasoning, finishReason }
}

function isStreamFinishReason(reason: string | null | undefined): boolean {
  return reason === 'stop' || reason === 'length' || reason === 'content_filter'
}

function ingestSseDataLine(line: string, handlers: StreamChatHandlers): 'done' | 'data' | 'skip' {
  if (!line.startsWith('data:')) return 'skip'
  const payload = line.slice(5).trim()
  if (payload === '[DONE]') return 'done'
  try {
    const parsed = JSON.parse(payload) as StreamChoicePayload
    const { content, reasoning, finishReason } = extractStreamDeltaParts(parsed)
    if (content) handlers.onChunk(content)
    if (reasoning) handlers.onReasoningChunk?.(reasoning)
    if (parsed.usage) handlers.onUsage?.(parsed.usage)
    if (isStreamFinishReason(finishReason)) return 'done'
  } catch {
    /* ignore partial json */
  }
  return 'data'
}

export function gatewayChatStreamCollect(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ text: string; usage?: GatewayTokenUsage; cancel: () => void }> {
  return new Promise((resolve, reject) => {
    let text = ''
    let usage: GatewayTokenUsage | undefined
    let cancel: (() => void) | null = null
    let settled = false

    void gatewayChatStream(model, messages, {
      onChunk: (chunk) => {
        text += chunk
      },
      onUsage: (u) => {
        usage = { ...usage, ...u }
      },
      onEnd: () => {
        if (settled) return
        settled = true
        resolve({ text, usage, cancel: cancel || (() => undefined) })
      },
      onError: (err) => {
        if (settled) return
        settled = true
        reject(new Error(err))
      },
    })
      .then((c) => {
        cancel = c
      })
      .catch((err) => {
        if (settled) return
        settled = true
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
}

export async function gatewayChatStream(
  model: string,
  messages: Array<{ role: string; content: string }>,
  handlers: StreamChatHandlers,
  params?: import('@shared/gateway/constants').GatewayGenerationParams
): Promise<() => void> {
  let cancelled = false
  let cleanupFns: Array<() => void> = []

  async function runStream(forceRefreshKey: boolean): Promise<void> {
    cleanupFns.forEach((fn) => fn())
    cleanupFns = []
    let ended = false
    const finish = () => {
      if (ended) return
      ended = true
      cleanup()
      handlers.onEnd()
    }

    const endpoints = await resolveGatewayEndpoints(forceRefreshKey)
    const key = await ensureGatewayKey(getAppKeyName(), forceRefreshKey)
    const url = `${endpoints.chatBaseUrl}/chat/completions`
    const bodyPayload: Record<string, unknown> = {
      model,
      messages: normalizeChatMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (params?.temperature != null) bodyPayload.temperature = params.temperature
    if (params?.top_p != null) bodyPayload.top_p = params.top_p
    if (params?.presence_penalty != null) bodyPayload.presence_penalty = params.presence_penalty
    if (params?.frequency_penalty != null) bodyPayload.frequency_penalty = params.frequency_penalty
    if (params?.max_tokens != null) bodyPayload.max_tokens = params.max_tokens
    if (params?.tools?.length) bodyPayload.tools = params.tools
    if (params?.tool_choice != null) bodyPayload.tool_choice = params.tool_choice
    const body = JSON.stringify(bodyPayload)

    const seenLines = new Set<string>()
    const ingestLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed || seenLines.has(trimmed)) return
      seenLines.add(trimmed)
      ingestSseDataLine(trimmed, handlers)
    }

    const offChunk = window.api.onSSEChunk((line: string) => {
      ingestLine(line)
    })
    const offEnd = window.api.onSSEEnd(() => {
      /* 等 fetchSSE invoke 返回并回放 lines 后再 finish，避免 IPC 竞态丢 chunk */
    })
    const offError = window.api.onSSEError((err: string) => {
      cleanup()
      ended = true
      if (!cancelled && !forceRefreshKey && isInvalidGatewayTokenError(undefined, err)) {
        void runStream(true).catch((e) => {
          handlers.onError(e instanceof Error ? e.message : '流式请求失败')
        })
        return
      }
      handlers.onError(
        isInvalidGatewayTokenError(undefined, err)
          ? 'API Key 无效或已过期，已尝试自动刷新。请在用户中心检查 Key 与邮箱验证状态'
          : /503|网关暂时不可用|无可用渠道|no available channel/i.test(err)
            ? (err.includes('503') && err.length < 80
              ? '模型网关暂时不可用（503），请确认账户后台「New API → 网关配置」上游已启动，且对应模型渠道已启用'
              : formatGatewayApiError(err))
            : formatGatewayApiError(err)
      )
    })

    function cleanup() {
      offChunk()
      offEnd()
      offError()
    }

    cleanupFns = [cleanup]

    try {
      const result = (await window.api.fetchSSE({
        url,
        method: 'POST',
        body,
        token: key,
        timeoutMs: params?.timeoutMs ?? 120_000,
      })) as { lines?: string[] } | void
      for (const line of result?.lines ?? []) {
        ingestLine(line)
      }
      if (!ended && !cancelled) finish()
    } catch (err) {
      cleanup()
      ended = true
      const msg = err instanceof Error ? err.message : '流式请求失败'
      if (!cancelled && !forceRefreshKey && isInvalidGatewayTokenError(undefined, msg)) {
        await runStream(true)
        return
      }
      handlers.onError(
        isInvalidGatewayTokenError(undefined, msg)
          ? 'API Key 无效或已过期，已尝试自动刷新。请在用户中心检查 Key 与邮箱验证状态'
          : formatGatewayApiError(msg)
      )
    }
  }

  await runStream(false)

  return () => {
    cancelled = true
    void window.api.cancelSSE()
    cleanupFns.forEach((fn) => fn())
    cleanupFns = []
  }
}
