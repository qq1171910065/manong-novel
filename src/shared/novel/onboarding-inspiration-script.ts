import type { ConverseResponse, ConversationMessage, NovelProject, UIControl } from './types'
import { isOnboardingProjectTitle } from './onboarding'

/** 演示模式灵感对话：用户可见文案与 AI 回复均写死 */
export interface OnboardingInspirationTurn {
  /** 引导按钮触发时模拟发送的用户文案；开场为 null */
  userMessage: string | null
  aiMessage: string
  uiControl: UIControl
  conversationState: Record<string, unknown>
}

export const ONBOARDING_INSPIRATION_TURNS: OnboardingInspirationTurn[] = [
  {
    userMessage: null,
    aiMessage:
      '欢迎来到灵感对话。我是文思。先随便聊聊你想写的故事——类型、主角或一个画面都行。演示里可以直接点选下方推荐。',
    uiControl: {
      type: 'single_choice',
      options: [
        {
          id: 'demo_spark_xuanhuan',
          label: '东方玄幻：灵脉枯竭，边陲少年崛起',
          description: '演示用推荐灵感',
        },
        {
          id: 'demo_spark_urban',
          label: '都市异能：雨夜逃亡',
          description: '另一条演示路线',
        },
      ],
    },
    conversationState: {
      concept_brief: '',
      checklist_answers: {},
      ready_for_blueprint: false,
    },
  },
  {
    userMessage: '东方玄幻：灵脉枯竭，边陲少年崛起',
    aiMessage:
      '收到。核心冲突可以设为「灵脉枯竭引发宗门争夺」，主角能感知残存灵息。建议再补一位引路人与一位理念宿敌，并定一个雨夜逃亡的开篇钩子。',
    uiControl: {
      type: 'single_choice',
      options: [
        {
          id: 'demo_refine_yes',
          label: '就按这个：引路人 + 宿敌 + 雨夜开篇',
          description: '演示下一句',
        },
        {
          id: 'demo_refine_ok',
          label: '可以，准备出蓝图',
          description: '直接收束',
        },
      ],
    },
    conversationState: {
      concept_brief:
        '东方玄幻短篇。灵脉枯竭乱世中，边陲少年沈砚凭残灵感知卷入宗门纷争。',
      checklist_answers: {
        core_spark: '灵脉枯竭与边陲少年',
        genre_tone: '东方玄幻 / 冷峻带希望',
        writing_style: '史诗感与人物情感并重',
        protagonist: '沈砚',
        core_conflict: '灵脉枯竭引发争夺',
        catalyst: '雨夜逃亡',
        chapter_scope: '短篇约 6 章',
      },
      ready_for_blueprint: false,
    },
  },
  {
    userMessage: '就按这个：引路人 + 宿敌 + 雨夜开篇',
    aiMessage:
      '设定已齐。引路人顾寒山、宿敌陆青崖、开篇雨夜逃亡都已记下。可以点上方「确认蓝图设定」，进入蓝图确认（演示将使用预制蓝图，不调用模型）。',
    uiControl: {
      type: 'text_input',
      placeholder: '还可以继续微调，或点「确认蓝图设定」…',
    },
    conversationState: {
      concept_brief:
        '东方玄幻短篇《青玉长歌》。灵脉枯竭乱世，沈砚在雨夜踏上修行之路；引路人顾寒山、宿敌陆青崖。',
      checklist_answers: {
        core_spark: '灵脉枯竭与边陲少年',
        genre_tone: '东方玄幻 / 冷峻带希望',
        writing_style: '史诗感与人物情感并重',
        protagonist: '沈砚',
        core_conflict: '灵脉枯竭引发争夺',
        catalyst: '雨夜逃亡',
        chapter_scope: '短篇约 6 章',
        mentor: '顾寒山',
        rival: '陆青崖',
      },
      ready_for_blueprint: true,
    },
  },
]

export function isOnboardingDemoProject(
  project: Pick<NovelProject, 'title' | 'initial_prompt'> | null | undefined
): boolean {
  if (!project) return false
  if (isOnboardingProjectTitle(project.title)) return true
  return Boolean(project.initial_prompt?.includes('[onboarding]'))
}

/** 已完成的用户轮次数（不含开场 assistant） */
export function countOnboardingUserTurns(history: ConversationMessage[] | undefined): number {
  if (!history?.length) return 0
  return history.filter((m) => m.role === 'user').length
}

/**
 * 下一则脚本回复下标：
 * - 开场 null → 0
 * - 已有 N 条 assistant → 用户再发一条时用 min(N, last)
 */
export function resolveOnboardingInspirationTurnIndex(
  history: ConversationMessage[] | undefined,
  userInput: { id?: string | null; value?: string | null } | null
): number {
  if (!userInput || (!userInput.value?.trim() && !userInput.id)) {
    return 0
  }
  const assistantTurns = (history || []).filter((m) => m.role === 'assistant').length
  return Math.min(Math.max(assistantTurns, 1), ONBOARDING_INSPIRATION_TURNS.length - 1)
}

export function getOnboardingScriptedUserMessage(turnIndex: number): string | null {
  return ONBOARDING_INSPIRATION_TURNS[turnIndex]?.userMessage ?? null
}

/** 应用脚本轮次并写入 conversation_history（不调模型） */
export function applyOnboardingInspirationTurn(
  project: NovelProject,
  userInput: { id?: string | null; value?: string | null } | null
): ConverseResponse {
  const history: ConversationMessage[] = [...(project.conversation_history || [])]
  const isStart = !userInput || (!userInput.value?.trim() && !userInput.id)

  // 开场已有历史：直接回放首轮，避免重复追加
  if (isStart && history.some((m) => m.role === 'assistant')) {
    const turn = ONBOARDING_INSPIRATION_TURNS[0]
    return {
      ai_message: turn.aiMessage,
      ui_control: turn.uiControl,
      conversation_state: { ...turn.conversationState },
      is_complete: false,
      ready_for_blueprint: Boolean(turn.conversationState.ready_for_blueprint),
    }
  }

  const turnIndex = resolveOnboardingInspirationTurnIndex(history, userInput)
  const turn = ONBOARDING_INSPIRATION_TURNS[turnIndex] ?? ONBOARDING_INSPIRATION_TURNS[0]

  const formattedInput = userInput ?? { id: null, value: null }
  if (isStart) {
    history.push({ role: 'user', content: JSON.stringify({ id: null, value: null }) })
  } else {
    history.push({ role: 'user', content: JSON.stringify(formattedInput) })
  }

  const conversationState = {
    ...turn.conversationState,
    ready_for_blueprint: Boolean(turn.conversationState.ready_for_blueprint),
  }

  const assistantPayload = JSON.stringify({
    ai_message: turn.aiMessage,
    ui_control: turn.uiControl,
    conversation_state: conversationState,
    is_complete: false,
    ready_for_blueprint: conversationState.ready_for_blueprint,
  })
  history.push({ role: 'assistant', content: assistantPayload })
  project.conversation_history = history

  return {
    ai_message: turn.aiMessage,
    ui_control: turn.uiControl,
    conversation_state: conversationState,
    is_complete: false,
    ready_for_blueprint: Boolean(conversationState.ready_for_blueprint),
  }
}
