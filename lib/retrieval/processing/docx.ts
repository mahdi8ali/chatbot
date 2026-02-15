import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

export const processDocX = async (text: string): Promise<FileItemChunk[]> => {
  let chunks: FileItemChunk[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end)
    chunks.push({
      content: chunk,
      tokens: encode(chunk).length
    })
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }

  return chunks
}
