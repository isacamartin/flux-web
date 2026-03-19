#!/usr/bin/env node
'use strict'

const fs   = require('fs')
const path = require('path')
const http = require('http')

const VERSION     = '1.0.0'
const RUNTIME_DIR = path.join(__dirname, '..', 'runtime')
const cmd         = process.argv[2]
const args        = process.argv.slice(3)

// ── Compiler helpers (top-level to avoid TDZ) ────────────────────
const ICONS = {
  bolt:'⚡',leaf:'🌱',map:'🗺',chart:'📊',lock:'🔒',star:'⭐',
  heart:'❤',check:'✓',alert:'⚠',user:'👤',car:'🚗',money:'💰',
  phone:'📱',shield:'🛡',fire:'🔥',rocket:'🚀',clock:'🕐',
  globe:'🌐',gear:'⚙',pin:'📍',flash:'⚡',eye:'◉',tag:'◈',
  plus:'+',minus:'−',edit:'✎',trash:'🗑',search:'⌕',bell:'🔔',
  home:'⌂',mail:'✉',
}
const esc    = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const ic     = n => ICONS[n] || n
const isDyn  = s => s && (s.includes('@') || s.includes('$'))
const hSize  = n => n < 1024 ? `${n}B` : `${(n/1024).toFixed(1)}KB`

// ── HELP ─────────────────────────────────────────────────────────
if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`
  flux-lang v${VERSION}
  AI-first web language — write full apps in 20 lines.

  Usage:
    npx flux-lang init [name]        create a new project
    npx flux-lang serve [dir]        dev server → localhost:3000
    npx flux-lang build [dir/file]   compile .flux → static HTML
    npx flux-lang new <page>         create a new .flux page
    npx flux-lang --version

  Examples:
    npx flux-lang init my-app
    cd my-app && npx flux-lang serve
    npx flux-lang build pages/ --out dist/
    npx flux-lang new dashboard

  GitHub: https://github.com/isacamartin/flux
  Demo:   https://isacamartin.github.io/flux
  `)
  process.exit(0)
}

if (cmd === '--version' || cmd === '-v') {
  console.log(`flux-lang v${VERSION}`)
  process.exit(0)
}

// ── INIT ─────────────────────────────────────────────────────────
if (cmd === 'init') {
  const name = args[0] || 'flux-app'
  const dir  = path.resolve(name)

  if (fs.existsSync(dir)) {
    console.error(`\n  ✗  Directory "${name}" already exists.\n`)
    process.exit(1)
  }

  fs.mkdirSync(path.join(dir, 'pages'),  { recursive: true })
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true })

  for (const f of ['flux-runtime.js', 'flux-hydrate.js']) {
    const src = path.join(RUNTIME_DIR, f)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, 'public', f))
  }

  const year = new Date().getFullYear()

  fs.writeFileSync(path.join(dir, 'public', 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name}</title>
</head>
<body>
  <div id="app"></div>
  <script src="flux-runtime.js"></script>
  <script>
    fetch('../pages/home.flux')
      .then(r => r.text())
      .then(src => FLUX.boot(src, document.getElementById('app')))
  </script>
</body>
</html>`)

  fs.writeFileSync(path.join(dir, 'pages', 'home.flux'), `# ${name}
%home dark /

nav{${name}>/login:Sign in}

hero{Welcome to ${name}|Edit pages/home.flux to get started.>/signup:Get started}

row3{rocket>Fast>Renders in under 1ms. Zero framework overhead.|bolt>AI-native>Written by Claude in seconds, not hours.|globe>Deploy anywhere>Static files. Any host. Zero config.}

foot{© ${year} ${name}}
`)

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name, version: '0.1.0',
    scripts: { dev: 'npx flux-lang serve', build: 'npx flux-lang build pages/ --out dist/' },
    devDependencies: { 'flux-lang': `^${VERSION}` }
  }, null, 2))

  fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\nnode_modules/\n')

  console.log(`
  ✓  Created ${name}/

     pages/home.flux       ← edit this
     public/index.html     ← dev entry point

  Next steps:
     cd ${name}
     npx flux-lang serve   ← http://localhost:3000
  `)
  process.exit(0)
}

// ── NEW PAGE ─────────────────────────────────────────────────────
if (cmd === 'new') {
  const pageName = args[0]
  if (!pageName) { console.error('\n  ✗  Usage: flux-lang new <page-name>\n'); process.exit(1) }

  const pagesDir = fs.existsSync('pages') ? 'pages' : '.'
  const filePath = path.join(pagesDir, `${pageName}.flux`)
  if (fs.existsSync(filePath)) { console.error(`\n  ✗  ${filePath} already exists.\n`); process.exit(1) }

  const cap = pageName.charAt(0).toUpperCase() + pageName.slice(1)
  fs.writeFileSync(filePath, `# ${pageName}
%${pageName} dark /${pageName}

nav{AppName>/home:Home}

hero{${cap}|Page description here.>/action:Get started}

foot{© ${new Date().getFullYear()} AppName}
`)
  console.log(`\n  ✓  Created ${filePath}\n`)
  process.exit(0)
}

// ── BUILD ─────────────────────────────────────────────────────────
if (cmd === 'build') {
  const outIdx = args.indexOf('--out')
  const outDir = outIdx !== -1 ? args[outIdx + 1] : 'dist'
  const input  = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1)[0] || 'pages/'

  const fluxFiles = []
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
    fs.readdirSync(input).filter(f => f.endsWith('.flux')).forEach(f => fluxFiles.push(path.join(input, f)))
  } else if (input.endsWith('.flux') && fs.existsSync(input)) {
    fluxFiles.push(input)
  }

  if (!fluxFiles.length) {
    console.error(`\n  ✗  No .flux files found in: ${input}\n`)
    process.exit(1)
  }

  const combined = fluxFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n---\n')
  const pages    = parseFlux(combined)

  if (!pages.length) { console.error('\n  ✗  No pages found.\n'); process.exit(1) }

  fs.mkdirSync(outDir, { recursive: true })
  console.log(`\n  flux-lang build — ${fluxFiles.length} file(s)\n`)

  let totalBytes = 0
  for (const page of pages) {
    const html    = renderPage(page, pages)
    const fname   = page.route === '/' ? 'index.html' : page.route.replace(/^\//, '') + '/index.html'
    const outPath = path.join(outDir, fname)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, html)
    const jsNote = html.includes('flux-hydrate') ? ' + hydrate' : ' (zero JS ✓)'
    console.log(`  ✓  ${outPath.padEnd(40)} ${hSize(html.length)}${jsNote}`)
    totalBytes += html.length
  }

  const hydrateFile = path.join(RUNTIME_DIR, 'flux-hydrate.js')
  if (fs.existsSync(hydrateFile)) {
    const dst = path.join(outDir, 'flux-hydrate.js')
    fs.copyFileSync(hydrateFile, dst)
    totalBytes += fs.statSync(dst).size
    console.log(`  ✓  ${dst.padEnd(40)} ${hSize(fs.statSync(dst).size)}`)
  }

  if (fs.existsSync('public')) {
    for (const f of fs.readdirSync('public')) {
      if (!f.endsWith('.flux')) fs.copyFileSync(path.join('public', f), path.join(outDir, f))
    }
  }

  console.log(`\n  ${pages.length} page(s) built — ${hSize(totalBytes)} total`)
  console.log(`\n  Preview:  npx serve ${outDir}`)
  console.log(`  Deploy:   Vercel, Netlify, S3, any static host\n`)
  process.exit(0)
}

// ── SERVE ─────────────────────────────────────────────────────────
if (cmd === 'serve' || cmd === 'dev') {
  const root = path.resolve(args[0] || '.')
  const port = parseInt(process.env.PORT || '3000')

  const MIME = {
    '.html':'text/html; charset=utf-8', '.js':'application/javascript',
    '.css':'text/css', '.flux':'text/plain', '.json':'application/json',
    '.wasm':'application/wasm', '.svg':'image/svg+xml',
    '.png':'image/png', '.ico':'image/x-icon',
  }

  http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]
    if (urlPath === '/') urlPath = '/index.html'

    let filePath = null
    for (const candidate of [path.join(root,'public',urlPath), path.join(root,urlPath)]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { filePath = candidate; break }
    }
    if (!filePath && urlPath.endsWith('.flux')) {
      const fp = path.join(root, 'pages', path.basename(urlPath))
      if (fs.existsSync(fp)) filePath = fp
    }

    if (!filePath) { res.writeHead(404); res.end('Not found'); return }

    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
    res.end(fs.readFileSync(filePath))
  }).listen(port, () => {
    console.log(`\n  ✓  flux-lang dev server\n\n  →  http://localhost:${port}\n\n  Edit pages/*.flux and reload.\n  Ctrl+C to stop.\n`)
  })
  return
}

console.error(`\n  ✗  Unknown command: ${cmd}\n  Run flux-lang --help\n`)
process.exit(1)

// ═════════════════════════════════════════════════════════════════
// PARSER
// ═════════════════════════════════════════════════════════════════

function parseFlux(src) {
  return src.split(/\n---\n/).map(s => parsePage(s.trim())).filter(Boolean)
}

function parsePage(src) {
  const lines = src.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (!lines.length) return null
  const p = { id:'page', theme:'dark', route:'/', state:{}, queries:[], blocks:[] }
  for (const line of lines) {
    if (line.startsWith('%')) {
      const [id, theme, route] = line.slice(1).trim().split(/\s+/)
      p.id = id || 'page'; p.theme = theme || 'dark'; p.route = route || '/'
    } else if (line.startsWith('@') && line.includes('=')) {
      const eq = line.indexOf('=')
      p.state[line.slice(1, eq).trim()] = line.slice(eq + 1).trim()
    } else if (line.startsWith('~')) {
      const q = parseQuery(line.slice(1).trim()); if (q) p.queries.push(q)
    } else {
      const b = parseBlock(line); if (b) p.blocks.push(b)
    }
  }
  return p
}

function parseQuery(s) {
  const pts = s.split(/\s+/), ai = pts.indexOf('=>')
  if (pts[0] === 'mount')    return { trigger:'mount', method:pts[1], path:pts[2], target: ai===-1?pts[3]:null, action: ai!==-1?pts.slice(ai+1).join(' '):null }
  if (pts[0] === 'interval') return { trigger:'interval', interval:parseInt(pts[1]), method:pts[2], path:pts[3], target: ai===-1?pts[4]:null, action: ai!==-1?pts.slice(ai+1).join(' '):null }
  return null
}

function parseBlock(line) {
  if (line.startsWith('table ')) {
    const idx = line.indexOf('{'); if (idx === -1) return null
    const binding = line.slice(6, idx).trim()
    const content = line.slice(idx + 1, line.lastIndexOf('}')).trim()
    return { kind:'table', binding, cols:parseCols(content), empty:parseEmpty(content) }
  }
  if (line.startsWith('form ')) {
    const bi = line.indexOf('{'); if (bi === -1) return null
    let head = line.slice(5, bi).trim()
    const content = line.slice(bi + 1, line.lastIndexOf('}')).trim()
    let action = ''
    const ai = head.indexOf('=>')
    if (ai !== -1) { action = head.slice(ai + 2).trim(); head = head.slice(0, ai).trim() }
    const [method, bpath] = head.split(/\s+/)
    return { kind:'form', method:method||'POST', bpath:bpath||'', action, fields:parseFields(content) }
  }
  if (line.startsWith('if ')) {
    const bi = line.indexOf('{'); if (bi === -1) return null
    return { kind:'if', cond:line.slice(3,bi).trim(), inner:line.slice(bi+1,line.lastIndexOf('}')).trim() }
  }
  const bi = line.indexOf('{'); if (bi === -1) return null
  const head = line.slice(0, bi).trim()
  const body = line.slice(bi + 1, line.lastIndexOf('}')).trim()
  const m = head.match(/^([a-z]+)(\d+)$/)
  return { kind: m ? m[1] : head, cols: m ? parseInt(m[2]) : 3, items: parseItems(body) }
}

function parseItems(body) {
  return body.split('|').map(raw => {
    raw = raw.trim(); if (!raw) return null
    return raw.split('>').map(f => {
      f = f.trim()
      if (f.startsWith('/')) { const [p, l] = f.split(':'); return { isLink:true, path:(p||'').trim(), label:(l||'').trim() } }
      return { isLink:false, text:f }
    })
  }).filter(Boolean)
}

function parseCols(s) {
  return s.split('|').map(c => {
    c = c.trim(); if (c.startsWith('empty:')) return null
    const [l, k] = c.split(':').map(x => x.trim()); return k ? { label:l, key:k } : null
  }).filter(Boolean)
}

function parseEmpty(s) {
  const m = s.match(/empty:\s*([^|]+)/); return m ? m[1].trim() : 'No data.'
}

function parseFields(s) {
  return s.split('|').map(f => {
    const [label, type, placeholder] = f.split(':').map(x => x.trim())
    return label ? { label, type:type||'text', placeholder:placeholder||'', name:label.toLowerCase().replace(/\s+/g,'_') } : null
  }).filter(Boolean)
}

// ═════════════════════════════════════════════════════════════════
// RENDERER — SSG: static HTML + minimal hydration where needed
// ═════════════════════════════════════════════════════════════════

function renderPage(page, allPages) {
  const needsJS = page.queries.length > 0 ||
    page.blocks.some(b => ['table','list','form','if'].includes(b.kind))

  const body   = page.blocks.map(b => renderBlock(b)).join('')
  const config = needsJS ? JSON.stringify({
    id: page.id, theme: page.theme,
    routes: allPages.map(p => p.route),
    state:  page.state,
    queries: page.queries
  }) : ''

  const hydrateTag = needsJS
    ? `\n<script>window.__FLUX_PAGE__=${config};</script>\n<script src="./flux-hydrate.js" defer></script>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.id.charAt(0).toUpperCase()+page.id.slice(1))}</title>
<link rel="canonical" href="${esc(page.route)}">
<meta name="robots" content="index,follow">
<style>${css(page.theme)}</style>
</head>
<body>
${body}${hydrateTag}
</body>
</html>`
}

function renderBlock(b) {
  switch (b.kind) {
    case 'nav':   return rNav(b)
    case 'hero':  return rHero(b)
    case 'stats': return rStats(b)
    case 'row':   return rRow(b)
    case 'sect':  return rSect(b)
    case 'foot':  return rFoot(b)
    case 'table': return rTable(b)
    case 'form':  return rForm(b)
    case 'if':    return `<div class="fx-if-wrap" data-fx-if="${esc(b.cond)}" style="display:none"></div>\n`
    default: return ''
  }
}

function rNav(b) {
  if (!b.items?.[0]) return ''
  const it = b.items[0]
  const brand = !it[0]?.isLink ? `<span class="fx-brand">${esc(it[0].text)}</span>` : ''
  const start = !it[0]?.isLink ? 1 : 0
  const links = it.slice(start).filter(f => f.isLink)
    .map(f => `<a href="${esc(f.path)}" class="fx-nav-link">${esc(f.label)}</a>`).join('')
  return `<nav class="fx-nav">${brand}<div class="fx-nav-links">${links}</div></nav>\n`
}

function rHero(b) {
  let inner = '', h1 = false
  for (const item of b.items) for (const f of item) {
    if (f.isLink) inner += `<a href="${esc(f.path)}" class="fx-cta">${esc(f.label)}</a>`
    else if (!h1) { inner += `<h1 class="fx-title">${esc(f.text)}</h1>`; h1 = true }
    else inner += `<p class="fx-sub">${esc(f.text)}</p>`
  }
  return `<section class="fx-hero"><div class="fx-hero-inner">${inner}</div></section>\n`
}

function rStats(b) {
  const cells = b.items.map(item => {
    const raw = item[0]?.text || ''
    const [val, lbl] = raw.split(':')
    const bind = isDyn(val?.trim()) ? ` data-fx-bind="${esc(val.trim())}"` : ''
    return `<div class="fx-stat"><div class="fx-stat-val"${bind}>${esc(val?.trim())}</div><div class="fx-stat-lbl">${esc(lbl?.trim())}</div></div>`
  }).join('')
  return `<div class="fx-stats">${cells}</div>\n`
}

function rRow(b) {
  const cards = b.items.map(item => {
    const inner = item.map((f, fi) => {
      if (f.isLink) return `<a href="${esc(f.path)}" class="fx-card-link">${esc(f.label)} →</a>`
      if (fi === 0) return `<div class="fx-icon">${ic(f.text)}</div>`
      if (fi === 1) return `<h3 class="fx-card-title">${esc(f.text)}</h3>`
      return `<p class="fx-card-body">${esc(f.text)}</p>`
    }).join('')
    return `<div class="fx-card">${inner}</div>`
  }).join('')
  return `<div class="fx-grid fx-grid-${b.cols || 3}">${cards}</div>\n`
}

function rSect(b) {
  let inner = ''
  b.items.forEach((item, ii) => item.forEach(f => {
    if (f.isLink) inner += `<a href="${esc(f.path)}" class="fx-sect-link">${esc(f.label)}</a>`
    else if (ii === 0) inner += `<h2 class="fx-sect-title">${esc(f.text)}</h2>`
    else inner += `<p class="fx-sect-body">${esc(f.text)}</p>`
  }))
  return `<section class="fx-sect">${inner}</section>\n`
}

function rFoot(b) {
  let inner = ''
  for (const item of b.items) for (const f of item) {
    if (f.isLink) inner += `<a href="${esc(f.path)}" class="fx-footer-link">${esc(f.label)}</a>`
    else inner += `<p class="fx-footer-text">${esc(f.text)}</p>`
  }
  return `<footer class="fx-footer">${inner}</footer>\n`
}

function rTable(b) {
  const ths  = b.cols.map(c => `<th class="fx-th">${esc(c.label)}</th>`).join('')
  const keys = JSON.stringify(b.cols.map(c => c.key))
  return `<div class="fx-table-wrap"><table class="fx-table" data-fx-table="${esc(b.binding)}" data-fx-cols='${keys}'><thead><tr>${ths}</tr></thead><tbody class="fx-tbody"><tr><td colspan="${b.cols.length}" class="fx-td-empty">${esc(b.empty)}</td></tr></tbody></table></div>\n`
}

function rForm(b) {
  const fields = b.fields.map(f => {
    const inp = f.type === 'select'
      ? `<select class="fx-input" name="${esc(f.name)}"><option value="">Select...</option></select>`
      : `<input class="fx-input" type="${esc(f.type)}" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}">`
    return `<div class="fx-field"><label class="fx-label">${esc(f.label)}</label>${inp}</div>`
  }).join('')
  return `<div class="fx-form-wrap"><form class="fx-form" data-fx-form="${esc(b.bpath)}" data-fx-method="${esc(b.method)}" data-fx-action="${esc(b.action)}">${fields}<div class="fx-form-msg"></div><button type="submit" class="fx-btn">Submit</button></form></div>\n`
}

// ═════════════════════════════════════════════════════════════════
// CSS — inlined, theme-specific
// ═════════════════════════════════════════════════════════════════

function css(theme) {
  const base = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}a{text-decoration:none;color:inherit}input,button,select{font-family:inherit}.fx-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 2.5rem;position:sticky;top:0;z-index:50;backdrop-filter:blur(12px)}.fx-brand{font-size:1.25rem;font-weight:800;letter-spacing:-.03em}.fx-nav-links{display:flex;align-items:center;gap:1.75rem}.fx-nav-link{font-size:.875rem;font-weight:500;opacity:.65;transition:opacity .15s}.fx-nav-link:hover{opacity:1}.fx-hero{display:flex;align-items:center;justify-content:center;min-height:92vh;padding:4rem 1.5rem}.fx-hero-inner{max-width:56rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.5rem}.fx-title{font-size:clamp(2.5rem,8vw,5.5rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-sub{font-size:clamp(1rem,2vw,1.25rem);line-height:1.75;max-width:40rem}.fx-cta{display:inline-flex;align-items:center;padding:.875rem 2.5rem;border-radius:.75rem;font-weight:700;font-size:1rem;letter-spacing:-.01em;transition:transform .15s;margin:.25rem}.fx-cta:hover{transform:translateY(-1px)}.fx-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3rem;padding:5rem 2.5rem;text-align:center}.fx-stat-val{font-size:clamp(2.5rem,5vw,4rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-stat-lbl{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:.5rem}.fx-grid{display:grid;gap:1.25rem;padding:1rem 2.5rem 5rem}.fx-grid-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.fx-grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.fx-grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.fx-card{border-radius:1rem;padding:1.75rem;transition:transform .2s,box-shadow .2s}.fx-card:hover{transform:translateY(-2px)}.fx-icon{font-size:2rem;margin-bottom:1rem}.fx-card-title{font-size:1.0625rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.5rem}.fx-card-body{font-size:.875rem;line-height:1.65}.fx-card-link{font-size:.8125rem;font-weight:600;display:inline-block;margin-top:1rem;opacity:.6;transition:opacity .15s}.fx-card-link:hover{opacity:1}.fx-sect{padding:5rem 2.5rem}.fx-sect-title{font-size:clamp(1.75rem,4vw,3rem);font-weight:800;letter-spacing:-.04em;margin-bottom:1.5rem;text-align:center}.fx-sect-body{font-size:1rem;line-height:1.75;text-align:center;max-width:48rem;margin:0 auto}.fx-form-wrap{padding:3rem 2.5rem;display:flex;justify-content:center}.fx-form{width:100%;max-width:28rem;border-radius:1.25rem;padding:2.5rem}.fx-field{margin-bottom:1.25rem}.fx-label{display:block;font-size:.8125rem;font-weight:600;margin-bottom:.5rem}.fx-input{width:100%;padding:.75rem 1rem;border-radius:.625rem;font-size:.9375rem;outline:none;transition:box-shadow .15s}.fx-input:focus{box-shadow:0 0 0 3px rgba(37,99,235,.35)}.fx-btn{width:100%;padding:.875rem 1.5rem;border:none;border-radius:.625rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-top:.5rem;transition:transform .15s,opacity .15s}.fx-btn:hover{transform:translateY(-1px)}.fx-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}.fx-form-msg{font-size:.8125rem;padding:.5rem 0;min-height:1.5rem;text-align:center}.fx-form-err{color:#f87171}.fx-form-ok{color:#4ade80}.fx-table-wrap{overflow-x:auto;padding:0 2.5rem 4rem}.fx-table{width:100%;border-collapse:collapse;font-size:.875rem}.fx-th{text-align:left;padding:.875rem 1.25rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.fx-tr{transition:background .1s}.fx-td{padding:.875rem 1.25rem}.fx-td-empty{padding:2rem 1.25rem;text-align:center;opacity:.4}.fx-if-wrap{display:contents}.fx-footer{padding:3rem 2.5rem;text-align:center}.fx-footer-text{font-size:.8125rem}.fx-footer-link{font-size:.8125rem;margin:0 .75rem;opacity:.5;transition:opacity .15s}.fx-footer-link:hover{opacity:1}`

  const themes = {
    dark:  `body{background:#030712;color:#f1f5f9}.fx-nav{border-bottom:1px solid #1e293b;background:rgba(3,7,18,.85)}.fx-nav-link{color:#cbd5e1}.fx-sub{color:#94a3b8}.fx-cta{background:#2563eb;color:#fff;box-shadow:0 8px 24px rgba(37,99,235,.35)}.fx-stat-lbl{color:#64748b}.fx-card{background:#0f172a;border:1px solid #1e293b}.fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.5)}.fx-card-body{color:#64748b}.fx-sect-body{color:#64748b}.fx-form{background:#0f172a;border:1px solid #1e293b}.fx-label{color:#94a3b8}.fx-input{background:#020617;border:1px solid #1e293b;color:#f1f5f9}.fx-input::placeholder{color:#334155}.fx-btn{background:#2563eb;color:#fff;box-shadow:0 4px 14px rgba(37,99,235,.4)}.fx-th{color:#475569;border-bottom:1px solid #1e293b}.fx-tr:hover{background:#0f172a}.fx-td{border-bottom:1px solid rgba(255,255,255,.03)}.fx-footer{border-top:1px solid #1e293b}.fx-footer-text{color:#334155}`,
    light: `body{background:#fff;color:#0f172a}.fx-nav{border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.85)}.fx-nav-link{color:#475569}.fx-sub{color:#475569}.fx-cta{background:#2563eb;color:#fff}.fx-stat-lbl{color:#94a3b8}.fx-card{background:#f8fafc;border:1px solid #e2e8f0}.fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.08)}.fx-card-body{color:#475569}.fx-sect-body{color:#475569}.fx-form{background:#f8fafc;border:1px solid #e2e8f0}.fx-label{color:#475569}.fx-input{background:#fff;border:1px solid #cbd5e1;color:#0f172a}.fx-btn{background:#2563eb;color:#fff}.fx-th{color:#94a3b8;border-bottom:1px solid #e2e8f0}.fx-tr:hover{background:#f8fafc}.fx-footer{border-top:1px solid #e2e8f0}.fx-footer-text{color:#94a3b8}`,
    acid:  `body{background:#000;color:#a3e635}.fx-nav{border-bottom:1px solid #1a2e05;background:rgba(0,0,0,.9)}.fx-nav-link{color:#86efac}.fx-sub{color:#4d7c0f}.fx-cta{background:#a3e635;color:#000;font-weight:800}.fx-stat-lbl{color:#365314}.fx-card{background:#0a0f00;border:1px solid #1a2e05}.fx-card-body{color:#365314}.fx-sect-body{color:#365314}.fx-form{background:#0a0f00;border:1px solid #1a2e05}.fx-label{color:#4d7c0f}.fx-input{background:#000;border:1px solid #1a2e05;color:#a3e635}.fx-btn{background:#a3e635;color:#000;font-weight:800}.fx-th{color:#365314;border-bottom:1px solid #1a2e05}.fx-footer{border-top:1px solid #1a2e05}.fx-footer-text{color:#1a2e05}`,
  }

  return base + (themes[theme] || themes.dark)
}
