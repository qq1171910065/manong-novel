import type { Character } from '@shared/novel/types'
import { gatewayChatCompletion, gatewayImageGenerate } from './gateway-api'
import { ensureLocalImageDataUrl } from './image-storage'
import {
  appendFrameToPrompt,
  buildCharacterPortraitPrompt,
  buildCoverPrompt,
  buildStyleCoverPrompt,
  imagePromptTaskMeta,
  type ImagePromptKind,
  type NovelVisualContext,
} from './image-prompt-builder'
import {
  resolveProjectChatModelId,
  resolveProjectImageModelId,
  type ProjectModelPrefs,
} from './novel/project-model'

export type { ImagePromptKind, NovelVisualContext } from './image-prompt-builder'
export {
  buildCharacterPortraitDraft,
  buildCharacterPortraitPrompt,
  buildCoverPrompt,
  buildStyleCoverPrompt,
  COVER_FRAME_PROMPT,
  PORTRAIT_FRAME_PROMPT,
  STYLE_COVER_FRAME_PROMPT,
} from './image-prompt-builder'

/** 用对话模型将草稿信息整理为可提交的绘图提示词 */
export async function analyzeImagePrompt(
  kind: ImagePromptKind,
  draft: string,
  project?: ProjectModelPrefs | null
): Promise<string> {
  const base = draft.trim()
  if (!base) return ''

  try {
    const model = await resolveProjectChatModelId(project)
    const { label, system } = imagePromptTaskMeta(kind)
    const result = await gatewayChatCompletion(
      model,
      [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `任务：${label}\n参考信息：\n${base}`,
        },
      ],
      { temperature: kind === 'portrait' ? 0.45 : 0.55, max_tokens: 520 }
    )
    const refined = String(result.content || result.reasoning || '').trim()
    return appendFrameToPrompt(kind, refined || base)
  } catch {
    return appendFrameToPrompt(kind, base)
  }
}

export async function generateStyleCoverImage(
  input: {
    title?: string
    summary?: string
    genre?: string
    style?: string
    tone?: string
    writingHints?: string
    tags?: string[]
  },
  project?: ProjectModelPrefs | null
): Promise<string> {
  const baseDraft = buildStyleCoverPrompt(input)
  const prompt = await analyzeImagePrompt('style', baseDraft, project)
  const model = await resolveProjectImageModelId(project)
  const dataUrl = await gatewayImageGenerate({ prompt, size: '1792x1024', model })
  return ensureLocalImageDataUrl(dataUrl)
}

export async function generateCoverImage(
  context: NovelVisualContext,
  promptOverride?: string,
  project?: ProjectModelPrefs | null
): Promise<string> {
  const prompt = promptOverride?.trim() || buildCoverPrompt(context)
  const model = await resolveProjectImageModelId(project)
  const dataUrl = await gatewayImageGenerate({ prompt, size: '1024x1792', model })
  return ensureLocalImageDataUrl(dataUrl)
}

export async function generateCharacterPortrait(
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description' | 'abilities'>,
  context?: Pick<NovelVisualContext, 'genre' | 'style'>,
  promptOverride?: string,
  project?: ProjectModelPrefs | null,
  options?: { portraitDraft?: string; skipPromptRefine?: boolean }
): Promise<string> {
  const baseDraft =
    options?.portraitDraft?.trim() ||
    promptOverride?.trim() ||
    buildCharacterPortraitPrompt(character, context)
  const prompt = options?.skipPromptRefine
    ? appendFrameToPrompt('portrait', baseDraft)
    : await analyzeImagePrompt('portrait', baseDraft, project)
  const model = await resolveProjectImageModelId(project)
  const dataUrl = await gatewayImageGenerate({ prompt, size: '1024x1024', model })
  return ensureLocalImageDataUrl(dataUrl)
}

export async function persistUploadedImage(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }
  if (file.size > maxBytes) {
    throw new Error('图片不能超过 4MB')
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  return ensureLocalImageDataUrl(dataUrl)
}

/** @deprecated 使用 persistUploadedImage */
export function readImageFileAsDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  return persistUploadedImage(file, maxBytes)
}
