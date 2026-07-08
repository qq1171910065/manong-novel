import type { NovelProject } from '@shared/novel/types'
import {
  buildChapterContentRows,
  extractForeshadowings,
  type ForeshadowingItem,
} from '@shared/novel/foreshadowing-tracker'
import { parseLlmJsonObject } from './json-utils'
import { chat } from './writing-service'

export type { ForeshadowingItem } from '@shared/novel/foreshadowing-tracker'

export interface EmotionPoint {
  chapter_number: number
  title: string
  emotion_type: string
  intensity: number
  narrative_phase?: string
  description: string
}

export interface EmotionCurveResponse {
  project_id: string
  project_title: string
  total_chapters: number
  emotion_points: EmotionPoint[]
  average_intensity: number
  emotion_distribution: Record<string, number>
}

export interface ForeshadowingResponse {
  project_id: string
  project_title: string
  total_foreshadowings: number
  planted_count: number
  paid_off_count: number
  overdue_count: number
  foreshadowings: ForeshadowingItem[]
}

const EMOTION_KEYWORDS: Record<string, string[]> = {
  喜悦: ['开心', '高兴', '欣喜', '兴奋', '愉快', '欢乐', '幸福', '满足', '得意', '狂喜', '笑', '乐'],
  悲伤: ['难过', '伤心', '悲痛', '哀伤', '忧郁', '沮丧', '失落', '绝望', '泪', '哭', '痛苦'],
  愤怒: ['生气', '愤怒', '恼火', '暴怒', '怒火', '气愤', '恨', '咬牙', '握拳', '怒吼'],
  恐惧: ['害怕', '恐惧', '惊恐', '担忧', '焦虑', '不安', '颤抖', '发抖', '心惊', '胆寒'],
  惊讶: ['震惊', '惊讶', '意外', '诧异', '愕然', '目瞪口呆', '不敢相信', '难以置信'],
  平静: ['平静', '安宁', '淡然', '从容', '镇定', '沉着', '安详', '宁静'],
}

const NARRATIVE_PHASE_KEYWORDS: Record<string, string[]> = {
  事件: ['突然', '意外', '发现', '出现', '打破', '离奇'],
  势力: ['对立', '敌人', '对手', '势力', '阵营', '威胁'],
  挑衅1: ['挑衅', '嘲讽', '侮辱', '轻视', '看不起'],
  挑衅2: ['打击', '损失', '失去', '剥夺', '阻碍'],
  挑衅3: ['绝境', '危机', '崩溃', '毁灭', '灭顶'],
  回击1: ['反击', '回应', '证明', '小胜'],
  回击2: ['扳回', '逆转', '反败为胜'],
  回击3: ['胜利', '成功', '化解', '解决'],
  回击4: ['揭露', '真相', '幕后', '黑手', '终极'],
}

function buildChapterRows(project: NovelProject) {
  return buildChapterContentRows(project)
}

function analyzeEmotion(text: string): [string, number] {
  const emotionScores: Record<string, number> = {}
  for (const emotion of Object.keys(EMOTION_KEYWORDS)) {
    emotionScores[emotion] = 0
  }

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      emotionScores[emotion] += text.split(keyword).length - 1
    }
  }

  let maxEmotion = '平静'
  let maxScore = 0
  for (const [emotion, score] of Object.entries(emotionScores)) {
    if (score > maxScore) {
      maxScore = score
      maxEmotion = emotion
    }
  }

  if (maxScore === 0) return ['平静', 3]

  let intensity = Math.min(10, Math.max(1, maxScore))
  const exclamationCount = (text.match(/！/g) || []).length + (text.match(/!/g) || []).length
  const questionCount = (text.match(/？/g) || []).length + (text.match(/\?/g) || []).length
  intensity = Math.min(10, intensity + Math.floor(exclamationCount / 3) + Math.floor(questionCount / 5))

  return [maxEmotion, intensity]
}

function detectNarrativePhase(text: string, summary = ''): string | undefined {
  const combinedText = `${text} ${summary}`
  const phaseScores: Record<string, number> = {}
  for (const phase of Object.keys(NARRATIVE_PHASE_KEYWORDS)) {
    phaseScores[phase] = 0
  }

  for (const [phase, keywords] of Object.entries(NARRATIVE_PHASE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) phaseScores[phase] += 1
    }
  }

  let maxPhase = ''
  let maxScore = 0
  for (const [phase, score] of Object.entries(phaseScores)) {
    if (score > maxScore) {
      maxScore = score
      maxPhase = phase
    }
  }

  return maxScore > 0 ? maxPhase : undefined
}

function generateEmotionDescription(emotion: string, intensity: number, title: string): string {
  const ranges: Array<[number, number, string]> = [
    [1, 3, '轻微的'],
    [4, 6, '明显的'],
    [7, 8, '强烈的'],
    [9, 10, '极度的'],
  ]
  for (const [low, high, word] of ranges) {
    if (intensity >= low && intensity <= high) {
      return `《${title}》呈现${word}${emotion}情绪`
    }
  }
  return `《${title}》的情感基调为${emotion}`
}

export function getEmotionCurve(project: NovelProject): EmotionCurveResponse {
  const rows = buildChapterRows(project)
  const emotionPoints: EmotionPoint[] = []
  const emotionCounts: Record<string, number> = {}
  let totalIntensity = 0

  for (const row of rows) {
    const [emotion, intensity] = analyzeEmotion(`${row.content} ${row.summary}`)
    const narrativePhase = detectNarrativePhase(row.content, row.summary)
    const description = generateEmotionDescription(emotion, intensity, row.title)

    emotionPoints.push({
      chapter_number: row.chapter_number,
      title: row.title,
      emotion_type: emotion,
      intensity,
      narrative_phase: narrativePhase,
      description,
    })

    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1
    totalIntensity += intensity
  }

  return {
    project_id: project.id,
    project_title: project.title,
    total_chapters: rows.length,
    emotion_points: emotionPoints,
    average_intensity: rows.length ? Math.round((totalIntensity / rows.length) * 100) / 100 : 0,
    emotion_distribution: emotionCounts,
  }
}

export function getForeshadowing(project: NovelProject): ForeshadowingResponse {
  const foreshadowings = extractForeshadowings(project)

  return {
    project_id: project.id,
    project_title: project.title,
    total_foreshadowings: foreshadowings.length,
    planted_count: foreshadowings.filter((f) => f.status === 'planted').length,
    paid_off_count: foreshadowings.filter((f) => f.status === 'paid_off').length,
    overdue_count: foreshadowings.filter((f) => f.status === 'overdue').length,
    foreshadowings,
  }
}

export async function analyzeEmotionWithAI(project: NovelProject): Promise<EmotionCurveResponse> {
  const rows = buildChapterRows(project)
  const chapterSummaries = rows
    .filter((row) => row.summary.trim())
    .map((row) => `第${row.chapter_number}章《${row.title}》：${row.summary}`)

  if (!chapterSummaries.length) {
    throw new Error('没有可分析的章节，请先生成章节大纲或正文')
  }

  const prompt = `请分析以下小说章节的情感走向，为每个章节返回情感类型和强度。

章节列表：
${chapterSummaries.join('\n')}

请以 JSON 格式返回，格式如下：
{
  "chapters": [
    {
      "chapter_number": 1,
      "emotion_type": "喜悦/悲伤/愤怒/恐惧/惊讶/平静",
      "intensity": 1,
      "narrative_phase": "事件/势力/挑衅1/挑衅2/挑衅3/回击1/回击2/回击3/回击4/过渡",
      "description": "简短的情感描述"
    }
  ]
}

只返回 JSON，不要其他内容。`

  try {
    const raw = await chat(
      '你是一个专业的小说情感分析师。',
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, project }
    )
    const data = parseLlmJsonObject(raw) || {}
    const chapters = Array.isArray(data.chapters) ? data.chapters : []

    const emotionPoints: EmotionPoint[] = []
    const emotionCounts: Record<string, number> = {}
    let totalIntensity = 0

    for (const item of chapters) {
      const entry = item as Record<string, unknown>
      const chapterNumber = Number(entry.chapter_number)
      const row = rows.find((r) => r.chapter_number === chapterNumber)
      const title = row?.title || `第${chapterNumber}章`
      const emotion = String(entry.emotion_type || '平静')
      const intensity = Number(entry.intensity) || 5

      emotionPoints.push({
        chapter_number: chapterNumber,
        title,
        emotion_type: emotion,
        intensity,
        narrative_phase: entry.narrative_phase ? String(entry.narrative_phase) : undefined,
        description: String(entry.description || generateEmotionDescription(emotion, intensity, title)),
      })

      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1
      totalIntensity += intensity
    }

    if (!emotionPoints.length) {
      return getEmotionCurve(project)
    }

    return {
      project_id: project.id,
      project_title: project.title,
      total_chapters: emotionPoints.length,
      emotion_points: emotionPoints.sort((a, b) => a.chapter_number - b.chapter_number),
      average_intensity: Math.round((totalIntensity / emotionPoints.length) * 100) / 100,
      emotion_distribution: emotionCounts,
    }
  } catch {
    return getEmotionCurve(project)
  }
}
