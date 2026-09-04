/**
 * Lets the verification scripts import the app's TypeScript directly.
 *
 * Node strips the types itself, but it will not guess an extension: the source
 * writes `from "./phonetics"` because a bundler resolves that, and Node's ESM
 * loader does not. This adds the ".ts" back at resolve time, which is the whole
 * difference between testing the real module and testing a copy of it.
 */
import { register } from "node:module"
import { pathToFileURL } from "node:url"

register(new URL("./ts-resolve-hooks.mjs", import.meta.url), pathToFileURL("./"))
