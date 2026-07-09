import type { Character } from '@shared/novel/types'

export interface NovelVisualContext {
  title?: string
  genre?: string
  style?: string
  tone?: string
  synopsis?: string
}

export type ImagePromptKind = 'cover' | 'portrait' | 'style'

/** 角色立绘硬性构图框架（写入最终提示词，防止跑题成场景图/海报等） */
export const PORTRAIT_FRAME_PROMPT = [
  '【立绘类型】单人角色立绘，半身像或胸像，角色居中，正面或微侧。',
  '【背景】纯色或简单渐变背景，无复杂场景、无多人大场面。',
  '【禁止】风景图、海报、表情包、Q版大头、分镜、漫画格、手办包装、文字标题、水印、logo。',
  '【禁止】全身远景、战斗场景、复杂动作场面、多人合影、纯背影、无人物空镜。',
].join('')

/** 书籍封面构图框架 */
export const COVER_FRAME_PROMPT = [
  '【封面类型】竖版 3:4 书籍封面插画，单一主视觉，留出装帧标题区域。',
  '【禁止】横版壁纸、内页插图、多格漫画、满屏文字、水印、logo、书籍实物照片。',
].join('')

/** 文风氛围封面构图框架 */
export const STYLE_COVER_FRAME_PROMPT = [
  '【封面类型】横版 16:9 抽象氛围插画，以色调光影质感表达文字风格。',
  '【禁止】人物特写、书籍实物、文字标题、水印、logo、复杂叙事场景。',
].join('')

export function imagePromptTaskMeta(kind: ImagePromptKind): { label: string; system: string } {
  switch (kind) {
    case 'portrait':
      return {
        label: '角色立绘',
        system: [
          '你是专业的 AI 绘画提示词工程师，任务是为【角色立绘】生成文生图提示词。',
          '',
          '【立绘定义 — 必须写入提示词】',
          '单人角色立绘，半身像或胸像，角色为主体居中；纯色或简单渐变背景；面部与上半身清晰可见。',
          '不得生成：风景、海报、表情包、Q版、分镜、漫画格、手办、3D 模型展示、全身战斗场景、多人场面、纯文字图。',
          '',
          '【内容范围 — 极其重要】',
          '只描写与人物外貌直接相关的内容：脸型、发型、五官、体型、肤色、年龄感、服装、配饰、可见道具、气质神态（仅限视觉层面）。',
          '禁止写入：剧情、背景故事、心理活动、性格侧面描写、能力特效、法术光效、与其他人物的关系、环境叙事、无关氛围铺陈。',
          '用户提供的性格/能力/摘要等信息仅作理解参考，不要写进提示词，除非其中包含可直接看见的外貌或服饰描述。',
          '',
          '【设定约束】',
          '严格依据用户提供的角色设定，不得编造与设定冲突的外貌、服饰、年龄、种族或道具；信息不足时只补充构图与画风，不编造人设。',
          '',
          '【输出要求】',
          '使用中文，输出一段可直接提交的提示词：先写立绘构图框架，再写外貌与服饰，最后写画风与质量要求；不要解释、不要标题、不要引号。',
        ].join('\n'),
      }
    case 'cover':
      return {
        label: '书籍封面',
        system: [
          '你是专业的 AI 绘画提示词工程师，任务是为【书籍封面】生成文生图提示词。',
          '',
          '【封面定义 — 必须写入提示词】',
          '竖版 3:4 书籍封面插画，单一主视觉突出，预留装帧标题留白；可含与题材相关的象征元素，但不要堆砌剧情摘要。',
          '不得生成：横版壁纸、内页插图、多格漫画、满屏文字、水印、logo、书籍实物照片、无主题抽象纹理。',
          '',
          '【内容范围】',
          '聚焦封面主视觉：主体形象或象征物、题材类型、风格基调、色彩光影；避免大段故事叙述与无关侧面描写。',
          '',
          '【输出要求】',
          '使用中文，输出一段可直接提交的提示词；不要解释、不要标题、不要引号。',
        ].join('\n'),
      }
    case 'style':
      return {
        label: '文风氛围封面',
        system: [
          '你是专业的 AI 绘画提示词工程师，任务是为【文风氛围封面】生成文生图提示词。',
          '',
          '【封面定义 — 必须写入提示词】',
          '横版 16:9 抽象氛围插画，以色调、光影、质感与抽象意象表达文字风格；不要人物特写，不要书籍实物。',
          '不得生成：人物立绘、叙事场景、文字标题、水印、logo。',
          '',
          '【内容范围】',
          '聚焦风格意象与色彩氛围，避免剧情叙述与人物外貌描写。',
          '',
          '【输出要求】',
          '使用中文，输出一段可直接提交的提示词；不要解释、不要标题、不要引号。',
        ].join('\n'),
      }
  }
}

export function appendFrameToPrompt(kind: ImagePromptKind, prompt: string): string {
  const text = prompt.trim()
  if (!text) return text
  const frame =
    kind === 'portrait'
      ? PORTRAIT_FRAME_PROMPT
      : kind === 'cover'
        ? COVER_FRAME_PROMPT
        : STYLE_COVER_FRAME_PROMPT
  if (text.includes('【立绘类型】') || text.includes('【封面类型】')) return text
  return `${text}\n${frame}`
}

export function buildCoverPrompt(context: NovelVisualContext): string {
  const title = context.title?.trim() || '未命名小说'
  const genre = context.genre?.trim() || '奇幻'
  const style = context.style?.trim() || '电影感概念艺术'
  const tone = context.tone?.trim() || '史诗'
  const synopsis = context.synopsis?.trim()
  const synopsisHint = synopsis ? `题材意象参考：${synopsis.slice(0, 120)}。` : ''
  return [
    `为小说《${title}》设计书籍封面主视觉。`,
    `类型：${genre}，风格：${style}，基调：${tone}。`,
    synopsisHint,
    COVER_FRAME_PROMPT,
    '高质量插画，无文字、无水印、无 logo。',
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
    character.identity?.trim() ? `身份（影响服饰气质）：${character.identity.trim()}` : '',
    character.description?.trim() ? `外貌与形象：${character.description.trim()}` : '',
    extras?.genre?.trim() ? `作品题材：${extras.genre.trim()}` : '',
    extras?.style?.trim() ? `画风：${extras.style.trim()}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildCharacterPortraitPrompt(
  character: Pick<Character, 'name' | 'identity' | 'personality' | 'description' | 'abilities'>,
  context?: Pick<NovelVisualContext, 'genre' | 'style'>
): string {
  const genre = context?.genre?.trim() || '奇幻'
  const style = context?.style?.trim() || '精细插画'
  const draft = buildCharacterPortraitDraft(character, { genre, style })
  return [
    draft,
    '',
    PORTRAIT_FRAME_PROMPT,
    '绘画要求：严格依据设定中的外貌与服饰绘制，不得编造冲突的年龄、种族、发型、服装或道具。',
    `画风：${style}，高质量插画，无文字、无水印。`,
  ].join('\n')
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
    `为写作风格「${title}」创作抽象氛围封面主视觉。`,
    `题材：${genre}，叙述风格：${style}，基调口吻：${tone}。`,
    summary ? `风格意象：${summary.slice(0, 100)}。` : '',
    hints ? `笔触参考：${hints.slice(0, 80)}。` : '',
    tags ? `关键词：${tags}。` : '',
    STYLE_COVER_FRAME_PROMPT,
    '高质量插画，无文字、无水印、无 logo。',
  ]
    .filter(Boolean)
    .join('')
}
