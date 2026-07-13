import type { AgentWorkflowDefinition } from './types'

/** 预定义多智能体工作流 — orchestrator 按序 handoff */
export const AGENT_WORKFLOWS: Record<string, AgentWorkflowDefinition> = {
  concept_turn: {
    id: 'concept_turn',
    label: '灵感对话轮次',
    description: '文思对话 → 设定编辑员 tool 写入',
    steps: [
      {
        id: 'dialogue',
        agentId: 'concept_dialogue',
        label: '与用户对话',
        resources: [],
        pipelineStep: 'concept_converse',
      },
      {
        id: 'refine',
        agentId: 'concept_editor',
        label: '整合设定文档',
        resources: ['concept'],
        pipelineStep: 'concept_refine',
      },
    ],
  },
  blueprint_generation: {
    id: 'blueprint_generation',
    label: '蓝图生成',
    description: '概念策划 → 蓝图架构 → 大纲规划',
    steps: [
      {
        id: 'prepare',
        agentId: 'orchestrator',
        label: '整理灵感与设定',
        resources: ['concept'],
      },
      {
        id: 'synthesize',
        agentId: 'blueprint_synthesizer',
        label: '撰写概念策划案',
        resources: ['concept'],
        pipelineStep: 'concept_converse',
      },
      {
        id: 'architect',
        agentId: 'blueprint_architect',
        label: '生成核心蓝图',
        resources: ['blueprint', 'concept'],
        pipelineStep: 'blueprint_generate',
      },
      {
        id: 'outline',
        agentId: 'outline_planner',
        label: '补全章节大纲',
        resources: ['blueprint'],
        pipelineStep: 'blueprint_outline',
      },
    ],
  },
  chapter_generation: {
    id: 'chapter_generation',
    label: '章节创作',
    description: '导演 → 写手 → 宪法 → 润色 → 评审',
    steps: [
      {
        id: 'direct',
        agentId: 'chapter_director',
        label: '撰写导演脚本',
        resources: ['chapter'],
        pipelineStep: 'chapter_plan',
      },
      {
        id: 'write',
        agentId: 'chapter_writer',
        label: '撰写正文',
        resources: ['chapter'],
        pipelineStep: 'chapter_write',
      },
      {
        id: 'constitution',
        agentId: 'constitution_guard',
        label: '宪法合规检查',
        resources: ['chapter'],
        pipelineStep: 'chapter_constitution',
      },
      {
        id: 'proofread',
        agentId: 'chapter_proofreader',
        label: '通篇润色',
        resources: ['chapter'],
        pipelineStep: 'chapter_proofread',
      },
      {
        id: 'evaluate',
        agentId: 'chapter_evaluator',
        label: '多版本评审',
        resources: ['chapter'],
        pipelineStep: 'chapter_evaluate',
      },
    ],
  },
  section_polish: {
    id: 'section_polish',
    label: '设定修改',
    description: '设定修改员对话与落稿',
    steps: [
      {
        id: 'polish',
        agentId: 'section_polish_agent',
        label: 'AI 修改对话',
        resources: ['section_polish', 'blueprint'],
        pipelineStep: 'section_polish',
      },
      {
        id: 'materialize',
        agentId: 'section_polish_agent',
        label: '生成修改稿',
        resources: ['blueprint'],
        pipelineStep: 'section_polish_materialize',
      },
    ],
  },
  auto_write: {
    id: 'auto_write',
    label: 'AI 接管创作',
    description: '协调员循环调度章节创作智能体',
    steps: [
      {
        id: 'orchestrate',
        agentId: 'orchestrator',
        label: '协调连写循环',
        resources: [],
      },
      {
        id: 'chapter',
        agentId: 'chapter_writer',
        label: '章节创作',
        resources: ['chapter'],
        pipelineStep: 'chapter_write',
      },
    ],
  },
  chapter_evaluation: {
    id: 'chapter_evaluation',
    label: '章节评审',
    description: '多版本评审与选优',
    steps: [
      {
        id: 'evaluate',
        agentId: 'chapter_evaluator',
        label: '多版本评审',
        resources: ['chapter'],
        pipelineStep: 'chapter_evaluate',
      },
    ],
  },
}

export function getWorkflowDefinition(workflowId: string): AgentWorkflowDefinition | undefined {
  return AGENT_WORKFLOWS[workflowId]
}
