import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { BrowserImageError, imageSignature, newImageCandidates, verifyImageDataUrl, captureBrowserImage, waitForGeneratedImage } from "../image-result.mjs";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tag, data) {
  const name = Buffer.from(tag, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length,name,data,crc]);
}
function realPng() {
  const width=64,height=64;
  const raw=Buffer.alloc((1+width*4)*height);
  for (let y=0;y<height;y++) {
    const row=y*(1+width*4); raw[row]=0;
    for(let x=0;x<width;x++) {
      raw[row+1+x*4] = (x*29+y*11)&255;
      raw[row+2+x*4] = (x*y*13)&255;
      raw[row+3+x*4] = (x*17+y*31)&255;
      raw[row+4+x*4] = 255;
    }
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}

const old={index:0,src:"https://example.com/old.png",alt:"original",width:500,height:300,naturalWidth:900,naturalHeight:600};
const fresh={index:1,src:"blob:https://www.google.com/new-art",alt:"Generated image",width:620,height:380,naturalWidth:1600,naturalHeight:900};

test("the output is new, never the uploaded original or historical result",()=>{
  const selected=newImageCandidates([old],[old,fresh]);
  assert.equal(selected.length,1);
  assert.equal(imageSignature(selected[0]),imageSignature(fresh));
  assert.deepEqual(newImageCandidates([old],[old]),[]);
});

test("small thumbnails are ignored as generation results",()=>{
  const mini={...fresh,width:100,height:120};
  assert.deepEqual(newImageCandidates([old],[old,mini]),[]);
});

test("real PNG is verified and converted to bytes, not a text-only success",()=>{
  const png=realPng(); assert.ok(png.length>1000);
  const parsed=verifyImageDataUrl("data:image/png;base64,"+png.toString("base64"));
  assert.equal(parsed.mime,"image/png");
  assert.deepEqual(parsed.bytes,png);
  assert.throws(()=>verifyImageDataUrl("data:image/jpeg;base64,"+png.toString("base64")),BrowserImageError);
  assert.throws(()=>verifyImageDataUrl("https://untrusted.example/photo.png"),BrowserImageError);
});

test("capture screens only the selected image element, not whole page",async()=>{
  const png=realPng();const called=[];
  const page={
    evaluate:async()=>null,
    locator:(selector)=>({nth:(index)=>({
      isVisible:async()=>true,
      screenshot:async()=>{called.push({selector,index});return png},
    })}),
  };
  const output=await captureBrowserImage(page,fresh);
  assert.equal(output.mime,"image/png");
  assert.deepEqual(Buffer.from(output.base64,"base64"),png);
  assert.deepEqual(called,[{selector:"img",index:1}]);
});

test("waits for a stable new image before returning a result",async()=>{
  const png=realPng();let frames=0;const snapshots=[[old],[old,fresh],[old,fresh],[old,fresh]];
  const page={
    evaluate:async(fn)=>{
      if(fn.toString().includes('const result = []')) return snapshots[Math.min(frames++,snapshots.length-1)];
      return false;
    },
    locator:()=>({nth:()=>({isVisible:async()=>true,screenshot:async()=>png})}),
  };
  const img=await waitForGeneratedImage(page,[old],{poll:async()=>{},timeoutMs:1500});
  assert.equal(img.mime,"image/png");
  assert.equal(img.width,fresh.naturalWidth);
  assert.ok(frames>=4);
});
