import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const currentFilePath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(currentFilePath), '..')
const buildRoot = path.join(repoRoot, '.cache', 'research-sync')

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectJsFiles(fullPath))
      continue
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

function withJsExtension(sourceFile, specifier) {
  if (!specifier.startsWith('.') || path.extname(specifier)) {
    return specifier
  }

  const resolvedBase = path.resolve(path.dirname(sourceFile), specifier)
  if (existsSync(`${resolvedBase}.js`)) {
    return `${specifier}.js`
  }

  if (existsSync(path.join(resolvedBase, 'index.js'))) {
    return `${specifier}/index.js`
  }

  return specifier
}

function rewriteRelativeImports(sourceFile, content) {
  const patterns = [
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    /(import\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    /(import\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g
  ]

  return patterns.reduce((nextContent, pattern) => (
    nextContent.replace(pattern, (match, prefix, specifier, suffix) => {
      const updatedSpecifier = withJsExtension(sourceFile, specifier)
      return updatedSpecifier === specifier ? match : `${prefix}${updatedSpecifier}${suffix}`
    })
  ), content)
}

async function main() {
  const jsFiles = await collectJsFiles(buildRoot)
  let updatedFiles = 0

  for (const filePath of jsFiles) {
    const original = await readFile(filePath, 'utf8')
    const rewritten = rewriteRelativeImports(filePath, original)
    if (rewritten === original) continue

    await writeFile(filePath, rewritten, 'utf8')
    updatedFiles += 1
  }

  console.log(`Patched relative ESM imports in ${updatedFiles} files.`)
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Failed to patch research sync imports.')
  process.exitCode = 1
})
