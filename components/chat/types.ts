export interface Message {
  role: "user" | "assistant"
  content: string
}

export interface ChatWidgetProps {
  apiEndpoint?: string
  title?: string
  subtitle?: string
  onClose?: () => void
}
