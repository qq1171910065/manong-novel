import type { Character } from '@shared/novel/types'
import { gatewayChatCompletion, gatewayImageGenerate } from './gateway-api'
import { ensureLocalImageDataUrl } from './image-storage'
import {
  resolveProjectChatModelId,
  resolveProjectImageModelId,
  type ProjectModelPrefs,
} from './novel/project-model'

export interface NovelVisualContext {
  title?: string
  genre?: string
  style?: string
  tone?: string
  synopsis?: string
}

export type ImagePromptKind = 'cover' | 'portrait'

export function buildCoverPrompt(context: NovelVisualContext): string {
  const title = context.title?.trim() || '未命名小说'
  const genre = context.genre?.trim() || '奇幻'
  const style = context.style?.trim() || '电影感概念艺术'
  const tone = context.tone?.trim() || '史诗'
  const synopsis = context.synopsis?.trim()
  const synopsisHint = synopsis ? `故事梗概：${synopsis.slice(0, 200)}。` : ''
  return [
    `为小说《${title}》设计书籍封面。`,
    `类型：${genre}，风格：${style}，基调：${tone}。`,
    synopsisHint,
    '竖版 3:4 构图，主体突出，留出装帧标题区域，高质量插画，无文字、无水印、无 logo。',
  ]
    .filter(Boolean)
    .join('')
}

export function buildCharacterPortraitPrompt(
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description'>,
  context?: Pick<NovelVisualContext, 'genre' | 'style'>
): string {
  const name = character.name?.trim() || '角色'
  const identity = character.identity?.trim()
  const personality = character.personality?.trim() || character.description?.trim()
  const genre = context?.genre?.trim() || '奇幻'
  const style = context?.style?.trim() || '精细插画'
  return [
    `角色立绘：${name}。`,
    identity ? `身份：${identity}。` : '',
    personality ? `性格气质：${personality}。` : '',
    `世界观类型：${genre}，画风：${style}。`,
    '半身或胸像，背景简洁，面部清晰，高质量，无文字、无水印。',
  ]
    .filter(Boolean)
    .join('')
}

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
    const label = kind === 'cover' ? '书籍封面' : '角色立绘'
    const result = await gatewayChatCompletion(
      model,
      [
        {
          role: 'system',
          content:
            '你是专业的 AI 绘画提示词工程师。根据用户提供的信息，输出一段适合文生图模型的提示词。' +
            '可使用中文与英文关键词混合，描述画面主体、风格、构图、光影。' +
            '只输出提示词正文，不要解释，不要加引号或标题。',
        },
        {
          role: 'user',
          content: `任务：${label}\n参考信息：\n${base}`,
        },
      ],
      { temperature: 0.65, max_tokens: 600 }
    )
    const refined = String(result.content || result.reasoning || '').trim()
    return refined || base
  } catch {
    return base
  }
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
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description'>,
  context?: Pick<NovelVisualContext, 'genre' | 'style'>,
  promptOverride?: string,
  project?: ProjectModelPrefs | null
): Promise<string> {
  const prompt = promptOverride?.trim() || buildCharacterPortraitPrompt(character, context)
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
