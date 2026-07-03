#!/usr/bin/env node
// gen-admin-hash.mjs — أداة لمرّة واحدة لتوليد ADMIN_PASSWORD_HASH.
//
// تقرأ كلمة المرور الصريحة من الوسيط الأول (process.argv[2])، وتطبع سطراً واحداً
// إلى stdout بصيغة:  ADMIN_PASSWORD_HASH=<saltHex>:<hashHex>
// جاهزاً للنسخ إلى .env.local. لا تُخزَّن كلمة المرور الصريحة ولا تُطبع أبداً.
//
// الخوارزمية/الصيغة مطابقة تماماً لـ hashPassword في lib/server/admin-auth.ts:
//   scryptSync(password, randomBytes(16), 64)  →  "saltHex:hashHex"
//
// الاستخدام:
//   node scripts/gen-admin-hash.mjs '<password>'

import { scryptSync, randomBytes } from "node:crypto"

const SCRYPT_KEYLEN = 64

const password = process.argv[2]

if (!password) {
  process.stderr.write("node scripts/gen-admin-hash.mjs '<password>'\n")
  process.exit(1)
}

const salt = randomBytes(16)
const hash = scryptSync(password, salt, SCRYPT_KEYLEN)

process.stdout.write(
  `ADMIN_PASSWORD_HASH=${salt.toString("hex")}:${hash.toString("hex")}\n`
)
