import type { MaterialItem } from './material-library-service'

export interface BuiltinStyleSeed {
  id: string
  title: string
  summary: string
  tags: string[]
  category: 'narrative' | 'tone' | 'rhetoric'
  genre: string
  style: string
  tone: string
  writingHints: string
}

export const BUILTIN_STYLE_SEEDS: BuiltinStyleSeed[] = [
  {
    id: 'mat_builtin_style_noir',
    title: '冷峻悬疑',
    summary: '短句为主、信息密度高，氛围压抑克制，用细节与留白制造张力，适合推理与罪案叙事。',
    tags: ['悬疑', '冷峻', '压抑'],
    category: 'tone',
    genre: '悬疑',
    style: '冷峻写实',
    tone: '压抑克制',
    writingHints: '句子偏短，少形容词堆砌；用细节与留白制造悬念，避免直说情绪。',
  },
  {
    id: 'mat_builtin_style_xianxia',
    title: '古风仙侠',
    summary: '意象丰盈、句长舒展，江湖与仙门交织，基调苍凉悠远，适合东方奇幻与修真题材。',
    tags: ['仙侠', '古风', '诗意'],
    category: 'narrative',
    genre: '仙侠',
    style: '诗意飘逸',
    tone: '苍凉悠远',
    writingHints: '善用意象与对仗，环境描写服务心境；动作场面仍保持文言感的节奏。',
  },
  {
    id: 'mat_builtin_style_romance',
    title: '都市言情',
    summary: '心理描写细腻，对话自然有生活感，基调温暖舒缓，适合现代情感与都市故事。',
    tags: ['言情', '细腻', '温暖'],
    category: 'tone',
    genre: '言情',
    style: '细腻温情',
    tone: '温暖舒缓',
    writingHints: '重视人物内心波动与微表情；对话口语化但不失文学感。',
  },
  {
    id: 'mat_builtin_style_scifi',
    title: '硬核科幻',
    summary: '叙述克制理性，术语准确、逻辑清晰，适合硬科幻与未来主义题材。',
    tags: ['科幻', '理性', '克制'],
    category: 'rhetoric',
    genre: '科幻',
    style: '克制理性',
    tone: '冷峻思辨',
    writingHints: '概念解释融入叙事，避免说明书式旁白；情感通过选择与后果体现。',
  },
  {
    id: 'mat_builtin_style_slice',
    title: '轻松日常',
    summary: '节奏轻快，对话多、生活细节足，基调温暖治愈，适合日常系与轻喜剧。',
    tags: ['日常', '轻快', '治愈'],
    category: 'narrative',
    genre: '日常',
    style: '轻快活泼',
    tone: '温暖治愈',
    writingHints: '用小事件推动情绪；幽默来自人物性格碰撞，而非强行插科打诨。',
  },
]

const SEED_EPOCH = '2026-01-01T00:00:00.000Z'

export function createBuiltinStyleItem(seed: BuiltinStyleSeed): MaterialItem {
  return {
    id: seed.id,
    type: 'styles',
    title: seed.title,
    summary: seed.summary,
    tags: seed.tags,
    payload: {
      builtIn: true,
      blueprintAssetId: seed.id,
      source: 'builtin',
      category: seed.category,
      genre: seed.genre,
      style: seed.style,
      tone: seed.tone,
      writingHints: seed.writingHints,
    },
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  }
}

export function ensureBuiltinStyleSeeds(items: MaterialItem[]): MaterialItem[] {
  const next = [...items]
  let changed = false

  for (const seed of BUILTIN_STYLE_SEEDS) {
    const index = next.findIndex((item) => item.id === seed.id)
    const seeded = createBuiltinStyleItem(seed)
    if (index < 0) {
      next.push(seeded)
      changed = true
      continue
    }
    if (!next[index].payload?.builtIn) {
      next[index] = {
        ...seeded,
        createdAt: next[index].createdAt,
        updatedAt: next[index].updatedAt,
      }
      changed = true
    }
  }

  return changed ? next : items
}
