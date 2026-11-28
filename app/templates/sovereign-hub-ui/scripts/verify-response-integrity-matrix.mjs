import assert from "node:assert/strict"
import { ChatSseDecoder, ChatTextBuffer, parseChatSseFrame, providerTextDelta } from "../lib/ai/chat-stream-contract.ts"

let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log("PASS " + name)
}
const frame = (type, fields, sep = "\n") =>
  ["event: " + type, "data: " + JSON.stringify({type, ...fields}), "", ""].join(sep)
const encoder = new TextEncoder()
const examples = [
  ["russian", "Привет, мир! ", "Это нормальный текст."],
  ["kazakh", "Қазақша жауап: ", "Әлем 🌍"],
  ["english", "Hello ", "world."],
  ["chinese", "你好，", "世界。"],
  ["arabic", "مرحبا ", "بالعالم"],
  ["repeat", "да ", "да "],
  ["math-inline", "Пусть $x^2", "+ y^2 = 1$."],
  ["integral", "$$\\int_0^1 ", "\\frac{x}{1+x^2}\\,dx$$"],
  ["matrix", "$$\\begin{pmatrix}a&b", "\\\\c&d\\end{pmatrix}$$"],
  ["physics", "$$5\\frac{dv}{dt}=", "12t^2+8t+20-49.05(0.1+0.02v)$$"],
  ["code", "\x60\x60\x60python\nfor i in range(3):\n", "    print(i)\n\x60\x60\x60"],
  ["markdown", "## Заголовок\n\n| A | B |\n", "|---|---|\n| 1 | 2 |"],
  ["emoji", "🧑‍🔬", "🧮🚀"],
  ["unicode-combining", "e\u0301", " — қ"],
  ["whitespace", "a\n\n  ", "b\t\n"],
  ["long", "x".repeat(8192), "y".repeat(8192)],
]
for (const [name, left, right] of examples) {
  for (const separator of ["\n", "\r\n", "\r"]) {
    for (const width of [1, 7, 53]) {
      check(name + " / " + JSON.stringify(separator) + " / byte chunks " + width, () => {
        const id = "generation-A"
        const a = {generationId:id, offset:0, contentMode:"delta", content:left}
        const b = {generationId:id, offset:left.length, contentMode:"delta", content:right}
        const wire = frame("content", a, separator) + frame("content", a, separator)
          + frame("progress", {text:"ignore reasoning"}, separator)
          + frame("content", b, separator) + frame("content", b, separator)
          + frame("done", {generationId:id, ok:true}, separator)
          + frame("content", {generationId:id, offset:left.length+right.length, contentMode:"delta", content:"LATE"}, separator)
        const bytes = encoder.encode(wire), decoder = new ChatSseDecoder(), buffer = new ChatTextBuffer()
        const consume = raw => {
          const event = parseChatSseFrame(raw)
          if (!event) return
          if (event.type === "content") buffer.apply(event.payload)
          if (event.type === "done") buffer.complete(event.payload)
        }
        for (let pos=0; pos<bytes.length; pos+=width) decoder.push(bytes.slice(pos,pos+width)).forEach(consume)
        decoder.push(undefined,true).forEach(consume)
        assert.equal(buffer.content,left+right)
      })
    }
  }
}
const delta = (content, offset=0, generationId="g1") => ({content,offset,generationId,contentMode:"delta"})
check("reject out of order, retain prefix",()=>{
  const b=new ChatTextBuffer(); b.apply(delta("abc"))
  assert.throws(()=>b.apply(delta("ghi",6)),/gap/)
  assert.equal(b.content,"abc")
})
check("reject conflicting replay",()=>{
  const b=new ChatTextBuffer(); b.apply(delta("abc"))
  assert.throws(()=>b.apply(delta("abd")),/conflicts/)
  assert.equal(b.content,"abc")
})
check("isolate generations",()=>{
  const b=new ChatTextBuffer(); b.apply(delta("A"))
  assert.throws(()=>b.apply(delta("B",1,"g2")),/generation mismatch/)
  assert.equal(b.content,"A")
})
check("final authoritative replacement is not appended",()=>{
  const b=new ChatTextBuffer(); b.apply(delta("Draft"))
  assert.equal(b.complete({generationId:"g1",finalContent:"Corrected answer"}),"Corrected answer")
  assert.equal(b.apply(delta("late",16)),false)
})
check("invalid terminal does not report success",()=>{
  const b=new ChatTextBuffer()
  assert.throws(()=>b.complete({ok:false,message:"provider error"}),/provider error/)
  assert.throws(()=>b.complete({}),/without an answer/)
})
check("multi-line SSE JSON",()=>{
  const decoder=new ChatSseDecoder()
  const f=decoder.push(encoder.encode('event: content\r\ndata: {"content":\r\ndata: "🌍"}\r\n\r\n'))
  assert.equal(parseChatSseFrame(f[0]).payload.content,"🌍")
})
check("provider snapshots and repeated deltas",()=>{
  assert.deepEqual(providerTextDelta("abc","abcdef","snapshot"),{content:"abcdef",delta:"def"})
  assert.deepEqual(providerTextDelta("abc","abc","snapshot"),{content:"abc",delta:""})
  assert.deepEqual(providerTextDelta("abc","abc","delta"),{content:"abcabc",delta:"abc"})
  assert.throws(()=>providerTextDelta("abc","xyz","snapshot"),/does not match/)
})
check("invalid UTF-8 never silently changes a formula",()=>{
  const d=new ChatSseDecoder()
  assert.throws(()=>d.push(Uint8Array.of(0xff),true))
})

// Independent reference oracle for the requested physics task. This validates
// the analytic solution against numerical integration, not a live LLM answer.
const m=5,g=9.81,k=0.02*g
const A=2.4/k,B=(1.6-2*A)/k,C=(3.019-B)/k
const velocity=t=>A*t*t+B*t-C*Math.expm1(-k*t)
const position=t=>A*t*t*t/3+B*t*t/2+C*(t+Math.expm1(-k*t)/k)
const F=t=>12*t*t+8*t+20
const rhs=(t,y)=>[y[1],F(t)/m-g*(0.1+0.02*y[1]),F(t)*y[1],m*g*(0.1+0.02*y[1])*y[1]]
const integrate=T=>{
  let y=[0,0,0,0], n=5000,h=T/n
  for(let i=0;i<n;i++){
    let t=i*h, a=rhs(t,y),b=rhs(t+h/2,y.map((v,j)=>v+h*a[j]/2))
    let c=rhs(t+h/2,y.map((v,j)=>v+h*b[j]/2)),d=rhs(t+h,y.map((v,j)=>v+h*c[j]))
    y=y.map((v,j)=>v+h*(a[j]+2*b[j]+2*c[j]+d[j])/6)
  }
  return y
}
check("physics reference initial conditions",()=>{assert.equal(velocity(0),0);assert.equal(position(0),0)})
for(const t of [0.1,1,2,3,5,10]) check("physics reference RK4 and work-energy at t="+t,()=>{
  const [x,v,work,loss]=integrate(t)
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),a+" != "+b)
  near(x,position(t));near(v,velocity(t));near(work-loss,m*v*v/2)
  assert.ok(loss>0 && work>loss)
})
console.log(checks+" response-integrity matrix scenarios passed (transport fixtures and numerical oracle; not live provider QA)")
