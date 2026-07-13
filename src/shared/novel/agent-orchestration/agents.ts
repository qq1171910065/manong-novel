import type { AgentDefinition, AgentId } from './types'

/** 写作多智能体注册表 — 各 specialist 分工明确，由 orchestrator 协调 handoff */
export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  orchestrator: {
    id: 'orchestrator',
    label: '协调员',
    role: '调度工作流、分配资源锁、协调 handoff',
    writeScopes: ['project'],
    pipelineSteps: [],
  },
  concept_dialogue: {
    id: 'concept_dialogue',
    label: '文思',
    role: '与用户对话，引导灵感；不直接写入设定文档',
    writeScopes: [],
    pipelineSteps: ['concept_converse'],
  },
  concept_editor: {
    id: 'concept_editor',
    label: '设定编辑员',
    role: '通过 tool_calls 写入概念清单与 brief（Claude Code 模式）',
    writeScopes: ['concept'],
    pipelineSteps: ['concept_refine'],
  },
  blueprint_synthesizer: {
    id: 'blueprint_synthesizer',
    label: '概念策划师',
    role: '将灵感对话整理为故事概念策划案',
    writeScopes: ['concept'],
    pipelineSteps: ['concept_converse'],
  },
  blueprint_architect: {
    id: 'blueprint_architect',
    label: '蓝图架构师',
    role: '生成核心设定、人物、世界观 JSON',
    writeScopes: ['blueprint'],
    pipelineSteps: ['blueprint_generate'],
  },
  outline_planner: {
    id: 'outline_planner',
    label: '大纲规划师',
    role: '分批补全章节大纲',
    writeScopes: ['blueprint'],
    pipelineSteps: ['blueprint_outline'],
  },
  chapter_director: {
    id: 'chapter_director',
    label: '章节导演',
    role: '撰写导演脚本与章节任务书',
    writeScopes: ['chapter'],
    pipelineSteps: ['chapter_plan'],
  },
  chapter_writer: {
    id: 'chapter_writer',
    label: '章节写手',
    role: '根据导演脚本撰写正文草稿',
    writeScopes: ['chapter'],
    pipelineSteps: ['chapter_write', 'chapter_rewrite'],
  },
  constitution_guard: {
    id: 'constitution_guard',
    label: '宪法守卫',
    role: '检查正文是否符合全书宪法与设定',
    writeScopes: ['chapter'],
    pipelineSteps: ['chapter_constitution'],
  },
  chapter_proofreader: {
    id: 'chapter_proofreader',
    label: '润色编辑',
    role: '通篇润色与语言优化',
    writeScopes: ['chapter'],
    pipelineSteps: ['chapter_proofread'],
  },
  chapter_evaluator: {
    id: 'chapter_evaluator',
    label: '评审员',
    role: '多版本评审与选版建议',
    writeScopes: ['chapter'],
    pipelineSteps: ['chapter_evaluate'],
  },
  section_polish_agent: {
    id: 'section_polish_agent',
    label: '设定修改员',
    role: '针对蓝图板块进行 AI 修改',
    writeScopes: ['section_polish', 'blueprint'],
    pipelineSteps: ['section_polish', 'section_polish_materialize'],
  },
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  return AGENT_REGISTRY[agentId]
}

export function getAgentLabel(agentId: AgentId): string {
  return AGENT_REGISTRY[agentId]?.label ?? agentId
}
