#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagramTypes, themes, normalizeDocument } from '../dist/core.mjs'
import { readDiagramFile, renderNativeImage } from '../dist/native.mjs'
import { createHtml } from '../dist/export.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const usage = `UML Studio — JSON / 已保存 HTML → 可编辑多图 HTML / 图片（无需浏览器）

node scripts/diagram.mjs input.json --out output.html --image output.png
node scripts/diagram.mjs saved.html --diagram 2 --image activity.png
node scripts/diagram.mjs saved.html --all --out-dir images --format webp
node scripts/diagram.mjs input.json --validate
node scripts/diagram.mjs --list

--diagram 从 1 开始，或指定图形 id；多图图片导出必须明确选择或使用 --all。
--scale 0.1..4（位图默认 2，SVG 默认 1） --quality 0..1 --theme ocean
--font-file path.ttf 可重复，用于未安装到系统的本地字体。
输出路径相对当前目录；HTML 保留全部图形及各自的样式与布局参数。`
function parse(args) {
  const result = {fontFiles:[]}
  for (let i=0;i<args.length;i++) {
    const arg=args[i]
    if (arg==='--help'||arg==='-h') result.help=true
    else if (['--list','--validate','--all'].includes(arg)) result[arg.slice(2)]=true
    else if (['--out','--image','--out-dir','--format','--scale','--quality','--theme','--diagram','--font-file'].includes(arg)) {
      if (!args[i+1]||args[i+1].startsWith('--')) throw new Error(`${arg} 缺少参数`)
      const value=args[++i]
      if(arg==='--font-file') result.fontFiles.push(resolve(value)); else result[arg.slice(2)]=value
    } else if(arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    else if(result.input) throw new Error('只能指定一个 JSON 或 HTML 输入文件')
    else result.input=arg
  }
  return result
}
function safeName(value) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').slice(0,100)||'diagram' }
async function save(path,value) { await mkdir(dirname(path),{recursive:true});await writeFile(path,value) }
async function main() {
  const args=parse(process.argv.slice(2))
  if(args.help||!process.argv.slice(2).length){console.log(usage);return}
  if(args.list){console.log(JSON.stringify({types:diagramTypes,themes:Object.keys(themes),formats:['svg','png','jpeg','webp'],browserRequired:false},null,2));return}
  if(!args.input)throw new Error('缺少 input.json / saved.html；使用 --help 查看用法')
  const document=await readDiagramFile(resolve(args.input))
  if(args.theme) { for(const spec of document.diagrams)spec.theme=args.theme;normalizeDocument(document) }
  if(args.validate){console.log(JSON.stringify({valid:true,title:document.title,diagramCount:document.diagrams.length}));return}
  if(!args.out&&!args.image&&!args.all)throw new Error('至少指定 --out、--image 或 --all --out-dir')
  if(args.out&&extname(args.out).toLowerCase()!=='.html')throw new Error('--out 必须使用 .html 扩展名')
  if(args.all&&(args.image||args.diagram))throw new Error('--all 不能与 --image / --diagram 同时使用')
  if(args.all&&!args['out-dir'])throw new Error('--all 必须指定 --out-dir')
  if(args['out-dir']&&!args.all)throw new Error('--out-dir 必须与 --all 同时使用')
  const extension=args.image?extname(args.image).slice(1).toLowerCase().replace(/^jpg$/,'jpeg'):undefined
  const format=args.format??extension??'png'
  if(!['svg','png','jpeg','webp'].includes(format))throw new Error(`不支持的图片格式：${format}`)
  if(extension&&extension!==format)throw new Error('--format 与 --image 扩展名不一致')
  const scale=Number(args.scale??(format==='svg'?1:2)),quality=Number(args.quality??.92)
  if(!Number.isFinite(scale)||scale<.1||scale>4)throw new Error('--scale 必须在 0.1–4 之间')
  if(!Number.isFinite(quality)||quality<0||quality>1)throw new Error('--quality 必须在 0–1 之间')
  let selection
  if(args.diagram!==undefined){
    selection=/^\d+$/.test(args.diagram)?Number(args.diagram)-1:document.diagrams.findIndex(spec=>spec.id===args.diagram)
    if(!Number.isInteger(selection)||selection<0||selection>=document.diagrams.length)throw new Error('--diagram 不存在：请使用从 1 开始的序号或已声明的 id')
  }
  if(args.image&&selection===undefined&&document.diagrams.length>1)throw new Error('多图 HTML / JSON 需要 --diagram 明确选择一张，或 --all 批量导出')
  const selected=args.all?document.diagrams.map((spec,index)=>({spec,index})):args.image?[{spec:document.diagrams[selection??0],index:selection??0}]:[]
  const images=[]
  try {
    for(const {spec,index} of selected){
      const image=await renderNativeImage(spec,{format,scale,quality,fontFiles:args.fontFiles})
      const path=resolve(args.all?resolve(args['out-dir'],`${String(index+1).padStart(2,'0')}-${safeName(spec.title)}.${format}`):args.image)
      await save(path,image.data)
      images.push({index:index+1,id:spec.id,title:spec.title,path,format,width:image.width,height:image.height,bytes:image.data.byteLength})
    }
    if(args.out){
      const runtime={js:await readFile(resolve(root,'assets/viewer.js'),'utf8'),css:await readFile(resolve(root,'assets/viewer.css'),'utf8')}
      await save(resolve(args.out),createHtml(document,runtime))
    }
  } catch(error){throw new Error(`${error.message}${images.length?`；已生成 ${images.length} 张图片，未完成整个批次`:''}`)}
  console.log(JSON.stringify({title:document.title,diagramCount:document.diagrams.length,browser:false,html:args.out?resolve(args.out):undefined,images},null,2))
}
main().catch(error=>{console.error(`UML Studio: ${error.message}`);process.exitCode=1})
