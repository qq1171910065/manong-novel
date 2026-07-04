import type { NovelProject } from './types'

export function isTxtImportPending(
  project: Pick<NovelProject, 'source_type' | 'import_parsed'> | null | undefined
): boolean {
  return project?.source_type === 'txt_import' && !project.import_parsed
}

export function isTxtImportLocked(
  project: Pick<NovelProject, 'source_type' | 'import_parsed'> | null | undefined
): boolean {
  return isTxtImportPending(project)
}
