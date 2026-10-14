// QA-only client bundle loader. Never loaded by the application or server runtime.
const ts=require('typescript')
module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText}
