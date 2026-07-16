import { describe, expect, it } from 'vitest'
import {
  extractLooseImportBlueprintFields,
  mergeImportBlueprintCandidates,
  parseBestImportBlueprintJson,
  repairMalformedImportBlueprintText,
} from './import-blueprint-json'
import { hasSubstantialImportSettings } from '@shared/novel/import-status'

describe('parseBestImportBlueprintJson', () => {
  it('选取含梗概与角色的蓝图对象', () => {
    const raw = `
说明文字
\`\`\`json
{"ok":true}
\`\`\`
{"title":"测试书","one_sentence_summary":"一句话概括故事主旨用于得分","characters":[{"name":"林远"}],"world_setting":{"core_rules":"有异能"}}
`
    const parsed = parseBestImportBlueprintJson(raw)
    expect(parsed?.title).toBe('测试书')
    expect(parsed?.one_sentence_summary).toContain('一句话')
  })

  it('解包 blueprint 包装层', () => {
    const raw = JSON.stringify({
      blueprint: {
        title: '包装书',
        full_synopsis: '很长的完整梗概用来通过评分门槛，故事发生在都市异能世界。',
        characters: [{ name: '主角' }],
      },
    })
    const parsed = parseBestImportBlueprintJson(raw)
    expect(parsed?.title).toBe('包装书')
  })

  it('尽量闭合截断的 JSON', () => {
    const raw =
      '{"title":"截断书","full_synopsis":"一段足够长的梗概文本用于通过蓝图评分","characters":[{"name":"甲"'
    const parsed = parseBestImportBlueprintJson(raw)
    expect(parsed?.title).toBe('截断书')
  })

  it('修复值缺开头引号、键值粘连的畸形输出', () => {
    const raw =
      '{ "title":诡秘之主", one_sentence_summary穿越者周明瑞化身克莱恩·莫雷蒂，在一个融合蒸汽朋与神秘学的异世界中，通过非凡序列途径追求力量、揭开宇宙真相并登临神位。", full_synopsis从现代地球到黑夜教会的漫长旅途里，主角不断攀登序列。"}'
    const repaired = repairMalformedImportBlueprintText(raw)
    expect(repaired).toContain('"title":"诡秘之主"')
    expect(repaired).toContain('"one_sentence_summary":"穿越者')

    const parsed = parseBestImportBlueprintJson(raw)
    expect(parsed?.title).toBe('诡秘之主')
    expect(String(parsed?.one_sentence_summary || '')).toContain('克莱恩')
    expect(String(parsed?.full_synopsis || '')).toContain('黑夜教会')
  })

  it('字段捞取兜底仍可得到梗概', () => {
    const raw =
      'title诡秘之主", one_sentence_summary穿越者周明瑞化身克莱恩并登临神位。", full_synopsis从现代地球到异世界。'
    const loose = extractLooseImportBlueprintFields(raw)
    expect(loose?.title || loose?.one_sentence_summary).toBeTruthy()
    expect(String(loose?.one_sentence_summary || loose?.full_synopsis || '')).toMatch(/穿越|异世界/)
  })

  it('合并候选：梗概与设定可来自不同对象', () => {
    const merged = mergeImportBlueprintCandidates([
      {
        title: '书A',
        one_sentence_summary: '一句话梗概足够长用于合并测试',
        full_synopsis: '完整梗概文本用来保证 meta 得分更高一些。',
      },
      {
        characters: [{ name: '克莱恩' }, { name: '奥黛丽' }],
        world_setting: {
          core_rules: '非凡者序列体系',
          key_locations: [{ name: '廷根' }],
          factions: [{ name: '值夜者' }],
        },
        relationships: [{ character_from: '克莱恩', character_to: '奥黛丽', description: '相识' }],
      },
    ])
    expect(merged?.title).toBe('书A')
    expect((merged?.characters as unknown[])?.length).toBe(2)
    expect((merged?.world_setting as { core_rules?: string })?.core_rules).toContain('非凡')
    expect(hasSubstantialImportSettings(merged as never)).toBe(true)
  })

  it('能从文本捞出 characters / world_setting', () => {
    const raw = `{
      "title": "测试",
      "characters": [{"name":"甲","description":"主角"}],
      "world_setting": {"core_rules":"这是一段足够长的世界规则说明文字", "key_locations":[{"name":"帝都"}], "factions":[{"name":"教会"}]}
    }`
    const loose = extractLooseImportBlueprintFields(raw)
    expect(Array.isArray(loose?.characters) && (loose?.characters as unknown[]).length).toBe(1)
    expect((loose?.world_setting as { core_rules?: string })?.core_rules).toContain('世界规则')
  })
})
