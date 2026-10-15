/** Opt-in, local arithmetic only. No names, external books, network, macros,
 * volatile functions, DDE, structured references or opaque spreadsheet code. */
export function safeSpreadsheetFormula(raw:string):string {
 const text=raw.trim().replace(/^=/,"")
 if(!text||text.length>300||/[[\]!'";{}\\\p{Cc}]/u.test(text))throw new Error("UNSAFE_SPREADSHEET_FORMULA")
 const token=/\s+|(?:SUM|AVERAGE|MIN|MAX|COUNT|ROUND|ABS|IF)(?=\s*\()|\$?[A-Z]{1,3}\$?[1-9]\d{0,4}|(?:\d+(?:\.\d+)?|\.\d+)|<>|<=|>=|[()+*/^%,:<>=-]/gy
 const tokens:string[]=[]
 let offset=0
 while(offset<text.length){token.lastIndex=offset;const match=token.exec(text);if(!match||tokens.length>=150)throw new Error("UNSAFE_SPREADSHEET_FORMULA");const value=match[0];offset=token.lastIndex
  if(!value.trim())continue
  tokens.push(value)
  if(/^\$?[A-Z]+\$?\d+$/.test(value)){const name=value.replace(/\$/g,"").match(/^([A-Z]+)(\d+)$/)!;let column=0;for(const c of name[1])column=column*26+c.charCodeAt(0)-64;if(column>200||Number(name[2])>50001)throw new Error("FORMULA_REFERENCE_OUT_OF_SCOPE")}
 }
 // Closed expression grammar, not just a character allowlist: adjacent
 // operands, empty arguments and mismatched parentheses must not export.
 let index=0,depth=0
 const fail=():never=>{throw new Error("INVALID_SPREADSHEET_FORMULA")}
 const take=(value:string)=>tokens[index]===value?(index++,true):false
 const ref=/^\$?[A-Z]+\$?\d+$/
 const primary=():void=>{
  if(++depth>24)fail()
  const next=tokens[index++]||""
  if(next==="+"||next==="-")primary()
  else if(next==="("){expression(0);if(!take(")"))fail()}
  else if(/^[A-Z]+$/.test(next)){
   if(!take("("))fail()
   let args=0
   do{expression(0);args++}while(take(","))
   if(!take(")")||args>50||next==="IF"&&(args<2||args>3)||next==="ROUND"&&args!==2||next==="ABS"&&args!==1)fail()
  }else if(ref.test(next)){
   if(take(":")){if(!ref.test(tokens[index++]||""))fail()}
  }else if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(next))fail()
  take("%")
  depth--
 }
 const precedence:Record<string,number>={"=":1,"<>":1,"<":1,">":1,"<=":1,">=":1,"+":2,"-":2,"*":3,"/":3,"^":4}
 const expression=(min:number):void=>{
  primary()
  while((precedence[tokens[index]]||0)>min){const op=tokens[index++];expression(precedence[op]-(op==="^"?1:0))}
 }
 expression(0)
 if(index!==tokens.length)fail()
 return text
}
