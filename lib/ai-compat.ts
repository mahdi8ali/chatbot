// Compatibility shim for legacy 'ai' package exports
// These were removed in ai v4+. Since these routes are unused
// (only /api/chat/site is used), we provide minimal stubs.

export function OpenAIStream(response: any): ReadableStream {
  return response.body || new ReadableStream()
}

export function AnthropicStream(response: any): ReadableStream {
  return response.body || new ReadableStream()
}

export class StreamingTextResponse extends Response {
  constructor(stream: ReadableStream, init?: ResponseInit) {
    super(stream, {
      ...init,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...init?.headers
      }
    })
  }
}
