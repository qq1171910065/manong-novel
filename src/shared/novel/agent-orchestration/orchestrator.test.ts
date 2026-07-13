import { describe, expect, it } from 'vitest'
import {
  createAgentOrchestratorState,
  finishAgentWorkflow,
  runAgentStep,
  startAgentWorkflow,
} from './orchestrator'
import { getLocksForProject } from './resource-lock'

describe('orchestrator', () => {
  it('runs steps and releases locks on finish', async () => {
    const state = createAgentOrchestratorState()
    const run = startAgentWorkflow(state, {
      workflowId: 'concept_turn',
      projectId: 'p1',
      projectTitle: '测试书',
    })

    await runAgentStep(
      state,
      run.id,
      {
        stepId: 'dialogue',
        agentId: 'concept_dialogue',
        label: '对话',
      },
      async () => 'ok'
    )

    await runAgentStep(
      state,
      run.id,
      {
        stepId: 'refine',
        agentId: 'concept_editor',
        label: '整合设定',
        resources: ['concept'],
      },
      async () => 'done'
    )

    expect(getLocksForProject(state.locks, 'p1').length).toBeGreaterThan(0)

    finishAgentWorkflow(state, run.id, 'completed')
    expect(getLocksForProject(state.locks, 'p1')).toHaveLength(0)
    expect(state.runs[0]?.status).toBe('completed')
  })
})
