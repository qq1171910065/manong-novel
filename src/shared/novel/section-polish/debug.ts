const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true

/** 设定修改 / materialize 调试日志（开发时在控制台搜索 [section-polish]） */
export function polishDebug(stage: string, detail?: Record<string, unknown>): void {
  if (!isDev) return
  if (detail && Object.keys(detail).length) {
    console.info(`[section-polish] ${stage}`, detail)
    return
  }
  console.info(`[section-polish] ${stage}`)
}

export function polishDebugWarn(stage: string, detail?: Record<string, unknown>): void {
  if (!isDev) return
  if (detail && Object.keys(detail).length) {
    console.warn(`[section-polish] ${stage}`, detail)
    return
  }
  console.warn(`[section-polish] ${stage}`)
}
