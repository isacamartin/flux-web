#!/usr/bin/env node
'use strict'

const fs   = require('fs')
const path = require('path')
const http = require('http')

const VERSION     = '2.3.0'
const RUNTIME_DIR = path.join(__dirname, '..', 'runtime')
const cmd         = process.argv[2]
const args        = process.argv.slice(3)

const ICONS = {
  bolt:'⚡',leaf:'🌱',map:'🗺',chart:'📊',lock:'🔒',star:'⭐',
  heart:'❤',check:'✓',alert:'⚠',user:'👤',car:'🚗',money:'💰',
  phone:'📱',shield:'🛡',fire:'🔥',rocket:'🚀',clock:'🕐',
  globe:'🌐',gear:'⚙',pin:'📍',flash:'⚡',eye:'◉',tag:'◈',
  plus:'+',minus:'−',edit:'✎',trash:'🗑',search:'⌕',bell:'🔔',
  home:'⌂',mail:'✉',
}

const esc   = s => s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const ic    = n => ICONS[n] || n
const isDyn = s => s&&(s.includes('@')||s.includes('$'))
const hSize = n => n<1024?`${n}B`:`${(n/1024).toFixed(1)}KB`

// ─────────────────────────────────────────────────────────────────
// CLI COMMANDS
// ─────────────────────────────────────────────────────────────────

if (!cmd||cmd==='--help'||cmd==='-h') {
  console.log(`
  aiplang v${VERSION}
  AI-first web language — full apps in ~20 lines.

  Usage:
    npx aiplang init [name]                  create project (default template)
    npx aiplang init [name] --template <t>   use template: saas|landing|crud|dashboard|portfolio|blog
    npx aiplang init [name] --template ./my.flux     use a local .flux file as template
    npx aiplang init [name] --template my-custom     use a saved custom template
    npx aiplang serve [dir]                  dev server + hot reload
    npx aiplang build [dir/file]             compile → static HTML
    npx aiplang new <page>                   new page template
    npx aiplang --version

  Full-stack:
    npx aiplang start app.flux           start full-stack server (API + DB + frontend)
    PORT=8080 aiplang start app.flux     custom port

  Templates:
    npx aiplang template list                list all templates (built-in + custom)
    npx aiplang template save <n>            save current project as template
    npx aiplang template save <n> --from <f> save a specific .flux file as template
    npx aiplang template edit <n>            open template in editor
    npx aiplang template show <n>            print template source
    npx aiplang template export <n>          export template to .flux file
    npx aiplang template remove <n>          delete a custom template

  Custom template variables:
    {{name}}  project name
    {{year}}  current year

  Customization:
    ~theme accent=#7c3aed radius=1.5rem font=Syne bg=#000 text=#fff
    hero{...} animate:fade-up
    row3{...} class:my-class animate:stagger
    raw{<div>any HTML here</div>}

  GitHub: https://github.com/isacamartin/aiplang
  npm:    https://npmjs.com/package/aiplang
  Docs:   https://isacamartin.github.io/aiplang
  `)
  process.exit(0)
}
if (cmd==='--version'||cmd==='-v') { console.log(`aiplang v${VERSION}`); process.exit(0) }

// ─────────────────────────────────────────────────────────────────
// TEMPLATE SYSTEM
// Custom templates stored at ~/.aiplang/templates/<name>.flux
// ─────────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(require('os').homedir(), '.aiplang', 'templates')

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
}

// Built-in templates (interpolate {{name}} and {{year}})
const BUILTIN_TEMPLATES = {
  saas: `# {{name}}
~db sqlite ./app.db
~auth jwt $JWT_SECRET expire=7d
~admin /admin

model User {
  id       : uuid : pk auto
  name     : text : required
  email    : text : required unique
  password : text : required hashed
  plan     : enum : free,starter,pro : default=free
  role     : enum : user,admin : default=user
  ~soft-delete
}

api POST /api/auth/register {
  ~validate name required | email required email | password min=8
  ~unique User email $body.email | 409
  ~hash password
  insert User($body)
  return jwt($inserted) 201
}

api POST /api/auth/login {
  $user = User.findBy(email=$body.email)
  ~check password $body.password $user.password | 401
  return jwt($user) 200
}

api GET /api/me {
  ~guard auth
  return $auth.user
}

api GET /api/stats {
  return User.count()
}

%home dark /
@stats = {}
~mount GET /api/stats => @stats
nav{{{name}}>/pricing:Pricing>/login:Sign in}
hero{Ship faster with AI|Zero config, infinite scale.>/signup:Start free>/demo:View demo} animate:blur-in
stats{@stats:Users|99.9%:Uptime|$0:Start free}
row3{rocket>Deploy instantly>Push to git, live in seconds.|shield>Enterprise ready>SOC2, GDPR built-in.|chart>Full observability>Real-time errors.} animate:stagger
pricing{Free>$0/mo>3 projects>/signup:Get started|Pro>$29/mo>Unlimited>/signup:Start trial|Enterprise>Custom>SSO + SLA>/contact:Talk}
testimonial{Sarah Chen, CEO @ Acme|"Cut deployment time by 90%."|img:https://i.pravatar.cc/64?img=47} animate:fade-up
foot{© {{year}} {{name}}>/privacy:Privacy>/terms:Terms}

---

%login dark /login
nav{{{name}}>/signup:Create account}
hero{Welcome back|Sign in to continue.}
form POST /api/auth/login => redirect /dashboard { Email:email | Password:password }
foot{© {{year}} {{name}}}

---

%signup dark /signup
nav{{{name}}>/login:Sign in}
hero{Start for free|No credit card required.}
form POST /api/auth/register => redirect /dashboard { Name:text | Email:email | Password:password }
foot{© {{year}} {{name}}}

---

%dashboard dark /dashboard
@users = []
@stats = {}
~mount GET /api/users => @users
~mount GET /api/stats => @stats
nav{{{name}}>/logout:Sign out}
stats{@stats:Total users}
sect{Users}
table @users { Name:name | Email:email | Plan:plan | edit PUT /api/users/{id} | delete /api/users/{id} | empty: No users yet. }
foot{{{name}} Dashboard}`,

  landing: `# {{name}}
%home dark /
nav{{{name}}>/about:About>/contact:Contact}
hero{The future is now|{{name}} — built for the next generation.>/signup:Get started for free} animate:blur-in
row3{rocket>Fast>Zero config, instant results.|bolt>Simple>One command to deploy.|globe>Global>CDN in 180+ countries.}
foot{© {{year}} {{name}}}`,

  crud: `# {{name}}
%items dark /
@items = []
~mount GET /api/items => @items
nav{{{name}}>/items:Items>/settings:Settings}
sect{Manage Items}
table @items { Name:name | Status:status | edit PUT /api/items/{id} | delete /api/items/{id} | empty: No items yet. }
form POST /api/items => @items.push($result) { Name:text:Item name | Status:select:active,inactive }
foot{© {{year}} {{name}}}`,

  blog: `# {{name}}
%home dark /
@posts = []
~mount GET /api/posts => @posts
nav{{{name}}>/about:About}
hero{{{name}}|A blog about things that matter.} animate:fade-up
table @posts { Title:title | Date:created_at | empty: No posts yet. }
foot{© {{year}} {{name}}}`,

  portfolio: `# {{name}}
~theme accent=#f59e0b radius=2rem font=Syne bg=#0c0a09 text=#fafaf9

%home dark /
nav{{{name}}>/work:Work>/contact:Contact}
hero{Design & code.|Creative work for bold brands.>/work:See my work} animate:blur-in
row3{globe>10+ countries>Clients from 3 continents.|star>50+ projects>From startups to Fortune 500.|check>On time>98% on-schedule delivery.} animate:stagger
gallery{https://images.unsplash.com/photo-1518770660439?w=600|https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600|https://images.unsplash.com/photo-1558655146?w=600}
testimonial{Marco Rossi, CEO|"Exceptional work from start to finish."|img:https://i.pravatar.cc/64?img=11}
foot{© {{year}} {{name}}>/github:GitHub>/linkedin:LinkedIn}`,

  dashboard: `# {{name}}
%main dark /
@stats = {}
@items = []
~mount GET /api/stats => @stats
~mount GET /api/items => @items
~interval 30000 GET /api/stats => @stats
nav{{{name}}>/logout:Sign out}
stats{@stats.total:Total|@stats.active:Active|@stats.revenue:Revenue}
sect{Recent Items}
table @items { Name:name | Status:status | Date:created_at | edit PUT /api/items/{id} | delete /api/items/{id} | empty: No data. }
sect{Add Item}
form POST /api/items => @items.push($result) { Name:text | Status:select:active,inactive }
foot{{{name}}}`,

  default: `# {{name}}
%home dark /
nav{{{name}}>/login:Sign in}
hero{Welcome to {{name}}|Edit pages/home.flux to get started.>/signup:Get started} animate:fade-up
row3{rocket>Fast>Renders in under 1ms.|bolt>AI-native>Written by Claude in seconds.|globe>Deploy anywhere>Static files. Any host.}
foot{© {{year}} {{name}}}`,
}

function applyTemplateVars(src, name, year) {
  return src.replace(/\{\{name\}\}/g, name).replace(/\{\{year\}\}/g, year)
}

function getTemplate(tplName, name, year) {
  ensureTemplatesDir()

  // 1. Local file path: --template ./my-template.flux or --template /abs/path.flux
  if (tplName.startsWith('./') || tplName.startsWith('../') || tplName.startsWith('/')) {
    const full = path.resolve(tplName)
    if (!fs.existsSync(full)) { console.error(`\n  ✗  Template file not found: ${full}\n`); process.exit(1) }
    return applyTemplateVars(fs.readFileSync(full, 'utf8'), name, year)
  }

  // 2. User custom template: ~/.aiplang/templates/<name>.flux
  const customPath = path.join(TEMPLATES_DIR, tplName + '.flux')
  if (fs.existsSync(customPath)) {
    return applyTemplateVars(fs.readFileSync(customPath, 'utf8'), name, year)
  }

  // 3. Built-in template
  const builtin = BUILTIN_TEMPLATES[tplName]
  if (builtin) return applyTemplateVars(builtin, name, year)

  // Not found — show what's available
  const customs = fs.existsSync(TEMPLATES_DIR)
    ? fs.readdirSync(TEMPLATES_DIR).filter(f=>f.endsWith('.flux')).map(f=>f.replace('.flux',''))
    : []
  const all = [...Object.keys(BUILTIN_TEMPLATES).filter(k=>k!=='default'), ...customs]
  console.error(`\n  ✗  Template "${tplName}" not found.\n  Available: ${all.join(', ')}\n`)
  process.exit(1)
}

function listTemplates() {
  ensureTemplatesDir()
  const builtins = Object.keys(BUILTIN_TEMPLATES).filter(k=>k!=='default')
  const customs  = fs.readdirSync(TEMPLATES_DIR).filter(f=>f.endsWith('.flux')).map(f=>f.replace('.flux',''))
  console.log(`\n  aiplang templates\n`)
  console.log(`  Built-in:`)
  builtins.forEach(t => console.log(`    ${t}`))
  if (customs.length) {
    console.log(`\n  Custom (${TEMPLATES_DIR}):`)
    customs.forEach(t => console.log(`    ${t}  ✓`))
  } else {
    console.log(`\n  Custom:  (none yet — use "aiplang template save <name>" to create one)`)
  }
  console.log()
}

// ── template subcommand ──────────────────────────────────────────
if (cmd === 'template') {
  const sub = args[0]
  ensureTemplatesDir()

  // aiplang template list
  if (!sub || sub === 'list' || sub === 'ls') {
    listTemplates(); process.exit(0)
  }

  // aiplang template save <name> [--from <file>]
  if (sub === 'save' || sub === 'add') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template save <name> [--from <file>]\n'); process.exit(1) }
    const fromIdx = args.indexOf('--from')
    let src
    if (fromIdx !== -1 && args[fromIdx+1]) {
      const fp = path.resolve(args[fromIdx+1])
      if (!fs.existsSync(fp)) { console.error(`\n  ✗  File not found: ${fp}\n`); process.exit(1) }
      src = fs.readFileSync(fp, 'utf8')
    } else {
      // Auto-detect: use pages/ directory or app.flux
      const sources = ['pages', 'app.flux', 'index.flux']
      const found = sources.find(s => fs.existsSync(s))
      if (!found) { console.error('\n  ✗  No .flux files found. Use --from <file> to specify source.\n'); process.exit(1) }
      if (fs.statSync(found).isDirectory()) {
        src = fs.readdirSync(found).filter(f=>f.endsWith('.flux'))
          .map(f => fs.readFileSync(path.join(found,f),'utf8')).join('\n---\n')
      } else {
        src = fs.readFileSync(found, 'utf8')
      }
    }
    const dest = path.join(TEMPLATES_DIR, tname + '.flux')
    fs.writeFileSync(dest, src)
    console.log(`\n  ✓  Template saved: ${tname}\n     ${dest}\n\n  Use it: aiplang init my-app --template ${tname}\n`)
    process.exit(0)
  }

  // aiplang template remove <name>
  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template remove <name>\n'); process.exit(1) }
    const dest = path.join(TEMPLATES_DIR, tname + '.flux')
    if (!fs.existsSync(dest)) { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    fs.unlinkSync(dest)
    console.log(`\n  ✓  Removed template: ${tname}\n`); process.exit(0)
  }

  // aiplang template edit <name>
  if (sub === 'edit' || sub === 'open') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template edit <name>\n'); process.exit(1) }
    let dest = path.join(TEMPLATES_DIR, tname + '.flux')
    if (!fs.existsSync(dest)) {
      // create from built-in if exists
      const builtin = BUILTIN_TEMPLATES[tname]
      if (builtin) { fs.writeFileSync(dest, builtin); console.log(`\n  ✓  Copied built-in "${tname}" to custom templates.\n`) }
      else { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    }
    const editor = process.env.EDITOR || process.env.VISUAL || 'code'
    try { require('child_process').spawnSync(editor, [dest], { stdio: 'inherit' }) }
    catch { console.log(`\n  Template path: ${dest}\n  Open it in your editor.\n`) }
    process.exit(0)
  }

  // aiplang template show <name>
  if (sub === 'show' || sub === 'cat') {
    const tname = args[1] || 'default'
    const customPath = path.join(TEMPLATES_DIR, tname + '.flux')
    if (fs.existsSync(customPath)) { console.log(fs.readFileSync(customPath,'utf8')); process.exit(0) }
    const builtin = BUILTIN_TEMPLATES[tname]
    if (builtin) { console.log(builtin); process.exit(0) }
    console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1)
  }

  // aiplang template export <name> [--out <file>]
  if (sub === 'export') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template export <name>\n'); process.exit(1) }
    const outIdx = args.indexOf('--out')
    const outFile = outIdx !== -1 ? args[outIdx+1] : `./${tname}.flux`
    const customPath = path.join(TEMPLATES_DIR, tname + '.flux')
    const src = fs.existsSync(customPath) ? fs.readFileSync(customPath,'utf8') : BUILTIN_TEMPLATES[tname]
    if (!src) { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    fs.writeFileSync(outFile, src)
    console.log(`\n  ✓  Exported "${tname}" → ${outFile}\n`)
    process.exit(0)
  }

  console.error(`\n  ✗  Unknown template command: ${sub}\n  Commands: list, save, remove, edit, show, export\n`)
  process.exit(1)
}

// ── Init ─────────────────────────────────────────────────────────
if (cmd==='init') {
  const tplIdx = args.indexOf('--template')
  const tplName = tplIdx !== -1 ? args[tplIdx+1] : 'default'
  const name = args.find(a=>!a.startsWith('--')&&a!==tplName)||'aiplang-app'
  const dir  = path.resolve(name), year = new Date().getFullYear()

  if (fs.existsSync(dir)) { console.error(`\n  ✗  Directory "${name}" already exists.\n`); process.exit(1) }

  // Get template source (built-in, custom, or file path)
  const tplSrc = getTemplate(tplName, name, year)

  // Check if template has full-stack backend (models/api blocks)
  const isFullStack = tplSrc.includes('\nmodel ') || tplSrc.includes('\napi ')
  const isMultiFile = tplSrc.includes('\n---\n')

  if (isFullStack) {
    // Full-stack project: single app.flux
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'app.flux'), tplSrc)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name, version:'0.1.0',
      scripts: { dev: 'npx aiplang start app.flux', start: 'npx aiplang start app.flux' },
      devDependencies: { 'aiplang': `^${VERSION}` }
    }, null, 2))
    fs.writeFileSync(path.join(dir, '.env.example'), 'JWT_SECRET=change-me-in-production\n# STRIPE_SECRET_KEY=sk_test_...\n# AWS_ACCESS_KEY_ID=...\n# AWS_SECRET_ACCESS_KEY=...\n# S3_BUCKET=...\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), '*.db\nnode_modules/\ndist/\n.env\nuploads/\n')
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n\nGenerated with [aiplang](https://npmjs.com/package/aiplang) v${VERSION}\n\n## Run\n\n\`\`\`bash\nnpx aiplang start app.flux\n\`\`\`\n`)
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    console.log(`\n  ✓  Created ${name}/${label}\n\n     app.flux  ← full-stack app (backend + frontend)\n\n  Next:\n     cd ${name} && npx aiplang start app.flux\n`)
  } else if (isMultiFile) {
    // Multi-page SSG project: pages/*.flux
    fs.mkdirSync(path.join(dir,'pages'), {recursive:true})
    fs.mkdirSync(path.join(dir,'public'), {recursive:true})
    for (const f of ['aiplang-runtime.js','aiplang-hydrate.js']) {
      const src=path.join(RUNTIME_DIR,f); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(dir,'public',f))
    }
    const pageBlocks = tplSrc.split('\n---\n')
    pageBlocks.forEach((block, i) => {
      const m = block.match(/^%([a-zA-Z0-9_-]+)/m)
      const pageName = m ? m[1] : (i === 0 ? 'home' : `page${i}`)
      fs.writeFileSync(path.join(dir,'pages',`${pageName}.flux`), block.trim())
    })
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name,version:'0.1.0',scripts:{dev:'npx aiplang serve',build:'npx aiplang build pages/ --out dist/'},devDependencies:{'aiplang':`^${VERSION}`}},null,2))
    fs.writeFileSync(path.join(dir,'.gitignore'),'dist/\nnode_modules/\n')
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    const files = fs.readdirSync(path.join(dir,'pages')).map(f=>f).join(', ')
    console.log(`\n  ✓  Created ${name}/${label}\n\n     pages/{${files}}  ← edit these\n\n  Next:\n     cd ${name} && npx aiplang serve\n`)
  } else {
    // Single-page SSG project
    fs.mkdirSync(path.join(dir,'pages'), {recursive:true})
    fs.mkdirSync(path.join(dir,'public'), {recursive:true})
    for (const f of ['aiplang-runtime.js','aiplang-hydrate.js']) {
      const src=path.join(RUNTIME_DIR,f); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(dir,'public',f))
    }
    fs.writeFileSync(path.join(dir,'pages','home.flux'), tplSrc)
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name,version:'0.1.0',scripts:{dev:'npx aiplang serve',build:'npx aiplang build pages/ --out dist/'},devDependencies:{'aiplang':`^${VERSION}`}},null,2))
    fs.writeFileSync(path.join(dir,'.gitignore'),'dist/\nnode_modules/\n')
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    console.log(`\n  ✓  Created ${name}/${label}\n\n     pages/home.flux  ← edit this\n\n  Next:\n     cd ${name} && npx aiplang serve\n`)
  }
  process.exit(0)
}

// ── New ───────────────────────────────────────────────────────────
if (cmd==='new') {
  const name=args[0]; if(!name){console.error('\n  ✗  Usage: aiplang new <page>\n');process.exit(1)}
  const dir=fs.existsSync('pages')?'pages':'.'
  const file=path.join(dir,`${name}.flux`)
  if(fs.existsSync(file)){console.error(`\n  ✗  ${file} exists.\n`);process.exit(1)}
  const cap=name.charAt(0).toUpperCase()+name.slice(1)
  fs.writeFileSync(file,`# ${name}\n%${name} dark /${name}\n\nnav{AppName>/home:Home}\nhero{${cap}|Description.>/action:Get started}\nfoot{© ${new Date().getFullYear()} AppName}\n`)
  console.log(`\n  ✓  Created ${file}\n`)
  process.exit(0)
}

// ── Build ─────────────────────────────────────────────────────────
if (cmd==='build') {
  const outIdx=args.indexOf('--out')
  const outDir=outIdx!==-1?args[outIdx+1]:'dist'
  const input=args.filter((a,i)=>!a.startsWith('--')&&i!==outIdx+1)[0]||'pages/'
  const files=[]
  if(fs.existsSync(input)&&fs.statSync(input).isDirectory()){
    fs.readdirSync(input).filter(f=>f.endsWith('.flux')).forEach(f=>files.push(path.join(input,f)))
  } else if(input.endsWith('.flux')&&fs.existsSync(input)){ files.push(input) }
  if(!files.length){console.error(`\n  ✗  No .flux files in: ${input}\n`);process.exit(1)}
  const src=files.map(f=>fs.readFileSync(f,'utf8')).join('\n---\n')
  const pages=parseFlux(src)
  if(!pages.length){console.error('\n  ✗  No pages found.\n');process.exit(1)}
  fs.mkdirSync(outDir,{recursive:true})
  console.log(`\n  aiplang build v${VERSION} — ${files.length} file(s)\n`)
  let total=0
  for(const page of pages){
    const html=renderPage(page,pages)
    const fname=page.route==='/'?'index.html':page.route.replace(/^\//,'')+'/index.html'
    const out=path.join(outDir,fname)
    fs.mkdirSync(path.dirname(out),{recursive:true})
    fs.writeFileSync(out,html)
    const note=html.includes('aiplang-hydrate')?'+hydrate':'zero JS ✓'
    console.log(`  ✓  ${out.padEnd(40)} ${hSize(html.length)} (${note})`)
    total+=html.length
  }
  const hf=path.join(RUNTIME_DIR,'aiplang-hydrate.js')
  if(fs.existsSync(hf)){const dst=path.join(outDir,'aiplang-hydrate.js');fs.copyFileSync(hf,dst);total+=fs.statSync(dst).size;console.log(`  ✓  ${dst.padEnd(40)} ${hSize(fs.statSync(dst).size)}`)}
  if(fs.existsSync('public'))fs.readdirSync('public').filter(f=>!f.endsWith('.flux')).forEach(f=>fs.copyFileSync(path.join('public',f),path.join(outDir,f)))
  console.log(`\n  ${pages.length} page(s) — ${hSize(total)} total\n\n  Preview: npx serve ${outDir}\n  Deploy:  Vercel, Netlify, S3, any static host\n`)
  process.exit(0)
}

// ── Serve (hot reload) ────────────────────────────────────────────
if (cmd==='serve'||cmd==='dev') {
  const root=path.resolve(args[0]||'.')
  const port=parseInt(process.env.PORT||'3000')
  const MIME={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.flux':'text/plain','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'}
  let clients=[]
  const mtimes={}
  setInterval(()=>{
    const pd=path.join(root,'pages')
    if(!fs.existsSync(pd))return
    fs.readdirSync(pd).filter(f=>f.endsWith('.flux')).forEach(f=>{
      const fp=path.join(pd,f),mt=fs.statSync(fp).mtimeMs
      if(mtimes[fp]&&mtimes[fp]!==mt)clients.forEach(c=>{try{c.write('data: reload\n\n')}catch{}})
      mtimes[fp]=mt
    })
  },500)
  require('http').createServer((req,res)=>{
    if(req.url.split('?')[0]==='/__aiplang_reload'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'})
      res.write('data: connected\n\n');clients.push(res)
      req.on('close',()=>{clients=clients.filter(c=>c!==res)});return
    }
    let p=req.url.split('?')[0];if(p==='/') p='/index.html'
    let fp=null
    for(const c of [path.join(root,'public',p),path.join(root,p)]){if(fs.existsSync(c)&&fs.statSync(c).isFile()){fp=c;break}}
    if(!fp&&p.endsWith('.flux')){const c=path.join(root,'pages',path.basename(p));if(fs.existsSync(c))fp=c}
    if(!fp){res.writeHead(404);res.end('Not found');return}
    let content=fs.readFileSync(fp)
    if(path.extname(fp)==='.html'){
      const inject=`\n<script>const __es=new EventSource('/__aiplang_reload');__es.onmessage=e=>{if(e.data==='reload')location.reload()}</script>`
      content=content.toString().replace('</body>',inject+'</body>')
    }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Access-Control-Allow-Origin':'*'})
    res.end(content)
  }).listen(port,()=>console.log(`\n  ✓  aiplang dev server\n\n  →  http://localhost:${port}\n\n  Hot reload ON — edit .flux files and browser refreshes.\n  Ctrl+C to stop.\n`))
  return
}

// ── Dev server (full-stack) ──────────────────────────────────────
if (cmd === 'start' || cmd === 'run') {
  const aipFile = args[0]
  if (!aipFile || !fs.existsSync(aipFile)) {
    console.error(`\n  ✗  Usage: aiplang start <app.flux>\n`)
    process.exit(1)
  }
  const port = parseInt(process.env.PORT || args[1] || '3000')
  const serverPath = path.join(__dirname, '..', 'server', 'server.js')
  if (!fs.existsSync(serverPath)) {
    console.error(`\n  ✗  Full-stack server not found.`)
    console.error(`  Install: npm install -g aiplang-server\n`)
    process.exit(1)
  }
  console.log(`\n  aiplang full-stack server\n`)
  require('child_process').spawn(process.execPath, [serverPath, aipFile, port], {
    stdio: 'inherit', env: { ...process.env, PORT: port }
  })
  return
}

console.error(`\n  ✗  Unknown command: ${cmd}\n  Run aiplang --help\n`)
process.exit(1)

// ═════════════════════════════════════════════════════════════════
// PARSER
// ═════════════════════════════════════════════════════════════════

function parseFlux(src) {
  return src.split(/\n---\n/).map(s=>parsePage(s.trim())).filter(Boolean)
}

function parsePage(src) {
  const lines=src.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))
  if(!lines.length) return null
  const p={id:'page',theme:'dark',route:'/',customTheme:null,themeVars:null,state:{},queries:[],blocks:[]}
  for(const line of lines) {
    if(line.startsWith('%')) {
      const pts=line.slice(1).trim().split(/\s+/)
      p.id=pts[0]||'page'; p.route=pts[2]||'/'
      const rt=pts[1]||'dark'
      if(rt.includes('#')||rt.startsWith('theme=')) {
        const colors=rt.replace('theme=','').split(',')
        p.theme='custom'
        p.customTheme={bg:colors[0],text:colors[1]||'#f1f5f9',accent:colors[2]||'#2563eb',surface:colors[3]||null}
      } else { p.theme=rt }
    } else if(line.startsWith('~theme ')) {
      p.themeVars=p.themeVars||{}
      line.slice(7).trim().split(/\s+/).forEach(pair=>{
        const eq=pair.indexOf('='); if(eq!==-1) p.themeVars[pair.slice(0,eq).trim()]=pair.slice(eq+1).trim()
      })
    } else if(line.startsWith('@')&&line.includes('=')) {
      const eq=line.indexOf('='); p.state[line.slice(1,eq).trim()]=line.slice(eq+1).trim()
    } else if(line.startsWith('~')) {
      const q=parseQuery(line.slice(1).trim()); if(q) p.queries.push(q)
    } else {
      const b=parseBlock(line); if(b) p.blocks.push(b)
    }
  }
  return p
}

function parseQuery(s) {
  const pts=s.split(/\s+/),ai=pts.indexOf('=>')
  if(pts[0]==='mount')    return{trigger:'mount',method:pts[1],path:pts[2],target:ai===-1?pts[3]:null,action:ai!==-1?pts.slice(ai+1).join(' '):null}
  if(pts[0]==='interval') return{trigger:'interval',interval:parseInt(pts[1]),method:pts[2],path:pts[3],target:ai===-1?pts[4]:null,action:ai!==-1?pts.slice(ai+1).join(' '):null}
  return null
}

function parseBlock(line) {
  // ── Extract suffix modifiers FIRST ──────────────────────────
  // animate:fade-up class:my-class (can appear at end of any block line)
  let extraClass=null, animate=null
  const _cm=line.match(/\bclass:(\S+)/)
  if(_cm){extraClass=_cm[1];line=line.replace(_cm[0],'').trim()}
  const _am=line.match(/\banimate:(\S+)/)
  if(_am){animate=_am[1];line=line.replace(_am[0],'').trim()}

  // ── raw{} HTML passthrough ──────────────────────────────────
  if(line.startsWith('raw{')) {
    return{kind:'raw',html:line.slice(4,line.lastIndexOf('}')),extraClass,animate}
  }

  // ── table ───────────────────────────────────────────────────
  if(line.startsWith('table ')) {
    const idx=line.indexOf('{');if(idx===-1) return null
    const binding=line.slice(6,idx).trim()
    const content=line.slice(idx+1,line.lastIndexOf('}')).trim()
    const em=content.match(/edit\s+(PUT|PATCH)\s+(\S+)/), dm=content.match(/delete\s+(?:DELETE\s+)?(\S+)/)
    const clean=content.replace(/edit\s+(PUT|PATCH)\s+\S+/g,'').replace(/delete\s+(?:DELETE\s+)?\S+/g,'')
    return{kind:'table',binding,cols:parseCols(clean),empty:parseEmpty(clean),editPath:em?.[2]||null,editMethod:em?.[1]||'PUT',deletePath:dm?.[1]||null,deleteKey:'id',extraClass,animate}
  }

  // ── form ────────────────────────────────────────────────────
  if(line.startsWith('form ')) {
    const bi=line.indexOf('{');if(bi===-1) return null
    let head=line.slice(5,bi).trim(); const content=line.slice(bi+1,line.lastIndexOf('}')).trim()
    let action=''; const ai=head.indexOf('=>')
    if(ai!==-1){action=head.slice(ai+2).trim();head=head.slice(0,ai).trim()}
    const [method,bpath]=head.split(/\s+/)
    return{kind:'form',method:method||'POST',bpath:bpath||'',action,fields:parseFields(content),extraClass,animate}
  }

  // ── pricing ─────────────────────────────────────────────────
  if(line.startsWith('pricing{')) {
    const body=line.slice(8,line.lastIndexOf('}')).trim()
    const plans=body.split('|').map(p=>{
      const pts=p.trim().split('>').map(x=>x.trim())
      return{name:pts[0],price:pts[1],desc:pts[2],linkRaw:pts[3]}
    }).filter(p=>p.name)
    return{kind:'pricing',plans,extraClass,animate}
  }

  // ── faq ─────────────────────────────────────────────────────
  if(line.startsWith('faq{')) {
    const body=line.slice(4,line.lastIndexOf('}')).trim()
    const items=body.split('|').map(i=>{const idx=i.indexOf('>');return{q:i.slice(0,idx).trim(),a:i.slice(idx+1).trim()}}).filter(i=>i.q&&i.a)
    return{kind:'faq',items,extraClass,animate}
  }

  // ── testimonial ──────────────────────────────────────────────
  if(line.startsWith('testimonial{')) {
    const body=line.slice(12,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const imgPart=parts.find(p=>p.startsWith('img:'))
    return{kind:'testimonial',author:parts[0],quote:parts[1]?.replace(/^"|"$/g,''),img:imgPart?.slice(4)||null,extraClass,animate}
  }

  // ── gallery ──────────────────────────────────────────────────
  if(line.startsWith('gallery{')) {
    return{kind:'gallery',imgs:line.slice(8,line.lastIndexOf('}')).trim().split('|').map(x=>x.trim()).filter(Boolean),extraClass,animate}
  }

  // ── btn ──────────────────────────────────────────────────────
  if(line.startsWith('btn{')) {
    const parts=line.slice(4,line.lastIndexOf('}')).split('>').map(p=>p.trim())
    const label=parts[0]||'Click', method=parts[1]?.split(' ')[0]||'POST'
    const bpath=parts[1]?.split(' ').slice(1).join(' ')||'#'
    const confirm=parts.find(p=>p.startsWith('confirm:'))?.slice(8)||null
    const action=parts.find(p=>!p.startsWith('confirm:')&&p!==parts[0]&&p!==parts[1])||''
    return{kind:'btn',label,method,bpath,action,confirm,extraClass,animate}
  }

  // ── select ───────────────────────────────────────────────────
  if(line.startsWith('select ')) {
    const bi=line.indexOf('{')
    const varName=bi!==-1?line.slice(7,bi).trim():line.slice(7).trim()
    const body=bi!==-1?line.slice(bi+1,line.lastIndexOf('}')).trim():''
    return{kind:'select',binding:varName,options:body.split('|').map(o=>o.trim()).filter(Boolean),extraClass,animate}
  }

  // ── if ───────────────────────────────────────────────────────
  if(line.startsWith('if ')) {
    const bi=line.indexOf('{');if(bi===-1) return null
    return{kind:'if',cond:line.slice(3,bi).trim(),inner:line.slice(bi+1,line.lastIndexOf('}')).trim(),extraClass,animate}
  }

  // ── regular blocks (nav, hero, stats, rowN, sect, foot) ──────
  const bi=line.indexOf('{');if(bi===-1) return null
  const head=line.slice(0,bi).trim()
  const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
  const m=head.match(/^([a-z]+)(\d+)$/)
  return{kind:m?m[1]:head,cols:m?parseInt(m[2]):3,items:parseItems(body),extraClass,animate}
}

function parseItems(body) {
  return body.split('|').map(raw=>{
    raw=raw.trim();if(!raw) return null
    return raw.split('>').map(f=>{
      f=f.trim()
      if(f.startsWith('img:')) return{isImg:true,src:f.slice(4)}
      if(f.startsWith('/')) {const[p,l]=f.split(':');return{isLink:true,path:(p||'').trim(),label:(l||'').trim()}}
      return{isLink:false,text:f}
    })
  }).filter(Boolean)
}
function parseCols(s){return s.split('|').map(c=>{c=c.trim();if(c.startsWith('empty:')||!c)return null;const[l,k]=c.split(':').map(x=>x.trim());return k?{label:l,key:k}:null}).filter(Boolean)}
function parseEmpty(s){const m=s.match(/empty:\s*([^|]+)/);return m?m[1].trim():'No data.'}
function parseFields(s){return s.split('|').map(f=>{const[label,type,ph]=f.split(':').map(x=>x.trim());return label?{label,type:type||'text',placeholder:ph||'',name:label.toLowerCase().replace(/\s+/g,'_')}:null}).filter(Boolean)}

// ═════════════════════════════════════════════════════════════════
// RENDERER
// ═════════════════════════════════════════════════════════════════

function applyMods(html, b) {
  if(!html||(!b.extraClass&&!b.animate)) return html
  const cls=[(b.extraClass||''),(b.animate?'fx-anim-'+b.animate:'')].filter(Boolean).join(' ')
  // Inject into first tag's class attribute (handles multiline HTML)
  return html.replace(/class="([^"]*)"/, (_,c)=>`class="${c} ${cls}"`)
}

function renderPage(page, allPages) {
  const needsJS=page.queries.length>0||page.blocks.some(b=>['table','list','form','if','btn','select','faq'].includes(b.kind))
  const body=page.blocks.map(b=>applyMods(renderBlock(b,page),b)).join('')
  const config=needsJS?JSON.stringify({id:page.id,theme:page.theme,routes:allPages.map(p=>p.route),state:page.state,queries:page.queries}):''
  const hydrate=needsJS?`\n<script>window.__AIPLANG_PAGE__=${config};</script>\n<script src="./aiplang-hydrate.js" defer></script>`:''
  const customVars=page.customTheme?genCustomThemeVars(page.customTheme):''
  const themeVarCSS=page.themeVars?genThemeVarCSS(page.themeVars):''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.id.charAt(0).toUpperCase()+page.id.slice(1))}</title>
<link rel="canonical" href="${esc(page.route)}">
<meta name="robots" content="index,follow">
<style>${css(page.theme)}${customVars}${themeVarCSS}</style>
</head>
<body>
${body}${hydrate}
</body>
</html>`
}

function renderBlock(b, page) {
  switch(b.kind) {
    case 'nav':         return rNav(b)
    case 'hero':        return rHero(b)
    case 'stats':       return rStats(b)
    case 'row':         return rRow(b)
    case 'sect':        return rSect(b)
    case 'foot':        return rFoot(b)
    case 'table':       return rTable(b)
    case 'form':        return rForm(b)
    case 'btn':         return rBtn(b)
    case 'select':      return rSelectBlock(b)
    case 'pricing':     return rPricing(b)
    case 'faq':         return rFaq(b)
    case 'testimonial': return rTestimonial(b)
    case 'gallery':     return rGallery(b)
    case 'raw':         return (b.html||'')+'\n'
    case 'if':          return `<div class="fx-if-wrap" data-fx-if="${esc(b.cond)}" style="display:none"></div>\n`
    default: return ''
  }
}

function rNav(b) {
  if(!b.items?.[0]) return ''
  const it=b.items[0]
  const brand=!it[0]?.isLink?`<span class="fx-brand">${esc(it[0].text)}</span>`:''
  const start=!it[0]?.isLink?1:0
  const links=it.slice(start).filter(f=>f.isLink).map(f=>`<a href="${esc(f.path)}" class="fx-nav-link">${esc(f.label)}</a>`).join('')
  return `<nav class="fx-nav">${brand}<button class="fx-hamburger" onclick="this.classList.toggle('open');document.querySelector('.fx-nav-links').classList.toggle('open')" aria-label="Menu"><span></span><span></span><span></span></button><div class="fx-nav-links">${links}</div></nav>\n`
}

function rHero(b) {
  let h1='',sub='',img='',ctas=''
  for(const item of b.items) for(const f of item){
    if(f.isImg) img=`<img src="${esc(f.src)}" class="fx-hero-img" alt="hero" loading="eager">`
    else if(f.isLink) ctas+=`<a href="${esc(f.path)}" class="fx-cta">${esc(f.label)}</a>`
    else if(!h1) h1=`<h1 class="fx-title">${esc(f.text)}</h1>`
    else sub+=`<p class="fx-sub">${esc(f.text)}</p>`
  }
  return `<section class="fx-hero${img?' fx-hero-split':''}"><div class="fx-hero-inner">${h1}${sub}${ctas}</div>${img}</section>\n`
}

function rStats(b) {
  const cells=b.items.map(item=>{
    const[val,lbl]=(item[0]?.text||'').split(':')
    const bind=isDyn(val?.trim())?` data-fx-bind="${esc(val.trim())}"`  :''
    return`<div class="fx-stat"><div class="fx-stat-val"${bind}>${esc(val?.trim())}</div><div class="fx-stat-lbl">${esc(lbl?.trim())}</div></div>`
  }).join('')
  return `<div class="fx-stats">${cells}</div>\n`
}

function rRow(b) {
  const cards=b.items.map(item=>{
    const inner=item.map((f,fi)=>{
      if(f.isImg) return`<img src="${esc(f.src)}" class="fx-card-img" alt="" loading="lazy">`
      if(f.isLink) return`<a href="${esc(f.path)}" class="fx-card-link">${esc(f.label)} →</a>`
      if(fi===0) return`<div class="fx-icon">${ic(f.text)}</div>`
      if(fi===1) return`<h3 class="fx-card-title">${esc(f.text)}</h3>`
      return`<p class="fx-card-body">${esc(f.text)}</p>`
    }).join('')
    return`<div class="fx-card">${inner}</div>`
  }).join('')
  return `<div class="fx-grid fx-grid-${b.cols||3}">${cards}</div>\n`
}

function rSect(b) {
  let inner=''
  b.items.forEach((item,ii)=>item.forEach(f=>{
    if(f.isLink) inner+=`<a href="${esc(f.path)}" class="fx-sect-link">${esc(f.label)}</a>`
    else if(ii===0) inner+=`<h2 class="fx-sect-title">${esc(f.text)}</h2>`
    else inner+=`<p class="fx-sect-body">${esc(f.text)}</p>`
  }))
  return `<section class="fx-sect">${inner}</section>\n`
}

function rFoot(b) {
  let inner=''
  for(const item of b.items) for(const f of item){
    if(f.isLink) inner+=`<a href="${esc(f.path)}" class="fx-footer-link">${esc(f.label)}</a>`
    else inner+=`<p class="fx-footer-text">${esc(f.text)}</p>`
  }
  return `<footer class="fx-footer">${inner}</footer>\n`
}

function rTable(b) {
  const ths=b.cols.map(c=>`<th class="fx-th">${esc(c.label)}</th>`).join('')
  const keys=JSON.stringify(b.cols.map(c=>c.key))
  const cm=JSON.stringify(b.cols.map(c=>({label:c.label,key:c.key})))
  const ea=b.editPath?` data-fx-edit="${esc(b.editPath)}" data-fx-edit-method="${esc(b.editMethod)}"`:''
  const da=b.deletePath?` data-fx-delete="${esc(b.deletePath)}"`:''
  const at=(b.editPath||b.deletePath)?'<th class="fx-th fx-th-actions">Actions</th>':''
  const span=b.cols.length+((b.editPath||b.deletePath)?1:0)
  return `<div class="fx-table-wrap"><table class="fx-table" data-fx-table="${esc(b.binding)}" data-fx-cols='${keys}' data-fx-col-map='${cm}'${ea}${da}><thead><tr>${ths}${at}</tr></thead><tbody class="fx-tbody"><tr><td colspan="${span}" class="fx-td-empty">${esc(b.empty)}</td></tr></tbody></table></div>\n`
}

function rForm(b) {
  const fields=b.fields.map(f=>{
    const inp=f.type==='select'
      ?`<select class="fx-input" name="${esc(f.name)}"><option value="">Select...</option></select>`
      :`<input class="fx-input" type="${esc(f.type)}" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}">`
    return`<div class="fx-field"><label class="fx-label">${esc(f.label)}</label>${inp}</div>`
  }).join('')
  return `<div class="fx-form-wrap"><form class="fx-form" data-fx-form="${esc(b.bpath)}" data-fx-method="${esc(b.method)}" data-fx-action="${esc(b.action)}">${fields}<div class="fx-form-msg"></div><button type="submit" class="fx-btn">Submit</button></form></div>\n`
}

function rBtn(b) {
  const ca=b.confirm?` data-fx-confirm="${esc(b.confirm)}"`:''
  const aa=b.action?` data-fx-action="${esc(b.action)}"`:''
  return `<div class="fx-btn-wrap"><button class="fx-btn fx-standalone-btn" data-fx-btn="${esc(b.bpath)}" data-fx-method="${esc(b.method)}"${aa}${ca}>${esc(b.label)}</button></div>\n`
}

function rSelectBlock(b) {
  const opts=b.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')
  return `<div class="fx-select-wrap"><select class="fx-input fx-select-block" data-fx-model="${esc(b.binding)}">${opts}</select></div>\n`
}

function rPricing(b) {
  const cards=b.plans.map((p,i)=>{
    let lh='#',ll='Get started'
    if(p.linkRaw){const m=p.linkRaw.match(/\/([^:]+):(.+)/);if(m){lh='/'+m[1];ll=m[2]}}
    const f=i===1?' fx-pricing-featured':''
    const badge=i===1?'<div class="fx-pricing-badge">Most popular</div>':''
    return`<div class="fx-pricing-card${f}">${badge}<div class="fx-pricing-name">${esc(p.name)}</div><div class="fx-pricing-price">${esc(p.price)}</div><p class="fx-pricing-desc">${esc(p.desc)}</p><a href="${esc(lh)}" class="fx-cta fx-pricing-cta">${esc(ll)}</a></div>`
  }).join('')
  return `<div class="fx-pricing">${cards}</div>\n`
}

function rFaq(b) {
  const items=b.items.map(i=>`<div class="fx-faq-item" onclick="this.classList.toggle('open')"><div class="fx-faq-q">${esc(i.q)}<span class="fx-faq-arrow">▸</span></div><div class="fx-faq-a">${esc(i.a)}</div></div>`).join('')
  return `<section class="fx-sect"><div class="fx-faq">${items}</div></section>\n`
}

function rTestimonial(b) {
  const img=b.img?`<img src="${esc(b.img)}" class="fx-testi-img" alt="${esc(b.author)}" loading="lazy">`:`<div class="fx-testi-avatar">${esc((b.author||'?').charAt(0))}</div>`
  return `<section class="fx-testi-wrap"><div class="fx-testi">${img}<blockquote class="fx-testi-quote">"${esc(b.quote)}"</blockquote><div class="fx-testi-author">${esc(b.author)}</div></div></section>\n`
}

function rGallery(b) {
  const imgs=b.imgs.map(src=>`<div class="fx-gallery-item"><img src="${esc(src)}" alt="" loading="lazy"></div>`).join('')
  return `<div class="fx-gallery">${imgs}</div>\n`
}

// ── Theme helpers ─────────────────────────────────────────────────
function genCustomThemeVars(ct) {
  return `body{background:${ct.bg};color:${ct.text}}.fx-nav{background:${ct.bg}cc;border-bottom:1px solid ${ct.text}18}.fx-cta,.fx-btn{background:${ct.accent};color:#fff}.fx-card{background:${ct.surface||ct.bg};border:1px solid ${ct.text}15}.fx-form{background:${ct.surface||ct.bg};border:1px solid ${ct.text}15}.fx-input{background:${ct.bg};border:1px solid ${ct.text}30;color:${ct.text}}.fx-stat-lbl,.fx-card-body,.fx-sub,.fx-sect-body,.fx-footer-text{color:${ct.text}88}.fx-th,.fx-nav-link{color:${ct.text}77}.fx-footer{border-top:1px solid ${ct.text}15}.fx-th{border-bottom:1px solid ${ct.text}15}`
}

function genThemeVarCSS(t) {
  const r=[]
  if(t.accent)  r.push(`.fx-cta,.fx-btn,.fx-pricing-cta{background:${t.accent}!important;color:#fff!important}`)
  if(t.bg)      r.push(`body{background:${t.bg}!important}`)
  if(t.text)    r.push(`body{color:${t.text}!important}`)
  if(t.font)    r.push(`@import url('https://fonts.googleapis.com/css2?family=${t.font.replace(/ /g,'+')}:wght@400;700;900&display=swap');body{font-family:'${t.font}',system-ui,sans-serif!important}`)
  if(t.radius)  r.push(`.fx-card,.fx-form,.fx-btn,.fx-input,.fx-cta,.fx-pricing-card{border-radius:${t.radius}!important}`)
  if(t.surface) r.push(`.fx-card,.fx-form{background:${t.surface}!important}`)
  if(t.border)  r.push(`.fx-card,.fx-form,.fx-input{border-color:${t.border}!important}`)
  if(t.shadow)  r.push(`.fx-card:hover{box-shadow:${t.shadow}!important}`)
  if(t.navbg)   r.push(`.fx-nav{background:${t.navbg}!important}`)
  if(t.spacing) r.push(`.fx-sect,.fx-hero{padding-top:${t.spacing};padding-bottom:${t.spacing}}`)
  return r.join('')
}

// ═════════════════════════════════════════════════════════════════
// CSS
// ═════════════════════════════════════════════════════════════════

function css(theme) {
  const base=`*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}a{text-decoration:none;color:inherit}input,button,select{font-family:inherit}img{max-width:100%;height:auto}.fx-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 2.5rem;position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);flex-wrap:wrap;gap:.5rem}.fx-brand{font-size:1.25rem;font-weight:800;letter-spacing:-.03em}.fx-nav-links{display:flex;align-items:center;gap:1.75rem}.fx-nav-link{font-size:.875rem;font-weight:500;opacity:.65;transition:opacity .15s}.fx-nav-link:hover{opacity:1}.fx-hamburger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:.25rem}.fx-hamburger span{display:block;width:22px;height:2px;background:currentColor;transition:all .2s;border-radius:1px}.fx-hamburger.open span:nth-child(1){transform:rotate(45deg) translate(5px,5px)}.fx-hamburger.open span:nth-child(2){opacity:0}.fx-hamburger.open span:nth-child(3){transform:rotate(-45deg) translate(5px,-5px)}@media(max-width:640px){.fx-hamburger{display:flex}.fx-nav-links{display:none;width:100%;flex-direction:column;align-items:flex-start;gap:.75rem;padding:.75rem 0}.fx-nav-links.open{display:flex}}.fx-hero{display:flex;align-items:center;justify-content:center;min-height:92vh;padding:4rem 1.5rem}.fx-hero-split{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center;padding:4rem 2.5rem;min-height:70vh}@media(max-width:768px){.fx-hero-split{grid-template-columns:1fr}}.fx-hero-img{width:100%;border-radius:1.25rem;object-fit:cover;max-height:500px}.fx-hero-inner{max-width:56rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.5rem}.fx-hero-split .fx-hero-inner{text-align:left;align-items:flex-start;max-width:none}.fx-title{font-size:clamp(2.5rem,8vw,5.5rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-sub{font-size:clamp(1rem,2vw,1.25rem);line-height:1.75;max-width:40rem}.fx-cta{display:inline-flex;align-items:center;padding:.875rem 2.5rem;border-radius:.75rem;font-weight:700;font-size:1rem;letter-spacing:-.01em;transition:transform .15s;margin:.25rem}.fx-cta:hover{transform:translateY(-1px)}.fx-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3rem;padding:5rem 2.5rem;text-align:center}.fx-stat-val{font-size:clamp(2.5rem,5vw,4rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-stat-lbl{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:.5rem}.fx-grid{display:grid;gap:1.25rem;padding:1rem 2.5rem 5rem}.fx-grid-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.fx-grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.fx-grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.fx-card{border-radius:1rem;padding:1.75rem;transition:transform .2s,box-shadow .2s}.fx-card:hover{transform:translateY(-2px)}.fx-card-img{width:100%;border-radius:.75rem;object-fit:cover;height:180px;margin-bottom:1rem}.fx-icon{font-size:2rem;margin-bottom:1rem}.fx-card-title{font-size:1.0625rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.5rem}.fx-card-body{font-size:.875rem;line-height:1.65}.fx-card-link{font-size:.8125rem;font-weight:600;display:inline-block;margin-top:1rem;opacity:.6;transition:opacity .15s}.fx-card-link:hover{opacity:1}.fx-sect{padding:5rem 2.5rem}.fx-sect-title{font-size:clamp(1.75rem,4vw,3rem);font-weight:800;letter-spacing:-.04em;margin-bottom:1.5rem;text-align:center}.fx-sect-body{font-size:1rem;line-height:1.75;text-align:center;max-width:48rem;margin:0 auto}.fx-form-wrap{padding:3rem 2.5rem;display:flex;justify-content:center}.fx-form{width:100%;max-width:28rem;border-radius:1.25rem;padding:2.5rem}.fx-field{margin-bottom:1.25rem}.fx-label{display:block;font-size:.8125rem;font-weight:600;margin-bottom:.5rem}.fx-input{width:100%;padding:.75rem 1rem;border-radius:.625rem;font-size:.9375rem;outline:none;transition:box-shadow .15s}.fx-input:focus{box-shadow:0 0 0 3px rgba(37,99,235,.35)}.fx-btn{width:100%;padding:.875rem 1.5rem;border:none;border-radius:.625rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-top:.5rem;transition:transform .15s,opacity .15s;letter-spacing:-.01em}.fx-btn:hover{transform:translateY(-1px)}.fx-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}.fx-btn-wrap{padding:0 2.5rem 1.5rem}.fx-standalone-btn{width:auto;padding:.75rem 2rem;margin-top:0}.fx-form-msg{font-size:.8125rem;padding:.5rem 0;min-height:1.5rem;text-align:center}.fx-form-err{color:#f87171}.fx-form-ok{color:#4ade80}.fx-table-wrap{overflow-x:auto;padding:0 2.5rem 4rem}.fx-table{width:100%;border-collapse:collapse;font-size:.875rem}.fx-th{text-align:left;padding:.875rem 1.25rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.fx-th-actions{opacity:.6}.fx-tr{transition:background .1s}.fx-td{padding:.875rem 1.25rem}.fx-td-empty{padding:2rem 1.25rem;text-align:center;opacity:.4}.fx-td-actions{white-space:nowrap;padding:.5rem 1rem!important}.fx-action-btn{border:none;cursor:pointer;font-size:.75rem;font-weight:600;padding:.3rem .75rem;border-radius:.375rem;margin-right:.375rem;font-family:inherit;transition:opacity .15s}.fx-action-btn:hover{opacity:.85}.fx-edit-btn{background:#1e40af;color:#93c5fd}.fx-delete-btn{background:#7f1d1d;color:#fca5a5}.fx-select-wrap{padding:.5rem 2.5rem}.fx-select-block{width:auto;min-width:200px;margin-top:0}.fx-pricing{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;padding:2rem 2.5rem 5rem;align-items:start}.fx-pricing-card{border-radius:1.25rem;padding:2rem;position:relative;transition:transform .2s}.fx-pricing-featured{transform:scale(1.03)}.fx-pricing-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;font-size:.7rem;font-weight:700;padding:.25rem .875rem;border-radius:999px;white-space:nowrap;letter-spacing:.05em}.fx-pricing-name{font-size:.875rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;opacity:.7}.fx-pricing-price{font-size:3rem;font-weight:900;letter-spacing:-.05em;line-height:1;margin-bottom:.75rem}.fx-pricing-desc{font-size:.875rem;line-height:1.65;margin-bottom:1.5rem;opacity:.7}.fx-pricing-cta{display:block;text-align:center;padding:.75rem;border-radius:.625rem;font-weight:700;font-size:.9rem;transition:opacity .15s}.fx-pricing-cta:hover{opacity:.85}.fx-faq{max-width:48rem;margin:0 auto}.fx-faq-item{border-radius:.75rem;margin-bottom:.625rem;cursor:pointer;overflow:hidden;transition:background .15s}.fx-faq-q{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;font-size:.9375rem;font-weight:600}.fx-faq-arrow{transition:transform .2s;font-size:.75rem;opacity:.5}.fx-faq-item.open .fx-faq-arrow{transform:rotate(90deg)}.fx-faq-a{max-height:0;overflow:hidden;padding:0 1.25rem;font-size:.875rem;line-height:1.7;transition:max-height .3s,padding .3s}.fx-faq-item.open .fx-faq-a{max-height:300px;padding:.75rem 1.25rem 1.25rem}.fx-testi-wrap{padding:5rem 2.5rem;display:flex;justify-content:center}.fx-testi{max-width:42rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.25rem}.fx-testi-img{width:64px;height:64px;border-radius:50%;object-fit:cover}.fx-testi-avatar{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;background:#1e293b}.fx-testi-quote{font-size:1.25rem;line-height:1.7;font-style:italic;opacity:.9}.fx-testi-author{font-size:.875rem;font-weight:600;opacity:.5}.fx-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;padding:1rem 2.5rem 4rem}.fx-gallery-item{border-radius:.75rem;overflow:hidden;aspect-ratio:4/3}.fx-gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform .3s}.fx-gallery-item:hover img{transform:scale(1.04)}.fx-if-wrap{display:contents}.fx-footer{padding:3rem 2.5rem;text-align:center}.fx-footer-text{font-size:.8125rem}.fx-footer-link{font-size:.8125rem;margin:0 .75rem;opacity:.5;transition:opacity .15s}.fx-footer-link:hover{opacity:1}@keyframes fx-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}@keyframes fx-fade-in{from{opacity:0}to{opacity:1}}@keyframes fx-slide-left{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}@keyframes fx-slide-right{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}@keyframes fx-zoom-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}@keyframes fx-blur-in{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:blur(0)}}.fx-anim-fade-up{animation:fx-fade-up .6s cubic-bezier(.4,0,.2,1) both}.fx-anim-fade-in{animation:fx-fade-in .6s ease both}.fx-anim-slide-left{animation:fx-slide-left .6s cubic-bezier(.4,0,.2,1) both}.fx-anim-slide-right{animation:fx-slide-right .6s cubic-bezier(.4,0,.2,1) both}.fx-anim-zoom-in{animation:fx-zoom-in .5s cubic-bezier(.4,0,.2,1) both}.fx-anim-blur-in{animation:fx-blur-in .7s ease both}.fx-anim-stagger>.fx-card:nth-child(1){animation:fx-fade-up .5s 0s both}.fx-anim-stagger>.fx-card:nth-child(2){animation:fx-fade-up .5s .1s both}.fx-anim-stagger>.fx-card:nth-child(3){animation:fx-fade-up .5s .2s both}.fx-anim-stagger>.fx-card:nth-child(4){animation:fx-fade-up .5s .3s both}.fx-anim-stagger>.fx-card:nth-child(5){animation:fx-fade-up .5s .4s both}.fx-anim-stagger>.fx-card:nth-child(6){animation:fx-fade-up .5s .5s both}`

  const T={
    dark:  `body{background:#030712;color:#f1f5f9}.fx-nav{border-bottom:1px solid #1e293b;background:rgba(3,7,18,.85)}.fx-nav-link{color:#cbd5e1}.fx-sub{color:#94a3b8}.fx-cta{background:#2563eb;color:#fff;box-shadow:0 8px 24px rgba(37,99,235,.35)}.fx-stat-lbl{color:#64748b}.fx-card{background:#0f172a;border:1px solid #1e293b}.fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.5)}.fx-card-body{color:#64748b}.fx-sect-body{color:#64748b}.fx-form{background:#0f172a;border:1px solid #1e293b}.fx-label{color:#94a3b8}.fx-input{background:#020617;border:1px solid #1e293b;color:#f1f5f9}.fx-input::placeholder{color:#334155}.fx-btn{background:#2563eb;color:#fff;box-shadow:0 4px 14px rgba(37,99,235,.4)}.fx-th{color:#475569;border-bottom:1px solid #1e293b}.fx-tr:hover{background:#0f172a}.fx-td{border-bottom:1px solid rgba(255,255,255,.03)}.fx-footer{border-top:1px solid #1e293b}.fx-footer-text{color:#334155}.fx-pricing-card{background:#0f172a;border:1px solid #1e293b}.fx-faq-item{background:#0f172a}.fx-faq-item:hover{background:#111827}`,
    light: `body{background:#fff;color:#0f172a}.fx-nav{border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.85)}.fx-nav-link{color:#475569}.fx-sub{color:#475569}.fx-cta{background:#2563eb;color:#fff}.fx-stat-lbl{color:#94a3b8}.fx-card{background:#f8fafc;border:1px solid #e2e8f0}.fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.08)}.fx-card-body{color:#475569}.fx-sect-body{color:#475569}.fx-form{background:#f8fafc;border:1px solid #e2e8f0}.fx-label{color:#475569}.fx-input{background:#fff;border:1px solid #cbd5e1;color:#0f172a}.fx-btn{background:#2563eb;color:#fff}.fx-th{color:#94a3b8;border-bottom:1px solid #e2e8f0}.fx-tr:hover{background:#f8fafc}.fx-footer{border-top:1px solid #e2e8f0}.fx-footer-text{color:#94a3b8}.fx-pricing-card{background:#f8fafc;border:1px solid #e2e8f0}.fx-faq-item{background:#f8fafc}`,
    acid:  `body{background:#000;color:#a3e635}.fx-nav{border-bottom:1px solid #1a2e05;background:rgba(0,0,0,.9)}.fx-nav-link{color:#86efac}.fx-sub{color:#4d7c0f}.fx-cta{background:#a3e635;color:#000;font-weight:800}.fx-stat-lbl{color:#365314}.fx-card{background:#0a0f00;border:1px solid #1a2e05}.fx-card-body{color:#365314}.fx-sect-body{color:#365314}.fx-form{background:#0a0f00;border:1px solid #1a2e05}.fx-label{color:#4d7c0f}.fx-input{background:#000;border:1px solid #1a2e05;color:#a3e635}.fx-btn{background:#a3e635;color:#000;font-weight:800}.fx-th{color:#365314;border-bottom:1px solid #1a2e05}.fx-footer{border-top:1px solid #1a2e05}.fx-footer-text{color:#1a2e05}.fx-pricing-card{background:#0a0f00;border:1px solid #1a2e05}.fx-faq-item{background:#0a0f00}`,
  }
  return base+(T[theme]||T.dark)
}
