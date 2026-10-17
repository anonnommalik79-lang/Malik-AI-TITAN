import "server-only"
import ts from "typescript"
import type { ProjectFile } from "@/lib/work/code/files"
import type { Asset } from "./types"

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
/** Attribution is real source markup, not a promise in a system prompt.
 * Preserve the rest of the generated layout and never evaluate its code. */
export function withAssetCredits(files: ProjectFile[], assets: Asset[]): ProjectFile[] {
  if (!assets.length) return files
  const unique = [...new Map(assets.map(asset => [asset.url, asset])).values()]
  return files.map(file => {
    if (/\.html?$/.test(file.path)) {
      const at = file.content.toLowerCase().lastIndexOf("</body>")
      if (at < 0) return file
      const footer = `<footer data-malik-asset-credits="v1" aria-label="Media credits" style="font:inherit;font-size:.75rem;padding:1rem;display:flex;flex-wrap:wrap;gap:.75rem">${unique.map(asset => `<a href="${escape(asset.sourcePage)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${escape(asset.credit)}</a><a href="${escape(asset.license)}" target="_blank" rel="noopener noreferrer" style="color:inherit">License / usage terms</a>${asset.creatorUrl ? `<a href="${escape(asset.creatorUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit">Photographer profile</a>` : ""}`).join("")}</footer>`
      const existing = /<footer data-malik-asset-credits="v1"[\s\S]*?<\/footer>/
      return { ...file, content: existing.test(file.content) ? file.content.replace(existing, () => footer) : file.content.slice(0, at) + footer + file.content.slice(at) }
    }
    if (!/^(?:src\/)?app\/layout\.tsx$/.test(file.path)) return file
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let at = -1
    let existing: { start: number; end: number } | undefined
    const visit = (node: ts.Node) => {
      if (ts.isJsxClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === "body") at = node.getStart(source)
      if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === "data-malik-asset-credits" && prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === "v1")) existing = { start: node.getStart(source), end: node.end }
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (at < 0) return file
    const footer = `<footer data-malik-asset-credits="v1" aria-label="Media credits" style={{fontSize:".75rem",padding:"1rem",display:"flex",flexWrap:"wrap",gap:".75rem"}}>${unique.map(asset => `<a href={${JSON.stringify(asset.sourcePage)}} target="_blank" rel="noopener noreferrer" style={{color:"inherit"}}>{${JSON.stringify(asset.credit)}}</a><a href={${JSON.stringify(asset.license)}} target="_blank" rel="noopener noreferrer" style={{color:"inherit"}}>License / usage terms</a>${asset.creatorUrl ? `<a href={${JSON.stringify(asset.creatorUrl)}} target="_blank" rel="noopener noreferrer" style={{color:"inherit"}}>Photographer profile</a>` : ""}`).join("")}</footer>`
    return { ...file, content: existing ? file.content.slice(0, existing.start) + footer + file.content.slice(existing.end) : file.content.slice(0, at) + footer + file.content.slice(at) }
  })
}
