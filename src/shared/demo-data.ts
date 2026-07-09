import type { NovelProject } from './novel/types'

/** 示例数据项目标题，用于空库检测后的展示导入 */
export const DEMO_DATA_PROJECT_TITLE = '青玉长歌'

function demoAssistantTurn(aiMessage: string, conversationState: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ai_message: aiMessage,
    ui_control: {
      type: 'text_input',
      placeholder: '继续描述你的故事，或提出修改意见…',
    },
    conversation_state: conversationState,
  })
}

/**
 * 生成用于「示例数据」导入的种子项目（草稿级，导入时由 AI 润色）。
 * 不含 id，由导入流程在创建时分配。
 */
export function createDemoDataSeed(): Omit<NovelProject, 'id'> {
  const now = new Date().toISOString()
  return {
    title: DEMO_DATA_PROJECT_TITLE,
    initial_prompt: '东方玄幻，灵脉枯竭，边陲少年沈砚在雨夜踏上修行之路。',
    source_type: 'created',
    writing_mode: 'full',
    genre: '东方玄幻',
    updated_at: now,
    conversation_history: [
      {
        role: 'user',
        content: '我想写一部东方玄幻，主角从边陲小镇崛起，世界观要有「灵脉枯竭」的危机。',
      },
      {
        role: 'assistant',
        content: demoAssistantTurn(
          '很好的切入点。建议核心冲突设为：灵脉枯竭引发宗门争夺，主角因特殊体质能感知残存灵息。需要一位引路人，以及一位理念决裂的宿敌。',
          { genre: '东方玄幻', core_conflict: '灵脉枯竭' }
        ),
      },
      {
        role: 'user',
        content: '要。再加一个雨夜逃亡的开篇钩子，以及三幕结构。',
      },
      {
        role: 'assistant',
        content: demoAssistantTurn(
          '已记录。第一幕边陲异变、第二幕宗门试炼、第三幕灵脉真相。可以进入蓝图编辑并开始写第一章。',
          {
            genre: '东方玄幻',
            core_conflict: '灵脉枯竭',
            opening_hook: '雨夜逃亡',
            structure: '三幕',
            ready_for_blueprint: true,
          }
        ),
      },
    ],
    blueprint: {
      title: DEMO_DATA_PROJECT_TITLE,
      genre: '东方玄幻',
      style: '史诗感与人物情感并重',
      tone: '冷峻克制，底色带希望',
      target_audience: '喜欢东方玄幻、成长与背叛主题的读者',
      one_sentence_summary: '边陲少年在灵脉枯竭的乱世中，踏上寻找真相与重建秩序的旅程。',
      full_synopsis:
        '沈砚出身边陲青石镇，因能感知残存灵息而被卷入宗门纷争。灵脉枯竭的真相逐渐浮出水面，他必须在引路人顾寒山、宿敌陆青崖与旧秩序之间做出选择。',
      world_setting: {
        core_rules:
          '灵脉枯竭导致修行资源稀缺；宗门以灵息矿脉为核心争夺目标，巡灵司控制流通。',
        key_locations: [
          { name: '青石镇', description: '边陲起始地，雨夜逃亡发生于此。' },
          { name: '残灵庙', description: '封印旧时代灵息的废弃庙宇，沈砚感知异变的起点。' },
          { name: '巡灵城', description: '巡灵司辖区，规则森严，灵息交易受控。' },
        ],
        factions: [
          { name: '青玉宗', description: '试图重启灵脉的传统宗门，保守而执着。' },
          { name: '巡灵司', description: '控制灵息流通的秩序机构，维持表面稳定。' },
          { name: '散修盟', description: '拒绝宗门束缚的修行者联盟，行事激进。' },
        ],
      },
      characters: [
        {
          name: '沈砚',
          description: '边陲少年，能感知残存灵息，性格坚韧。',
          identity: '主角',
          personality: '克制、敏锐、重情',
          goals: '查明灵脉枯竭真相，保护青石镇',
          relationship_to_protagonist: '本人',
        },
        {
          name: '顾寒山',
          description: '前青玉宗长老，沈砚的引路人。',
          identity: '导师',
          personality: '沉稳、隐忧、守旧',
          goals: '重启灵脉，但方式存疑',
          relationship_to_protagonist: '师徒与托付',
        },
        {
          name: '陆青崖',
          description: '与沈砚一同长大的师兄，后成为理念宿敌。',
          identity: '宿敌',
          personality: '骄傲、理想主义、决绝',
          goals: '以激进手段打破旧秩序',
          relationship_to_protagonist: '竹马之交走向决裂',
        },
        {
          name: '苏晚',
          description: '巡灵城文书，掌握部分灵息档案。',
          identity: '盟友',
          personality: '冷静、理性、有所保留',
          goals: '在秩序与真相之间找平衡',
          relationship_to_protagonist: '信息提供者',
        },
      ],
      relationships: [
        {
          character_from: '沈砚',
          character_to: '顾寒山',
          relationship_type: '师徒',
          description: '顾寒山在雨夜救下沈砚，成为其引路人。',
        },
        {
          character_from: '沈砚',
          character_to: '陆青崖',
          relationship_type: '宿敌',
          description: '竹马之交因理念分歧走向对立。',
        },
        {
          character_from: '沈砚',
          character_to: '苏晚',
          relationship_type: '合作',
          description: '在巡灵城因灵息档案结缘，互有保留。',
        },
      ],
      chapter_outline: [
        {
          chapter_number: 1,
          title: '雨夜',
          summary: '沈砚雨夜逃离残灵庙，初遇灵息异变，林深处与陆青崖重逢。',
        },
        {
          chapter_number: 2,
          title: '灵息',
          summary: '顾寒山现身，点破灵脉枯竭的危机，沈砚被迫做出选择。',
        },
        {
          chapter_number: 3,
          title: '旧盟',
          summary: '陆青崖提出激进方案，与沈砚理念冲突首次爆发。',
        },
        {
          chapter_number: 4,
          title: '巡城',
          summary: '进入巡灵司辖区，规则与代价显现，苏晚递来关键线索。',
        },
        {
          chapter_number: 5,
          title: '矿脉',
          summary: '深入灵息矿脉，灵脉枯竭真相露出冰山一角。',
        },
        {
          chapter_number: 6,
          title: '抉择',
          summary: '三方势力摊牌，沈砚必须在旧秩序与重建之间站队。',
        },
      ],
    },
    chapters: [
      {
        chapter_number: 1,
        title: '雨夜',
        summary: '沈砚雨夜逃离残灵庙，初遇灵息异变。',
        content:
          '雨夜。沈砚从残灵庙逃出，身后有人追。他背着破布包袱，玉佩发烫。\n\n林子里，陆青崖撑着伞等他。沈砚不知道，这一夜会改变一切。',
        generation_status: 'successful',
        versions: null,
        evaluation: null,
        word_count: 0,
      },
      {
        chapter_number: 2,
        title: '灵息',
        summary: '顾寒山现身，点破灵脉枯竭的危机。',
        content: null,
        generation_status: 'not_generated',
        versions: null,
        evaluation: null,
      },
      {
        chapter_number: 3,
        title: '旧盟',
        summary: '陆青崖提出激进方案，理念冲突爆发。',
        content: null,
        generation_status: 'not_generated',
        versions: null,
        evaluation: null,
      },
      {
        chapter_number: 4,
        title: '巡城',
        summary: '进入巡灵司辖区，苏晚递来线索。',
        content: null,
        generation_status: 'not_generated',
        versions: null,
        evaluation: null,
      },
      {
        chapter_number: 5,
        title: '矿脉',
        summary: '深入灵息矿脉，真相初现。',
        content: null,
        generation_status: 'not_generated',
        versions: null,
        evaluation: null,
      },
      {
        chapter_number: 6,
        title: '抉择',
        summary: '三方摊牌，沈砚必须站队。',
        content: null,
        generation_status: 'not_generated',
        versions: null,
        evaluation: null,
      },
    ],
  }
}
