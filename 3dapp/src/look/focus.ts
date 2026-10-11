import { panelOpen, useUi } from '@actora/stores/ui'

/** Something is open (chat, a card, a list, finds, the vault): the stage steps back, the camera comes in. */
export const useFocused = () => useUi((s) => s.chatOpen || panelOpen(s))
