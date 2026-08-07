import { existsSync, cpSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'dist')

const apiSrc  = join(root, 'api')
const apiDest = join(dist, 'api')
if (existsSync(apiSrc)) {
  cpSync(apiSrc, apiDest, { recursive: true, force: true })
  console.log('[postbuild] api/ → dist/api/ ✓')
}

// Write a vercel.json to dist/ to extend the migadu function timeout.
// The default 10s is too short for the DNS propagation retry loop in activate_domain.
const vercelConfig = {
  functions: {
    'api/migadu.js': { maxDuration: 30 },
  },
}
writeFileSync(join(dist, 'vercel.json'), JSON.stringify(vercelConfig, null, 2))
console.log('[postbuild] dist/vercel.json written ✓')
