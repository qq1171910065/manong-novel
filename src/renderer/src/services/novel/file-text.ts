/** 读取小说 txt，自动尝试 UTF-8 / GB18030 */
export async function readNovelTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  const decode = (label: string) => {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes)
    } catch {
      return ''
    }
  }

  const utf8 = decode('utf-8').replace(/^\uFEFF/, '')
  const utf8Cjk = countCjk(utf8)
  const utf8Bad = (utf8.match(/\uFFFD/g) || []).length

  if (utf8Cjk >= 20 && utf8Bad <= Math.max(2, utf8.length * 0.002)) {
    return utf8
  }

  const gb18030 = decode('gb18030').replace(/^\uFEFF/, '')
  const gbCjk = countCjk(gb18030)

  if (gbCjk > utf8Cjk) return gb18030

  const gbk = decode('gbk').replace(/^\uFEFF/, '')
  if (countCjk(gbk) > utf8Cjk) return gbk

  return utf8 || gb18030 || gbk
}

function countCjk(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length
}
