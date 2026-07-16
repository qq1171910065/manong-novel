import type { WritingMode } from './types'
import {
  CONCEPT_CHECKLIST_LABELS,
  type ConceptChecklistAnswers,
  type ConceptChecklistKey,
  type ConceptConversationState,
  createEmptyChecklist,
  normalizeChecklist,
  requiredChecklistKeys,
} from './concept-checklist/constants'
import { firstIncompleteTopic, isChecklistComplete, rankIncompleteTopicsForQuestioning } from './concept-checklist'

export interface InspirationSuggestionChip {
  id: string
  label: string
  description?: string
}

const STARTER_CHIPS: InspirationSuggestionChip[] = [
  {
    id: 'starter-detective',
    label: '我想写一个能「品尝」谎言的侦探，每一句假话都有味道。',
    description: '都市悬疑',
  },
  {
    id: 'starter-xuanhuan',
    label: '东方玄幻：灵脉枯竭的乱世，边陲少年被迫踏上修行之路。',
    description: '成长与抉择',
  },
  {
    id: 'starter-scifi',
    label: '近未来科幻：记忆可以被买卖，主角发现自己的童年是伪造的。',
    description: '身份危机',
  },
  {
    id: 'starter-romance',
    label: '现代言情：前任成了我的商务对手，合作项目却绑定了我们。',
    description: '试探与破冰',
  },
]

type ChipFactory = (answers: ConceptChecklistAnswers) => InspirationSuggestionChip[]

const TOPIC_CHIP_FACTORIES: Record<ConceptChecklistKey, ChipFactory> = {
  spark: () => STARTER_CHIPS.slice(0, 3),
  genre_tone: (answers) => {
    const spark = answers.spark?.trim()
    if (spark) {
      return [
        {
          id: 'genre-noir',
          label: `类型偏黑色悬疑：在「${clip(spark, 18)}」上加强压迫与反转。`,
          description: '冷峻、克制',
        },
        {
          id: 'genre-warm',
          label: `类型偏温暖成长：保留「${clip(spark, 18)}」，主调写希望与羁绊。`,
          description: '治愈底色',
        },
        {
          id: 'genre-epic',
          label: `类型偏史诗奇幻：把「${clip(spark, 18)}」扩成宗门/势力博弈。`,
          description: '格局更大',
        },
      ]
    }
    return [
      { id: 'genre-urban', label: '都市奇幻，夜色与规则并存。', description: '现代超自然' },
      { id: 'genre-xuanhuan', label: '东方玄幻，冷峻克制里藏希望。', description: '修行乱世' },
      { id: 'genre-mystery', label: '本格悬疑，信息差与反转驱动。', description: '推理解谜' },
    ]
  },
  prose_style: (answers) => {
    const tone = answers.genre_tone?.trim()
    const hint = tone ? `贴合「${clip(tone, 16)}」` : '叙事'
    return [
      {
        id: 'style-cold',
        label: `${hint}用冷峻短句，少形容、多动作与对白推进。`,
        description: '克制笔触',
      },
      {
        id: 'style-lyric',
        label: `${hint}用略带诗意的画面感，但仍保持情节可追读。`,
        description: '意象叙事',
      },
      {
        id: 'style-fast',
        label: `${hint}用网文节奏：章节钩子清晰，信息密度高。`,
        description: '快节奏',
      },
    ]
  },
  protagonist: (answers) => {
    const spark = answers.spark?.trim()
    return [
      {
        id: 'protag-flaw',
        label: spark
          ? `主角因「${clip(spark, 16)}」卷入风暴，致命缺陷是太擅长自欺。`
          : '主角外表克制，致命缺陷是不肯相信别人。',
        description: '缺陷驱动',
      },
      {
        id: 'protag-drive',
        label: '主角驱动力是查明真相，性格锐利、重情但不软弱。',
        description: '真相执念',
      },
      {
        id: 'protag-reluctant',
        label: '主角本想远离纷争，却因一条旧债被迫站到台前。',
        description: '被迫英雄',
      },
    ]
  },
  central_conflict: (answers) => {
    const protag = answers.protagonist?.trim()
    return [
      {
        id: 'conflict-truth',
        label: protag
          ? `主线冲突：保护信任 vs 揭开真相（围绕「${clip(protag, 16)}」）。`
          : '主线冲突：秩序稳定 vs 揭示被掩盖的真相。',
        description: '内外拉扯',
      },
      {
        id: 'conflict-power',
        label: '主线冲突：稀缺资源争夺，个人正义与集体利益对撞。',
        description: '资源博弈',
      },
      {
        id: 'conflict-identity',
        label: '主线冲突：身份被改写/出卖，主角必须夺回自我叙事权。',
        description: '身份危机',
      },
    ]
  },
  antagonist: (answers) => {
    const conflict = answers.central_conflict?.trim()
    return [
      {
        id: 'antag-person',
        label: conflict
          ? `对立面是昔日同伴：理念决裂，正好卡在「${clip(conflict, 16)}」上。`
          : '对立面是昔日同伴，理想相同、手段相反。',
        description: '宿敌',
      },
      {
        id: 'antag-system',
        label: '对立面是体制本身：规则看似公正，实则吞噬异类。',
        description: '系统阻力',
      },
      {
        id: 'antag-shadow',
        label: '对立面是主角自身的「另一面」被外部势力利用。',
        description: '阴影投射',
      },
    ]
  },
  inciting_incident: (answers) => {
    const spark = answers.spark?.trim()
    return [
      {
        id: 'inciting-night',
        label: spark
          ? `催化事件：雨夜事故后，「${clip(spark, 16)}」再也无法伪装成日常。`
          : '催化事件：雨夜逃亡，主角被迫离开安全区。',
        description: '开篇钩子',
      },
      {
        id: 'inciting-letter',
        label: '催化事件：一封署名旧识的委托信带来不可拒绝的条件。',
        description: '委托入局',
      },
      {
        id: 'inciting-expose',
        label: '催化事件：公开场合一场失控，秘密被迫提前曝光。',
        description: '当众破局',
      },
    ]
  },
  core_theme: () => [
    {
      id: 'theme-truth',
      label: '核心主题：真相是否值得用信任去换？',
      description: '伦理选择',
    },
    {
      id: 'theme-power',
      label: '核心主题：权力承诺秩序，是否必然吞掉自由？',
      description: '秩序命题',
    },
    {
      id: 'theme-growth',
      label: '核心主题：成长不是变强，而是学会承担选择的代价。',
      description: '成长代价',
    },
  ],
  working_title: (answers) => {
    const spark = answers.spark?.trim()
    const genre = answers.genre_tone?.trim()
    const base = spark ? clip(spark, 10) : genre ? clip(genre, 10) : '残响'
    return [
      { id: 'title-a', label: `标题方向：《${base}夜谈》`, description: '备选一' },
      { id: 'title-b', label: `标题方向：《未尽的${base}》`, description: '备选二' },
      { id: 'title-c', label: `标题方向：《${base}法则》`, description: '备选三' },
    ]
  },
  chapter_count: () => [
    {
      id: 'chapters-short',
      label: '篇幅定短篇：6 章左右，三幕清晰收束。',
      description: '短篇',
    },
    {
      id: 'chapters-mid',
      label: '篇幅定中篇：12 章左右，有余地写人物弧。',
      description: '中篇',
    },
    {
      id: 'chapters-long',
      label: '篇幅定长篇：24 章起步，适合连载与伏笔回收。',
      description: '长篇',
    },
  ],
}

const COMPLETE_CHIPS: InspirationSuggestionChip[] = [
  {
    id: 'complete-review',
    label: '设定看起来齐了，请用两三段帮我复述主线，并标出仍可 sharpen 的点。',
    description: '收束复盘',
  },
  {
    id: 'complete-protag',
    label: '主角再锋利一点：强化致命缺陷，并写清它如何制造麻烦。',
    description: '微调主角',
  },
  {
    id: 'complete-opening',
    label: '开篇钩子再狠一点：催化事件要在第一章就把读者拽进去。',
    description: '强化开篇',
  },
]

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function buildInspirationSuggestionChips(options: {
  mode: WritingMode
  state?: ConceptConversationState | null
  /** 对话是否已有内容（不含仅加载态） */
  hasConversation?: boolean
  maxChips?: number
}): InspirationSuggestionChip[] {
  const maxChips = options.maxChips ?? 3
  const answers = options.state?.checklist_answers ?? {}
  const drafts = options.state?.checklist_drafts ?? {}
  const checklist = normalizeChecklist(options.state?.checklist) ?? createEmptyChecklist()

  if (!options.hasConversation) {
    return STARTER_CHIPS.slice(0, maxChips)
  }

  if (isChecklistComplete(checklist, options.mode)) {
    return COMPLETE_CHIPS.slice(0, maxChips)
  }

  const ranked = rankIncompleteTopicsForQuestioning(checklist, answers, drafts, options.mode)
  const primary = ranked[0] ?? firstIncompleteTopic(checklist, options.mode)
  if (!primary) return COMPLETE_CHIPS.slice(0, maxChips)

  const chips = TOPIC_CHIP_FACTORIES[primary](answers).slice(0, maxChips)
  if (chips.length > 0) return chips

  const label = CONCEPT_CHECKLIST_LABELS[primary]
  return [
    {
      id: `fallback-${primary}`,
      label: `继续完善「${label}」：请基于已有设定给出一个具体可写的版本。`,
      description: label,
    },
  ]
}

export function inspirationSuggestionTopicLabel(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode
): string | null {
  const checklist = normalizeChecklist(state?.checklist)
  const key = firstIncompleteTopic(checklist, mode)
  if (!key) return null
  if (!requiredChecklistKeys(mode).includes(key)) return null
  return CONCEPT_CHECKLIST_LABELS[key]
}
