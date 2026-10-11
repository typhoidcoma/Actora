import { useAgent } from '@actora/stores/agent'
import { focusDraft, useDraft } from '../draft'
import { TextPanel } from './TextPanel'

/** The message box, in the scene: click to type, Enter to send (the keys go to the hidden input). */
export function ChatInput3D() {
  const { text, focused } = useDraft()
  const name = useAgent((s) => s.botName)
  return (
    <TextPanel
      position={[0, 0.16, 1.05]}
      rotation-x={-0.35}
      width={1.9}
      height={0.16}
      body={text || (focused ? '' : `Say something to ${name}`)}
      bodySize={0.056}
      caret={focused}
      fill={focused ? 'rgba(34,36,64,0.92)' : undefined}
      onPress={focusDraft}
    />
  )
}
