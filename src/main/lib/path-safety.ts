import { URL } from 'node:url'

/** storage key 仅允许安全字符，防止路径穿越 */
export function sanitizeStorageKey(key: string): string {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid storage key')
  }
  if (key.includes('..') || key.includes('/') || key.includes('\\') || key.includes('\0')) {
    throw new Error('Invalid storage key')
  }
  const sanitized = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!sanitized) throw new Error('Invalid storage key')
  return sanitized
}

function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0' || host === '::1' || host === '::') return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map(Number)
    if (parts.some((n) => n > 255)) return true
    return isPrivateIpv4(parts[0], parts[1])
  }

  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  return false
}

/** 阻止 renderer 经主进程代理访问内网地址（SSRF 防护） */
export function assertPublicHttpUrl(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are allowed')
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Private or local network URLs are not allowed')
  }
}

/** 文件路径基础校验 */
export function assertSafeFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path')
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path')
  }
}
