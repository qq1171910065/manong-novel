/** 从角色描述推断简短称呼（用于关系网节点名） */
export function inferCharacterDisplayName(text: string | undefined, fallback: string): string {
  const trimmed = text?.trim()
  if (!trimmed) return fallback
  const named = trimmed.match(/^([^\s，,。；：:（(【\[]]{1,8})/)?.[1]?.trim()
  if (named && named.length >= 2) return named
  if (trimmed.length <= 10) return trimmed
  return fallback
}
