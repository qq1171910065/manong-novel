export const READER_PAGE_PADDING_X = 24
export const READER_PAGE_PADDING_Y = 20
export const READER_CHROME_HEIGHT_TOP = 44
export const READER_CHROME_HEIGHT_BOTTOM = 40
export const READER_CHROME_HEIGHT_TTS = 42
export const READER_CHAPTER_SPACER_MARGIN = 16

export interface PageLayoutMetrics {
  contentWidth: number
  contentHeight: number
  fontSize: number
  lineHeight: number
  fontFamily?: string
}

export type PaginationInput = number | PageLayoutMetrics

export interface BookPage {
  chapterIndex: number
  pageIndex: number
  text: string
}

let pageMeasurer: HTMLDivElement | null = null

export function resolvePageLayoutMetrics(
  viewport: HTMLElement | null,
  settings: { fontSize: number; lineHeight: number },
  options?: { listening?: boolean }
): PageLayoutMetrics {
  const width = viewport?.clientWidth ?? 420
  const height = viewport?.clientHeight ?? 560
  const bottomChrome = options?.listening
    ? READER_CHROME_HEIGHT_BOTTOM + READER_CHROME_HEIGHT_TTS
    : READER_CHROME_HEIGHT_BOTTOM
  const spacerTop = READER_CHROME_HEIGHT_TOP + READER_CHAPTER_SPACER_MARGIN
  const spacerBottom = bottomChrome + READER_CHAPTER_SPACER_MARGIN

  return {
    contentWidth: Math.max(160, width - READER_PAGE_PADDING_X * 2),
    contentHeight: Math.max(160, height - READER_PAGE_PADDING_Y * 2 - spacerTop - spacerBottom),
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
  }
}

export function paginateChapter(text: string, input: PaginationInput): string[] {
  if (typeof input === 'number') {
    return paginateChapterText(text, input)
  }
  if (typeof document !== 'undefined' && document.body) {
    return paginateChapterTextByLayout(text, input)
  }
  const chars = Math.floor(
    estimateCharsPerPage(input.fontSize, input.lineHeight, input.contentWidth, input.contentHeight) * 0.9
  )
  return paginateChapterText(text, chars)
}

export function paginateChapterText(text: string, charsPerPage: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ['本章暂无正文，可在创作台继续写作。']

  const paragraphs = splitSourceParagraphs(normalized)
  const pages: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > charsPerPage) {
      if (current.trim()) {
        pages.push(current.trim())
        current = ''
      }
      pages.push(...splitLongPage(paragraph, charsPerPage))
      continue
    }

    const block = current ? `${current}\n\n${paragraph}` : paragraph
    if (block.length > charsPerPage && current) {
      pages.push(current.trim())
      current = paragraph
      continue
    }
    current = block
  }

  if (current.trim()) pages.push(current.trim())

  return normalizePageSizes(pages, charsPerPage)
}

export function paginateChapterTextByLayout(text: string, metrics: PageLayoutMetrics): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ['本章暂无正文，可在创作台继续写作。']

  const paragraphs = splitSourceParagraphs(normalized)
  const pages: string[] = []
  let currentParagraphs: string[] = []

  for (const paragraph of paragraphs) {
    const singleHeight = measurePageContentHeight(paragraph, metrics)
    if (singleHeight > metrics.contentHeight) {
      if (currentParagraphs.length) {
        pages.push(joinPageParagraphs(currentParagraphs))
        currentParagraphs = []
      }
      pages.push(...splitPageByLayout(paragraph, metrics))
      continue
    }

    const trial = [...currentParagraphs, paragraph]
    if (
      currentParagraphs.length
      && measurePageContentHeight(joinPageParagraphs(trial), metrics) > metrics.contentHeight
    ) {
      pages.push(joinPageParagraphs(currentParagraphs))
      currentParagraphs = [paragraph]
      continue
    }

    currentParagraphs = trial
  }

  if (currentParagraphs.length) {
    pages.push(joinPageParagraphs(currentParagraphs))
  }

  const normalizedPages: string[] = []
  for (const page of pages) {
    if (measurePageContentHeight(page, metrics) <= metrics.contentHeight) {
      normalizedPages.push(page)
      continue
    }
    normalizedPages.push(...splitPageByLayout(page, metrics))
  }

  return normalizedPages.length ? normalizedPages : ['本章暂无正文，可在创作台继续写作。']
}

function normalizePageSizes(pages: string[], charsPerPage: number): string[] {
  const normalizedPages: string[] = []
  for (const page of pages) {
    if (page.length <= charsPerPage) {
      normalizedPages.push(page)
      continue
    }
    normalizedPages.push(...splitLongPage(page, charsPerPage))
  }
  return normalizedPages.length ? normalizedPages : ['本章暂无正文，可在创作台继续写作。']
}

function splitSourceParagraphs(normalized: string): string[] {
  return normalized.split(/\n{2,}/).filter(Boolean)
}

function joinPageParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}

function splitLongPage(text: string, charsPerPage: number): string[] {
  const pages: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + charsPerPage, text.length)
    const chunk = text.slice(start, end)
    if (chunk) pages.push(chunk)
    start = end
  }
  return pages
}

function splitPageByLayout(text: string, metrics: PageLayoutMetrics): string[] {
  const pages: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (measurePageContentHeight(remaining, metrics) <= metrics.contentHeight) {
      pages.push(remaining)
      break
    }

    const chunk = findLargestFittingPrefix(remaining, metrics)
    if (!chunk) {
      pages.push(remaining.slice(0, 1))
      remaining = remaining.slice(1)
      continue
    }

    pages.push(chunk)
    remaining = remaining.slice(chunk.length)
  }

  return pages.filter(Boolean)
}

function findLargestFittingPrefix(text: string, metrics: PageLayoutMetrics): string {
  let low = 1
  let high = text.length
  let best = ''

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = text.slice(0, mid)
    if (measurePageContentHeight(candidate, metrics) <= metrics.contentHeight) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}

function getPageMeasurer(metrics: PageLayoutMetrics): HTMLDivElement {
  if (!pageMeasurer) {
    pageMeasurer = document.createElement('div')
    pageMeasurer.setAttribute('aria-hidden', 'true')
    pageMeasurer.style.position = 'fixed'
    pageMeasurer.style.left = '-100000px'
    pageMeasurer.style.top = '0'
    pageMeasurer.style.visibility = 'hidden'
    pageMeasurer.style.pointerEvents = 'none'
    pageMeasurer.style.overflow = 'hidden'
    pageMeasurer.style.boxSizing = 'border-box'
    pageMeasurer.style.margin = '0'
    pageMeasurer.style.padding = '0'
    document.body.appendChild(pageMeasurer)
  }

  pageMeasurer.style.width = `${metrics.contentWidth}px`
  pageMeasurer.style.fontSize = `${metrics.fontSize}px`
  pageMeasurer.style.lineHeight = String(metrics.lineHeight)
  pageMeasurer.style.fontFamily = metrics.fontFamily ?? 'inherit'
  return pageMeasurer
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function pageContentToHtml(text: string): string {
  const paragraphs = text.split('\n\n').filter(Boolean)
  if (!paragraphs.length) {
    return `<p>${escapeHtml(text)}</p>`
  }
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function measurePageContentHeight(text: string, metrics: PageLayoutMetrics): number {
  const el = getPageMeasurer(metrics)
  el.innerHTML = `<div class="reader-page-measurer">${pageContentToHtml(text)}</div>`
  const content = el.firstElementChild as HTMLElement | null
  if (!content) return 0

  content.style.margin = '0'
  content.style.padding = '0'
  for (const paragraph of content.querySelectorAll('p')) {
    const node = paragraph as HTMLElement
    node.style.margin = '0 0 0.95em'
    node.style.wordBreak = 'break-word'
  }

  return content.scrollHeight
}

export function buildBookPages(
  chapters: Array<{ content: string }>,
  input: PaginationInput
): BookPage[] {
  const pages: BookPage[] = []
  chapters.forEach((chapter, chapterIndex) => {
    const chapterPages = paginateChapter(chapter.content, input)
    chapterPages.forEach((text, pageIndex) => {
      pages.push({ chapterIndex, pageIndex, text })
    })
  })
  return pages
}

export function toGlobalPageIndex(
  bookPages: BookPage[],
  chapterIndex: number,
  pageIndex: number
): number {
  const found = bookPages.findIndex(
    (page) => page.chapterIndex === chapterIndex && page.pageIndex === pageIndex
  )
  return found >= 0 ? found : 0
}

export function fromGlobalPageIndex(
  bookPages: BookPage[],
  globalIndex: number
): { chapterIndex: number; pageIndex: number } {
  const page = bookPages[globalIndex]
  if (!page) return { chapterIndex: 0, pageIndex: 0 }
  return { chapterIndex: page.chapterIndex, pageIndex: page.pageIndex }
}

export function estimateCharsPerPage(
  fontSize: number,
  lineHeight: number,
  width: number,
  height: number
): number {
  const lineChars = Math.max(12, Math.floor(width / (fontSize * 0.92)))
  const lines = Math.max(8, Math.floor(height / (fontSize * lineHeight)))
  return Math.floor(lineChars * lines * 0.92)
}
