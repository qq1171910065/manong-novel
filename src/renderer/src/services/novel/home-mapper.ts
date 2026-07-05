import type { NovelProjectSummary } from '@shared/novel/types'

export interface HomeNovelCard {
  id: string
  title: string
  genre: string
  coverUrl?: string
  subtitle: string
  bio: string
  tags: string[]
  speech: string
  accent: string
  progress: number
  chapterLabel: string
  lastEdited: string
  clickable: boolean
}

export interface HomeNovelRow {
  id: string
  title: string
  genre: string
  coverUrl?: string
  status: string
  date: string
  progress: number
  accent: string
  chapterLabel: string
}

const GENRE_ACCENTS: Record<string, string> = {
  科幻: '#8eb4a2',
  悬疑: '#8eb4a2',
  奇幻: '#34d399',
  冒险: '#22c55e',
  言情: '#d4a0a8',
  穿越: '#c5a059',
  武侠: '#fbbf24',
  东方: '#f59e0b',
  玄幻: '#1f7a67',
}

const THEME_ACCENT_DEFAULT = '#1f7a67'
const THEME_INK_DEEP = '#0f4b44'

const SPEECH_LINES = [
  '这一章的转折可以再大胆一点。',
  '角色的动机还需要再铺垫一下。',
  '世界观设定已经很有画面感了。',
  '接下来可以推进主线冲突了。',
  '这段对白的节奏很顺，很有小说感。',
  '伏笔埋得不错，后面记得回收。',
]

function resolveAccent(genre: string): string {
  for (const [key, color] of Object.entries(GENRE_ACCENTS)) {
    if (genre.includes(key)) return color
  }
  return THEME_ACCENT_DEFAULT
}

export { resolveAccent, THEME_ACCENT_DEFAULT, THEME_INK_DEEP }

/** 无封面占位：墨玉主题渐变，铺满媒体区域 */
export function coverPlaceholderGradient(accent: string): string {
  return `linear-gradient(145deg, color-mix(in srgb, ${accent} 18%, #f5f5ed), color-mix(in srgb, ${accent} 68%, ${THEME_INK_DEEP}))`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function projectStatus(project: NovelProjectSummary): string {
  const { completed_chapters, total_chapters } = project
  if (total_chapters > 0 && completed_chapters >= total_chapters) return '已完成'
  if (completed_chapters > 0) return '创作中'
  if (total_chapters > 0) return '待开写'
  return '蓝图完成'
}

function projectProgress(project: NovelProjectSummary): number {
  const { completed_chapters, total_chapters } = project
  return total_chapters > 0 ? Math.round((completed_chapters / total_chapters) * 100) : 0
}

function chapterLabel(project: NovelProjectSummary): string {
  const { completed_chapters, total_chapters } = project
  if (total_chapters <= 0) return '蓝图阶段'
  if (completed_chapters <= 0) return `${total_chapters} 章待写`
  return `${completed_chapters}/${total_chapters} 章`
}

export function mapNovelsForHome(projects: NovelProjectSummary[]): HomeNovelCard[] {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime()
  )

  if (!sorted.length) {
    return [
      {
        id: 'placeholder-1',
        title: '未命名小说',
        genre: '奇幻',
        subtitle: '小说家 · 等你落笔',
        bio: '灵感到章节，陪你把第一部小说一笔一笔写完整。',
        tags: ['开笔', '蓝图'],
        speech: '第一部小说，就从这里开始。',
        accent: '#1f7a67',
        progress: 0,
        chapterLabel: '等待创建',
        lastEdited: '',
        clickable: false,
      },
      {
        id: 'placeholder-2',
        title: '灵感草稿',
        genre: '科幻',
        subtitle: '角色 · 文风',
        bio: '把常用角色与文风预设整理进物料库，开新书更顺手。',
        tags: ['角色库', '文风库'],
        speech: '选好角色与文风，正文会写得更快。',
        accent: '#8eb4a2',
        progress: 0,
        chapterLabel: '灵感模式',
        lastEdited: '',
        clickable: false,
      },
      {
        id: 'placeholder-3',
        title: '连载中',
        genre: '言情',
        subtitle: '逐章推进 · 笔耕不辍',
        bio: '每写完一章，进度与设定同步更新，连载不断档。',
        tags: ['连载中', '章节'],
        speech: '继续写下去，角色会自己长出命运。',
        accent: '#c5a059',
        progress: 42,
        chapterLabel: '3/7 章',
        lastEdited: '',
        clickable: false,
      },
    ]
  }

  return sorted.slice(0, 6).map((project, index) => {
    const genre = project.genre || '未分类'
    const progress = projectProgress(project)
    return {
      id: project.id,
      title: project.title,
      genre,
      coverUrl: project.cover_url,
      subtitle: `${genre} · ${projectStatus(project)}`,
      bio: progress > 0 ? `已完成 ${progress}% ，继续推进下一章。` : '蓝图已就绪，小说家可以开笔了。',
      tags: [genre, chapterLabel(project)].filter(Boolean),
      speech: SPEECH_LINES[index % SPEECH_LINES.length],
      accent: resolveAccent(genre),
      progress,
      chapterLabel: chapterLabel(project),
      lastEdited: formatDate(project.last_edited),
      clickable: true,
    }
  })
}

export function mapNovelsForHomeList(projects: NovelProjectSummary[]): HomeNovelRow[] {
  return [...projects]
    .sort((a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime())
    .map((project) => {
      const genre = project.genre || '未分类'
      return {
        id: project.id,
        title: project.title,
        genre,
        coverUrl: project.cover_url,
        status: projectStatus(project),
        date: formatDate(project.last_edited),
        progress: projectProgress(project),
        accent: resolveAccent(genre),
        chapterLabel: chapterLabel(project),
      }
    })
}

export function findResumableProject(projects: NovelProjectSummary[]): NovelProjectSummary | null {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime()
  )
  return sorted.find((p) => p.completed_chapters > 0 || p.total_chapters > 0) ?? sorted[0] ?? null
}
