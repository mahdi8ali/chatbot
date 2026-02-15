import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

export const processTxt = async (txt: Blob): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await txt.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  let chunks: FileItemChunk[] = []
  let start = 0

  while (start < textContent.length) {
    const end = Math.min(start + CHUNK_SIZE, textContent.length)
    const chunk = textContent.slice(start, end)
    chunks.push({
      content: chunk,
      tokens: encode(chunk).length
    })
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }

  return chunks
}
