const fs = require("fs")
const path = require("path")
const mysql = require("mysql2/promise")

function env(name, fallback = "") {
  return process.env[name] ?? fallback
}

function getCreateStatement(sql) {
  const match = sql.match(/CREATE TABLE IF NOT EXISTS `news`[\s\S]*?;\s*/)
  if (!match) {
    throw new Error("Could not find CREATE TABLE statement for `news`.")
  }
  return match[0]
}

function getInsertStatements(sql) {
  const matches = sql.match(/INSERT INTO `news`[\s\S]*?;\s*/g)
  return matches || []
}

async function main() {
  const host = env("DB_HOST", "127.0.0.1")
  const port = Number(env("DB_PORT", "3306"))
  const user = env("DB_USER", "root")
  const password = env("DB_PASSWORD", "")
  const database = env("DB_NAME", "db")

  const sqlPath = path.join(process.cwd(), "news.sql")
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`)
  }

  console.log("[Import] Reading news.sql...")
  const sql = fs.readFileSync(sqlPath, "utf8")

  const createStatement = getCreateStatement(sql)
  const insertStatements = getInsertStatements(sql)

  if (insertStatements.length === 0) {
    throw new Error("No INSERT statements found for `news`.")
  }

  console.log(`[Import] Found ${insertStatements.length} INSERT batches.`)

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: false,
    charset: "utf8mb4"
  })

  try {
    console.log("[Import] Ensuring database exists...")
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.query(`USE \`${database}\``)

    console.log("[Import] Recreating table news...")
    await connection.query("DROP TABLE IF EXISTS `news`")
    await connection.query(createStatement)

    console.log("[Import] Inserting rows...")
    for (let i = 0; i < insertStatements.length; i++) {
      await connection.query(insertStatements[i])
      if ((i + 1) % 20 === 0 || i === insertStatements.length - 1) {
        console.log(`[Import] Inserted ${i + 1}/${insertStatements.length} batches`)
      }
    }

    const [rows] = await connection.query("SELECT COUNT(*) AS count FROM `news`")
    const total = Array.isArray(rows) && rows[0] ? rows[0].count : 0

    console.log(`[Import] Done. Total rows in news: ${total}`)
  } finally {
    await connection.end()
  }
}

main().catch(err => {
  console.error("[Import] Failed:", err.message)
  process.exit(1)
})
