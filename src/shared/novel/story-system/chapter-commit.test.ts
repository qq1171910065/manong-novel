import { describe, expect, it } from 'vitest'
import {
  projectChapterFromCommits,
  recordChapterCommit,
  replayStoryProjections,
  resolveAllProjectChapters,
} from './chapter-commit'
import { createEmptyStorySystem } from './types'
import type { Chapter, NovelProject } from '../types'

const sampleChapter = (n: number, status: Chapter['generation_status']): Chapter => ({
  chapter_number: n,
  title: `第${n}章`,
  summary: 'summary',
  content: '正文内容足够长',
  versions: ['正文内容足够长'],
  evaluation: null,
  generation_status: status,
})

describe('chapter commits', () => {
  it('recordChapterCommit 投影到 project.chapters', () => {
    const project: NovelProject = {
      id: 'p1',
      title: 't',
      initial_prompt: '',
      chapters: [],
      conversation_history: [],
    }
    recordChapterCommit(project, {
      chapterNumber: 1,
      event: 'draft',
      chapter: sampleChapter(1, 'waiting_for_confirm'),
    })
    expect(project.chapters).toHaveLength(1)
    expect(project.story_system?.chapter_commits).toHaveLength(1)
    expect(project.story_system?.phase).toBe('writing')
  })

  it('projectChapterFromCommits 取最后 accepted', () => {
    const project: NovelProject = {
      id: 'p1',
      title: 't',
      initial_prompt: '',
      chapters: [],
      conversation_history: [],
      story_system: createEmptyStorySystem('writing'),
    }
    recordChapterCommit(project, {
      chapterNumber: 2,
      event: 'draft',
      chapter: sampleChapter(2, 'waiting_for_confirm'),
    })
    recordChapterCommit(project, {
      chapterNumber: 2,
      event: 'confirmed',
      chapter: sampleChapter(2, 'successful'),
    })
    const ch = projectChapterFromCommits(project.story_system, 2)
    expect(ch?.generation_status).toBe('successful')
  })

  it('replayStoryProjections 重建 chapters', () => {
    const project: NovelProject = {
      id: 'p1',
      title: 't',
      initial_prompt: '',
      chapters: [{ ...sampleChapter(1, 'not_generated'), content: null, versions: null }],
      conversation_history: [],
      story_system: createEmptyStorySystem('writing'),
    }
    recordChapterCommit(project, {
      chapterNumber: 1,
      event: 'confirmed',
      chapter: sampleChapter(1, 'successful'),
    })
    project.chapters[0].generation_status = 'not_generated'
    replayStoryProjections(project)
    expect(resolveAllProjectChapters(project)[0]?.generation_status).toBe('successful')
  })
})
