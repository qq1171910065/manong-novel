import {
  IMPORT_LATE_FROM_RATIO,
  IMPORT_LATE_RESERVE_RATIO,
  pickTopNamesWithLateReserve,
  takeWithLateReserve,
} from './import-coverage'

const DIALOGUE_VERBS =
  '(?:说|道|问|回答|冷笑|大笑|苦笑|点头|摇头|叹气|叹道|解释|怒道|吼道|低语|传音|喊道|叫道|哭道|骂道|笑道|喝道)'

/** 含间隔号：格尔曼·斯帕罗 */
const PERSON_NAME = '[\\u4e00-\\u9fa5]{2,4}(?:·[\\u4e00-\\u9fa5]{2,4})?'

const LOCATION_SUFFIX =
  '(?:城|镇|市|街区|区|国|府|宫|殿|山|岛|界|域|县|村|谷|湖|海|河|州|郡|寺|观|塔|阁|苑|林|洞|渊|原|沙漠|平原|大陆|时空|总部|公馆|庄园|密室|神殿|监牢|监狱|学院|学校|公司|集团)'

/** 禁止单独用「会/派/部」等单字后缀，否则「怎么会」「必然会」会被当成阵营 */
const FACTION_SUFFIX =
  '(?:教会|结社|小队|组织|公司|兄弟会|议会|王室|教派|派系|公会|商会|帮会|盟会|学院|神殿|神社|教团|分部|总部|廷)'

const CHAR_STOP_WORDS = new Set([
  '自己', '怎么', '于是', '接着', '忽然', '突然', '虽然', '既然', '如果', '只要', '为了',
  '并且', '而且', '不仅', '甚至', '难道', '毕竟', '到底', '终于', '立刻', '马上',
  '众人', '大家', '某人', '那个', '这个', '什么', '此时', '此刻', '随后', '然后',
  '少年', '少女', '男子', '女子', '老者', '青年', '中年', '小孩', '师父', '师兄',
  '陛下', '殿下', '将军', '大人', '掌门', '宗主', '长老', '弟子', '一声', '一下',
  '心中', '眼中', '身上', '时候', '一眼', '一步', '今日', '明日', '对方', '两者',
  '一人', '两人', '三人', '前方', '后方', '左右', '上下', '东西', '南北',
  '呵呵', '哈哈', '嘿嘿', '唉呀', '哎呀', '我知', '不知', '你们', '我们', '他们',
  '她们', '它们', '有人', '此人', '其人', '后者', '前者', '彼此', '各自',
  '忽然间', '终于是', '这时候', '那时候',
])

const LOCATION_STOP_WORDS = new Set([
  '这里', '那里', '何处', '哪里', '地方', '房间', '门外', '门口', '地上', '空中',
  '眼前', '身后', '四周', '附近', '远处', '外面', '里面', '上面', '下面', '两边',
  '世界', '人间', '天地', '人间世', '全世界', '另一个', '这个世界',
])

const FACTION_STOP_WORDS = new Set([
  '组织', '公司', '教会', '小队', '帮会', '派系', '议会', '王室', '教派', '商会',
  '总部', '分部', '一个组织', '某个组织', '对方组织', '怎么会', '必然会', '总会',
  '不会', '都会', '才会', '仍会', '也会', '机会', '社会', '一会', '大会', '开会',
])

const ONOMATOPOEIA = /^(?:呵|哈|嘿|嘻|哼|唉|啊|哦|噢|唔|嗯){2,4}$/

function addCounts(counter: Map<string, number>, name: string, weight = 1): void {
  const key = name.trim()
  if (!key) return
  counter.set(key, (counter.get(key) || 0) + weight)
}

function addCountedWithFirst(
  counter: Map<string, number>,
  firstIndex: Map<string, number>,
  name: string,
  chapterIndex: number,
  weight = 1
): void {
  const key = name.trim()
  if (!key) return
  counter.set(key, (counter.get(key) || 0) + weight)
  if (!firstIndex.has(key)) firstIndex.set(key, chapterIndex)
}

/** 启发式初筛：过滤明显不像人名的碎片 */
export function isPlausibleCharacterName(name: string): boolean {
  const n = name.trim()
  if (n.length < 2 || n.length > 8) return false
  if (CHAR_STOP_WORDS.has(n)) return false
  if (ONOMATOPOEIA.test(n)) return false
  if (/^[我你他她它您这那何早晚是否难道怎可却又也却]$/.test(n)) return false
  if (/^(?:不知|我知|你知|却说|说道|问道|笑道|怒道)/.test(n)) return false
  if (/(?:说道|问道|笑道|怒道|喝道|叹道)$/.test(n)) return false
  if (/^(?:怎么|什么|如何|为何|哪里|这儿|那儿)/.test(n)) return false
  // 纯语气/副词碎片
  if (/^(?:忽然|突然|终于|立刻|马上|随后|然后|于是|接着)$/.test(n)) return false
  return /^[\u4e00-\u9fa5·]{2,8}$/.test(n)
}

export function isPlausibleFactionName(name: string): boolean {
  const n = name.trim()
  if (n.length < 2 || n.length > 16) return false
  if (FACTION_STOP_WORDS.has(n)) return false
  if (/^(?:怎么|必然|总|不|都|才|仍|也)会$/.test(n)) return false
  if (/会$/.test(n) && n.length <= 3 && !/(?:教会|公会|商会|帮会|盟会|结社)/.test(n)) {
    return false
  }
  // 至少像组织：包含明确组织语义后缀，或长度>=4 且非常见口语
  if (
    !/(?:教会|结社|小队|组织|公司|兄弟会|议会|王室|教派|派系|公会|商会|帮会|盟会|学院|神殿|神社|教团|分部|总部|廷|帮|盟)$/.test(
      n
    )
  ) {
    return n.length >= 4
  }
  return true
}

export function isPlausibleLocationName(name: string): boolean {
  const n = name.trim()
  if (n.length < 2 || n.length > 16) return false
  if (LOCATION_STOP_WORDS.has(n)) return false
  if (/^(?:这里|那里|何处|哪里|地方)/.test(n)) return false
  return /^[\u4e00-\u9fa5]{2,16}$/.test(n)
}

function scanCharacterNames(
  content: string,
  counter: Map<string, number>,
  firstIndex?: Map<string, number>,
  chapterIndex = 0
): void {
  const patterns = [
    new RegExp(`(${PERSON_NAME})${DIALOGUE_VERBS}`, 'g'),
    new RegExp(`(${PERSON_NAME})[：:]\\s*["「“]`, 'g'),
    new RegExp(`(?:名叫|名为|叫做|自称|人称)(${PERSON_NAME})`, 'g'),
  ]

  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      if (!isPlausibleCharacterName(name)) continue
      if (firstIndex) addCountedWithFirst(counter, firstIndex, name, chapterIndex)
      else addCounts(counter, name)
    }
  }
}

function scanLocationNames(
  content: string,
  counter: Map<string, number>,
  firstIndex?: Map<string, number>,
  chapterIndex = 0
): void {
  const patterns = [
    new RegExp(
      `(?:来到|前往|抵达|位于|坐落于?|进入|离开|回到|逃往|赶往|驻扎在|现身于|潜伏在)([\\u4e00-\\u9fa5]{2,10}${LOCATION_SUFFIX}?)`,
      'g'
    ),
    new RegExp(`([\\u4e00-\\u9fa5]{2,8}${LOCATION_SUFFIX})`, 'g'),
  ]

  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      if (!isPlausibleLocationName(name)) continue
      if (firstIndex) addCountedWithFirst(counter, firstIndex, name, chapterIndex)
      else addCounts(counter, name)
    }
  }
}

function scanFactionNames(
  content: string,
  counter: Map<string, number>,
  firstIndex?: Map<string, number>,
  chapterIndex = 0
): void {
  const patterns = [
    new RegExp(
      `(?:加入|属于|效忠|供职于|听命于|来自|隶属|对抗|镇压|围剿)([\\u4e00-\\u9fa5]{2,12}${FACTION_SUFFIX})`,
      'g'
    ),
    new RegExp(`([\\u4e00-\\u9fa5]{2,10}${FACTION_SUFFIX})`, 'g'),
  ]

  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      if (!isPlausibleFactionName(name)) continue
      if (firstIndex) addCountedWithFirst(counter, firstIndex, name, chapterIndex)
      else addCounts(counter, name)
    }
  }
}

/** 名字是否在原文中真实出现（防模型胡编） */
export function nameAppearsInText(name: string, text: string): boolean {
  const n = name.trim()
  if (!n || n.length < 2) return false
  return text.includes(n)
}

export function extractPotentialCharactersFromChapters(
  chapters: Array<{ content: string }>,
  topN = 200
): string[] {
  const counter = new Map<string, number>()
  const firstIndex = new Map<string, number>()
  chapters.forEach((ch, i) => {
    if (!ch.content) return
    scanCharacterNames(ch.content, counter, firstIndex, i)
  })

  const lateFrom = Math.floor(chapters.length * IMPORT_LATE_FROM_RATIO)
  const entries = [...counter.entries()]
    .filter(([name, count]) => {
      if (!isPlausibleCharacterName(name)) return false
      const first = firstIndex.get(name) ?? 0
      // 后半本短戏份配角：出现 1 次也进候选；前半本仍要求 ≥2 降噪
      const minCount = first >= lateFrom ? 1 : 2
      return count >= minCount
    })
    .map(([name, count]) => ({
      name,
      count,
      firstIndex: firstIndex.get(name) ?? 0,
    }))
  return pickTopNamesWithLateReserve(entries, topN, lateFrom, IMPORT_LATE_RESERVE_RATIO)
}

export function extractPotentialLocationsFromChapters(
  chapters: Array<{ content: string }>,
  topN = 100
): string[] {
  const counter = new Map<string, number>()
  const firstIndex = new Map<string, number>()
  chapters.forEach((ch, i) => {
    if (!ch.content) return
    scanLocationNames(ch.content, counter, firstIndex, i)
  })

  const entries = [...counter.entries()]
    .filter(([name, count]) => isPlausibleLocationName(name) && count >= 2)
    .map(([name, count]) => ({
      name,
      count,
      firstIndex: firstIndex.get(name) ?? 0,
    }))
  const lateFrom = Math.floor(chapters.length * IMPORT_LATE_FROM_RATIO)
  return pickTopNamesWithLateReserve(entries, topN, lateFrom, IMPORT_LATE_RESERVE_RATIO)
}

export function extractPotentialFactionsFromChapters(
  chapters: Array<{ content: string }>,
  topN = 80
): string[] {
  const counter = new Map<string, number>()
  const firstIndex = new Map<string, number>()
  chapters.forEach((ch, i) => {
    if (!ch.content) return
    scanFactionNames(ch.content, counter, firstIndex, i)
  })

  const entries = [...counter.entries()]
    .filter(([name, count]) => isPlausibleFactionName(name) && count >= 2)
    .map(([name, count]) => ({
      name,
      count,
      firstIndex: firstIndex.get(name) ?? 0,
    }))
  const lateFrom = Math.floor(chapters.length * IMPORT_LATE_FROM_RATIO)
  return pickTopNamesWithLateReserve(entries, topN, lateFrom, IMPORT_LATE_RESERVE_RATIO)
}

export function extractCharacterHighlights(
  chapters: Array<{ content: string }>,
  characters: string[],
  contextWindow = 220,
  maxChars = 32_000
): string {
  const usedKeys = new Set<string>()
  const perChar: Array<{ char: string; snippets: string[] }> = []

  for (const char of takeWithLateReserve(characters, 120)) {
    const snippets: Array<{ score: number; text: string; key: string }> = []

    for (let ci = 0; ci < chapters.length; ci++) {
      const content = chapters[ci]?.content || ''
      if (!content.includes(char)) continue
      const re = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const matches = [...content.matchAll(re)]
      if (!matches.length) continue

      // 章内命中过多时，优先首/中/末，保证后文戏份也能入选
      const sampleIdx =
        matches.length <= 6
          ? matches.map((_, i) => i)
          : [0, 1, Math.floor(matches.length / 2), matches.length - 1]

      for (const idx of sampleIdx) {
        const m = matches[idx]
        if (m?.index == null) continue
        const start = Math.max(0, m.index - contextWindow)
        const end = Math.min(content.length, m.index + char.length + contextWindow)
        const key = `${ci}:${start}`
        if (usedKeys.has(key)) continue

        const snippet = content.slice(start, end).trim()
        if (snippet.length < 60) continue
        // 略提高中后章片段优先级
        const chapterBonus = chapters.length > 1 ? (ci / (chapters.length - 1)) * 1.5 : 0
        const score =
          (snippet.match(/[“”「」]/g) || []).length * 2 +
          (snippet.match(/[！？]/g) || []).length +
          chapterBonus
        snippets.push({ score, text: snippet, key })
      }
    }

    snippets.sort((a, b) => b.score - a.score)
    const kept = snippets.slice(0, 2)
    for (const snip of kept) usedKeys.add(snip.key)
    if (kept.length) {
      perChar.push({ char, snippets: kept.map((s) => s.text) })
    }
  }

  // 轮询填入：每人先 1 段，再第二轮，避免开篇高频角色占满预算
  const highlights: string[] = []
  const append = (char: string, text: string): boolean => {
    highlights.push(`--- 【${char}】片段 ---\n${text}\n`)
    return highlights.join('\n').length < maxChars
  }

  for (const row of perChar) {
    const first = row.snippets[0]
    if (!first) continue
    if (!append(row.char, first)) return highlights.join('\n').slice(0, maxChars)
  }
  for (const row of perChar) {
    const second = row.snippets[1]
    if (!second) continue
    if (!append(row.char, second)) return highlights.join('\n').slice(0, maxChars)
  }

  return highlights.join('\n').slice(0, maxChars)
}

/** 仅保留原文可证且形态可信的名字 */
export function filterGroundedNames(
  names: string[],
  sourceText: string,
  allowlist: string[] = [],
  kind: 'character' | 'location' | 'faction' = 'character'
): string[] {
  const allow = new Set(allowlist.map((n) => n.trim()).filter(Boolean))
  const seen = new Set<string>()
  const result: string[] = []
  const plausible =
    kind === 'faction'
      ? isPlausibleFactionName
      : kind === 'location'
        ? isPlausibleLocationName
        : isPlausibleCharacterName

  for (const raw of names) {
    const name = raw.trim()
    if (!name || seen.has(name)) continue
    if (!plausible(name)) continue
    if (allow.has(name) || nameAppearsInText(name, sourceText)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}

/** 统计角色出场次数/章数跨度，供重要度排序 */
export function countCharacterAppearances(
  chapters: Array<{ content: string }>,
  names: string[]
): Map<string, { count: number; chapterHits: number; firstIndex: number; lastIndex: number }> {
  const stats = new Map<
    string,
    { count: number; chapterHits: number; firstIndex: number; lastIndex: number }
  >()
  for (const name of names) {
    const n = name.trim()
    if (!n) continue
    stats.set(n, { count: 0, chapterHits: 0, firstIndex: -1, lastIndex: -1 })
  }
  chapters.forEach((ch, i) => {
    const content = ch.content || ''
    if (!content) return
    for (const [name, row] of stats) {
      if (!content.includes(name)) continue
      const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const hits = content.match(re)?.length || 0
      if (!hits) continue
      row.count += hits
      row.chapterHits += 1
      if (row.firstIndex < 0) row.firstIndex = i
      row.lastIndex = i
    }
  })
  return stats
}

/**
 * 按出场频率与重要度排序：提及次数、出现章数、跨度优先；同频时开篇更早者靠前。
 */
export function rankCharactersByImportance(
  chapters: Array<{ content: string }>,
  names: string[]
): string[] {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (unique.length <= 1) return unique
  const stats = countCharacterAppearances(chapters, unique)
  const scoreOf = (name: string) => {
    const s = stats.get(name)
    if (!s || s.count <= 0) return 0
    const span = s.firstIndex < 0 ? 0 : s.lastIndex - s.firstIndex + 1
    // 开篇出场略加权（主角常在前部）
    const earlyBonus = s.firstIndex >= 0 && s.firstIndex <= 2 ? 8 : 0
    return s.count * 3 + s.chapterHits * 6 + span + earlyBonus
  }
  return unique.sort((a, b) => {
    const diff = scoreOf(b) - scoreOf(a)
    if (diff !== 0) return diff
    const fa = stats.get(a)?.firstIndex ?? 9999
    const fb = stats.get(b)?.firstIndex ?? 9999
    if (fa !== fb) return fa - fb
    return a.localeCompare(b, 'zh')
  })
}

/**
 * 合并规则：以语义/LLM 结果为主，启发式候选仅作补充且仍须过形态校验。
 * 吸收时为后期名额预留槽位，避免只补进开篇高频名。
 */
export function mergeVerifiedCharacterList(
  llmPicks: string[],
  potentialOrdered: string[],
  minCount = 16,
  maxCount = 100
): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const push = (raw: string) => {
    const name = raw.trim()
    if (!name || seen.has(name) || !isPlausibleCharacterName(name)) return false
    seen.add(name)
    out.push(name)
    return true
  }

  for (const name of llmPicks) push(name)

  const lateQuota = Math.max(2, Math.min(maxCount - 1, Math.floor(maxCount * IMPORT_LATE_RESERVE_RATIO)))
  const earlyCap = Math.max(minCount, maxCount - lateQuota)
  const srcLateQuota = Math.max(
    2,
    Math.min(potentialOrdered.length - 1, Math.floor(potentialOrdered.length * IMPORT_LATE_RESERVE_RATIO))
  )
  const srcEarlyEnd = Math.max(0, potentialOrdered.length - srcLateQuota)
  const earlyPotential = potentialOrdered.slice(0, srcEarlyEnd)
  const latePotential = potentialOrdered.slice(srcEarlyEnd)

  // 先凑够下限（前段优先，保证主角班底）
  if (out.length < minCount) {
    for (const name of earlyPotential) {
      if (out.length >= minCount) break
      push(name)
    }
    for (const name of latePotential) {
      if (out.length >= minCount) break
      push(name)
    }
  }

  // 吸收前段至 earlyCap
  for (const name of earlyPotential) {
    if (out.length >= earlyCap) break
    push(name)
  }
  // 强制吸收后期名至 maxCount
  for (const name of latePotential) {
    if (out.length >= maxCount) break
    push(name)
  }
  // 仍不足则用全量 potential 补齐
  for (const name of potentialOrdered) {
    if (out.length >= maxCount) break
    push(name)
  }
  return out.slice(0, maxCount)
}

export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return []
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array<R>(items.length)
  let cursor = 0

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runOne()))
  return results
}
