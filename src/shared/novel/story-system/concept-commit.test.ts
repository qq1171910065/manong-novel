import { describe, expect, it } from 'vitest'
import {
  appendConceptCommit,
  createConceptCommit,
  projectConceptStateFromCommits,
  resolveProjectConceptState,
  scoreConceptStateCompleteness,
} from './concept-commit'
import { createEmptyStorySystem } from './types'
import type { ConceptToolCall } from '../concept-refinement'

const sampleBatchCall = (fields: Record<string, string>, brief: string): ConceptToolCall => ({
  name: 'batch_update_concept',
  arguments: { fields, brief },
})

describe('story-system concept commits', () => {
  it('projects latest accepted commit applied_state', () => {
    const brief =
      '这是一段足够长的故事概念综述，用于测试 brief 写入门槛。主角流落荒岛，在系统与生存压力之间寻找出路。'
    const call = sampleBatchCall(
      {
        spark: '荒岛系统降临，生存即修行',
        genre_tone: '玄幻生存 · 冷峻写实',
        prose_style: '短句、感官细节、少形容词',
        protagonist: '被放逐的落魄修士，求生欲极强',
        central_conflict: '荒岛资源枯竭与系统任务期限的对抗',
        antagonist: '自然法则与系统惩罚机制构成的无形对立',
        inciting_incident: '海难后醒来，系统面板强制绑定',
        core_theme: '在极限环境中重建秩序与自我',
        working_title: '荒岛系统',
        chapter_count: '12 章左右',
      },
      brief
    )

    const commit = createConceptCommit({
      turn: 1,
      priorState: {},
      toolCalls: [call],
      mode: 'full',
      lockedFields: [],
      userChangedKeys: [],
      userTexts: ['荒岛系统文'],
    })

    const story = appendConceptCommit(createEmptyStorySystem(), commit, 'full')
    const projected = projectConceptStateFromCommits(story)

    expect(projected.checklist_answers?.spark).toContain('荒岛')
    expect(projected.checklist_answers?.working_title).toBe('荒岛系统')
    expect(projected.concept_brief).toBe(brief)
    expect(projected.checklist?.spark).toBe(true)
  })

  it('resolveProjectConceptState prefers commits over embedded fallback', () => {
    const brief =
      '第二版概念综述，长度满足 brief 门槛。故事从海难开始，主角必须在系统规则下活下去并完成隐藏主线。'
    const commit = createConceptCommit({
      turn: 1,
      priorState: {},
      toolCalls: [
        sampleBatchCall(
          {
            spark: '第二版火花',
            genre_tone: '类型基调',
            prose_style: '文风笔触描述',
            protagonist: '主角设定完整描述',
            central_conflict: '主线冲突完整描述',
            antagonist: '对立面完整描述',
            inciting_incident: '催化事件完整描述',
            core_theme: '核心主题完整描述',
            working_title: '第二版书名',
            chapter_count: '8 章左右',
          },
          brief
        ),
      ],
      mode: 'full',
      lockedFields: [],
      userChangedKeys: [],
      userTexts: [],
    })
    const story = appendConceptCommit(createEmptyStorySystem(), commit, 'full')

    const resolved = resolveProjectConceptState(
      {
        story_system: story,
        conversation_history: [],
      },
      'full',
      {
        checklist_answers: { spark: '旧 embedded 值不应出现' },
      }
    )

    expect(resolved.checklist_answers?.spark).toBe('第二版火花')
    expect(resolved.checklist_answers?.working_title).toBe('第二版书名')
  })

  it('scoreConceptStateCompleteness 统计可展示字段', () => {
    const score = scoreConceptStateCompleteness(
      {
        checklist_answers: { spark: '荒岛系统流亮点描述', genre_tone: '玄幻生存基调描述' },
      },
      'full'
    )
    expect(score).toBeGreaterThanOrEqual(2)
  })

  it('embedded 状态在无 commit 时可用于投影', () => {
    const resolved = resolveProjectConceptState(
      { story_system: createEmptyStorySystem(), conversation_history: [] },
      'full',
      {
        checklist_answers: {
          spark: 'embedded 火花描述足够长',
          genre_tone: '类型基调描述足够',
        },
        concept_brief: '这是一段足够长的 embedded brief 用于展示。',
      }
    )
    expect(resolved.checklist_answers?.spark).toContain('embedded')
  })
})
