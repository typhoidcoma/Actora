// Downloads three.js's rigged Xbot as a stand-in until the real character is converted.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'

const URL_ = 'https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/Xbot.glb'
const out = new URL('../public/models/placeholder.glb', import.meta.url)

if (existsSync(out)) {
  console.log('placeholder.glb already there')
} else {
  const res = await fetch(URL_)
  if (!res.ok) throw new Error(`${res.status} fetching ${URL_}`)
  await mkdir(new URL('.', out), { recursive: true })
  await writeFile(out, Buffer.from(await res.arrayBuffer()))
  console.log('saved public/models/placeholder.glb')
}
