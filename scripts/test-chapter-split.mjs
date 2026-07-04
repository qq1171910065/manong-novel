import { splitIntoChapters } from '../src/renderer/src/services/novel/chapter-splitter.ts'

const samples = [
  ['standard', '序章内容\r\n\r\n第一章 开端\r\n正文1\r\n\r\n第二章 修炼\r\n正文2'],
  ['no newline before title', '第一章开端\r\n正文1\r\n第二章修炼\r\n正文2'],
  ['numeric', '第1章：开始\r\n内容1\r\n第2章 继续\r\n内容2'],
  ['english', 'Chapter 1 Start\r\ncontent\r\nChapter 2 Next\r\ncontent2'],
  ['bracket', '【第一章】穿越\r\nabc\r\n【第二章】修炼\r\ndef'],
  ['separator', '第一章 标题\r\n内容1\r\n========\r\n第二章 标题2\r\n内容2'],
  ['no titles', '全文无章节标题只有一大段文字'.repeat(20)],
]

for (const [name, s] of samples) {
  const r = splitIntoChapters(s)
  console.log(name, '->', r.length, r.map((c) => c.title))
}
