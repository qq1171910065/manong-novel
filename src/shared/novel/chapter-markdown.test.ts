import { describe, expect, it } from 'vitest'
import { buildBlueprintEntityIndex } from './blueprint-entity-index'
import {
  renderChapterInlineMarkdown,
  splitChapterMarkdownParagraphs,
  splitParagraphWithEntities,
} from './chapter-markdown'
import { extractChapterPlainText, stripMarkdownInline } from './chapter-content-text'
import { countChapterChars } from './chapter-length-plan'

describe('chapter markdown', () => {
  it('renders inline emphasis', () => {
    expect(renderChapterInlineMarkdown('**关键**与*语气*')).toBe(
      '<strong>关键</strong>与<em>语气</em>'
    )
  })

  it('splits paragraphs by blank lines', () => {
    expect(splitChapterMarkdownParagraphs('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。'])
  })

  it('highlights blueprint entities outside markdown markers', () => {
    const entities = buildBlueprintEntityIndex({
      characters: [{ name: '林逸', description: '主角，黑客' }],
      world_setting: {
        key_locations: [{ name: '旧城区', description: '故事起点' }],
      },
    })

    const segments = splitParagraphWithEntities('林逸走进旧城区，**林逸**握紧拳头。', entities)
    const entityNames = segments
      .filter((item) => item.kind === 'entity')
      .map((item) => item.entity.name)

    expect(entityNames).toEqual(['林逸', '旧城区'])
  })

  it('strips markdown for word count', () => {
    expect(stripMarkdownInline('**林逸**说')).toBe('林逸说')
    expect(countChapterChars('**林逸**说')).toBe(3)
  })

  it('extracts plain chapter text from escaped storage', () => {
    expect(extractChapterPlainText('第\\n一段。')).toBe('第\n一段。')
  })
})

describe('blueprint entity index', () => {
  it('dedupes and sorts by name length', () => {
    const entities = buildBlueprintEntityIndex({
      characters: [
        { name: '林', description: 'ignored-too-short' },
        { name: '林逸', description: '主角' },
        { name: '苏婉', description: '女主' },
      ],
      world_setting: {
        key_locations: [{ name: '旧城区', description: '地点' }],
        factions: [{ name: '黑曜会', description: '反派组织' }],
      },
    })

    expect(entities.map((item) => item.name)).toEqual(['旧城区', '黑曜会', '林逸', '苏婉'])
    expect(entities.find((item) => item.name === '林')).toBeUndefined()
  })
})
