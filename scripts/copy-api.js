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

// Write a vercel.json to dist/ to extend function timeouts past Vercel's 10s default.
// migadu.js needs it for the DNS propagation retry loop in activate_domain;
// slack_widget_command.js needs it because its background job (waitUntil) runs
// well past 10s and would otherwise be killed before it finishes.
const vercelConfig = {
  functions: {
    'api/migadu.js': { maxDuration: 30 },
    'api/slack_widget_command.js': { maxDuration: 60 },
  },
}
writeFileSync(join(dist, 'vercel.json'), JSON.stringify(vercelConfig, null, 2))
console.log('[postbuild] dist/vercel.json written ✓')
