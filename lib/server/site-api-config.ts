/**
 * Database Configuration
 * Server-side only - never expose to client
 */

export interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  connectionLimit: number
  openaiModel: string
}

/**
 * Get Database configuration from environment variables
 * This function should only be called on the server-side
 */
export function getDatabaseConfig(): DatabaseConfig {
  const host = process.env.DB_HOST || "127.0.0.1"
  const port = Number(process.env.DB_PORT || "3306")
  const user = process.env.DB_USER || "root"
  const password = process.env.DB_PASSWORD || ""
  const database = process.env.DB_NAME || "db"
  const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT || "50")
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini"

  if (!database) {
    throw new Error(
      "DB_NAME is not configured. Please set it in your .env.local file."
    )
  }

  return {
    host,
    port,
    user,
    password,
    database,
    connectionLimit,
    openaiModel
  }
}

/**
 * Get OpenAI model from environment variable
 * Falls back to gpt-4o-mini if not set
 */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini"
}

/**
 * Check if database is properly configured
 */
export function isSiteAPIConfigured(): boolean {
  return Boolean(process.env.DB_NAME || "db")
}
