import {SCIENCE_METHODS} from "./science-methods"
/** Explicit SI key=value shorthand; no guessed parameters, locale or LLM arithmetic.
 * Nested curves/tables retain the existing JSON/file path. */
export function scienceTaskFromPrompt(text:string):{op:"scientific";input:Record<string,unknown>}|null {
  const method=text.match(/\bmethod\s*[:=]\s*["']?([a-z][a-z-]*)["']?/i)?.[1]?.toLowerCase()
  if(!method)return null
  if(!Object.hasOwn(SCIENCE_METHODS,method))return {op:"scientific",input:{method}}
  const input:Record<string,unknown>=Object.create(null)
  for(const match of text.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s;]+))/g)){
    const key=match[1],value=match[2]??match[3]??match[4]
    if(Object.hasOwn(input,key))return {op:"scientific",input:{method,duplicateParameter:key}}
    input[key]=/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)?Number(value):value
  }
  input.method=method
  return {op:"scientific",input}
}
