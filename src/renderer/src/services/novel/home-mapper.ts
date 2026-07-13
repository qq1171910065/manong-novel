import type { NovelProjectSummary } from '@shared/novel/types'
import type { TranslateFn } from '@renderer/i18n/log-labels'

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

const BUBBLE_LINE_COUNT = 6

function resolveAccent(genre: string): string {
  for (const [key, color] of Object.entries(GENRE_ACCENTS)) {
    if (genre.includes(key)) return color
  }
  return THEME_ACCENT_DEFAULT
}

export { resolveAccent, THEME_ACCENT_DEFAULT, THEME_INK_DEEP }

export function coverPlaceholderGradient(accent: string): string {
  return `linear-gradient(145deg, color-mix(in srgb, ${accent} 18%, #f5f5ed), color-mix(in srgb, ${accent} 68%, ${THEME_INK_DEEP}))`
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function projectStatus(project: NovelProjectSummary, t: TranslateFn): string {
  const { completed_chapters, total_chapters } = project
  if (total_chapters > 0 && completed_chapters >= total_chapters) return t('home.status.done')
  if (completed_chapters > 0) return t('home.status.writing')
  if (total_chapters > 0) return t('home.status.draft')
  return t('home.status.blueprintReady')
}

function projectProgress(project: NovelProjectSummary): number {
  const { completed_chapters, total_chapters } = project
  return total_chapters > 0 ? Math.round((completed_chapters / total_chapters) * 100) : 0
}

function chapterLabel(project: NovelProjectSummary, t: TranslateFn): string {
  const { completed_chapters, total_chapters } = project
  if (total_chapters <= 0) return t('home.chapterLabel.blueprintPhase')
  if (completed_chapters <= 0) {
    return t('home.chapterLabel.chaptersPending', { total: total_chapters })
  }
  return t('home.chapterLabel.chaptersProgress', {
    completed: completed_chapters,
    total: total_chapters,
  })
}

function bubbleLine(t: TranslateFn, index: number): string {
  return t(`home.bubbleLines.${index % BUBBLE_LINE_COUNT}`)
}

export function mapNovelsForHome(projects: NovelProjectSummary[], t: TranslateFn, locale = 'zh-CN'): HomeNovelCard[] {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime()
  )

  if (!sorted.length) {
    return [
      {
        id: 'placeholder-1',
        title: t('home.placeholders.novel1Title'),
        genre: t('home.placeholders.novel1Genre'),
        subtitle: t('home.placeholders.novel1Subtitle'),
        bio: t('home.placeholders.novel1Bio'),
        tags: [t('home.placeholders.novel1Tag1'), t('home.placeholders.novel1Tag2')],
        speech: t('home.placeholders.novel1Speech'),
        accent: '#1f7a67',
        progress: 0,
        chapterLabel: t('home.placeholders.novel1Chapter'),
        lastEdited: '',
        clickable: false,
      },
      {
        id: 'placeholder-2',
        title: t('home.placeholders.novel2Title'),
        genre: t('home.placeholders.novel2Genre'),
        subtitle: t('home.placeholders.novel2Subtitle'),
        bio: t('home.placeholders.novel2Bio'),
        tags: [t('home.placeholders.novel2Tag1'), t('home.placeholders.novel2Tag2')],
        speech: t('home.placeholders.novel2Speech'),
        accent: '#8eb4a2',
        progress: 0,
        chapterLabel: t('home.placeholders.novel2Chapter'),
        lastEdited: '',
        clickable: false,
      },
      {
        id: 'placeholder-3',
        title: t('home.placeholders.novel3Title'),
        genre: t('home.placeholders.novel3Genre'),
        subtitle: t('home.placeholders.novel3Subtitle'),
        bio: t('home.placeholders.novel3Bio'),
        tags: [t('home.placeholders.novel3Tag1'), t('home.placeholders.novel3Tag2')],
        speech: t('home.placeholders.novel3Speech'),
        accent: '#c5a059',
        progress: 42,
        chapterLabel: t('home.placeholders.novel3Chapter'),
        lastEdited: '',
        clickable: false,
      },
    ]
  }

  return sorted.slice(0, 6).map((project, index) => {
    const genre = project.genre || t('bookshelf.uncategorized')
    const progress = projectProgress(project)
    const status = projectStatus(project, t)
    return {
      id: project.id,
      title: project.title,
      genre,
      coverUrl: project.cover_url,
      subtitle: t('home.subtitle', { genre, status }),
      bio: progress > 0 ? t('home.bioProgress', { progress }) : t('home.bioReady'),
      tags: [genre, chapterLabel(project, t)].filter(Boolean),
      speech: bubbleLine(t, index),
      accent: resolveAccent(genre),
      progress,
      chapterLabel: chapterLabel(project, t),
      lastEdited: formatDate(project.last_edited, locale),
      clickable: true,
    }
  })
}

export function mapNovelsForHomeList(
  projects: NovelProjectSummary[],
  t: TranslateFn,
  locale = 'zh-CN'
): HomeNovelRow[] {
  return [...projects]
    .sort((a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime())
    .map((project) => {
      const genre = project.genre || t('bookshelf.uncategorized')
      return {
        id: project.id,
        title: project.title,
        genre,
        coverUrl: project.cover_url,
        status: projectStatus(project, t),
        date: formatDate(project.last_edited, locale),
        progress: projectProgress(project),
        accent: resolveAccent(genre),
        chapterLabel: chapterLabel(project, t),
      }
    })
}

export function findResumableProject(projects: NovelProjectSummary[]): NovelProjectSummary | null {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime()
  )
  return sorted.find((p) => p.completed_chapters > 0 || p.total_chapters > 0) ?? sorted[0] ?? null
}
