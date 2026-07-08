import projectDocsRaw from '../data/project-docs.md?raw'
import { randomUUID } from '@renderer/utils/id'
import { gatewayChatStream, resolveChatModelId } from './gateway-api'

export type MessageStreamStatus = 'pending' | 'streaming' | 'done' | 'error'

export interface HelpChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  streamStatus?: MessageStreamStatus
}

const STORAGE_KEY = 'novel-help-chat'

function readStored(): HelpChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HelpChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStored(messages: HelpChatMessage[]): HelpChatMessage[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  return messages
}

export const HELP_WELCOME_TEXT =
  '你好，我是帮助助手。你可以问我关于写作台、灵感模式、模型服务、钱包充值等问题，我会基于项目文档回答。'

export type HelpChatStreamHandler = (messages: HelpChatMessage[]) => void

function buildHelpSystemPrompt(): string {
  return [
    '你是 Manong Novel 设置中心「帮助中心」的答疑助手。',
    '',
    '## 回答规则',
    '- 只能根据下方「项目文档」中的内容回答，不得编造文档未提及的功能、步骤、政策或数值。',
    '- 若用户问题在项目文档中没有明确说明，必须直接回复：「项目文档中暂无相关说明。你可以前往「项目文档」查看完整内容，或通过「报 Bug」提交反馈。」不要给出推测性答案。',
    '- 语气清晰友好，回答简洁，优先分点说明操作步骤。',
    '- 不要提及你是 AI 模型；不要引用文档外的互联网知识。',
    '',
    '## 项目文档',
    projectDocsRaw.trim(),
  ].join('\n')
}

export function createHelpWelcomeMessage(): HelpChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: HELP_WELCOME_TEXT,
    createdAt: new Date().toISOString(),
  }
}

export const helpChatService = {
  createWelcomeMessage: createHelpWelcomeMessage,

  async listMessages(): Promise<HelpChatMessage[]> {
    return readStored()
  },

  async clearMessages(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY)
  },

  async askStream(
    question: string,
    onMessages: HelpChatStreamHandler
  ): Promise<{ reply: string; messages: HelpChatMessage[] }> {
    const trimmed = question.trim()
    if (!trimmed) throw new Error('请输入问题')

    const userMsg: HelpChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    const afterUser = writeStored([...readStored(), userMsg])

    const placeholderId = randomUUID()
    let draft = ''
    let streamStatus: MessageStreamStatus = 'pending'
    const pushDraft = () => {
      const draftMsg: HelpChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: draft,
        createdAt: new Date().toISOString(),
        streamStatus,
      }
      onMessages([...afterUser, draftMsg])
    }

    pushDraft()

    const llmMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: buildHelpSystemPrompt() },
      ...afterUser.slice(-16).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    ]

    const modelId = await resolveChatModelId()

    await new Promise<void>((resolve, reject) => {
      void gatewayChatStream(modelId, llmMessages, {
        onChunk: (chunk) => {
          draft += chunk
          streamStatus = 'streaming'
          pushDraft()
        },
        onEnd: () => resolve(),
        onError: (err) => reject(new Error(err)),
      }).catch(reject)
    })

    const reply = draft.trim() || '抱歉，我暂时无法回答这个问题。'
    streamStatus = 'done'
    draft = reply
    pushDraft()

    const assistantMsg: HelpChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      streamStatus: 'done',
    }
    const messages = writeStored([...afterUser, assistantMsg])
    onMessages(messages)

    return { reply, messages }
  },
}
