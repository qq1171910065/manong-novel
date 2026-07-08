const PROMPT_MODULES = import.meta.glob('@shared/novel/prompts/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export function getPromptFileContent(filename: string): string | null {
  const normalized = filename.trim()
  if (!normalized) return null
  for (const [path, content] of Object.entries(PROMPT_MODULES)) {
    if (path.endsWith(`/${normalized}`)) return content
  }
  return null
}
