import { describe, expect, it } from 'vitest'
import {
  looksLikeImportMetaLeak,
  looksLikeBlueprintMetaNarration,
  sanitizeImportBlueprintFields,
  sanitizeImportProseField,
} from './import-field-sanitize'
import { parseBestImportBlueprintJson, scoreImportBlueprintObject } from './import-blueprint-json'

describe('looksLikeImportMetaLeak', () => {
  it('识别思考过程与英文键名污染', () => {
    const leak =
      'relationships部分需要描述角色间的关系。现在我需要确保所有专有名词都来自名单。对于core_rules，我要写出可运行的世界规则。最终，我会构建一个完整的JSON对象。'
    expect(looksLikeImportMetaLeak(leak)).toBe(true)
  })

  it('识别 target_audience / genre 选型式元叙述', () => {
    const leak =
      '要300-500字的故事梗概，我需要基于提供的章节。target_audience应该是科幻小说爱好者。genre是科幻，style是硬科幻风格，tone是冷峻而深刻的。'
    expect(looksLikeImportMetaLeak(leak)).toBe(true)
  })

  it('正常梗概不被误伤', () => {
    const ok =
      '地球文明在与三体文明的首次接触中陷入危机，叶文洁的抉择开启了两百年的对峙与博弈。'
    expect(looksLikeImportMetaLeak(ok)).toBe(false)
  })

  it('正常短标签不被误伤', () => {
    expect(looksLikeImportMetaLeak('硬科幻')).toBe(false)
    expect(looksLikeImportMetaLeak('科幻读者')).toBe(false)
  })
})

describe('sanitizeImportBlueprintFields', () => {
  it('清空污染字段并保留可用正文', () => {
    const cleaned = sanitizeImportBlueprintFields({
      title: '三体',
      one_sentence_summary:
        '现在我需要确保所有专有名词都来自名单，最终我会构建完整的JSON对象。',
      full_synopsis:
        '叶文洁向宇宙发出信号后，地球与三体文明开始漫长对峙，人类在危机中艰难求存。',
      target_audience: 'target_audience应该是科幻小说爱好者',
      genre: '科幻',
      world_setting: {
        core_rules:
          'world_setting部分最重要。core_rules需要不少于120字。从样本看三体世界有三个太阳。',
        key_locations: [{ name: '红岸基地', description: '向宇宙发送信号的秘密基地' }],
      },
      characters: [
        {
          name: '叶文洁',
          description: '我需要基于提供的片段写出人物简介，不少于40字。',
        },
      ],
    })

    expect(cleaned.title).toBe('三体')
    expect(cleaned.one_sentence_summary).toBe('')
    expect(cleaned.full_synopsis).toContain('叶文洁')
    expect(cleaned.target_audience).toBe('')
    expect(cleaned.genre).toBe('科幻')
    expect((cleaned.world_setting as { core_rules?: string }).core_rules).toBe('')
    expect(
      (cleaned.world_setting as { key_locations?: Array<{ name: string }> }).key_locations?.[0]
        ?.name
    ).toBe('红岸基地')
    expect((cleaned.characters as Array<{ description?: string }>)[0]?.description).toBe('')
  })

  it('sanitizeImportProseField 对污染返回空串', () => {
    expect(sanitizeImportProseField('最终我会构建一个完整的JSON对象')).toBe('')
    expect(sanitizeImportProseField('地球危机年代的科幻史诗')).toBe('地球危机年代的科幻史诗')
  })
})

describe('looksLikeBlueprintMetaNarration', () => {
  it('识别三体案例式需求分析白话', () => {
    const raw =
      '好的，用户要我分析小说《三体》并输出JSON文档。用户提供了很多输入材料，包括章节标题、候选名单和剧情片段，我需要基于这些信息来构建分析。用户可能是网文编辑或文学分析师，需要一份结构清晰的小说分析文档，用于项目开发或内容评估。深层需求是…'
    expect(looksLikeBlueprintMetaNarration(raw)).toBe(true)
  })

  it('合法 JSON 开头不算元叙述', () => {
    const raw = '{"title":"三体","one_sentence_summary":"地球文明与三体文明的首次接触。"}'
    expect(looksLikeBlueprintMetaNarration(raw)).toBe(false)
  })
})

describe('parseBestImportBlueprintJson with meta leak', () => {
  it('污染字段不计高分，清洗后可用字段仍保留', () => {
    const raw = JSON.stringify({
      title: '三体',
      one_sentence_summary:
        'relationships部分需要描述。现在我需要确保专有名词来自名单，最终我会构建JSON。',
      full_synopsis:
        '地球文明在与三体文明接触后陷入两百年危机，科学与政治撕扯中人类艰难求存。',
      world_setting: {
        core_rules: '三体星系拥有三个太阳，苛刻气候迫使文明以脱水方式存续，并向宇宙广播威胁。',
      },
      characters: [{ name: '叶文洁', description: '红岸工程关键人物，向三体发出信号。' }],
    })

    const parsed = parseBestImportBlueprintJson(raw)
    expect(parsed?.title).toBe('三体')
    expect(parsed?.one_sentence_summary).toBe('')
    expect(String(parsed?.full_synopsis || '')).toContain('三体文明')
    expect(scoreImportBlueprintObject(parsed || {})).toBeGreaterThan(0)
  })
})
