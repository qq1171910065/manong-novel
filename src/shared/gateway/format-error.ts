/** 将网关 content_filter 类错误转为更易理解的提示 */
export function formatGatewayContentFilterError(raw: string): string {
  if (!/content_filter|high risk|considered high/i.test(raw)) return raw
  return `${raw}。部分模型对小说创作类系统提示较敏感，请换用其他写作模型（如 DeepSeek、GPT 等）后重试。`
}
