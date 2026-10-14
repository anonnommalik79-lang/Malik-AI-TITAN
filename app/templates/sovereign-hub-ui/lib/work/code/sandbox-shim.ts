/**
 * Generated apps often keep state in localStorage. A preview frame sandboxed
 * without same-origin has no storage (and must not have Malik AI's), so this
 * gives it an in-memory localStorage/sessionStorage and an empty cookie jar
 * for the life of the frame. Injected before any project code.
 */
export const SANDBOX_STORAGE_SHIM = `(function(){function m(){var d={};return{get length(){return Object.keys(d).length},key:function(i){return Object.keys(d)[i]||null},getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d={}}}};["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}});try{document.cookie}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return ""},set:function(){},configurable:true})}catch(_){}}})();`

/** Puts the storage shim first in a page (inside <head> when there is one). */
export function withSandboxStorage(html: string) {
  const script = `<script>${SANDBOX_STORAGE_SHIM}</script>`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${script}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${script}</head>`)
  return `${script}${html}`
}
