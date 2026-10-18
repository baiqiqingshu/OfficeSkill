import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { renderNativeImage, documentFromHtml } from '../dist/native.mjs'
import { normalizeDocument } from '../dist/core.mjs'
const model = () => ({version:1,type:'flowchart',title:'中文透明背景',nodes:[{id:'a',label:'开始处理'},{id:'b',label:'检查结果'}],edges:[{from:'a',to:'b'}],style:{background:'transparent'},layout:{maxWidth:300,maxHeight:240}})

test('native PNG preserves transparency and honors physical dimension caps, JPEG flattens to white',async()=>{
  const png=await renderNativeImage(model(),{format:'png',scale:1})
  const pixels=await sharp(png.data).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  assert.equal(pixels.data[3],0)
  assert.ok(png.width<=300&&png.height<=240)
  const jpg=await renderNativeImage(model(),{format:'jpeg',scale:1,quality:1})
  const corner=await sharp(jpg.data).extract({left:0,top:0,width:1,height:1}).removeAlpha().raw().toBuffer()
  assert.ok(corner[0]>=250&&corner[1]>=250&&corner[2]>=250)
})

test('collection identity is per diagram rather than per type, duplicate IDs and empty books are rejected',()=>{
  const first={...model(),id:'first'},second={...model(),id:'second',theme:'rose'}
  const document=normalizeDocument({version:1,title:'重复类型',diagrams:[first,second]})
  const invalid=structuredClone(document);invalid.diagrams[1].id='first'
  assert.throws(()=>normalizeDocument(invalid),/重复 ID/)
  assert.throws(()=>normalizeDocument({version:1,title:'空',diagrams:[]}))
})

test('HTML extraction rejects absent, ambiguous, and executable data blocks',()=>{
  assert.throws(()=>documentFromHtml('<html><script>throw new Error("must not run")</script></html>'),/缺少/)
  const json=JSON.stringify(model())
  const data=`<script id="diagram-data" type="application/json">${json}</script>`
  assert.throws(()=>documentFromHtml(data+data),/多个/)
  assert.throws(()=>documentFromHtml(`<script id="diagram-data">${json}</script>`),/application\/json/)
})
