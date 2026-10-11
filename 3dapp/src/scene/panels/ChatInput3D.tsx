import { useAgent } from '@actora/stores/agent'
import { useLook } from '../../look/theme'
import { focusDraft, useDraft } from '../draft'
import { Glass } from './Glass'

/** The message box, in the scene: click to type, Enter to send (the keys go to the hidden input). */
export function ChatInput3D() {
  const look = useLook()
  const { text, focused } = useDraft()
  const name = useAgent((s) => s.botName)
  return (
    <Glass
      position={[0, 0.17, 1.1]}
      rotation={[-0.35, 0, 0]}
      width={2}
      height={0.17}
      body={text || (focused ? '' : `Say something to ${name}`)}
      bodySize={0.058}
      caret={focused}
      thick
      accent={look.role.accent}
      delay={0.3}
      onPress={focusDraft}
    />
  )
}
