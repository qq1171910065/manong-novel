import { describe, expect, it } from 'vitest'
import {
  buildMaterialJsonExample,
  getPolishVagueInputHint,
  normalizeCharacterRecord,
  sanitizeMaterialCharacter,
} from './blueprint-material-schemas'
import type { Character } from './types'

describe('getPolishVagueInputHint', () => {
  it('角色提示不含 JSON 字段名', () => {
    const hint = getPolishVagueInputHint('characters')
    expect(hint).not.toMatch(/identity|personality|relationship_to_protagonist/)
    expect(hint).toMatch(/自然语言|例如/)
  })
})

describe('buildMaterialJsonExample', () => {
  it('生成合法角色示例 JSON', () => {
    const raw = buildMaterialJsonExample('characters')
    const parsed = JSON.parse(raw)
    expect(parsed.blueprint_updates.characters).toHaveLength(1)
    expect(parsed.blueprint_updates.characters[0].name).toBeTruthy()
  })
})

describe('normalizeCharacterRecord', () => {
  it('从 loose 对象归一化角色', () => {
    const record = normalizeCharacterRecord({
      name: '林婉儿',
      identity: '师妹',
      personality: '外冷内热',
    })
    expect(record?.name).toBe('林婉儿')
    expect(record?.description).toBeTruthy()
  })

  it('拒绝单字姓名', () => {
    expect(
      normalizeCharacterRecord({
        name: '婉',
        identity: '师妹',
        personality: '外冷内热',
      })
    ).toBeNull()
  })
})

describe('sanitizeMaterialCharacter', () => {
  it('补全缺失 description', () => {
    const result = sanitizeMaterialCharacter({
      name: '苏清月',
      identity: '琴师',
      personality: '温婉',
    } as Character)
    expect(result?.name).toBe('苏清月')
    expect(result?.description).toContain('琴师')
  })
})
