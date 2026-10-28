import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// VSelect.vue is the only allowed native <select>: it keeps the real element
// hidden as the data layer. Everything else must use the <VSelect> component
// so opened option lists stay styled instead of falling back to the OS popup.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const files = (await readdir(src)).filter(name => name.endsWith('.vue'))

test('only VSelect renders a native select; other components use the VSelect component', async () => {
  for (const name of files) {
    const code = await readFile(join(src, name), 'utf8')
    const natives = code.match(/<\/?select[\s>]/g) ?? []
    if (name === 'VSelect.vue') assert.ok(natives.length > 0, 'VSelect.vue must render the hidden native select')
    else assert.deepEqual(natives, [], `${name} uses a bare <select>; use <VSelect> instead`)
  }
})

test('select usage keeps the select-wrap plus chevron shell', async () => {
  for (const name of files.filter(name => name !== 'VSelect.vue')) {
    const code = await readFile(join(src, name), 'utf8')
    for (const match of code.matchAll(/<VSelect\b/g)) {
      const before = code.slice(Math.max(0, match.index - 120), match.index)
      assert.match(before, /class="select-wrap">\s*$/, `${name}: <VSelect> must sit directly inside .select-wrap`)
    }
  }
})
