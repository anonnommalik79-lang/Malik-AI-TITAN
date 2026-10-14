/** Bounded numerical primitives; not a scripting runtime. */
export function domain(ok:boolean,code:string):asserts ok {if(!ok)throw new RangeError(code)}
export function increasing(xs:number[],code="STRICTLY_INCREASING_REQUIRED") {domain(xs.every((x,i)=>i===0||x>xs[i-1]),code)}
export function unique(ids:string[]) {domain(new Set(ids).size===ids.length,"DUPLICATE_ID")}
export function ols(x:number[],y:number[]) {
  domain(x.length===y.length&&x.length>=3,"OLS_SAMPLE_COUNT")
  const xm=x.reduce((a,b)=>a+b,0)/x.length,ym=y.reduce((a,b)=>a+b,0)/y.length
  const xx=x.reduce((a,b)=>a+(b-xm)**2,0);domain(xx>0,"OLS_SINGULAR")
  const b=x.reduce((a,v,i)=>a+(v-xm)*(y[i]-ym),0)/xx,a=ym-b*xm
  const residuals=y.map((v,i)=>v-a-b*x[i]),sse=residuals.reduce((a,b)=>a+b*b,0),sst=y.reduce((a,b)=>a+(b-ym)**2,0)
  return{a,b,residuals,rmse:Math.sqrt(sse/x.length),r2:sst===0?null:1-sse/sst}
}
export function linear(xs:number[],ys:number[],x:number) {
  increasing(xs);domain(x>=xs[0]&&x<=xs.at(-1)!,"NO_EXTRAPOLATION")
  let i=1;while(i<xs.length-1&&x>xs[i])i++
  return ys[i-1]+(ys[i]-ys[i-1])*(x-xs[i-1])/(xs[i]-xs[i-1])
}
export function quantile(values:number[],q:number) {
  domain(values.length>0,"EMPTY_DISTRIBUTION")
  const s=[...values].sort((a,b)=>a-b),x=(s.length-1)*q,i=Math.floor(x)
  return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(x-i)
}
/** xorshift32 v1, unsigned nonzero seed; deterministic cross-platform draws. */
export function random(seed:number) {let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
export function triangular(t:{min:number;mode:number;max:number},u:number) {
  domain(t.min<=t.mode&&t.mode<=t.max,"TRIANGULAR_ORDER")
  if(t.min===t.max)return t.min
  const range=t.max-t.min,p=(t.mode-t.min)/range
  return u<p?t.min+Math.sqrt(u*range*(t.mode-t.min)):t.max-Math.sqrt((1-u)*range*(t.max-t.mode))
}
export function triOrder(t:{min:number;mode:number;max:number}) {domain(t.min<=t.mode&&t.mode<=t.max,"TRIANGULAR_ORDER")}
export function discounted(values:number[],rate:number) {let sum=0,c=0;for(let i=0;i<values.length;i++){const y=values[i]/Math.pow(1+rate,i)-c,t=sum+y;c=(t-sum)-y;sum=t}return sum}
