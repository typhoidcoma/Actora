/** The 3D scene's chunk: one shared import, started early (main.tsx) and awaited by App. */
let pending: Promise<typeof import('../scene/World')> | null = null
export const loadWorld = () => (pending ??= import('../scene/World'))
