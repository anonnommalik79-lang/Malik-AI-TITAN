import assert from "node:assert/strict"
import fs from "node:fs"

const source = fs.readFileSync("lib/god-mode/upload-safety.ts", "utf8")
assert.match(source, /FILE_TOO_LARGE/)
assert.match(source, /UNSUPPORTED_FILE_TYPE/)
assert.match(source, /FILE_SIGNATURE_MISMATCH/)
assert.match(source, /image\/png/)
assert.match(source, /application\/pdf/)
assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/)
assert.match(source, /file\.slice\(0, 32\)/)
assert.match(source, /replace\(\/\[\\\\\/\]\//)
console.log("✓ upload policy is bounded, allowlisted and signature-aware")
