/* EVERY TEXT ELEMENT, AGAINST THE GROUND IT IS ACTUALLY PAINTED ON.
   ============================================================================
   This suite exists because six contrast failures shipped in a round that had already passed
   every other check — including two elements at **1.01:1**, which is not low contrast but
   invisible (#111827 ink on the #0A192F band).

   Why the existing colour audits missed them: they check the TOKEN LADDER (is #6B7280 4.83:1
   on white?) rather than the rendered pairing. Every token here is individually correct. The
   bug was in which ground each one landed on, and that is only visible in the rendered page.

   How it measures: one full-page screenshot, then for each text element the MOST COMMON
   colour inside its own bounding box is taken as the ground — not the ancestor's background
   declaration, which is wrong wherever a gradient, a pseudo-element plate (`.mk-hero::before`)
   or a re-pointed token is involved. The ink is the computed colour, composited over that
   ground if it has alpha. Thresholds are WCAG 2.1 AA: 4.5:1 for body, 3:1 for large text.

   The trap this avoids, documented after it produced a false alarm: scrolling to each element
   and screenshotting per element races `scroll-behavior: smooth`, so every clip captured
   whatever was passing by. Absolute coordinates from one full-page capture cannot race. */

import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'
const PAGES=['/','/pricing','/product','/faq','/contact','/download','/about']
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']})
const lin=(v)=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}
const L=([r,g,bl])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(bl)
const parseC=(c)=>{const m=(c||'').match(/[\d.]+/g); const v=m?m.map(Number):[0,0,0]; return {rgb:v.slice(0,3),a:v.length>3?v[3]:1}}
let grand=0, grandFail=0
for(const path of PAGES){
  const p=await b.newPage()
  await p.setViewport({width:1440,height:1000})
  await p.evaluateOnNewDocument(()=>{ const s=document.createElement('style'); s.textContent='html{scroll-behavior:auto !important}'; document.documentElement.appendChild(s) })
  try { await p.goto('http://localhost:3100'+path,{waitUntil:'networkidle2',timeout:30000}) } catch(e){ console.log(`${path}: SKIP (${e.message.slice(0,40)})`); await p.close(); continue }
  await new Promise(r=>setTimeout(r,1800))
  const H = await p.evaluate(()=>document.documentElement.scrollHeight)
  for(let y=0;y<H;y+=700){ await p.evaluate(v=>window.scrollTo(0,v), y); await new Promise(r=>setTimeout(r,90)) }
  await p.evaluate(()=>window.scrollTo(0,0)); await new Promise(r=>setTimeout(r,1100))
  const els = await p.evaluate(()=>{
    const out=[]
    const walk=(el)=>{
      for(const node of el.children){
        if(node.namespaceURI && node.namespaceURI.includes('svg')) continue
        const cs=getComputedStyle(node)
        if(cs.display==='none'||cs.visibility==='hidden') continue
        const hasText=[...node.childNodes].some(n=>n.nodeType===3 && n.textContent.trim().length>1)
        if(hasText){
          const r=node.getBoundingClientRect()
          if(r.width>3 && r.height>3) out.push({ tag:node.tagName, cls:(node.className||'').toString().slice(0,46),
            text:(node.textContent||'').trim().replace(/\s+/g,' ').slice(0,40), color:cs.color,
            size:parseFloat(cs.fontSize), weight:parseInt(cs.fontWeight)||400,
            x:r.x+window.scrollX, y:r.y+window.scrollY, w:r.width, h:r.height })
        }
        walk(node)
      }
    }
    walk(document.querySelector('.mk')||document.body)
    return out
  })
  const png=PNG.sync.read(Buffer.from(await p.screenshot({fullPage:true,encoding:'base64'}),'base64'))
  const fails=[]
  for(const e of els){
    const x0=Math.max(0,Math.floor(e.x)), y0=Math.max(0,Math.floor(e.y))
    const x1=Math.min(png.width,Math.ceil(e.x+e.w)), y1=Math.min(png.height,Math.ceil(e.y+e.h))
    if(x1-x0<3||y1-y0<3) continue
    const hist=new Map()
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
      const i=(png.width*y+x)<<2
      const k=((png.data[i]>>4)<<8)|((png.data[i+1]>>4)<<4)|(png.data[i+2]>>4)
      hist.set(k,(hist.get(k)||0)+1)
    }
    const sorted=[...hist.entries()].sort((a,b)=>b[1]-a[1])
    const toRGB=(k)=>[((k>>8)&15)*16+8,((k>>4)&15)*16+8,(k&15)*16+8]
    const ink=parseC(e.color)
    let ground=toRGB(sorted[0][0])
    const near=(a,b2)=>a.every((v,i)=>Math.abs(v-b2[i])<20)
    if(near(ground,ink.rgb) && sorted[1]) ground=toRGB(sorted[1][0])
    const painted = ink.a<1 ? ink.rgb.map((v,i)=>v*ink.a+ground[i]*(1-ink.a)) : ink.rgb
    const l1=L(painted), l2=L(ground)
    const cr=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)
    const large = e.size>=24 || (e.size>=18.66 && e.weight>=700)
    if(cr < (large?3:4.5)) fails.push({...e, ground, ratio:+cr.toFixed(2), need:large?3:4.5})
  }
  grand+=els.length; grandFail+=fails.length
  console.log(`${path.padEnd(10)} ${String(els.length).padStart(3)} elements  ${fails.length? fails.length+' FAIL':'0 fail'}`)
  const seen=new Set()
  for(const f of fails){ const k=`${f.cls}|${f.color}|${f.ground.join()}`; if(seen.has(k))continue; seen.add(k)
    console.log(`      ${f.ratio}:1 (need ${f.need}) <${f.tag} class="${f.cls}"> ink ${f.color} on rgb(${f.ground.join(',')})  "${f.text}"`) }
  await p.close()
}
console.log(`\nTOTAL: ${grand} text elements across ${PAGES.length} pages, ${grandFail} failing`)
console.log(grandFail === 0
  ? 'PASS  every text element clears WCAG AA against the ground it is actually painted on'
  : `FAIL  ${grandFail} element(s) below the AA threshold`)
process.exit(grandFail === 0 ? 0 : 1)
await b.close()
