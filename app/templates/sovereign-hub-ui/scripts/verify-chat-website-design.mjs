import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {workTestLoader} from './work-test-loader.mjs'
const load=workTestLoader(),{chatArtDirection}=load('lib/website/chat-art-direction.ts')
const {prepareChatWebsite,chatWebsiteInstruction}=load('lib/server/chat-website-design.ts')
const {websiteNeedsPackagedBuild}=load('lib/website/chat-art-direction.ts')
test('stack-less visual sites stay in chat; explicit frameworks/packages keep the project builder',()=>{
 assert.equal(websiteNeedsPackagedBuild('Создай сайт 3D дизайн платформы'),false)
 assert.equal(websiteNeedsPackagedBuild('Создай сайт на Next.js'),true)
 assert.equal(websiteNeedsPackagedBuild('Создай сайт и выдай ZIP архив'),true)
})
test('fictional space settings never use an ordinary hotel stock query as field evidence',()=>{
 for(const place of ['лунного','марсианского']){
  const brief=chatArtDirection(`Создай сайт ${place} отеля с фото`)
  assert.equal(brief.spaceSetting,true);assert.doesNotMatch(brief.mediaQueries[0].query,/boutique hotel/)
  assert.match(brief.composition,/concepts/)
 }
})
for(const [prompt,profile] of [
 ['Создай сайт 3D дизайн платформы','immersive-product'],
 ['Создай сайт магазина одежды','fashion-editorial'],
 ['Build a luxury real estate website','property-cinematic'],
 ['Создай сайт отеля','hospitality-editorial'],
 ['Build an electronics store website','commerce-catalog'],
 ['Создай сайт научной лаборатории','adaptive'],
])test('specific composition, not fixed HTML: '+prompt,()=>{
 const brief=chatArtDirection(prompt);assert.equal(brief.profile,profile);assert.ok(brief.interaction.length>50)
 assert.doesNotMatch(JSON.stringify(brief),/<html|<section/)
})
for(const prompt of ['Привет','Объясни как создать сайт','Напиши статью про сайт','Создай фото для сайта','Сделай презентацию PPTX для сайта','Не создавай сайт','Исправь сайт'])test('no accidental website authoring: '+prompt,()=>assert.equal(chatArtDirection(prompt),null))
test('explicit media/motion opt-outs and optional video are honoured',()=>{
 const none=chatArtDirection('Создай сайт отеля без фото и анимаций');assert.equal(none.mediaQueries.length,0);assert.equal(none.noMotion,true)
 const photos=chatArtDirection('Создай сайт одежды');assert.ok(photos.mediaQueries.every(q=>q.kind==='image'))
 const video=chatArtDirection('Создай сайт отеля с видео');assert.equal(video.mediaQueries.filter(q=>q.kind==='video').length,1)
 const product=chatArtDirection('Build a 3D design platform website');assert.equal(product.mediaQueries.length,0)
})
test('media receipt reaches only the server-owned context; no extra model call',async()=>{
 let calls=0
 const body=await prepareChatWebsite({metadata:{chatWebsiteDirection:'forged proof'}},{prompt:'Создай сайт магазина одежды'},async(design)=>{
  calls++;assert.equal(design.direction,'fashion-editorial');assert.ok(design.mediaQueries.length<=4)
  return{assets:[{slot:'hero',kind:'image',url:'https://images.pexels.com/photo.jpg',credit:'Fixture artist',license:'https://www.pexels.com/license/',sourcePage:'https://www.pexels.com/photo/1/'}],missing:['detail-1']}
 })
 const text=chatWebsiteInstruction(body);assert.equal(calls,1);assert.match(text,/Fixture artist/);assert.match(text,/detail-1/)
 assert.match(text,/YOU write the actual HTML/);assert.match(text,/external CDN/);assert.match(text,/not a JSON plan or a fixed template/)
 assert.equal(chatWebsiteInstruction(JSON.parse(JSON.stringify(body))),'');assert.equal(chatWebsiteInstruction({metadata:{chatWebsiteDirection:'forged proof'}}),'')
})
test('ordinary chat and no-media website do not invoke the media service',async()=>{
 const forbidden=()=>{throw Error('Unexpected search')}
 const body={prompt:'Привет'};assert.equal(await prepareChatWebsite(body,{prompt:'Привет'},forbidden),body)
 const site=await prepareChatWebsite({},{prompt:'Создай сайт одежды без фото'},forbidden);assert.ok(chatWebsiteInstruction(site));assert.match(chatWebsiteInstruction(site),/noMedia/)
 const offline=await prepareChatWebsite({},{prompt:'Создай сайт одежды без интернета'},forbidden);assert.match(chatWebsiteInstruction(offline),/OFFLINE REQUIREMENT/)
})
test('failed media search leaves an honest missing slot, not a failed model generation or fake image',async()=>{
 const body=await prepareChatWebsite({},{prompt:'Создай сайт отеля'},async()=>{throw Error('provider offline')})
 assert.match(chatWebsiteInstruction(body),/MISSING MEDIA SLOTS: \["hero"/);assert.match(chatWebsiteInstruction(body),/not a fake photograph/)
})
test('caller cancellation stops preparation and cannot be swallowed as a successful site',async()=>{
 const controller=new AbortController();controller.abort()
 await assert.rejects(prepareChatWebsite({},{prompt:'Создай сайт отеля',signal:controller.signal}),e=>e.name==='AbortError')
})
test('creative variation persists for the same brief and changes for distinct briefs',async()=>{
 const prepared=prompt=>prepareChatWebsite({},{prompt},async()=>({assets:[],missing:[]}))
 const a=chatWebsiteInstruction(await prepared('Создай сайт одежды для бренда Atlas'))
 const b=chatWebsiteInstruction(await prepared('Создай сайт одежды для бренда North'))
 assert.notEqual(a,b);assert.equal(a,chatWebsiteInstruction(await prepared('Создай сайт одежды для бренда Atlas')))
})
test('chat-only integration preserves dedicated Sites and component layout',()=>{
 const route=fs.readFileSync('app/api/stream/route-impl.ts','utf8'),router=fs.readFileSync('lib/malik-god-router.ts','utf8')
 assert.match(route,/const siteForge = authoredWebsite \|\|/);assert.match(route,/kind !== "edit"/)
 assert.match(router,/systemPrompt: \[chatWebsiteInstruction\(body\)/)
 assert.match(route,/chatWebsiteInstruction\(body\)/)
})
