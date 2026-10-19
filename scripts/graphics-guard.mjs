#!/usr/bin/env node
/**
 * Graphics guard: Actora draws with WebGPU, and every shader is TSL.
 *
 * No WebGL (renderers, contexts, fallbacks), no GLSL, no raw WGSL strings, no
 * shader-string libraries. The rule and how to work within it: docs/agents/graphics.md.
 *
 *   node scripts/graphics-guard.mjs          scan the repo; exit 1 on any violation
 *   node scripts/graphics-guard.mjs --hook   Claude Code PreToolUse hook: read the tool call
 *                                            on stdin; exit 2 (block) if the edit breaks the rule
 *
 * It runs before both builds (so a violation can't deploy), in `npm run lint`, and as a
 * Claude Code hook (.claude/settings.json) so an agent is stopped before writing one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Code we check: the two apps' sources, their entry HTML and their Vite configs. */
const SCAN = ['src', '3dapp/src', 'index.html', '3dapp/index.html', 'vite.config.ts', '3dapp/vite.config.ts']
const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html'])
/** Shader source files have no place here at all: shaders are TSL, written in TypeScript. */
const SHADER_FILES = new Set(['.glsl', '.vert', '.frag', '.vs', '.fs', '.wgsl', '.vsh', '.fsh'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

/** Modules that are WebGL, GLSL, or a second renderer. */
const BANNED_MODULES = [
  [/^three$/, "bare 'three' (its default build is the WebGL renderer); import from 'three/webgpu' and 'three/tsl'"],
  [/^ogl$/, 'OGL is a WebGL library'],
  [/^(regl|twgl\.js|glslify|glslify-loader|vite-plugin-glsl|vite-plugin-glslify)$/, 'WebGL/GLSL tooling'],
  [
    /^(pixi\.js|@pixi\/.+|babylonjs|@babylonjs\/.+|playcanvas|phaser)$/,
    'a second renderer; Actora renders with three/webgpu',
  ],
  [
    /^(postprocessing|@react-three\/postprocessing)$/,
    "WebGL post-processing; use three/webgpu's RenderPipeline with three/tsl passes",
  ],
  [/^three-custom-shader-material/, 'patches GLSL into materials; use node materials and TSL'],
  [
    /^three\/(addons|examples\/jsm)\/(postprocessing|shaders)\//,
    "WebGL-only three addons; use the TSL ones under 'three/addons/tsl/'",
  ],
  [/webgl/i, 'a WebGL module'],
]

/** Code that is WebGL or GLSL, or skips TSL. Matched with comments removed. */
const BANNED_CODE = [
  [
    /\bWebGL(1|3D|Array|Cube|Multiple)?Render(er|Target|Targets)\b/,
    'WebGL renderer / render target; use WebGPURenderer / RenderTarget from three/webgpu',
  ],
  [/\bWebGL2?RenderingContext\b/, 'a WebGL context'],
  [/getContext\(\s*['"`](webgl2?|experimental-webgl)['"`]/, 'a WebGL context'],
  [/\bforceWebGL\b/, "WebGPURenderer's WebGL backend"],
  [
    /\b(Raw)?ShaderMaterial\b|<\s*(rawS|s)haderMaterial\b/,
    'GLSL materials; use a node material (MeshBasicNodeMaterial, ...) with TSL nodes',
  ],
  [/\bonBeforeCompile\b/, 'GLSL patching; set colorNode / positionNode / ... on a node material'],
  [/\b(ShaderChunk|ShaderLib|UniformsLib|UniformsUtils)\b/, "WebGL shader internals; use 'three/tsl'"],
  [/\b(glslFn|wgslFn)\b/, 'a raw shader string; write it as a TSL Fn()'],
  [/\bcreateShaderModule\b/, 'hand-written WGSL; write it in TSL and let three compile it'],
  [/\bgl_(FragColor|FragCoord|Position|PointSize|FragData)\b/, 'GLSL'],
  [/^\s*#version\s+\d+/m, 'GLSL'],
  [/\bprecision\s+(highp|mediump|lowp)\s+float\b/, 'GLSL'],
]

/** Tagged shader strings: checked before comments are removed, since the tag is one. */
const BANNED_RAW = [[/\/\*\s*(glsl|wgsl|frag|vert)\s*\*\/\s*`/i, 'an inline shader string; write it in TSL']]

const CANVAS = /<\s*Canvas\b/
const WEBGPU_RENDERER = /\bWebGPURenderer\b/
const CANVAS_WHY =
  'R3F defaults to WebGL; pass gl={async (props) => new WebGPURenderer(...)} as 3dapp/src/scene/World.tsx does'

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')
}

function importsOf(src) {
  const out = []
  const re = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]/g
  for (let m; (m = re.exec(src));) out.push(m[1] ?? m[2])
  return out
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

/** Violations in one file's text: [{ line, what, why }]. canvasCheck: judge <Canvas> (whole files only). */
export function check(path, text, { canvasCheck = true } = {}) {
  const ext = extname(path).toLowerCase()
  if (SHADER_FILES.has(ext)) return [{ line: 1, what: `${ext} file`, why: 'shaders are TSL, written in TypeScript' }]
  if (!CODE.has(ext)) return []
  const found = []
  for (const [re, why] of BANNED_RAW) {
    const m = re.exec(text)
    if (m) found.push({ line: lineOf(text, m.index), what: m[0].trim(), why })
  }
  const code = stripComments(text)
  for (const spec of importsOf(code)) {
    const hit = BANNED_MODULES.find(([re]) => re.test(spec))
    if (hit) found.push({ line: lineOf(code, code.indexOf(spec)), what: `import '${spec}'`, why: hit[1] })
  }
  for (const [re, why] of BANNED_CODE) {
    const m = re.exec(code)
    if (m) found.push({ line: lineOf(code, m.index), what: m[0].trim(), why })
  }
  // R3F's <Canvas> makes a WebGLRenderer unless it's handed a WebGPU one.
  const canvas = canvasCheck && CANVAS.exec(code)
  if (canvas && !WEBGPU_RENDERER.test(code)) {
    found.push({ line: lineOf(code, canvas.index), what: '<Canvas> without WebGPURenderer', why: CANVAS_WHY })
  }
  return found
}

const posix = (p) => p.split(sep).join('/')

function inScope(rel) {
  return SCAN.some((s) => rel === s || rel.startsWith(`${s}/`))
}

function* walk(abs) {
  const st = statSync(abs, { throwIfNoEntry: false })
  if (!st) return
  if (st.isFile()) return yield abs
  for (const name of readdirSync(abs)) if (!SKIP_DIRS.has(name)) yield* walk(join(abs, name))
}

function report(rel, hits) {
  return hits.map((h) => `  ${rel}:${h.line}  ${h.what}\n      ${h.why}`).join('\n')
}

function scan() {
  const failures = []
  for (const s of SCAN) {
    for (const abs of walk(join(ROOT, s))) {
      const rel = posix(relative(ROOT, abs))
      const hits = check(rel, readFileSync(abs, 'utf8'))
      if (hits.length) failures.push(report(rel, hits))
    }
  }
  // A shader file anywhere outside node_modules is a violation, scanned roots or not.
  for (const abs of walk(ROOT)) {
    const rel = posix(relative(ROOT, abs))
    if (!inScope(rel) && SHADER_FILES.has(extname(rel).toLowerCase())) failures.push(report(rel, check(rel, '')))
  }
  if (failures.length) {
    console.error(
      `Graphics guard: Actora uses WebGPU and TSL only (docs/agents/graphics.md).\n\n${failures.join('\n')}\n`,
    )
    process.exit(1)
  }
  console.log('graphics-guard: ok (WebGPU + TSL only)')
}

/** Claude Code PreToolUse: block a Write/Edit/MultiEdit that would add WebGL, GLSL or raw WGSL. */
function hook() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0)
  }
  const tool = input.tool_input ?? {}
  if (typeof tool.file_path !== 'string') process.exit(0)
  const rel = posix(relative(ROOT, resolve(input.cwd ?? ROOT, tool.file_path)))
  if (rel.startsWith('..')) process.exit(0)
  const ext = extname(rel).toLowerCase()
  if (!SHADER_FILES.has(ext) && !inScope(rel)) process.exit(0)
  // A whole new file is judged as a file; an edit's new text is judged on its own
  // (it may add a <Canvas> to a file that already makes its WebGPURenderer).
  const hits =
    typeof tool.content === 'string'
      ? check(rel, tool.content)
      : [tool.new_string, ...(tool.edits ?? []).map((e) => e?.new_string)]
          .filter((t) => typeof t === 'string')
          .flatMap((t) => check(rel, t, { canvasCheck: false }))
  if (!hits.length) process.exit(0)
  console.error(
    `Blocked by the graphics guard: Actora uses WebGPU and TSL only. Read docs/agents/graphics.md and write it ` +
      `with 'three/webgpu' node materials and 'three/tsl' instead.\n${report(rel, hits)}`,
  )
  process.exit(2)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--hook')) hook()
  else scan()
}
