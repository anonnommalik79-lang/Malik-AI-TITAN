/** Exact cash-flow construction over canonical JSON-number decimals. Discounting and
 * simulated draws remain floating point; this cannot recover digits lost before JSON parsing.
 * Integer coefficients avoid catastrophic cancellation before the final Number conversion. */
type Decimal={coefficient:bigint;exponent:number}
const ten=(n:number)=>BigInt("1"+"0".repeat(n))
function decimal(value:number):Decimal {
  if(!Number.isFinite(value))throw new RangeError("NONFINITE_CASHFLOW_INPUT")
  const [mantissa,power="0"]=String(value).split("e")
  return {coefficient:BigInt(mantissa.replace(".","")),exponent:Number(power)-(mantissa.split(".")[1]?.length??0)}
}
const multiply=(a:Decimal,b:Decimal):Decimal=>({coefficient:a.coefficient*b.coefficient,exponent:a.exponent+b.exponent})
function subtract(a:Decimal,b:Decimal):Decimal {
  const exponent=Math.min(a.exponent,b.exponent)
  return {coefficient:a.coefficient*ten(a.exponent-exponent)-b.coefficient*ten(b.exponent-exponent),exponent}
}
export function decimalCashflows(volumes:number[],price:number,variable:number,fixed:number,volumeScale=1):number[] {
  const margin=multiply(subtract(decimal(price),decimal(variable)),decimal(volumeScale)),overhead=decimal(fixed)
  const cache=new Map<number,number>()
  return volumes.map(volume=>{
    if(cache.has(volume))return cache.get(volume)!
    const flow=subtract(multiply(decimal(volume),margin),overhead)
    const value=Number(`${flow.coefficient}e${flow.exponent}`)
    if(!Number.isFinite(value))throw new RangeError("NONFINITE_CASHFLOW_RESULT")
    cache.set(volume,value)
    return value
  })
}
