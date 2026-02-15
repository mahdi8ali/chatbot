import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

export const processCSV = async (csv: Blob): Promise<FileItemChunk[]> => {
  const text = await csv.text()
  const lines = text.split("\n").filter(line => line.trim())
  let chunks: FileItemChunk[] = []

  // Simple chunking by lines
  let currentChunk = ""
  for (const line of lines) {
    if (currentChunk.length + line.length > CHUNK_SIZE && currentChunk) {
      chunks.push({
        content: currentChunk,
        tokens: encode(currentChunk).length
      })
      currentChunk = ""
    }
    currentChunk += line + "\n"
  }
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk,
      tokens: encode(currentChunk).length
    })
  }

  return chunks
}
