/**
 * Render docs/screenshots/mockups/*.html to PNG files via headless browser.
 * Usage: node scripts/capture-screenshots.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const mockupsDir = join(root, 'docs', 'screenshots', 'mockups')
const outputDir = join(root, 'docs', 'screenshots')

const screens = [
  { file: 'home.html', out: 'home.png', label: '首页' },
  { file: 'bookshelf.html', out: 'bookshelf.png', label: '书架' },
  { file: 'inspiration.html', out: 'inspiration.png', label: '灵感模式' },
  { file: 'writing-desk.html', out: 'writing-desk.png', label: '写作台' },
  { file: 'blueprint.html', out: 'blueprint.png', label: '项目蓝图' },
  { file: 'material-library.html', out: 'material-library.png', label: '素材库' },
  { file: 'reading-window.html', out: 'reading-window.png', label: '阅读窗口' },
]

const browserCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

function resolveBrowser() {
  const found = browserCandidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error('No Chrome/Edge found for headless screenshot capture')
  }
  return found
}

function capture(browser, htmlPath, outPath) {
  const url = pathToFileURL(htmlPath).href
  const result = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=1280,800`,
      `--screenshot=${outPath}`,
      url,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  )
  if (result.status !== 0 || !existsSync(outPath)) {
    throw new Error(
      `Screenshot failed for ${htmlPath}\n${result.stderr || result.stdout || 'unknown error'}`
    )
  }
}

mkdirSync(outputDir, { recursive: true })
const browser = resolveBrowser()

for (const screen of screens) {
  const htmlPath = join(mockupsDir, screen.file)
  const outPath = join(outputDir, screen.out)
  if (!existsSync(htmlPath)) {
    throw new Error(`Missing mockup: ${htmlPath}`)
  }
  capture(browser, htmlPath, outPath)
  console.log(`[capture-screenshots] ${screen.label} -> ${screen.out}`)
}

console.log('[capture-screenshots] done')
