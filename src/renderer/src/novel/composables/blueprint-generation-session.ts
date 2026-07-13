import { computed, readonly, ref } from 'vue'
import type { BlueprintGenerationPhase } from '@renderer/services/novel/writing-service'

export interface BlueprintGenerationSession {
  projectId: string
  active: boolean
  percent: number
  message: string
  phase: BlueprintGenerationPhase | null
  updatedAt: number
}

const sessions = ref<Map<string, BlueprintGenerationSession>>(new Map())

function touchSession(projectId: string, patch: Partial<BlueprintGenerationSession>): void {
  const existing = sessions.value.get(projectId)
  const next: BlueprintGenerationSession = {
    projectId,
    active: patch.active ?? existing?.active ?? false,
    percent: patch.percent ?? existing?.percent ?? 0,
    message: patch.message ?? existing?.message ?? '',
    phase: patch.phase !== undefined ? patch.phase : (existing?.phase ?? null),
    updatedAt: Date.now(),
  }
  const copy = new Map(sessions.value)
  copy.set(projectId, next)
  sessions.value = copy
}

export function beginBlueprintGenSession(projectId: string): void {
  touchSession(projectId, {
    active: true,
    percent: 0,
    message: '准备生成蓝图…',
    phase: 'preparing',
  })
}

export function updateBlueprintGenSession(
  projectId: string,
  patch: Partial<Pick<BlueprintGenerationSession, 'percent' | 'message' | 'phase'>>
): void {
  touchSession(projectId, { active: true, ...patch })
}

export function endBlueprintGenSession(projectId: string): void {
  const existing = sessions.value.get(projectId)
  if (!existing) return
  const copy = new Map(sessions.value)
  copy.set(projectId, { ...existing, active: false, updatedAt: Date.now() })
  sessions.value = copy
}

export function getBlueprintGenSession(projectId: string): BlueprintGenerationSession | null {
  return sessions.value.get(projectId) ?? null
}

export function useBlueprintGenSession(projectId: () => string) {
  const session = computed(() => getBlueprintGenSession(projectId()))
  const isActive = computed(() => Boolean(session.value?.active))
  return {
    session: readonly(session),
    isActive,
  }
}
