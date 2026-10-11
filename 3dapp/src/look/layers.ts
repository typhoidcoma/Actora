/**
 * Render layers. The UI (cards, her line, the focus glass) lives on its own
 * layer: the camera and the pointer see it, but the ambient-occlusion depth pass
 * doesn't, or every floating card would darken the room behind it like a solid block.
 */
export const UI_LAYER = 1
