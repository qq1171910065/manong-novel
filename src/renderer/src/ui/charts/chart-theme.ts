import type { ECBasicOption } from 'echarts/types/dist/shared'

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function axisTheme() {
  const line = readCssVar('--line', '#e2e8f0')
  const muted = readCssVar('--muted', '#64748b')
  return {
    axisLine: { lineStyle: { color: line } },
    axisLabel: { color: muted },
    splitLine: { lineStyle: { color: line, opacity: 0.45 } },
  }
}

/** 从 CSS 变量构建 ECharts 基础主题（随 applyTheme 刷新） */
export function buildChartBaseOption(): ECBasicOption {
  const text = readCssVar('--text-secondary', '#3d5550')
  const surface = readCssVar('--surface', '#fffcf7')
  const line = readCssVar('--line', '#ddd5c4')
  const textPrimary = readCssVar('--text', '#142f2f')
  const axis = axisTheme()

  return {
    color: [
      readCssVar('--brand', '#1f7a67'),
      readCssVar('--color-accent-cyan', '#8eb4a2'),
      readCssVar('--color-accent-indigo', '#c5a059'),
      readCssVar('--color-success', '#22c55e'),
      readCssVar('--color-warning', '#f59e0b'),
    ],
    textStyle: {
      color: text,
      fontFamily: readCssVar('--font-sans', 'system-ui, sans-serif'),
    },
    legend: { textStyle: { color: text } },
    tooltip: {
      backgroundColor: surface,
      borderColor: line,
      textStyle: { color: textPrimary },
    },
    xAxis: axis,
    yAxis: axis,
  }
}

function mergeAxis(
  base: Record<string, unknown>,
  user: Record<string, unknown> | Record<string, unknown>[] | undefined
): Record<string, unknown> | Record<string, unknown>[] | undefined {
  if (!user) return base
  if (Array.isArray(user)) {
    return user.map((item) => ({ ...base, ...item }))
  }
  return { ...base, ...user }
}

/** 将用户 option 与 token 主题合并（series 等用户数据优先） */
export function mergeChartTheme(option: ECBasicOption): ECBasicOption {
  const base = buildChartBaseOption()
  return {
    ...base,
    ...option,
    legend: { ...(base.legend as object), ...(option.legend as object) },
    tooltip: { ...(base.tooltip as object), ...(option.tooltip as object) },
    xAxis: mergeAxis(base.xAxis as Record<string, unknown>, option.xAxis as never),
    yAxis: mergeAxis(base.yAxis as Record<string, unknown>, option.yAxis as never),
  }
}
