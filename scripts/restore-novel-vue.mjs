import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const novelDir = path.join(root, 'src/renderer/src/novel')
const vendorDir = path.join(root, 'vendor/arboris-novel/frontend/src')

function transformContent(content, relPath) {
  let c = content

  c = c.replace(/@\/stores\/novel/g, '@renderer/stores/novel')
  c = c.replace(/@\/stores\/auth/g, '@renderer/stores/platform-auth-compat')
  c = c.replace(/@\/api\/novel/g, '@renderer/services/novel/api')
  c = c.replace(/@\/api\/optimizer/g, '@renderer/services/novel/api')
  c = c.replace(/@\/components\//g, '@renderer/novel/components/')
  c = c.replace(/@\/views\//g, '@renderer/novel/views/')
  c = c.replace(/@\/composables\//g, '@renderer/novel/composables/')

  c = c.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]vue-router['"]/g,
    (match, imports) => {
      const names = imports.split(',').map((s) => s.trim()).filter(Boolean)
      if (names.some((n) => /\buseRouter\b/.test(n) || /\buseRoute\b/.test(n))) {
        return `import { ${names.join(', ')} } from '@renderer/novel/composables/useNovelRouter'`
      }
      return match
    }
  )

  // Remove admin-only UI links
  if (relPath === 'views/NovelWorkspace.vue') {
    c = c.replace(
      /\s*<router-link\s[\s\S]*?v-if="authStore\.user\?\.is_admin"[\s\S]*?<\/router-link>\s*/g,
      '\n'
    )
  }

  if (relPath === 'views/Login.vue') {
    c = c.replace(
      /if \(user\?\.is_admin && \(authStore\.mustChangePassword \|\| mustChange\)\) \{\s*router\.push\(\{ name: 'admin', query: \{ tab: 'password' \} \}\);\s*\} else \{\s*router\.push\('\/'\);\s*\}/,
      "router.push('/')"
    )
  }

  // Electron user views always use non-admin APIs
  if (relPath === 'components/shared/NovelDetailShell.vue') {
    c = c.replace(/import \{ AdminAPI \} from '@renderer\/services\/novel\/api'\n?/g, '')
    c = c.replace(/import \{ AdminAPI \} from '@\/api\/admin'\n?/g, '')
    c = c.replace(
      /const response: NovelSectionResponse = props\.isAdmin\s*\?\s*await AdminAPI\.getNovelSection\(projectId, section as NovelSectionType\)\s*:\s*await NovelAPI\.getSection\(projectId, section as NovelSectionType\)/,
      'const response: NovelSectionResponse = await NovelAPI.getSection(projectId, section as NovelSectionType)'
    )
    c = c.replace(
      /const goBack = \(\) => router\.push\(props\.isAdmin \? '\/admin' : '\/workspace'\)/,
      "const goBack = () => router.push('/workspace')"
    )
  }

  if (relPath === 'components/novel-detail/ChaptersSection.vue') {
    c = c.replace(/import \{ AdminAPI \} from '@renderer\/services\/novel\/api'\n?/g, '')
    c = c.replace(/import \{ AdminAPI \} from '@\/api\/admin'\n?/g, '')
    c = c.replace(
      /const detail: ChapterDetail = props\.isAdmin\s*\?\s*await AdminAPI\.getNovelChapter\(projectId, chapterNumber\)\s*:\s*await NovelAPI\.getChapter\(projectId, chapterNumber\)/,
      'const detail: ChapterDetail = await NovelAPI.getChapter(projectId, chapterNumber)'
    )
  }

  return c
}

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const rel = path.join(base, entry.name).replace(/\\/g, '/')
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full, rel))
    } else if (entry.name.endsWith('.vue')) {
      files.push(rel)
    }
  }
  return files
}

function isCorrupted(content) {
  if (/\?\?\?\?/.test(content)) return true
  if (/[\u4e00-\u9fff][^<>\n]{0,20}\?[^?'"`\s]/.test(content)) return true
  if (/�/.test(content)) return true
  if (/[çæèäé][^\s]{0,3}[çæèäé]/.test(content)) return true
  if (/<\/[^>]*\?/.test(content)) return true
  if (/title="[^"]*\?"/.test(content)) return true
  if (/label="[^"]*\?/.test(content)) return true
  if (/>\?{1,3}</.test(content)) return true
  return false
}

const skip = new Set(['components/NovelRouterLink.vue'])
const fixed = []
const skipped = []

for (const rel of walk(novelDir)) {
  if (skip.has(rel)) {
    skipped.push(rel)
    continue
  }

  const vendorPath = path.join(vendorDir, rel)
  if (!fs.existsSync(vendorPath)) {
    skipped.push(rel)
    continue
  }

  const targetPath = path.join(novelDir, rel)
  const before = fs.readFileSync(targetPath, 'utf8')
  const vendor = fs.readFileSync(vendorPath, 'utf8')
  const after = transformContent(vendor, rel)

  if (before !== after) {
    fs.writeFileSync(targetPath, after, 'utf8')
    fixed.push(rel)
  }
}

const corruptedBefore = []
for (const rel of walk(novelDir)) {
  const content = fs.readFileSync(path.join(novelDir, rel), 'utf8')
  if (isCorrupted(content)) corruptedBefore.push(rel)
}

console.log(JSON.stringify({ fixed, skipped, stillCorrupted: corruptedBefore }, null, 2))
