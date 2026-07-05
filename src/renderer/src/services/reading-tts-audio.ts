const PCM_SAMPLE_RATES = [24000, 22050, 16000, 44100, 48000, 32000] as const

function isWavBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  const view = new DataView(buffer)
  return view.getUint32(0, false) === 0x52494646 && view.getUint32(8, false) === 0x57415645
}

function isLikelyMp3(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 3) return false
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

function isOggBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const view = new DataView(buffer)
  return view.getUint32(0, false) === 0x4f676753
}

function looksLikeTextPayload(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength))
  const text = String.fromCharCode(...head).trimStart()
  return text.startsWith('{') || text.startsWith('[') || text.startsWith('<')
}

function looksLikeRawPcm(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2 || buffer.byteLength % 2 !== 0) return false
  if (isWavBuffer(buffer) || isLikelyMp3(buffer) || isOggBuffer(buffer)) return false
  return !looksLikeTextPayload(buffer)
}

export function pcm16LeToWav(pcm: ArrayBuffer, sampleRate = 24000, channels = 1): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcm)
  const dataSize = pcmBytes.byteLength
  const blockAlign = channels * 2
  const byteRate = sampleRate * blockAlign
  const wav = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wav)
  const bytes = new Uint8Array(wav)

  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < tag.length; i++) bytes[offset + i] = tag.charCodeAt(i)
  }

  writeTag(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeTag(8, 'WAVE')
  writeTag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeTag(36, 'data')
  view.setUint32(40, dataSize, true)
  bytes.set(pcmBytes, 44)
  return wav
}

function audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const channels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const interleaved = new Int16Array(length * channels)

  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = audioBuffer.getChannelData(ch)[i]
      const clamped = Math.max(-1, Math.min(1, sample))
      interleaved[i * channels + ch] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }
  }

  return pcm16LeToWav(interleaved.buffer, audioBuffer.sampleRate, channels)
}

/** 将网关/缓存中的 PCM、WAV、MP3、OGG 等统一成可识别格式 */
export function normalizeTtsAudioBuffer(buffer: ArrayBuffer): ArrayBuffer {
  if (buffer.byteLength < 2) {
    throw new Error('语音数据无效或过小，请检查网关 TTS 配置')
  }
  if (isWavBuffer(buffer) || isLikelyMp3(buffer) || isOggBuffer(buffer)) return buffer
  if (buffer.byteLength % 2 === 0) {
    if (looksLikeTextPayload(buffer)) {
      throw new Error('语音合成返回了无效数据，请检查网关 TTS 配置')
    }
    return pcm16LeToWav(buffer)
  }
  throw new Error('语音数据格式无法识别，请确认网关 TTS 返回 WAV 或 PCM')
}

export function resolveTtsAudioMimeType(buffer: ArrayBuffer): string {
  if (isLikelyMp3(buffer)) return 'audio/mpeg'
  if (isOggBuffer(buffer)) return 'audio/ogg'
  if (isWavBuffer(buffer)) return 'audio/wav'
  return 'audio/wav'
}

export function isPlayableTtsBuffer(buffer: ArrayBuffer): boolean {
  if (!buffer.byteLength) return false
  if (looksLikeTextPayload(buffer)) return false
  if (isLikelyMp3(buffer) || isOggBuffer(buffer)) return buffer.byteLength >= 4
  return isWavBuffer(buffer) && buffer.byteLength >= 44
}

export function assertPlayableTtsBuffer(buffer: ArrayBuffer): void {
  if (!buffer.byteLength) throw new Error('语音数据为空')
  if (looksLikeTextPayload(buffer)) {
    throw new Error('语音合成返回了无效数据，请检查网关 TTS 配置')
  }
  if (!isPlayableTtsBuffer(buffer)) {
    throw new Error('语音格式无法播放，请重新合成')
  }
}

function buildDecodeCandidates(buffer: ArrayBuffer): ArrayBuffer[] {
  const candidates: ArrayBuffer[] = []

  try {
    candidates.push(normalizeTtsAudioBuffer(buffer))
  } catch {
    /* fall through */
  }

  if (isWavBuffer(buffer) || isLikelyMp3(buffer) || isOggBuffer(buffer)) {
    candidates.push(buffer)
  }

  if (looksLikeRawPcm(buffer)) {
    for (const rate of PCM_SAMPLE_RATES) {
      candidates.push(pcm16LeToWav(buffer, rate))
    }
  }

  return candidates
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null
}

/** 解码 TTS 音频为 AudioBuffer，兼容 PCM 采样率差异 */
export async function decodeTtsToAudioBuffer(
  buffer: ArrayBuffer,
  ctx?: AudioContext
): Promise<AudioBuffer> {
  const AudioCtx = getAudioContextCtor()
  if (!AudioCtx) throw new Error('当前环境不支持 Web Audio，无法播放听书')

  const ownCtx = !ctx
  const audioCtx = ctx ?? new AudioCtx()
  const candidates = buildDecodeCandidates(buffer)
  if (!candidates.length) {
    if (ownCtx) await audioCtx.close().catch(() => undefined)
    throw new Error('语音数据无效，请检查网关 TTS 配置')
  }

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const decoded = await audioCtx.decodeAudioData(candidate.slice(0))
      if (ownCtx) await audioCtx.close().catch(() => undefined)
      return decoded
    } catch (error) {
      lastError = error
    }
  }

  if (ownCtx) await audioCtx.close().catch(() => undefined)
  throw new Error(
    lastError instanceof Error && lastError.message
      ? `音频解码失败：${lastError.message}`
      : '音频解码失败，请重试或更换听书音色'
  )
}

/** 通过 Web Audio 解码并转为标准 PCM16 WAV */
export async function ensureBrowserPlayableTtsBuffer(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const AudioCtx = getAudioContextCtor()
  if (!AudioCtx) return normalizeTtsAudioBuffer(buffer)

  const ctx = new AudioCtx()
  try {
    const decoded = await decodeTtsToAudioBuffer(buffer, ctx)
    return audioBufferToWav(decoded)
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

export class TtsSessionPlayer {
  private ctx: AudioContext | null = null
  private buffers = new Map<number, AudioBuffer>()
  private source: AudioBufferSourceNode | null = null
  private offset = 0
  private startedAt = 0
  private playing = false
  private activeIndex = -1
  private endedCallback: (() => void) | null = null

  private async getContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = getAudioContextCtor()
      if (!Ctor) throw new Error('当前环境不支持 Web Audio，无法播放听书')
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  isReady(index: number): boolean {
    return this.buffers.has(index)
  }

  async loadSegment(index: number, rawBuffer: ArrayBuffer): Promise<void> {
    if (this.buffers.has(index)) return
    const ctx = await this.getContext()
    const decoded = await decodeTtsToAudioBuffer(rawBuffer, ctx)
    this.buffers.set(index, decoded)
  }

  dropSegmentsBefore(index: number): void {
    for (const key of this.buffers.keys()) {
      if (key < index - 1) this.buffers.delete(key)
    }
  }

  private stopSource(): void {
    if (!this.source) return
    const source = this.source
    this.source = null
    this.playing = false
    source.onended = null
    try {
      source.stop()
    } catch {
      /* already stopped */
    }
    source.disconnect()
  }

  async play(index: number, onEnded?: () => void): Promise<void> {
    const buffer = this.buffers.get(index)
    if (!buffer) throw new Error('段落音频尚未就绪')

    if (onEnded) this.endedCallback = onEnded
    const ctx = await this.getContext()

    if (this.activeIndex !== index) {
      this.offset = 0
      this.activeIndex = index
    }

    this.stopSource()

    const remaining = buffer.duration - this.offset
    if (remaining <= 0.01) {
      this.offset = 0
      this.endedCallback?.()
      return
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (!this.playing) return
      this.playing = false
      this.source = null
      this.offset = 0
      this.endedCallback?.()
    }

    source.start(0, this.offset)
    this.startedAt = ctx.currentTime - this.offset
    this.source = source
    this.playing = true
  }

  pause(): void {
    if (!this.playing || !this.ctx) return
    const buffer = this.buffers.get(this.activeIndex)
    if (!buffer) return
    this.offset = Math.min(buffer.duration, Math.max(0, this.ctx.currentTime - this.startedAt))
    this.stopSource()
  }

  stop(): void {
    this.offset = 0
    this.activeIndex = -1
    this.stopSource()
  }

  async dispose(): Promise<void> {
    this.stop()
    this.endedCallback = null
    this.buffers.clear()
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined)
    }
    this.ctx = null
  }
}

export class TtsWebAudioPlayer {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private startedAt = 0
  private offset = 0
  private playing = false
  private endedCallback: (() => void) | null = null

  async load(rawBuffer: ArrayBuffer): Promise<void> {
    await this.dispose()
    const AudioCtx = getAudioContextCtor()
    if (!AudioCtx) throw new Error('当前环境不支持 Web Audio，无法播放听书')

    this.ctx = new AudioCtx()
    this.buffer = await decodeTtsToAudioBuffer(rawBuffer, this.ctx)
    this.offset = 0
  }

  private stopSource(): void {
    if (!this.source) return
    const source = this.source
    this.source = null
    this.playing = false
    source.onended = null
    try {
      source.stop()
    } catch {
      /* already stopped */
    }
    source.disconnect()
  }

  async play(onEnded?: () => void): Promise<void> {
    if (!this.ctx || !this.buffer) throw new Error('无音频数据')
    if (onEnded) this.endedCallback = onEnded

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }

    this.stopSource()

    const remaining = this.buffer.duration - this.offset
    if (remaining <= 0.01) {
      this.offset = 0
      this.endedCallback?.()
      return
    }

    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.ctx.destination)
    source.onended = () => {
      if (!this.playing) return
      this.playing = false
      this.source = null
      this.offset = 0
      this.endedCallback?.()
    }

    source.start(0, this.offset)
    this.startedAt = this.ctx.currentTime - this.offset
    this.source = source
    this.playing = true
  }

  pause(): void {
    if (!this.playing || !this.ctx || !this.buffer) return
    this.offset = Math.min(this.buffer.duration, Math.max(0, this.ctx.currentTime - this.startedAt))
    this.stopSource()
  }

  stop(): void {
    this.offset = 0
    this.stopSource()
  }

  async dispose(): Promise<void> {
    this.stop()
    this.endedCallback = null
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined)
    }
    this.ctx = null
    this.buffer = null
  }
}

export interface TtsAudioHandle {
  url: string
  audio: HTMLAudioElement
}

export async function createTtsAudioElement(buffer: ArrayBuffer): Promise<TtsAudioHandle> {
  const playable = await ensureBrowserPlayableTtsBuffer(buffer)
  assertPlayableTtsBuffer(playable)
  const mime = resolveTtsAudioMimeType(playable)
  const blob = new Blob([playable], { type: mime })
  const url = URL.createObjectURL(blob)
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = url
  return { url, audio }
}

export function formatAudioElementError(audio: HTMLAudioElement): string {
  const code = audio.error?.code
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return '音频加载被中止'
    case MediaError.MEDIA_ERR_NETWORK:
      return '网络错误导致音频加载失败'
    case MediaError.MEDIA_ERR_DECODE:
      return '音频解码失败，请重试或更换 TTS 模型'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return '音频无法播放，请重试或更换听书音色'
    default:
      return '音频播放失败'
  }
}

export function waitForAudioElement(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (audio.error) {
      reject(new Error(formatAudioElementError(audio)))
      return
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve()
      return
    }

    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(formatAudioElementError(audio)))
    }
    const cleanup = () => {
      audio.removeEventListener('canplaythrough', onReady)
      audio.removeEventListener('error', onError)
    }

    audio.addEventListener('canplaythrough', onReady, { once: true })
    audio.addEventListener('error', onError, { once: true })
    audio.load()
  })
}
