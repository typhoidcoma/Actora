# Layout, phones and metrics

One store measures everything, and the UI animates between boxes it knows. Full reference:
[services.md](../services.md) section 7.

## Where things are

| What                                                                                          | File                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Geometry for line, grid, orb, rail, sheet, panels; `compact` / `short` / `stack` / `keyboard` | `src/stores/metrics.ts`                         |
| Screen composition                                                                            | `src/ui/Stage.tsx`                              |
| Panels and their headers                                                                      | `src/ui/cards/Panel.tsx`                        |
| Typing anywhere (keys go to the composer)                                                     | `src/ui/typeAnywhere.ts`                        |
| 3D overrides of the metrics for its focus panel                                               | `useHostMetrics` in `3dapp/src/dom/Overlay.tsx` |

## Rules

- **360 px wide is the floor** (Samsung S22). Nothing scrolls sideways; check every change there.
- **Read sizes from `useMetrics`**, not from the DOM or ad-hoc media queries. Its CSS variables (`--grid`, `--gap`,
  `--orb`, `--radius`) are there for styles.
- **The phone keyboard is not a layout change.** `keyboard: true` keeps the phone layout; panels get the visible
  height, headers slim, the rail and her line step aside.
- **Installed app looks like an app**: system bars match `#191832` (`public/manifest.webmanifest`).
- On phones, typing is in the menu (**Type instead**); the rail has no keyboard button.

## Check

Headless at 1366×1024 (iPad landscape), 1024×1366 (portrait) and 360×780 (phone), day and dusk. For the keyboard,
focus the composer at 360 px and shrink the viewport height below 80%.
