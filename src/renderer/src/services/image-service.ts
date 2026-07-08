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

export type ImagePromptKind = 'cover' | 'portrait' | 'style'

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

export function buildCharacterPortraitDraft(
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description' | 'abilities'>,
  extras?: { summary?: string; tags?: string[]; title?: string; genre?: string; style?: string }
): string {
  const name = character.name?.trim() || extras?.title?.trim() || '角色'
  const lines = [
    `角色姓名：${name}`,
    character.identity?.trim() ? `身份：${character.identity.trim()}` : '',
    character.description?.trim() ? `外貌与形象：${character.description.trim()}` : '',
    character.personality?.trim() ? `性格气质：${character.personality.trim()}` : '',
    character.abilities?.trim() ? `能力特征：${character.abilities.trim()}` : '',
    extras?.summary?.trim() ? `角色摘要：${extras.summary.trim()}` : '',
    extras?.tags?.length ? `标签：${extras.tags.join('、')}` : '',
    extras?.genre?.trim() ? `世界观类型：${extras.genre.trim()}` : '',
    extras?.style?.trim() ? `画风参考：${extras.style.trim()}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildCharacterPortraitPrompt(
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description' | 'abilities'>,
  context?: Pick<NovelVisualContext, 'genre' | 'style'>
): string {
  const genre = context?.genre?.trim() || '奇幻'
  const style = context?.style?.trim() || '精细插画'
  const draft = buildCharacterPortraitDraft(character, {
    genre,
    style,
  })
  return [
    draft,
    '',
    `绘画要求：严格依据以上全部角色信息绘制立绘，不得随意编造与设定冲突的外貌、服饰、年龄、种族或道具。`,
    `构图：半身或胸像，背景简洁，面部清晰，画风 ${style}，高质量，无文字、无水印。`,
  ].join('\n')
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
    const portraitRules =
      kind === 'portrait'
        ? '必须严格基于用户提供的全部角色信息生成提示词，不得随意添加与设定冲突的外貌、服饰、年龄、种族或道具。信息不足时只补充构图与画风，不要编造具体人设。'
        : '根据用户提供的信息，输出适合文生图模型的提示词。'
    const result = await gatewayChatCompletion(
      model,
      [
        {
          role: 'system',
          content:
            '你是专业的 AI 绘画提示词工程师。' +
            portraitRules +
            '必须使用中文撰写提示词，完整描述画面主体、风格、构图、光影与氛围。' +
            '不要输出英文，不要解释，不要加引号或标题。',
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

export function buildStyleCoverPrompt(input: {
  title?: string
  summary?: string
  genre?: string
  style?: string
  tone?: string
  writingHints?: string
  tags?: string[]
}): string {
  const title = input.title?.trim() || '文风预设'
  const genre = input.genre?.trim() || '文学'
  const style = input.style?.trim() || '诗意叙事'
  const tone = input.tone?.trim() || '沉静悠远'
  const summary = input.summary?.trim()
  const hints = input.writingHints?.trim()
  const tags = input.tags?.filter(Boolean).join('、')
  return [
    `为写作风格「${title}」创作一张抽象氛围封面图。`,
    `题材：${genre}，叙述风格：${style}，基调口吻：${tone}。`,
    summary ? `风格综述：${summary.slice(0, 160)}。` : '',
    hints ? `笔触意象：${hints.slice(0, 120)}。` : '',
    tags ? `关键词：${tags}。` : '',
    '横版 16:9 构图，以色调、光影、质感与抽象意象表达文字风格，不要人物特写，不要书籍实物，不要任何文字、水印或 logo，高质量插画。',
  ]
    .filter(Boolean)
    .join('')
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
  const prompt = buildStyleCoverPrompt(input)
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
    ? baseDraft
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
