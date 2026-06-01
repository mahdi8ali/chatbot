export interface Message {
  role: "user" | "assistant"
  content: string
  chatLogId?: string
}

export interface ChatWidgetProps {
  apiEndpoint?: string
  title?: string
  subtitle?: string
  onClose?: () => void
}
