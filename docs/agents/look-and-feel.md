# Look and feel: theme, colours, weather, the orb, sound, voice

Full reference: [services.md](../services.md) sections 3–5. GPU drawing (the orb, the 3D sky) follows
[graphics.md](graphics.md).

## Where things are

| What                                                       | File                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Theme mode (`auto` / `day` / `dusk`), `<html data-theme>`  | `src/ui/Theme.ts`, `src/stores/ui.ts`                             |
| OKLCH colour engine (brand or her `colors.set` → CSS vars) | `src/color/oklch.ts`, `src/color/scheme.ts`                       |
| Live scheme, `<style id="scheme">`                         | `src/stores/scheme.ts`                                            |
| Theme and palette persistence (local + Supabase metadata)  | `src/stores/appearance.ts`                                        |
| Tailwind tokens, glass                                     | `src/styles/index.css`                                            |
| Brand colours                                              | `src/ui/brand.ts`                                                 |
| Orb colours from mood                                      | `orbColors` in `src/ui/palette.ts`                                |
| The orb: CSS stand-in, WebGPU orb, TSL shader              | `src/ui/orb/Orb.tsx`, `gpuOrb.ts`, `shader.ts`, `OrbFallback.tsx` |
| Weather (Open-Meteo) and the ambient field                 | `src/weather/sky.ts`, `palette.ts`, `Ambient.tsx`                 |
| Springs and motion                                         | `src/ui/motion.ts`                                                |
| Sounds (one sprite, named moments)                         | `src/sound/sound.ts`, `public/sounds/sine/`                       |
| Speech to text                                             | `src/voice/speech.ts`, `toggleVoice` in `src/options/run.ts`      |

## Rules

- **Never hard-code a colour.** Use the theme tokens (`bg-bg`, `text-muted`, `text-accent`, …), which map to the
  engine's `--role-*` and `--ink-*`. The engine guarantees contrast (text 7:1, ink 4.5:1, roles 3:1) and keeps
  `urgent` warm and `calm` not; hard-coded colours bypass all of that.
- **Her colour and theme changes apply in the same turn**, no confirmation. "Back to normal" (`colors.reset`) is
  always available.
- **Motion uses the shared springs** (`morph`, `glide`, `jelly`, `press`) and lays out from `stores/metrics.ts`.
  Respect `prefers-reduced-motion` (the orb does: slower flow, no idle beats, no hue drift).
- **The orb is WebGPU + TSL.** Change its look in `shader.ts` (TSL) and its behaviour (phase targets, easing) in
  `gpuOrb.ts`. The CSS stand-in in `OrbFallback.tsx` should stay a believable match: same colours, same place.
- **Sounds are named moments** (`play('reply')`), never files. Opt a control out of tap sounds with
  `data-sound="none"`.
- **The app never speaks aloud.** Voice is input only; the agent's `voice.listen` can only offer a "Tap to talk" pill.

## Check

`src/color/color.test.ts`, `src/weather/sky.test.ts`, `src/sound/sound.test.ts`. On screen: day and dusk, with the
brand and with `__actora.ui('colors.set', { seed: '#7a5ad6', harmony: 'triadic' })`; the orb in each `phase`
(force with `__actora.agent`).
