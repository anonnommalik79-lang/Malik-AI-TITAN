import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { createRequire } from "node:module"

/**
 * The Library is a hundred finished websites, not a hundred pictures of them.
 *
 * The source pack shipped 100 standalone HTML files next to 100 previews.
 * Diffing them showed one template with eight substituted values, so shipping
 * all hundred would have been 680KB of near-identical markup that could never
 * be improved in one place. These checks hold the two things that makes true:
 * the builder really does produce a complete site, and every preview really
 * exists.
 */

const require_ = createRequire(import.meta.url)

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const box = { exports: {} }
  new Function("require", "module", "exports", code)(require_, box, box.exports)
  return box.exports
}

function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const library = load("lib/library/site-library.ts")
const panel = codeOf("components/sovereign/library/SiteLibraryPanel.tsx")

console.log("\na hundred sites, from one template")

check("all hundred templates are present and distinct", () => {
  const all = library.LIBRARY_TEMPLATES
  assert.equal(all.length, 100)
  assert.equal(new Set(all.map((t) => t.id)).size, 100, "ids must be unique")
  assert.equal(new Set(all.map((t) => t.name)).size, 100, "names must be unique")
  for (const t of all) {
    assert.ok(t.name && t.category && t.subcategory, `${t.id} is missing a field`)
    assert.ok(library.LIBRARY_CATEGORIES.includes(t.category), `${t.category} is not a known category`)
  }
})

check("every category carries its own colour, headline and line", () => {
  assert.equal(library.LIBRARY_CATEGORIES.length, 10)
  const accents = new Set()
  for (const category of library.LIBRARY_CATEGORIES) {
    const style = library.LIBRARY_STYLES[category]
    assert.match(style.accent, /^#[0-9a-f]{6}$/i, `${category} needs a colour`)
    assert.ok(style.headline.length > 4 && style.tagline.length > 20, `${category} needs copy`)
    accents.add(style.accent)
  }
  assert.equal(accents.size, 10, "ten categories that all look the same are one category")
})

check("the builder produces a complete, standalone site", () => {
  const site = library.buildLibrarySite(library.libraryTemplateById(1), "https://malikaiworld.world")
  assert.match(site, /^<!doctype html>/i)
  assert.match(site, /<\/html>$/)
  assert.match(site, /name="viewport"/, "a site that is not responsive is not finished")
  assert.match(site, /100svh/, "the hero fills the screen")
  assert.match(site, /@media\(max-width:760px\)/, "it has to work on a phone")
  assert.match(site, /links\.classList\.toggle\("open"\)/, "the mobile menu has to open")
  // Absolute asset URLs: the same HTML is used in an iframe, in a new tab, and
  // in a file the person downloads.
  assert.match(site, /https:\/\/malikaiworld\.world\/library\/hero\.webp/)
  assert.match(site, /https:\/\/malikaiworld\.world\/library\/gallery\/001\.webp/)
})

check("each site carries its own identity, not the template's", () => {
  const a = library.buildLibrarySite(library.libraryTemplateById(1))
  const b = library.buildLibrarySite(library.libraryTemplateById(47))
  const first = library.libraryTemplateById(1)
  const second = library.libraryTemplateById(47)
  assert.ok(a.includes(first.name) && !a.includes(second.name))
  assert.ok(b.includes(second.name) && !b.includes(first.name))
  assert.ok(a.includes(library.LIBRARY_STYLES[first.category].accent))
  assert.ok(b.includes(library.LIBRARY_STYLES[second.category].accent))
})

check("a name with a quote in it cannot break the page", () => {
  const site = library.buildLibrarySite({
    ...library.libraryTemplateById(1),
    name: 'Sharp & "Bold" <script>alert(1)</script>',
  })
  assert.doesNotMatch(site, /<script>alert\(1\)<\/script>/, "template text must be escaped")
  assert.match(site, /&lt;script&gt;/)
})

check("all hundred previews exist and are real photographs", () => {
  let total = 0
  for (const template of library.LIBRARY_TEMPLATES) {
    const file = `public${template.preview}`
    assert.ok(fs.existsSync(file), `${template.name} has no preview at ${file}`)
    const bytes = fs.statSync(file).size
    assert.ok(bytes > 15_000, `${template.name} preview is only ${bytes} bytes`)
    assert.ok(bytes < 300_000, `${template.name} preview is ${Math.round(bytes / 1024)}KB - too heavy`)
    total += bytes
  }
  assert.ok(fs.existsSync("public/library/hero.webp"), "the shared hero image is missing")
  // A hundred cards on one page: the whole gallery has to stay light.
  assert.ok(total < 5 * 1024 * 1024, `the gallery is ${(total / 1048576).toFixed(1)}MB`)
  console.log(`      (${(total / 1048576).toFixed(1)}MB for 100 previews)`)
})

console.log("\nit does something, rather than standing there")

check("a style can be handed to the site generator", () => {
  const template = library.libraryTemplateById(1)
  const prompt = library.libraryPrompt(template)
  assert.ok(prompt.length > 120, "a one-line prompt produces a one-line site")
  assert.ok(prompt.includes(template.category.toLowerCase()))
  assert.ok(prompt.includes(library.LIBRARY_STYLES[template.category].accent))
  assert.match(prompt, /Не копируй чужие логотипы/, "the direction, not a copy of the brand")
  // The panel offers it from inside the opened template, not from the card -
  // see "opening a template from the Library never navigates away" below.
  assert.match(panel, /onUseStyle\?\.\(libraryPrompt\(t\), t\)/)
  const dashboard = codeOf("components/sovereign/dashboard.tsx")
  assert.match(dashboard, /<SiteLibraryPanel/)
  assert.match(dashboard, /safeOpenView\("website-generation", "template"\)/, "the hand-off must reach the generator")
})

check("the site can be opened, and taken away", () => {
  assert.match(panel, /<iframe[\s\S]{0,200}srcDoc=\{openedHtml\}/, "the preview must run the real site")
  assert.match(panel, /window\.open\(url, "_blank", "noopener,noreferrer"\)/)
  assert.match(panel, /link\.download = /, "a site you cannot take with you is a demo")
})

check("a hundred cards do not all mount at once", () => {
  assert.match(panel, /IntersectionObserver/)
  assert.match(panel, /loading=\{position < 6 \? "eager" : "lazy"\}/)
  assert.match(panel, /width=\{1280\}[\s\S]{0,80}height=\{720\}/, "declared size stops the grid jumping")
})

check("favourites survive a reload", () => {
  assert.match(panel, /localStorage\.setItem\(FAVOURITES_KEY/)
  assert.match(panel, /localStorage\.getItem\(FAVOURITES_KEY/)
})

console.log("\nthe photograph is the point on a phone")

check("sites: the caption is asked for, not painted over every picture", () => {
  const source = codeOf("components/sovereign/website-generation/WebsiteGenerationStudio.tsx")
  // A phone has no hover, so the caption used to be forced on permanently and
  // covered the bottom third of every photograph.
  assert.match(source, /matchMedia\("\(hover: none\)"\)/)
  assert.match(source, /is-open/)
  const mobile = /@media\(max-width:720px\)\{([\s\S]*?)\n  `/.exec(source)?.[1] || source
  assert.doesNotMatch(mobile, /(templateShade|templateOverlay)\{opacity:1/,
    "the caption must not be forced visible on mobile")
})

check("library: the caption lives under the picture, not on top of it", () => {
  // The Library was rebuilt and no longer overlays anything: the name and the
  // direction sit in .libCardFoot below the shot, readable without a hover and
  // without covering the template. So the guard is the shape of that layout
  // rather than the tap-to-reveal mechanism it replaced - a caption absolutely
  // positioned inside the picture would fail this, which is the regression the
  // original check existed to catch.
  const source = panel
  assert.match(source, /<div className="libCardFoot">/, "the card still needs a caption row")
  const shot = /<button className="libShot"[\s\S]*?<\/button>/.exec(source)?.[0] || ""
  assert.ok(shot, "the card still needs its picture")
  assert.doesNotMatch(shot, /libCardText|libCardFoot/, "the caption must not be rendered inside the picture")
  const footCss = /\.libCardFoot\{([^}]*)\}/.exec(source)?.[1] || ""
  assert.ok(footCss, "libCardFoot must be styled")
  assert.doesNotMatch(footCss, /position:\s*absolute/, "the caption row must not be lifted onto the picture")
})

console.log("\nthe template opens, and it is a template")

check("both galleries open a running site, not a photograph of one", () => {
  const sites = codeOf("components/sovereign/website-generation/WebsiteGenerationStudio.tsx")
  // The Сайты gallery used to open a lightbox containing the card image. A
  // picture of a homepage is not a template you can look at.
  assert.match(sites, /<iframe[\s\S]{0,220}srcDoc=\{zoomedHtml\}/)
  assert.match(sites, /buildTemplateSite/)
  assert.match(sites, /GALLERY_STYLES/)
  assert.match(panel, /<iframe[\s\S]{0,220}srcDoc=\{openedHtml\}/)
})

check("every category in the Сайты gallery can build a real site", () => {
  const sites = fs.readFileSync("components/sovereign/website-generation/WebsiteGenerationStudio.tsx", "utf8")
  const categories = new Set([...sites.matchAll(/\["[a-z0-9-]+", "[^"]+", "[^"]+", "([^"]+)",/g)].map((m) => m[1]))
  const styled = new Set([...sites.matchAll(/^  "([^"]+)": \{ accent:/gm)].map((m) => m[1]))
  assert.ok(categories.size >= 10, `expected the gallery's categories, found ${categories.size}`)
  for (const category of categories) {
    assert.ok(styled.has(category), `${category} has no colour or voice, so its templates cannot open`)
  }
})

check("opening a template from the Library never navigates away", () => {
  // A card action that jumped to the site generator meant a click anywhere near
  // the bottom of a card threw the person out of the Library. The rebuilt card
  // has no actions row of its own, so the guard reads the card itself: nothing
  // inside it may call onUseStyle, and the only things it can do are select the
  // template and favourite it.
  const card = /<article\s+key=\{template\.id\}[\s\S]*?<\/article>/.exec(panel)?.[0] || ""
  assert.ok(card, "the template card must still exist")
  assert.doesNotMatch(card, /onUseStyle/, "a card must not navigate")
  assert.match(card, /setSelected\(template\)/, "a card opens the template, it does not leave")
  // Using a style stays available - in the detail panel and the opened viewer,
  // deliberately, where the person has already chosen a template.
  assert.match(panel, /libViewerActions[\s\S]{0,600}onUseStyle/)
  assert.match(panel, /libDetailRow[\s\S]{0,600}onUseStyle/)
})

check("no page title is inside a scrolling box", () => {
  // An 8px scrollbar was once drawn beside "Что вы хотите создать?" because the
  // div holding it inherited overflow-y:auto and its content stood 11px proud.
  // That studio has since been rewritten and the heading now sits in normal
  // flow, so the guard is the general rule rather than the old class name: a
  // heading must not be wrapped in something that scrolls.
  const video = fs.readFileSync("components/sovereign/video-generation/VideoGenerationStudio.tsx", "utf8")
  const headingWrapper = /<div[^>]*className="([\w-]*)"[^>]*>\s*(?:\{[^}]*\}\s*)?<h1>/.exec(video)?.[1]
  if (headingWrapper) {
    const rule = new RegExp(`\\.${headingWrapper}\\{[^}]*overflow(-y)?:\\s*(auto|scroll)`)
    assert.doesNotMatch(video, rule, `${headingWrapper} wraps the page title and scrolls`)
  }
})

console.log(failures ? `\n${failures} failing\n` : "\nall library checks passed\n")
process.exit(failures ? 1 : 0)
