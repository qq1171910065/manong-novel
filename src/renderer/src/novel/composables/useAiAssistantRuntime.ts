import { reactive, readonly } from 'vue'

export interface AiAssistantRuntimeState {
  inFlight: boolean
  materializing: boolean
  entrySectionLabel: string
  scopeMode: string
  workflowMode: string
}

const DEFAULT_STATE: AiAssistantRuntimeState = {
  inFlight: false,
  materializing: false,
  entrySectionLabel: '',
  scopeMode: 'auto',
  workflowMode: 'edit',
}

const runtimeByProject = reactive(new Map<string, AiAssistantRuntimeState>())

function ensure(projectId: string): AiAssistantRuntimeState {
  let state = runtimeByProject.get(projectId)
  if (!state) {
    state = { ...DEFAULT_STATE }
    runtimeByProject.set(projectId, state)
  }
  return state
}

export function patchAiAssistantRuntime(
  projectId: string,
  patch: Partial<AiAssistantRuntimeState>
): void {
  Object.assign(ensure(projectId), patch)
}

export function getAiAssistantRuntime(projectId: string): Readonly<AiAssistantRuntimeState> {
  return readonly(ensure(projectId))
}

export function isAiAssistantBusy(projectId: string): boolean {
  const state = runtimeByProject.get(projectId)
  return Boolean(state?.inFlight || state?.materializing)
}

export function clearAiAssistantRuntime(projectId: string): void {
  runtimeByProject.delete(projectId)
}
