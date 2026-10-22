/**
 * Whether the layout is the phone one, for code that can't import the metrics
 * store (it measures the DOM on load; the router also runs in tests without one).
 * The metrics store fills this in when it loads.
 * `split`: a wide screen with room for her chat and another window side by side.
 */
export const phone = { compact: () => false, split: () => false }
