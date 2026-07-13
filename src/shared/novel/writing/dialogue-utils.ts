import { parseBestConversationJsonObject } from '@shared/novel/json-utils'

export function parseJsonBlock(text: string): Record<string, unknown> | null {
  return parseBestConversationJsonObject(text)
}
