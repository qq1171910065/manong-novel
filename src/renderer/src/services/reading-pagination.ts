export function paginateChapterText(text: string, charsPerPage: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ['本章暂无正文，可在创作台继续写作。']

  const paragraphs = normalized.split(/\n+/).filter(Boolean)
  const pages: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    const block = current ? `${current}\n\n${paragraph}` : paragraph
    if (block.length > charsPerPage && current) {
      pages.push(current.trim())
      current = paragraph
      continue
    }
    current = block
  }

  if (current.trim()) pages.push(current.trim())

  if (pages.length === 1 && pages[0].length > charsPerPage * 1.4) {
    return splitLongPage(pages[0], charsPerPage)
  }

  return pages
}

function splitLongPage(text: string, charsPerPage: number): string[] {
  const pages: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + charsPerPage, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const breakAt = Math.max(
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
        slice.lastIndexOf('\n')
      )
      if (breakAt > charsPerPage * 0.45) end = start + breakAt + 1
    }
    pages.push(text.slice(start, end).trim())
    start = end
  }
  return pages.filter(Boolean)
}

export interface BookPage {
  chapterIndex: number
  pageIndex: number
  text: string
}

export function buildBookPages(
  chapters: Array<{ content: string }>,
  charsPerPage: number
): BookPage[] {
  const pages: BookPage[] = []
  chapters.forEach((chapter, chapterIndex) => {
    const chapterPages = paginateChapterText(chapter.content, charsPerPage)
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
  return lineChars * lines
}
