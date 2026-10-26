// Mechanical source inventory. Reads code, never private env files or secrets.
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
const app=process.cwd(),root=path.resolve(app,'../../..')
const output=path.join(root,'audit','SYSTEM_MAP.json')
async function walk(dir){const entries=await fs.readdir(dir,{withFileTypes:true});return (await Promise.all(entries.filter(e=>!['node_modules','.next','.git','.data'].includes(e.name)).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat()}
const files=await walk(path.join(app,'app')),routes=[]
for(const file of files.filter(f=>/[\\/](?:route|page)\.tsx?$/.test(f))){
 const code=await fs.readFile(file,'utf8'),relative=path.relative(path.join(app,'app'),file).replaceAll('\\','/')
 routes.push({file:path.relative(root,file).replaceAll('\\','/'),route:'/'+relative.replace(/\/(?:route|page)\.tsx?$/,'').replace(/^(?:route|page)\.tsx?$/,''),type:/route\.ts$/.test(file)?'api':'page',methods:[...code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(m=>m[1]),imports:[...code.matchAll(/from\s+["'](@\/[^"']+)["']/g)].map(m=>m[1]),envNames:[...new Set([...code.matchAll(/process\.env\.([A-Z_][A-Z0-9_]+)/g)].map(m=>m[1]))]})
}
const sidebarFile=path.join(app,'components/sovereign/sidebar.tsx'),code=await fs.readFile(sidebarFile,'utf8')
const ast=ts.createSourceFile(sidebarFile,code,ts.ScriptTarget.Latest,true),sidebar=[]
for(const statement of ast.statements){if(!ts.isVariableStatement(statement))continue;for(const decl of statement.declarationList.declarations){if(!['MAIN_ACTIONS','CREATE_ACTIONS','TOOL_ACTIONS'].includes(decl.name.getText(ast))||!decl.initializer||!ts.isArrayLiteralExpression(decl.initializer))continue;for(const item of decl.initializer.elements){if(!ts.isObjectLiteralExpression(item))continue;const row={group:decl.name.getText(ast)};for(const property of item.properties){if(!ts.isPropertyAssignment(property))continue;const key=property.name.getText(ast);if(!['id','label','view','action','href','badge','requiresPro'].includes(key))continue;row[key]=ts.isStringLiteral(property.initializer)?property.initializer.text:property.initializer.kind===ts.SyntaxKind.TrueKeyword?true:property.initializer.getText(ast)}sidebar.push(row)}}}
await fs.mkdir(path.dirname(output),{recursive:true})
await fs.writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),scope:'source-inventory-not-runtime-proof',sidebar,routes},null,2))
console.log(JSON.stringify({sidebar:sidebar.length,routes:routes.length,output}))
