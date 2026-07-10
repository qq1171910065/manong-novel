import {
  parseJsonFile,
  saveJsonFile,
} from '@renderer/utils/portable-file'
import {
  materialLibraryService,
  type MaterialItem,
  type MaterialLibraryType,
} from './material-library-service'

export const MATERIAL_PORTABLE_FORMAT = 'novel-material' as const
export const MATERIAL_PORTABLE_VERSION = 1

export interface MaterialPortableFile {
  format: typeof MATERIAL_PORTABLE_FORMAT
  version: typeof MATERIAL_PORTABLE_VERSION
  type: MaterialLibraryType
  exportedAt: string
  item: {
    title: string
    summary: string
    tags: string[]
    payload: Record<string, unknown>
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名'
}

function extensionForType(type: MaterialLibraryType): string {
  return type === 'characters' ? 'novel-character.json' : 'novel-style.json'
}

function filterNameForType(type: MaterialLibraryType): string {
  return type === 'characters' ? '角色物料' : '文风物料'
}

export function buildMaterialPortableFile(item: MaterialItem): MaterialPortableFile {
  const payload = { ...(item.payload ?? {}) }
  delete payload.builtIn
  delete payload.blueprintAssetId

  return {
    format: MATERIAL_PORTABLE_FORMAT,
    version: MATERIAL_PORTABLE_VERSION,
    type: item.type as MaterialLibraryType,
    exportedAt: new Date().toISOString(),
    item: {
      title: item.title,
      summary: item.summary,
      tags: [...item.tags],
      payload,
    },
  }
}

export function parseMaterialPortableFile(
  content: string,
  expectedType: MaterialLibraryType
): MaterialPortableFile {
  const parsed = parseJsonFile<MaterialPortableFile>(content)
  if (parsed?.format !== MATERIAL_PORTABLE_FORMAT || parsed.version !== MATERIAL_PORTABLE_VERSION) {
    throw new Error('不是有效的 Arena 物料文件')
  }
  if (parsed.type !== expectedType) {
    throw new Error(
      expectedType === 'characters'
        ? '该文件不是角色物料，请在角色库中导入'
        : '该文件不是文风物料，请在文风库中导入'
    )
  }
  if (!parsed.item?.title?.trim()) {
    throw new Error('物料文件缺少标题')
  }
  return parsed
}

export async function exportMaterialItem(item: MaterialItem): Promise<boolean> {
  if (item.type !== 'characters' && item.type !== 'styles') {
    throw new Error('仅支持导出角色或文风物料')
  }
  const portable = buildMaterialPortableFile(item)
  const defaultName = `${sanitizeFileName(item.title)}.${extensionForType(item.type)}`
  return saveJsonFile(defaultName, portable)
}

export async function importMaterialFromFile(
  expectedType: MaterialLibraryType
): Promise<MaterialItem | null> {
  const picked = await pickMaterialImportFile(expectedType)
  if (!picked) return null

  const portable = parseMaterialPortableFile(picked.content, expectedType)
  const payload = { ...portable.item.payload }
  delete payload.builtIn
  delete payload.blueprintAssetId
  payload.source = 'import'

  return materialLibraryService.create({
    type: expectedType,
    title: portable.item.title.trim(),
    summary: portable.item.summary ?? '',
    tags: portable.item.tags ?? [],
    payload,
  })
}

async function pickMaterialImportFile(
  type: MaterialLibraryType
): Promise<{ content: string; name: string } | null> {
  if (!window.api.openFileDialog || !window.api.readTextFile) {
    throw new Error('当前环境不支持文件选择')
  }
  const filters = [
    {
      name: filterNameForType(type),
      extensions: ['json'],
    },
  ]
  const picked = await window.api.openFileDialog({ filters })
  if (!picked.success || !picked.path) return null
  const read = await window.api.readTextFile(picked.path)
  if (!read.success || read.content == null) {
    throw new Error(read.error || '读取文件失败')
  }
  const name = picked.path.split(/[\\/]/).pop() || 'import.json'
  return { content: read.content, name }
}
