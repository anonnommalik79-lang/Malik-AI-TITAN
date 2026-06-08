const COMMON_LANGS = ["typescript","javascript","python","go","rust","java","cpp","c","csharp","php","ruby","swift","kotlin","dart","sql","bash","powershell","r","scala","haskell","lua","elixir","zig","ocaml"]

export function codeMatrixTarget(input: string) {
  const value = String(input || "typescript").toLowerCase()
  const found = COMMON_LANGS.find((lang) => value.includes(lang))
  return found || value.replace(/[^a-z0-9+#]/g, "") || "custom"
}

export function supportsCustomLanguage(target: string) {
  return {
    target,
    supported: true,
    mode: COMMON_LANGS.includes(target) ? "native-profile" : "custom-profile",
    note: COMMON_LANGS.includes(target) ? "Known language profile." : "Custom/rare target: generate with assumptions and verify compiler.",
  }
}

