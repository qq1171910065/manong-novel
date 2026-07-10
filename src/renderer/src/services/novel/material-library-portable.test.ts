import { describe, expect, it } from 'vitest'
import {
  buildMaterialPortableFile,
  parseMaterialPortableFile,
} from './material-library-portable'
import type { MaterialItem } from './material-library-service'

const sampleCharacter: MaterialItem = {
  id: 'mat_1',
  type: 'characters',
  title: '测试角色',
  summary: '摘要',
  tags: ['主角'],
  payload: { character: { name: '测试角色' }, builtIn: true },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('material-library-portable', () => {
  it('builds export payload without built-in flags', () => {
    const portable = buildMaterialPortableFile(sampleCharacter)
    expect(portable.format).toBe('novel-material')
    expect(portable.type).toBe('characters')
    expect(portable.item.title).toBe('测试角色')
    expect(portable.item.payload.builtIn).toBeUndefined()
  })

  it('rejects mismatched import type', () => {
    const portable = buildMaterialPortableFile(sampleCharacter)
    expect(() => parseMaterialPortableFile(JSON.stringify(portable), 'styles')).toThrow(
      '该文件不是文风物料'
    )
  })

  it('accepts matching import type', () => {
    const portable = buildMaterialPortableFile(sampleCharacter)
    const parsed = parseMaterialPortableFile(JSON.stringify(portable), 'characters')
    expect(parsed.item.title).toBe('测试角色')
  })
})
