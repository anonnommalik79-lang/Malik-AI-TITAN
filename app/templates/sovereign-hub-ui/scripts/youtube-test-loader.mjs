// Test-only module boundaries. No auth bypass is included in application runtime.
import { register } from "node:module"
register(new URL("./youtube-test-resolver.mjs", import.meta.url))
