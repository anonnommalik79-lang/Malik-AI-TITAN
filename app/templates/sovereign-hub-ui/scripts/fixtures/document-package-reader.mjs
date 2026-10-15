import assert from 'node:assert/strict'
import {inflateRawSync} from 'node:zlib'
/** Independent ZIP central-directory reader, verifying every entry CRC. */
export function readPackage(bytes){
 const b=Buffer.from(bytes),end=b.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));assert.ok(end>=0)
 let p=b.readUInt32LE(end+16);const files={}
 for(let n=0;n<b.readUInt16LE(end+10);n++){
  assert.equal(b.readUInt32LE(p),0x02014b50)
  const method=b.readUInt16LE(p+10),crc=b.readUInt32LE(p+16),size=b.readUInt32LE(p+20),nameLength=b.readUInt16LE(p+28),local=b.readUInt32LE(p+42)
  const name=b.subarray(p+46,p+46+nameLength).toString('utf8'),start=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28)
  const raw=b.subarray(start,start+size),data=method===8?inflateRawSync(raw):raw
  let value=0xffffffff
  for(const byte of data){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0)}
  assert.equal((value^0xffffffff)>>>0,crc,name);files[name]=data
  p+=46+nameLength+b.readUInt16LE(p+30)+b.readUInt16LE(p+32)
 }
 return files
}
