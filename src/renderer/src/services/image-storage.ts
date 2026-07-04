/** 将远程图片或 data URL 规范化为可本地持久化的 data URL */

export async function fetchRemoteImageAsDataUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed.startsWith('http')) {
    throw new Error('无效的图片地址')
  }

  if (typeof window.api.fetchBinaryUrl === 'function') {
    const result = await window.api.fetchBinaryUrl(trimmed, { timeoutMs: 120_000 })
    if (!result.success || !result.dataUrl) {
      throw new Error(result.error || '下载图片失败')
    }
    return result.dataUrl
  }

  throw new Error('当前环境无法下载远程图片，请使用 Electron 客户端')
}

export async function compressImageDataUrl(dataUrl: string, maxSide = 1280, quality = 0.88): Promise<string> {
  if (!dataUrl.startsWith('data:image')) return dataUrl
  if (typeof document === 'undefined') return dataUrl

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const scale = Math.min(1, maxSide / Math.max(width, height))
      const targetW = Math.max(1, Math.round(width * scale))
      const targetH = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, targetW, targetH)
      const mime = dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'image/jpeg' : 'image/png'
      const next = canvas.toDataURL(mime, quality)
      resolve(next || dataUrl)
    }
    img.onerror = () => reject(new Error('图片解码失败，无法保存到本地'))
    img.src = dataUrl
  })
}

export async function ensureLocalImageDataUrl(input: string): Promise<string> {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('图像数据为空')

  let dataUrl = raw
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    dataUrl = await fetchRemoteImageAsDataUrl(raw)
  } else if (!raw.startsWith('data:image')) {
    if (/^[A-Za-z0-9+/=]+$/.test(raw.slice(0, 64))) {
      dataUrl = `data:image/png;base64,${raw}`
    } else {
      throw new Error('无法识别的图像格式')
    }
  }

  return compressImageDataUrl(dataUrl)
}
