// Downloads three.js's rigged Xbot as a stand-in until the real character is converted,
// and compresses it for the web (meshopt: quantized geometry and animation tracks;
// the app's GLTFLoader decodes it). `--force` re-fetches.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

const URL_ = 'https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/Xbot.glb'
const out = new URL('../public/models/placeholder.glb', import.meta.url)

if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('placeholder.glb already there')
} else {
  const res = await fetch(URL_)
  if (!res.ok) throw new Error(`${res.status} fetching ${URL_}`)
  const raw = new Uint8Array(await res.arrayBuffer())
  await MeshoptEncoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const doc = await io.readBinary(raw)
  await doc.transform(dedup(), prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  const packed = await io.writeBinary(doc)
  await mkdir(new URL('.', out), { recursive: true })
  await writeFile(fileURLToPath(out), packed)
  console.log(`saved public/models/placeholder.glb (${(raw.length / 1e6).toFixed(1)} MB -> ${(packed.length / 1e6).toFixed(2)} MB)`)
}
