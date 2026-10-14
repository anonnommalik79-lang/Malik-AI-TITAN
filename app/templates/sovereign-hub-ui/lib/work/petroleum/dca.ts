/** Bounded Arps log-space profile fit; empirical history, not reserve certification. */
export const DCA_VERSION = "mpce-dca-1.0.0"
export const DCA_MAX_HYPERBOLIC_POINTS = 512
export function arpsRate(qi: number, D: number, t: number, b: number) {
  if (![qi,D,t,b].every(Number.isFinite) || qi < 0 || D < 0 || t < 0 || b < 0 || b > 1) throw new RangeError("ARPS_DOMAIN")
  return qi * Math.exp(b < 1e-8 ? -D*t : -Math.log1p(b*D*t)/b)
}
export function effectiveDecline(D: number, span: number, b = 0) {
  return -Math.expm1(b < 1e-8 ? -D*span : -Math.log1p(b*D*span)/b)
}
function minimize(fn: (x:number)=>number, lo: number, hi: number, iterations = 36) {
  const ratio = (Math.sqrt(5)-1)/2
  let a = hi-ratio*(hi-lo), c = lo+ratio*(hi-lo), fa=fn(a), fc=fn(c)
  for(let i=0;i<iterations;i++) {
    if(fa<fc) { hi=c; c=a; fc=fa; a=hi-ratio*(hi-lo); fa=fn(a) }
    else { lo=a; a=c; fa=fc; c=lo+ratio*(hi-lo); fc=fn(c) }
  }
  return (lo+hi)/2
}
export function fitHyperbolic(t: number[], q: number[]) {
  if(t.length<4 || t.length> DCA_MAX_HYPERBOLIC_POINTS || t.length!==q.length || !t.every((v,i)=>Number.isFinite(v)&&v>=0&&(i===0||v>t[i-1])) || !q.every(v=>Number.isFinite(v)&&v>0)) return null
  const logs=q.map(Math.log), span=t[t.length-1]-t[0]
  if(!(span>0) || logs[logs.length-1]>=logs[0]) return null
  // D is nominal / time-unit. Bound to 100 nominal e-folds per observed span;
  // a boundary optimum is rejected rather than presented as an identified fit.
  const upper=100/span
  const profile=(b:number,D:number)=>{
    const shape=t.map(v=>b<1e-8 ? D*v : Math.log1p(b*D*v)/b)
    const logQi=logs.reduce((s,v,i)=>s+v+shape[i],0)/logs.length
    return {qi:Math.exp(logQi),loss:logs.reduce((s,v,i)=>s+(v-logQi+shape[i])**2,0)}
  }
  const at=(b:number)=>{const D=minimize(d=>profile(b,d).loss,1e-12,upper);return {b,D,...profile(b,D)}}
  const grid=Array.from({length:17},(_,i)=>at(i/16))
  const best=grid.reduce((a,c)=>c.loss<a.loss?c:a)
  const b=minimize(value=>at(value).loss,Math.max(0,best.b-1/16),Math.min(1,best.b+1/16),28)
  const choices=[best,at(b),grid[0],grid[16]], fit=choices.reduce((a,c)=>c.loss<a.loss?c:a)
  if(fit.D>=upper*.999 || !Number.isFinite(fit.qi)) return null
  return fit
}
