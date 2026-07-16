/**
 * 长篇导入覆盖辅助：分层抽章、后期实体配额，避免实体名单偏开篇。
 */

/** 全书分桶：开篇 / 前中 / 中段 / 后中 / 结尾 */
export function chapterBucketRanges(total: number): Array<{ start: number; end: number }> {
  if (total <= 0) return []
  if (total <= 12) return [{ start: 0, end: total }]
  const cuts = [
    0,
    Math.max(1, Math.floor(total * 0.12)),
    Math.max(1, Math.floor(total * 0.35)),
    Math.max(1, Math.floor(total * 0.65)),
    Math.max(1, Math.floor(total * 0.88)),
    total,
  ]
  const ranges: Array<{ start: number; end: number }> = []
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const start = cuts[i]!
    const end = Math.max(start + 1, cuts[i + 1]!)
    ranges.push({ start, end: Math.min(end, total) })
  }
  return ranges
}

/** 在区间内均匀取章；强制包含区间首尾 */
export function sampleIndicesInRange(start: number, end: number, count: number): number[] {
  const size = Math.max(0, end - start)
  if (size <= 0 || count <= 0) return []
  if (count >= size) {
    return Array.from({ length: size }, (_, i) => start + i)
  }
  const out = new Set<number>()
  out.add(start)
  out.add(end - 1)
  if (count === 1) return [start]
  for (let i = 1; i < count - 1; i += 1) {
    const t = i / (count - 1)
    out.add(start + Math.min(size - 1, Math.floor(t * (size - 1))))
  }
  return [...out].sort((a, b) => a - b).slice(0, count)
}

/**
 * 分层选取章节下标。targetCount 为期望章数；始终覆盖开篇与结尾。
 */
export function pickStratifiedChapterIndices(total: number, targetCount: number): number[] {
  if (total <= 0) return []
  if (total <= targetCount) return Array.from({ length: total }, (_, i) => i)

  const ranges = chapterBucketRanges(total)
  // 开篇与结尾多留一点，中后段合计过半
  const weights = ranges.length === 1 ? [1] : [0.18, 0.18, 0.28, 0.2, 0.16]
  const quota = ranges.map((range, i) => {
    const w = weights[i] ?? 1 / ranges.length
    const size = range.end - range.start
    return Math.max(1, Math.min(size, Math.round(targetCount * w)))
  })

  // 修正总和
  let sum = quota.reduce((a, b) => a + b, 0)
  while (sum > targetCount) {
    let idx = quota.findIndex((q, i) => q > 1 && (ranges[i]!.end - ranges[i]!.start) > 1)
    if (idx < 0) idx = quota.findIndex((q) => q > 1)
    if (idx < 0) break
    quota[idx]! -= 1
    sum -= 1
  }
  while (sum < targetCount) {
    let best = -1
    let bestSlack = -1
    for (let i = 0; i < ranges.length; i += 1) {
      const slack = ranges[i]!.end - ranges[i]!.start - quota[i]!
      if (slack > bestSlack) {
        bestSlack = slack
        best = i
      }
    }
    if (best < 0 || bestSlack <= 0) break
    quota[best]! += 1
    sum += 1
  }

  const picked = new Set<number>()
  ranges.forEach((range, i) => {
    for (const idx of sampleIndicesInRange(range.start, range.end, quota[i]!)) {
      picked.add(idx)
    }
  })
  // 硬保证开篇 2 章 + 结尾 2 章
  ;[0, 1, total - 2, total - 1].forEach((i) => {
    if (i >= 0 && i < total) picked.add(i)
  })
  return [...picked].sort((a, b) => a - b)
}

/**
 * 按章分桶拼接正文：每桶独立字符预算，避免前半本吃光 token。
 * 开篇/结尾强制章优先占位，保证长篇尾部一定进样本。
 */
export function buildStratifiedChapterText(
  chapters: Array<{ title?: string; content: string }>,
  options: {
    maxChars: number
    maxChapterChars: number
    targetChapters?: number
    budgetByBucket?: number[]
  }
): string {
  const total = chapters.length
  if (!total) return ''
  const targetChapters = options.targetChapters ?? Math.min(48, Math.max(12, total))
  const indices = pickStratifiedChapterIndices(total, targetChapters)
  const ranges = chapterBucketRanges(total)
  const defaultBudget = ranges.length === 1 ? [1] : [0.22, 0.18, 0.28, 0.18, 0.14]
  const weights = options.budgetByBucket ?? defaultBudget

  const bucketBudget = ranges.map((_, i) =>
    Math.floor(options.maxChars * (weights[i] ?? 1 / ranges.length))
  )

  const forced = new Set(
    [0, 1, total - 2, total - 1].filter((i) => i >= 0 && i < total)
  )

  const formatPiece = (i: number): string => {
    const ch = chapters[i]
    if (!ch) return ''
    const title = ch.title ? `第${i + 1}章 ${ch.title}` : `第${i + 1}章`
    return `${title}\n${ch.content.slice(0, options.maxChapterChars).trim()}\n\n`
  }

  const byBucket: number[][] = ranges.map(() => [])
  for (const i of indices) {
    const bucket = ranges.findIndex((r) => i >= r.start && i < r.end)
    const b = bucket >= 0 ? bucket : ranges.length - 1
    byBucket[b]!.push(i)
  }

  let text = ''
  for (let b = 0; b < byBucket.length; b += 1) {
    const ordered = [...byBucket[b]!].sort((a, c) => {
      const af = forced.has(a) ? 0 : 1
      const cf = forced.has(c) ? 0 : 1
      if (af !== cf) return af - cf
      return a - c
    })
    let bucketText = ''
    for (const i of ordered) {
      const piece = formatPiece(i)
      if (!piece) continue
      if (bucketText.length + piece.length > bucketBudget[b]!) {
        // 强制章：必要时挤掉非强制内容后仍尝试插入
        if (forced.has(i) && !bucketText.includes(`第${i + 1}章`)) {
          const remain = bucketBudget[b]! - bucketText.length
          if (remain > 120) {
            bucketText += piece.slice(0, remain)
          }
        }
        continue
      }
      bucketText += piece
    }
    text += bucketText
  }

  // 若尾章仍未入样（极端预算），追加压缩尾段
  for (const i of [total - 2, total - 1]) {
    if (i < 0 || i >= total) continue
    if (text.includes(`第${i + 1}章`)) continue
    const piece = formatPiece(i)
    const remain = options.maxChars - text.length
    if (remain > 160) text += piece.slice(0, remain)
  }

  if (text.length > options.maxChars) {
    return `${text.slice(0, options.maxChars)}\n...(截断)`
  }
  return text
}

/** 真正后半本起算比例（章/分片下标） */
export const IMPORT_LATE_FROM_RATIO = 0.5
/** 名单中为后期实体预留的比例 */
export const IMPORT_LATE_RESERVE_RATIO = 0.42

/**
 * 频次名单 + 后期实体保留配额。
 * firstIndex 为首次出现章/分片下标；lateFrom 起算为「后期」。
 */
export function pickTopNamesWithLateReserve(
  entries: Array<{ name: string; count: number; firstIndex: number }>,
  topN: number,
  lateFrom: number,
  lateRatio = IMPORT_LATE_RESERVE_RATIO
): string[] {
  if (topN <= 0 || !entries.length) return []
  const sorted = [...entries].sort(
    (a, b) => b.count - a.count || a.firstIndex - b.firstIndex || a.name.localeCompare(b.name, 'zh')
  )
  const lateQuota = Math.max(2, Math.min(topN - 1, Math.floor(topN * lateRatio)))
  const earlyQuota = topN - lateQuota

  const early = sorted.filter((e) => e.firstIndex < lateFrom)
  const late = sorted.filter((e) => e.firstIndex >= lateFrom)

  const seen = new Set<string>()
  const out: string[] = []
  const push = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    out.push(name)
  }

  for (const e of early) {
    if (out.length >= earlyQuota) break
    push(e.name)
  }
  for (const e of late) {
    if (out.length >= topN) break
    // 先填满 late 配额（相对 early 已占用的部分）
    if (out.length < earlyQuota + lateQuota) push(e.name)
  }
  // 用剩余高频补齐
  for (const e of sorted) {
    if (out.length >= topN) break
    push(e.name)
  }
  return out.slice(0, topN)
}

/**
 * 截断已带后期配额的名单时，仍按 lateRatio 从尾部保留后期名。
 * 适用于 pickTopNamesWithLateReserve 产出后再 slice 进校验/高光的场景。
 */
export function takeWithLateReserve(
  ordered: string[],
  limit: number,
  lateRatio = IMPORT_LATE_RESERVE_RATIO
): string[] {
  if (limit <= 0) return []
  if (ordered.length <= limit) return ordered.slice()

  const lateQuota = Math.max(2, Math.min(limit - 1, Math.floor(limit * lateRatio)))
  const earlyQuota = limit - lateQuota
  // 源名单结构：前段 earlyQuota_src + 后段 late（与 pickTopNamesWithLateReserve 一致）
  const srcLateQuota = Math.max(2, Math.min(ordered.length - 1, Math.floor(ordered.length * lateRatio)))
  const srcEarlyEnd = ordered.length - srcLateQuota
  const early = ordered.slice(0, srcEarlyEnd)
  const late = ordered.slice(srcEarlyEnd)

  const seen = new Set<string>()
  const out: string[] = []
  const push = (name: string) => {
    const n = name.trim()
    if (!n || seen.has(n)) return
    seen.add(n)
    out.push(n)
  }

  for (const name of early) {
    if (out.length >= earlyQuota) break
    push(name)
  }
  for (const name of late) {
    if (out.length >= limit) break
    push(name)
  }
  for (const name of ordered) {
    if (out.length >= limit) break
    push(name)
  }
  return out.slice(0, limit)
}

/** 从已确认名单交错抽取首轮建档角色：前段主力 + 后段后期配角 */
export function pickInterleavedCast(
  ordered: string[],
  limit: number,
  lateRatio = IMPORT_LATE_RESERVE_RATIO
): string[] {
  if (limit <= 0 || !ordered.length) return []
  if (ordered.length <= limit) return ordered.slice()
  return takeWithLateReserve(ordered, limit, lateRatio)
}

/** 从分片列表抽头/中/尾（及四分位）证据，保证中后期名能进校验 prompt */
export function pickStratifiedChunkIndices(chunkCount: number): number[] {
  if (chunkCount <= 0) return []
  if (chunkCount === 1) return [0]
  if (chunkCount === 2) return [0, 1]
  if (chunkCount === 3) return [0, 1, 2]
  const picks = new Set<number>([
    0,
    Math.floor(chunkCount / 4),
    Math.floor(chunkCount / 2),
    Math.floor((chunkCount * 3) / 4),
    chunkCount - 1,
  ])
  return [...picks].sort((a, b) => a - b)
}

type NamedWorldItem = { name?: string; title?: string; description?: string }

function worldItemName(item: NamedWorldItem): string {
  return (item.name || item.title || '').trim()
}

function descriptionScore(desc: string | undefined): number {
  const d = (desc || '').trim()
  if (!d) return 0
  if (/^文中(?:反复)?提及/.test(d) || /^(?:详情待补充|暂无描述|待补充|无)$/.test(d)) return 1
  return d.length
}

/**
 * 地点/阵营去重：同名合并；一名为另一名子串时合并为更长专名并保留更详描述。
 */
export function dedupeNamedWorldItems<T extends NamedWorldItem>(items: T[] | null | undefined): T[] {
  if (!items?.length) return []
  const sorted = [...items]
    .map((item) => ({ ...item, name: worldItemName(item) }))
    .filter((item) => item.name)
    .sort((a, b) => b.name!.length - a.name!.length || a.name!.localeCompare(b.name!, 'zh'))

  const kept: T[] = []
  for (const item of sorted) {
    const name = item.name!
    const hit = kept.findIndex((k) => {
      const kn = worldItemName(k)
      return kn === name || kn.includes(name) || name.includes(kn)
    })
    if (hit < 0) {
      kept.push({ ...item, name } as T)
      continue
    }
    const prev = kept[hit]!
    const prevName = worldItemName(prev)
    const preferName = name.length >= prevName.length ? name : prevName
    const preferDesc =
      descriptionScore(item.description) >= descriptionScore(prev.description)
        ? (item.description || prev.description || '')
        : (prev.description || item.description || '')
    kept[hit] = {
      ...prev,
      ...item,
      name: preferName,
      description: preferDesc,
    } as T
  }
  return kept
}
