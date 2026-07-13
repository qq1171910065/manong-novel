/** 检测主进程后台生成 IPC 是否可用 */
export function isMainGenerationAvailable(): boolean {
  return (
    typeof window.api?.novelGenerationStart === 'function' &&
    typeof window.api?.novelGenerationSyncGateway === 'function'
  )
}
