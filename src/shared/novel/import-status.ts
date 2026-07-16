import type { Blueprint, ImportBlueprintSubstep, ImportParseCheckpoint, NovelProject } from './types'

export {
  IMPORT_LOCATION_PLACEHOLDER,
  IMPORT_FACTION_PLACEHOLDER,
  characterHasProfileBody,
  isUsableImportCharacterProse,
  isWeakImportWorldDescription,
  isWeakImportCoreRules,
  isWeakImportSynopsis,
  hasSubstantialImportSettings,
  needsImportWorldEnrichment,
  needsImportCastEnrichment,
  needsImportRelationshipEnrichment,
  isSparseImportSettings,
} from './import-status-quality'

import { isSparseImportSettings } from './import-status-quality'

const BLUEPRINT_SUBSTEP_ORDER: ImportBlueprintSubstep[] = [
  'meta',
  'world',
  'world_items',
  'cast',
  'relationships',
  'done',
]

export function blueprintSubstepIndex(substep: ImportBlueprintSubstep | null | undefined): number {
  if (!substep) return -1
  return BLUEPRINT_SUBSTEP_ORDER.indexOf(substep)
}

/** 已完成 substep 之后，下一待执行子步骤；done 则返回 null */
export function resolveNextBlueprintSubstep(
  checkpoint: ImportParseCheckpoint | null | undefined
): ImportBlueprintSubstep | null {
  if (!checkpoint) return 'meta'
  if (checkpoint.phase === 'summaries') return null
  if (checkpoint.phase !== 'blueprint') return 'meta'
  const done = checkpoint.blueprintSubstep
  if (!done) return 'meta'
  const idx = blueprintSubstepIndex(done)
  if (idx < 0) return 'meta'
  if (done === 'done') return null
  return BLUEPRINT_SUBSTEP_ORDER[idx + 1] || null
}

export function isTxtImportPending(
  project: Pick<NovelProject, 'source_type' | 'import_parsed' | 'blueprint'> | null | undefined
): boolean {
  if (project?.source_type !== 'txt_import') return false
  if (!project.import_parsed) return true
  // 上一轮解析只写出梗概/空壳设定时，允许再次智能解析
  return isSparseImportSettings(project.blueprint)
}

export function isTxtImportLocked(
  project: Pick<NovelProject, 'source_type' | 'import_parsed' | 'blueprint'> | null | undefined
): boolean {
  return isTxtImportPending(project)
}

export function hasImportParseCheckpoint(
  project: Pick<NovelProject, 'import_parse_checkpoint'> | null | undefined
): boolean {
  return Boolean(project?.import_parse_checkpoint?.phase)
}

/** txt 导入作品是否允许「优化解析」（已有结果也可再跑） */
export function canOptimizeImportParse(
  project: Pick<NovelProject, 'source_type' | 'import_parsed'> | null | undefined
): boolean {
  return project?.source_type === 'txt_import' && Boolean(project.import_parsed)
}

export function checkpointHasVerifiedCast(
  checkpoint: ImportParseCheckpoint | null | undefined
): boolean {
  return (checkpoint?.verifiedCharacters?.length ?? 0) > 0
}

/**
 * 断点可跳过实体抽取：角色阶段已落盘，或已进入蓝图/摘要且带有角色名单。
 */
export function canSkipImportCharactersStep(
  checkpoint: ImportParseCheckpoint | null | undefined
): boolean {
  if (!checkpoint || !checkpointHasVerifiedCast(checkpoint)) return false
  return (
    checkpoint.phase === 'characters' ||
    checkpoint.phase === 'blueprint' ||
    checkpoint.phase === 'summaries'
  )
}

/**
 * 断点可跳过整段蓝图：摘要阶段，或蓝图子步骤已 done，且蓝图已充实。
 */
export function canSkipImportBlueprintStep(
  checkpoint: ImportParseCheckpoint | null | undefined,
  blueprint: Pick<Blueprint, 'world_setting' | 'characters' | 'relationships'> | null | undefined
): boolean {
  if (!checkpointHasVerifiedCast(checkpoint) || isSparseImportSettings(blueprint)) return false
  if (checkpoint?.phase === 'summaries') return true
  return checkpoint?.phase === 'blueprint' && checkpoint.blueprintSubstep === 'done'
}
