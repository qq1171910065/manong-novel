import { describe, expect, it } from 'vitest'
import {
  isPlayableTtsBuffer,
  resolveTtsAudioMimeType,
} from './reading-tts-audio'

function makeWavBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  view.setUint32(0, 0x52494646, false)
  view.setUint32(8, 0x57415645, false)
  return buffer
}

describe('reading-tts-audio', () => {
  it('detects wav mime type', () => {
    const wav = makeWavBuffer()
    expect(resolveTtsAudioMimeType(wav)).toBe('audio/wav')
    expect(isPlayableTtsBuffer(wav)).toBe(true)
  })

  it('detects mp3 mime type', () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer
    expect(resolveTtsAudioMimeType(mp3)).toBe('audio/mpeg')
    expect(isPlayableTtsBuffer(mp3)).toBe(true)
  })

  it('rejects json-like payloads', () => {
    const json = new TextEncoder().encode('{"error":"bad"}').buffer
    expect(isPlayableTtsBuffer(json)).toBe(false)
  })
})
