import { getGatewayChatPort, setGatewayChatPort } from '@shared/gateway/chat-port'
import { getWritingRuntime, setWritingRuntime } from '@shared/novel/writing/runtime'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import {
  getChapterGenProgressSnapshot,
  patchChapterGenProgress,
  setChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import { projectStatsService } from '@renderer/services/project-stats-service'
import { pipelineLogService } from '@renderer/services/pipeline-log-service'
import { createRendererGatewayChatPort } from './gateway-chat-port'
import { trySyncGatewayToMain } from './generation-client'


function bindRendererWritingRuntime(): void {
  setGatewayChatPort(createRendererGatewayChatPort())
  setWritingRuntime({
    runAgentWorkflow,
    patchChapterGenProgress,
    setChapterGenProgress,
    getChapterGenProgressSnapshot,
    getCreationWorkflowPrefs,
    recordChapterComplete: (projectId) => projectStatsService.recordChapterComplete(projectId),
    recordAiCall: (projectId, usage) => projectStatsService.recordAiCall(projectId, usage),
    startPipelineLog: (input) => pipelineLogService.start(input),
    finishPipelineLog: (id, result) => pipelineLogService.finish(id, result),
  })
}

export function initWritingRuntime(): void {
  bindRendererWritingRuntime()
  void trySyncGatewayToMain()
}

/** 生成/对话前确保 renderer 侧 port 与 runtime 已绑定（兼容 HMR 与懒加载） */
export function ensureWritingRuntime(): void {
  try {
    getGatewayChatPort()
    getWritingRuntime()
    return
  } catch {
    // fall through
  }
  bindRendererWritingRuntime()
}
