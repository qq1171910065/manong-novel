import { describe, expect, it } from 'vitest'
import { assertStoryWriteGate, runStorySystemDoctor, runStorySystemPreflight } from './doctor'
import type { NovelProject } from '../types'

const baseProject = (): NovelProject => ({
  id: 'p1',
  title: '测试',
  initial_prompt: 'prompt',
  chapters: [],
  conversation_history: [{ role: 'user', content: '{"value":"hello"}' }],
})

describe('story system doctor', () => {
  it('preflight 对无 commit 的对话给出 warning', () => {
    const report = runStorySystemPreflight(baseProject())
    expect(report.phase).toBe('concept')
    expect(report.issues.some((i) => i.code === 'concept_no_commits')).toBe(true)
  })

  it('write gate 阻止无蓝图写章', () => {
    const gate = assertStoryWriteGate(baseProject(), 'chapter_generate', { chapterNumber: 1 })
    expect(gate.allowed).toBe(false)
  })

  it('doctor 返回 counts 与 suggestions', () => {
    const report = runStorySystemDoctor({
      ...baseProject(),
      blueprint: { title: 'BP', chapter_outline: [] },
    })
    expect(report.counts.concept_commits).toBe(0)
    expect(Array.isArray(report.suggestions)).toBe(true)
  })
})
