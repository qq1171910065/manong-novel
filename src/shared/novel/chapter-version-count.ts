import type { ChapterOutline } from './types'

const IMPORTANCE_KEYWORDS = [
  '转折',
  '高潮',
  '决战',
  '揭秘',
  '反转',
  '危机',
  '关键',
  '重要',
  '真相',
  '对决',
  '爆发',
  '命运',
  '终局',
  '伏笔',
  '揭示',
]

const DIVERGENCE_KEYWORDS = [
  '支线',
  '回忆',
  '闪回',
  '多线',
  '视角',
  '发散',
  '旁支',
  '插叙',
  '平行',
  '梦境',
  '倒叙',
  '外传',
  '分支',
  '双线',
]

function keywordScore(text: string, keywords: string[]): number {
  if (!text.trim()) return 0
  const normalized = text.toLowerCase()
  let hits = 0
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) hits += 1
  }
  return Math.min(1, hits / 3)
}

function positionImportance(chapterNumber: number, totalChapters: number): number {
  if (totalChapters <= 1) return 0.5
  const ratio = chapterNumber / totalChapters
  if (chapterNumber === 1) return 0.55
  if (chapterNumber === totalChapters) return 0.85
  if (ratio >= 0.65 && ratio <= 0.8) return 0.75
  return 0.35
}

export function scoreChapterImportance(
  outline: ChapterOutline | undefined,
  totalChapters: number
): number {
  const text = `${outline?.title || ''} ${outline?.summary || ''}`
  const keywordPart = keywordScore(text, IMPORTANCE_KEYWORDS)
  const positionPart = positionImportance(outline?.chapter_number ?? 1, totalChapters)
  return Math.min(1, keywordPart * 0.65 + positionPart * 0.35)
}

export function scoreChapterDivergence(outline: ChapterOutline | undefined): number {
  const text = `${outline?.title || ''} ${outline?.summary || ''}`
  return keywordScore(text, DIVERGENCE_KEYWORDS)
}

/**
 * 根据章节重要程度与发散程度，随机生成 2~5 个版本数。
 * 重要/发散程度越高，越倾向于生成更多版本。
 */
export function resolveChapterVersionCount(
  outline: ChapterOutline | undefined,
  totalChapters: number
): number {
  const importance = scoreChapterImportance(outline, totalChapters)
  const divergence = scoreChapterDivergence(outline)
  const weight = Math.min(1, importance * 0.55 + divergence * 0.45)

  const minTarget = weight < 0.35 ? 2 : weight < 0.65 ? 3 : 4
  const maxTarget = weight < 0.35 ? 3 : weight < 0.65 ? 4 : 5
  const span = maxTarget - minTarget + 1

  return minTarget + Math.floor(Math.random() * span)
}

export const CHAPTER_VERSION_STYLE_HINTS = [
  '情绪更细腻，节奏更慢，多写内心戏和感官描写',
  '冲突更强，节奏更快，多写动作和对话',
  '悬念更重，多埋伏笔，结尾钩子更强',
  '文风更诗意，意象与氛围更浓',
  '叙事更贴近角色内心，潜台词更丰富',
] as const
