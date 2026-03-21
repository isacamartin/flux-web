#!/usr/bin/env node
'use strict'

const fs   = require('fs')
const path = require('path')
const http = require('http')

const VERSION     = '2.11.9'
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

if (!cmd||cmd==='--help'||cmd==='-h') {
  console.log(`
  aiplang v${VERSION}
  AI-first web language — full apps in ~20 lines.

  Usage:
    npx aiplang init [name]                  create project (default template)
    npx aiplang init [name] --template <t>   use template: saas|landing|crud|dashboard|portfolio|blog
    npx aiplang init [name] --template ./my.aip     use a local .aip file as template
    npx aiplang init [name] --template my-custom     use a saved custom template
    npx aiplang serve [dir]                  dev server + hot reload
    npx aiplang build [dir/file]             compile → static HTML
    npx aiplang validate <app.aip>           validate syntax with AI-friendly errors
    npx aiplang types   <app.aip>            generate TypeScript types (.d.ts)
    npx aiplang context [app.aip]            dump minimal AI context (<500 tokens)
    npx aiplang new <page>                   new page template
    npx aiplang --version

  Full-stack:
    npx aiplang start app.aip           start full-stack server (API + DB + frontend)
    PORT=8080 aiplang start app.aip     custom port

  Templates:
    npx aiplang template list                list all templates (built-in + custom)
    npx aiplang template save <n>            save current project as template
    npx aiplang template save <n> --from <f> save a specific .aip file as template
    npx aiplang template edit <n>            open template in editor
    npx aiplang template show <n>            print template source
    npx aiplang template export <n>          export template to .aip file
    npx aiplang template remove <n>          delete a custom template

  Custom template variables:
    {{name}}  project name
    {{year}}  current year

  Customization:
    # Bancos de dados suportados:
    #   ~db sqlite   ./app.db          (padrão — sem configuração)
    #   ~db pg       $DATABASE_URL     (PostgreSQL)
    #   ~db mysql    $MYSQL_URL        (MySQL / MariaDB)
    #   ~db mongodb  $MONGODB_URL      (MongoDB)
    #   ~db redis    $REDIS_URL        (Redis — cache/session)
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

const TEMPLATES_DIR = path.join(require('os').homedir(), '.aip', 'templates')

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
}

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

api GET /api/users {
  ~guard admin
  ~query page=1
  return User.paginate($page, 20)
}

api PUT /api/users/:id {
  ~guard admin
  update User($id, $body)
  return $updated
}

api DELETE /api/users/:id {
  ~guard admin
  delete User($id)
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

  hello: `# {{name}}
%home dark /
nav{{{name}}}
hero{Hello, World!|Built with aiplang.} animate:blur-in
foot{© {{year}} {{name}}}`,

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
hero{Welcome to {{name}}|Edit pages/home.aip to get started.>/signup:Get started} animate:fade-up
row3{rocket>Fast>Renders in under 1ms.|bolt>AI-native>Written by Claude in seconds.|globe>Deploy anywhere>Static files. Any host.}
foot{© {{year}} {{name}}}`,
}

function applyTemplateVars(src, name, year) {
  return src.replace(/\{\{name\}\}/g, name).replace(/\{\{year\}\}/g, year)
}

function getTemplate(tplName, name, year) {
  ensureTemplatesDir()

  if (tplName.startsWith('./') || tplName.startsWith('../') || tplName.startsWith('/')) {
    const full = path.resolve(tplName)
    if (!fs.existsSync(full)) { console.error(`\n  ✗  Template file not found: ${full}\n`); process.exit(1) }
    return applyTemplateVars(fs.readFileSync(full, 'utf8'), name, year)
  }

  const customPath = path.join(TEMPLATES_DIR, tplName + '.aip')
  if (fs.existsSync(customPath)) {
    return applyTemplateVars(fs.readFileSync(customPath, 'utf8'), name, year)
  }

  const builtin = BUILTIN_TEMPLATES[tplName]
  if (builtin) return applyTemplateVars(builtin, name, year)

  const customs = fs.existsSync(TEMPLATES_DIR)
    ? fs.readdirSync(TEMPLATES_DIR).filter(f=>f.endsWith('.aip')).map(f=>f.replace('.aip',''))
    : []
  const all = [...Object.keys(BUILTIN_TEMPLATES).filter(k=>k!=='default'), ...customs]
  console.error(`\n  ✗  Template "${tplName}" not found.\n  Available: ${all.join(', ')}\n`)
  process.exit(1)
}

function listTemplates() {
  ensureTemplatesDir()
  const builtins = Object.keys(BUILTIN_TEMPLATES).filter(k=>k!=='default')
  const customs  = fs.readdirSync(TEMPLATES_DIR).filter(f=>f.endsWith('.aip')).map(f=>f.replace('.aip',''))
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

if (cmd === 'template') {
  const sub = args[0]
  ensureTemplatesDir()

  if (!sub || sub === 'list' || sub === 'ls') {
    listTemplates(); process.exit(0)
  }

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

      const sources = ['pages', 'app.aip', 'index.aip']
      const found = sources.find(s => fs.existsSync(s))
      if (!found) { console.error('\n  ✗  No .aip files found. Use --from <file> to specify source.\n'); process.exit(1) }
      if (fs.statSync(found).isDirectory()) {
        src = fs.readdirSync(found).filter(f=>f.endsWith('.aip'))
          .map(f => fs.readFileSync(path.join(found,f),'utf8')).join('\n---\n')
      } else {
        src = fs.readFileSync(found, 'utf8')
      }
    }
    const dest = path.join(TEMPLATES_DIR, tname + '.aip')
    fs.writeFileSync(dest, src)
    console.log(`\n  ✓  Template saved: ${tname}\n     ${dest}\n\n  Use it: aiplang init my-app --template ${tname}\n`)
    process.exit(0)
  }

  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template remove <name>\n'); process.exit(1) }
    const dest = path.join(TEMPLATES_DIR, tname + '.aip')
    if (!fs.existsSync(dest)) { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    fs.unlinkSync(dest)
    console.log(`\n  ✓  Removed template: ${tname}\n`); process.exit(0)
  }

  if (sub === 'edit' || sub === 'open') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template edit <name>\n'); process.exit(1) }
    let dest = path.join(TEMPLATES_DIR, tname + '.aip')
    if (!fs.existsSync(dest)) {

      const builtin = BUILTIN_TEMPLATES[tname]
      if (builtin) { fs.writeFileSync(dest, builtin); console.log(`\n  ✓  Copied built-in "${tname}" to custom templates.\n`) }
      else { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    }
    const editor = process.env.EDITOR || process.env.VISUAL || 'code'
    try { require('child_process').spawnSync(editor, [dest], { stdio: 'inherit' }) }
    catch { console.log(`\n  Template path: ${dest}\n  Open it in your editor.\n`) }
    process.exit(0)
  }

  if (sub === 'show' || sub === 'cat') {
    const tname = args[1] || 'default'
    const customPath = path.join(TEMPLATES_DIR, tname + '.aip')
    if (fs.existsSync(customPath)) { console.log(fs.readFileSync(customPath,'utf8')); process.exit(0) }
    const builtin = BUILTIN_TEMPLATES[tname]
    if (builtin) { console.log(builtin); process.exit(0) }
    console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1)
  }

  if (sub === 'export') {
    const tname = args[1]
    if (!tname) { console.error('\n  ✗  Usage: aiplang template export <name>\n'); process.exit(1) }
    const outIdx = args.indexOf('--out')
    const outFile = outIdx !== -1 ? args[outIdx+1] : `./${tname}.aip`
    const customPath = path.join(TEMPLATES_DIR, tname + '.aip')
    const src = fs.existsSync(customPath) ? fs.readFileSync(customPath,'utf8') : BUILTIN_TEMPLATES[tname]
    if (!src) { console.error(`\n  ✗  Template "${tname}" not found.\n`); process.exit(1) }
    fs.writeFileSync(outFile, src)
    console.log(`\n  ✓  Exported "${tname}" → ${outFile}\n`)
    process.exit(0)
  }

  console.error(`\n  ✗  Unknown template command: ${sub}\n  Commands: list, save, remove, edit, show, export\n`)
  process.exit(1)
}

if (cmd==='init') {
  const tplIdx = args.indexOf('--template')
  const tplName = tplIdx !== -1 ? args[tplIdx+1] : 'default'
  const name = args.find(a=>!a.startsWith('--')&&a!==tplName)||'aiplang-app'
  const dir  = path.resolve(name), year = new Date().getFullYear()

  if (fs.existsSync(dir)) { console.error(`\n  ✗  Directory "${name}" already exists.\n`); process.exit(1) }

  const tplSrc = getTemplate(tplName, name, year)

  const isFullStack = tplSrc.includes('\nmodel ') || tplSrc.includes('\napi ')
  const isMultiFile = tplSrc.includes('\n---\n')

  if (isFullStack) {

    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'app.aip'), tplSrc)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name, version:'0.1.0',
      scripts: { dev: 'npx aiplang start app.aip', start: 'npx aiplang start app.aip' },
      devDependencies: { 'aiplang': `^${VERSION}` }
    }, null, 2))
    fs.writeFileSync(path.join(dir, '.env.example'), 'JWT_SECRET=change-me-in-production\n# STRIPE_SECRET_KEY=sk_test_...\n# AWS_ACCESS_KEY_ID=...\n# AWS_SECRET_ACCESS_KEY=...\n# S3_BUCKET=...\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), '*.db\nnode_modules/\ndist/\n.env\nuploads/\n')
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n\nGenerated with [aiplang](https://npmjs.com/package/aiplang) v${VERSION}\n\n## Run\n\n\`\`\`bash\nnpx aiplang start app.aip\n\`\`\`\n`)
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    console.log(`\n  ✓  Created ${name}/${label}\n\n     app.aip  ← full-stack app (backend + frontend)\n\n  Next:\n     cd ${name} && npx aiplang start app.aip\n`)
  } else if (isMultiFile) {

    fs.mkdirSync(path.join(dir,'pages'), {recursive:true})
    fs.mkdirSync(path.join(dir,'public'), {recursive:true})
    for (const f of ['aiplang-runtime.js','aiplang-hydrate.js']) {
      const src=path.join(RUNTIME_DIR,f); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(dir,'public',f))
    }
    const pageBlocks = tplSrc.split('\n---\n')
    pageBlocks.forEach((block, i) => {
      const m = block.match(/^%([a-zA-Z0-9_-]+)/m)
      const pageName = m ? m[1] : (i === 0 ? 'home' : `page${i}`)
      fs.writeFileSync(path.join(dir,'pages',`${pageName}.aip`), block.trim())
    })
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name,version:'0.1.0',scripts:{dev:'npx aiplang serve',build:'npx aiplang build pages/ --out dist/'},devDependencies:{'aiplang':`^${VERSION}`}},null,2))
    fs.writeFileSync(path.join(dir,'.gitignore'),'dist/\nnode_modules/\n')
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    const files = fs.readdirSync(path.join(dir,'pages')).map(f=>f).join(', ')
    console.log(`\n  ✓  Created ${name}/${label}\n\n     pages/{${files}}  ← edit these\n\n  Next:\n     cd ${name} && npx aiplang serve\n`)
  } else {

    fs.mkdirSync(path.join(dir,'pages'), {recursive:true})
    fs.mkdirSync(path.join(dir,'public'), {recursive:true})
    for (const f of ['aiplang-runtime.js','aiplang-hydrate.js']) {
      const src=path.join(RUNTIME_DIR,f); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(dir,'public',f))
    }
    fs.writeFileSync(path.join(dir,'pages','home.aip'), tplSrc)
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name,version:'0.1.0',scripts:{dev:'npx aiplang serve',build:'npx aiplang build pages/ --out dist/'},devDependencies:{'aiplang':`^${VERSION}`}},null,2))
    fs.writeFileSync(path.join(dir,'.gitignore'),'dist/\nnode_modules/\n')
    const label = tplName !== 'default' ? ` (template: ${tplName})` : ''
    console.log(`\n  ✓  Created ${name}/${label}\n\n     pages/home.aip  ← edit this\n\n  Next:\n     cd ${name} && npx aiplang serve\n`)
  }
  process.exit(0)
}

if (cmd==='new') {
  const name=args[0]; if(!name){console.error('\n  ✗  Usage: aiplang new <page>\n');process.exit(1)}
  const dir=fs.existsSync('pages')?'pages':'.'
  const file=path.join(dir,`${name}.aip`)
  if(fs.existsSync(file)){console.error(`\n  ✗  ${file} exists.\n`);process.exit(1)}
  const cap=name.charAt(0).toUpperCase()+name.slice(1)
  fs.writeFileSync(file,`# ${name}\n%${name} dark /${name}\n\nnav{AppName>/home:Home}\nhero{${cap}|Description.>/action:Get started}\nfoot{© ${new Date().getFullYear()} AppName}\n`)
  console.log(`\n  ✓  Created ${file}\n`)
  process.exit(0)
}

// Type system: known field types
const _KNOWN_TYPES = new Set([
  'text','string','varchar','int','integer','float','double','number',
  'bool','boolean','email','url','uri','phone','date','datetime','timestamp',
  'uuid','json','jsonb','enum','file','image','color','slug',
  'bigint','smallint','tinyint','currency','money','price'
])



function _parseForTypes(src) {
  const app = { models:[], apis:[], auth:null }
  const _ta = {
    integer:'int',boolean:'bool',double:'float',number:'float',string:'text',
    varchar:'text',datetime:'timestamp',email:'email',url:'url',uri:'url',
    phone:'phone',currency:'float',money:'float',price:'float',
    json:'json',jsonb:'json',bigint:'int',smallint:'int',tinyint:'int'
  }
  const norm = t => _ta[(t||'').toLowerCase()] || t || 'text'

  function parseField(line) {
    const p = line.split(/\s*:\s*/)
    const f = { name:(p[0]||'').trim(), type:norm(p[1]), modifiers:[], enumVals:[], constraints:{}, default:null }
    if (f.type === 'enum') {
      const ev = p.slice(2).find(x => x && !x.startsWith('default=') && !['required','unique','hashed','pk','auto','index'].includes(x.trim()))
      if (ev) f.enumVals = ev.includes('|') ? ev.split('|').map(v=>v.trim()) : ev.split(',').map(v=>v.trim())
    }
    for (let j=2; j<p.length; j++) {
      const x = (p[j]||'').trim()
      if (!x) continue
      if (x.startsWith('default='))     f.default = x.slice(8)
      else if (x.startsWith('min='))    f.constraints.min = Number(x.slice(4))
      else if (x.startsWith('max='))    f.constraints.max = Number(x.slice(4))
      else if (x.startsWith('minLen=')) f.constraints.minLen = Number(x.slice(7))
      else if (x.startsWith('maxLen=')) f.constraints.maxLen = Number(x.slice(7))
      else if (x.startsWith('enum:'))   f.enumVals = x.slice(5).includes('|') ? x.slice(5).split('|').map(v=>v.trim()) : x.slice(5).split(',').map(v=>v.trim())
      else if (x && !x.includes('='))   f.modifiers.push(x)
    }
    return f
  }

  // Juntar todas as linhas e tokenizar por estado
  const lines = src.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  let inModel=false, inAPI=false, curModel=null, depth=0

  for (let i=0; i<lines.length; i++) {
    const line = lines[i]

    // Auth
    if (line.startsWith('~auth ')) { app.auth = { type: line.includes('jwt') ? 'jwt' : 'basic' }; continue }

    // Model
    if (line.startsWith('model ') || (line.startsWith('model') && line.includes('{'))) {
      if (inModel && curModel) app.models.push(curModel)
      curModel = { name: line.replace(/^model\s+/, '').replace(/\s*\{.*$/, '').trim(), fields:[] }
      inModel=true; inAPI=false; depth=0
      if (line.includes('{')) depth++
      continue
    }

    // API
    if (line.startsWith('api ')) {
      if (inModel && curModel) { app.models.push(curModel); curModel=null; inModel=false }
      const m = line.match(/^api\s+(\w+)\s+(\S+)/)
      if (m) {
        const guards = []
        // Procura guard tanto na linha atual quanto nas próximas linhas do bloco
        const blockLines = []
        let j=i; let bd=0
        while(j<lines.length) {
          const bl = lines[j]
          for(const ch of bl) { if(ch==='{') bd++; else if(ch==='}') bd-- }
          blockLines.push(bl)
          if(bd===0 && j>i) break
          j++
        }
        const blockStr = blockLines.join(' ')
        if (blockStr.includes('~guard auth'))  guards.push('auth')
        if (blockStr.includes('~guard admin')) guards.push('admin')
        if (blockStr.includes('=> auth'))      guards.push('auth')
        if (blockStr.includes('=> admin'))     guards.push('admin')
        app.apis.push({ method:m[1].toUpperCase(), path:m[2], guards })
      }
      inAPI=true; inModel=false
      // Contar profundidade das chaves para saber quando o bloco fecha
      depth=0
      for(const ch of line) { if(ch==='{') depth++; else if(ch==='}') depth-- }
      if(depth<=0) { inAPI=false; depth=0 }
      continue
    }

    // Dentro de api block: rastrear chaves
    if (inAPI) {
      for(const ch of line) { if(ch==='{') depth++; else if(ch==='}') depth-- }
      if(depth<=0) { inAPI=false; depth=0 }
      continue
    }

    // Fechar model
    if (line === '}' && inModel) {
      if (curModel) { app.models.push(curModel); curModel=null }
      inModel=false; continue
    }

    // Campos do model
    if (inModel && curModel && line && line !== '{' && !line.startsWith('~') && line.includes(':')) {
      const f = parseField(line)
      if (f.name) curModel.fields.push(f)
    }
  }
  if (inModel && curModel) app.models.push(curModel)
  return app
}

// ── TypeScript type generator ────────────────────────────────────
// Maps aiplang types to TypeScript equivalents
const _AIP_TO_TS = {
  text:'string', string:'string', email:'string', url:'string',
  phone:'string', slug:'string', color:'string', file:'string', image:'string',
  int:'number', integer:'number', float:'number', double:'number',
  number:'number', currency:'number', money:'number', price:'number',
  bool:'boolean', boolean:'boolean',
  uuid:'string', date:'string', timestamp:'string', datetime:'string',
  json:'Record<string,unknown>', jsonb:'Record<string,unknown>',
}

function generateTypes(app, srcFile) {
  const lines = [
    '// ─────────────────────────────────────────────────────────────',
    `// aiplang generated types — ${srcFile || 'app.aip'}`,
    `// Generated: ${new Date().toISOString()}`,
    '// DO NOT EDIT — regenerate with: npx aiplang types <app.aip>',
    '// ─────────────────────────────────────────────────────────────',
    '',
  ]

  // Model interfaces
  for (const model of (app.models || [])) {
    const name = model.name
    lines.push(`// Model: ${name}`)

    // Enum types first
    for (const f of (model.fields || [])) {
      if (f.type === 'enum' && f.enumVals && f.enumVals.length) {
        lines.push(`export type ${name}${_cap(f.name)} = ${f.enumVals.map(v => `'${v}'`).join(' | ')}`)
      }
    }

    // Main interface
    lines.push(`export interface ${name} {`)
    for (const f of (model.fields || [])) {
      const req   = f.modifiers && f.modifiers.includes('required')
      const pk    = f.modifiers && f.modifiers.includes('pk')
      const auto  = f.modifiers && f.modifiers.includes('auto')
      const opt   = !req || pk || auto
      let tsType
      if (f.type === 'enum' && f.enumVals && f.enumVals.length) {
        tsType = `${name}${_cap(f.name)}`
      } else {
        tsType = _AIP_TO_TS[f.type] || 'string'
      }
      // Constraint comments
      const constraints = []
      if (f.constraints) {
        if (f.constraints.min != null)    constraints.push(`min:${f.constraints.min}`)
        if (f.constraints.max != null)    constraints.push(`max:${f.constraints.max}`)
        if (f.constraints.minLen != null) constraints.push(`minLen:${f.constraints.minLen}`)
        if (f.constraints.maxLen != null) constraints.push(`maxLen:${f.constraints.maxLen}`)
        if (f.constraints.format)         constraints.push(`format:${f.constraints.format}`)
      }
      const comment = constraints.length ? `  // ${constraints.join(', ')}` : ''
      const mods = []
      if (f.modifiers) {
        if (f.modifiers.includes('unique')) mods.push('@unique')
        if (f.modifiers.includes('hashed')) mods.push('@hashed')
        if (pk)   mods.push('@pk')
        if (auto) mods.push('@auto')
      }
      const modStr = mods.length ? ` /** ${mods.join(' ')} */` : ''
      lines.push(`  ${f.name}${opt ? '?' : ''}: ${tsType}${modStr}${comment}`)
    }
    lines.push(`}`)
    lines.push(``)

    // Input type (for POST/PUT — excludes pk/auto, optional for patches)
    const inputFields = (model.fields || []).filter(f =>
      !(f.modifiers && f.modifiers.includes('pk')) &&
      !(f.modifiers && f.modifiers.includes('auto')) &&
      f.name !== 'created_at' && f.name !== 'updated_at'
    )
    if (inputFields.length) {
      lines.push(`export interface ${name}Input {`)
      for (const f of inputFields) {
        const req = f.modifiers && f.modifiers.includes('required')
        let tsType
        if (f.type === 'enum' && f.enumVals && f.enumVals.length) {
          tsType = `${name}${_cap(f.name)}`
        } else {
          tsType = _AIP_TO_TS[f.type] || 'string'
        }
        lines.push(`  ${f.name}${req ? '' : '?'}: ${tsType}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  // API route types
  if ((app.apis || []).length) {
    lines.push(`// ── API Route types ──────────────────────────────────────────`)
    lines.push(``)
    lines.push(`export interface AiplangRoutes {`)
    for (const api of (app.apis || [])) {
      const method = api.method.toUpperCase()
      const path   = api.path.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g,'').replace(/^_/,'')
      const guards = (api.guards || []).join(', ')
      const guardComment = guards ? ` /** guards: ${guards} */` : ''
      lines.push(`  '${method} ${api.path}': {${guardComment}}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  // Convenience type for auth user
  const hasAuth = app.auth && app.auth.type
  if (hasAuth) {
    const userModel = (app.models || []).find(m => m.name === 'User' || m.name === 'user')
    if (userModel) {
      lines.push(`// ── Auth types ───────────────────────────────────────────────`)
      lines.push(`export type AuthUser = Pick<User, 'id' | 'email'${(userModel.fields||[]).some(f=>f.name==='role')?" | 'role'":''}> & { type: 'access' | 'refresh', iat: number, exp: number }`)
      lines.push(`declare global { namespace Express { interface Request { user?: AuthUser } } }`)
      lines.push(``)
    }
  }

  lines.push(`// ── aiplang version ──────────────────────────────────────────`)
  lines.push(`export const AIPLANG_VERSION     = '2.11.9'`)
  lines.push(``)
  return lines.join('\n')
}

function _cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }


function validateAipSrc(source) {
  const errors = []
  const lines = source.split('\n')
  const knownDirs = new Set(['db','auth','env','mail','s3','stripe','plan','admin','realtime','use','plugin','import','store','ssr','interval','mount','theme','guard','validate','unique','hash','check','cache','rateLimit','broadcast','soft-delete','belongs'])
  for (let i=0; i<lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const dm = line.match(/^(guard|validate|unique|hash|check|cache|mount|store|ssr|interval|auth|db|env|use|plugin|import|theme|rateLimit|broadcast)\b/)
    if (dm && !line.startsWith('~') && !line.startsWith('api ') && !line.startsWith('model ') && !line.startsWith('%')) {
      errors.push({ line:i+1, code:line, message:`Missing ~ before '${dm[1]}'`, fix:`~${line}`, severity:'error' })
    }
    if (line.startsWith('api ') && !line.includes('{')) {
      errors.push({ line:i+1, code:line, message:"api block missing '{'", fix:line+' { return {} }', severity:'error' })
    }
    if (/^[a-z_]+\s+-\s+[a-z]/.test(line) && !line.startsWith('api') && !line.startsWith('model')) {
      errors.push({ line:i+1, code:line, message:"Use ':' not '-' in field definitions", fix:line.replace(/\s*-\s*/g,' : '), severity:'error' })
    }
    if (line.startsWith('~')) {
      const dir = line.slice(1).split(/\s/)[0]
      if (!knownDirs.has(dir)) errors.push({ line:i+1, code:line, message:`Unknown directive ~${dir}`, severity:'warning' })
    }
    if (/^table\s*\{/.test(line)) {
      errors.push({ line:i+1, code:line, message:"table missing @binding — e.g.: table @users { Name:name | ... }", severity:'error' })
    }

    // Type check on model fields: field : unknowntype
    if (/^\s{2,}\w+\s*:\s*\w+/.test(lines[i]) && !line.startsWith('api') && !line.startsWith('model') && !line.startsWith('~')) {
      const typePart = line.split(':')[1]?.trim().split(/\s/)[0]?.toLowerCase()
      if (typePart && typePart.length > 1 && !_KNOWN_TYPES.has(typePart) &&
          !['pk','auto','required','unique','hashed','index','asc','desc','fk'].includes(typePart)) {
        errors.push({ line:i+1, code:line,
          message:`Tipo desconhecido: '${typePart}'. Tipos válidos: text, integer, float, bool, email, url, date, datetime, uuid, enum, json`,
          fix: lines[i].replace(typePart, 'text').trim(), severity:'warning' })
      }
    }
  }
  return errors
}

if (cmd==='types'||cmd==='type'||cmd==='dts') {
  const file = args[0]
  if (!file) { console.error('\n  Usage: aiplang types <app.aip> [--out types.d.ts]\n'); process.exit(1) }
  if (!require('fs').existsSync(file)) { console.error(`\n  ✗  Arquivo não encontrado: ${file}\n`); process.exit(1) }
  const src = require('fs').readFileSync(file,'utf8')
  const errs = validateAipSrc(src)
  if (errs.some(e => e.severity === 'error')) {
    console.error('\n  ✗  Corrija os erros antes de gerar tipos:\n')
    errs.filter(e=>e.severity==='error').forEach(e=>console.error(`  Line ${e.line}: ${e.message}`))
    process.exit(1)
  }
  const serverPath = require('path').join(__dirname,'../server/server.js')
  // Parse models and routes from .aip source for type generation
  // Lightweight inline parser — no DB, no server init required
  const app = _parseForTypes(src)
  const _outIdx = args.indexOf('--out')
  const outFile = (_outIdx >= 0 && args[_outIdx+1]) ? args[_outIdx+1] : file.replace(/\.aip$/,'') + '.d.ts'
  const dts = generateTypes(app, require('path').basename(file))
  require('fs').writeFileSync(outFile, dts)
  console.log(`\n  ✅  Tipos gerados: ${outFile}`)
  console.log(`  ${(app.models||[]).length} models · ${(app.apis||[]).length} routes\n`)
  // Also show preview
  const preview = dts.split('\n').slice(0,30).join('\n')
  console.log(preview)
  if (dts.split('\n').length > 30) console.log('  ...')
  process.exit(0)
}

if (cmd==='validate'||cmd==='check'||cmd==='lint') {
  const file = args[0]
  if (!file) { console.error('\n  Usage: aiplang validate <app.aip>\n'); process.exit(1) }
  if (!require('fs').existsSync(file)) { console.error(`\n  ✗  File not found: ${file}\n`); process.exit(1) }
  const src = require('fs').readFileSync(file,'utf8')
  const errs = validateAipSrc(src)
  if (!errs.length) { console.log('\n  ✓  Syntax OK — safe to run\n'); process.exit(0) }
  console.log(`\n  ✗  ${errs.length} issue(s) found in ${file}:\n`)
  errs.forEach(e => {
    const icon = e.severity==='error' ? '✗' : '⚠'
    console.log(`  ${icon}  Line ${e.line}: ${e.message}`)
    console.log(`       ${e.code}`)
    if (e.fix) console.log(`     Fix: ${e.fix}`)
  })
  console.log()
  process.exit(errs.some(e=>e.severity==='error') ? 1 : 0)
}

if (cmd==='context'||cmd==='ctx') {
  const file = args[0] || 'app.aip'
  const exists = require('fs').existsSync
  const src = exists(file) ? require('fs').readFileSync(file,'utf8') : null
  if (!src) { console.log('\n  Usage: aiplang context [app.aip]\n  Dumps minimal AI context (~200 tokens).\n'); process.exit(0) }
  // Use server's parseApp for full app structure
  const serverPath = require('path').join(__dirname,'../server/server.js')
  let app = { models:[], apis:[], pages:[], db:null, auth:null }
  try {
    const srv = require(serverPath)
    if (srv.parseApp) app = srv.parseApp(src)
  } catch {
    // Fallback: basic parse for models + routes
    const modelRx = /^model\s+(\w+)/gm
    const apiRx = /^api\s+(\w+)\s+(\S+)/gm
    let m
    while((m=modelRx.exec(src))) app.models.push({name:m[1],fields:[]})
    while((m=apiRx.exec(src))) app.apis.push({method:m[1],path:m[2],guards:[]})
    const pageRx = /^%(\w+)\s+(\w+)\s+(\S+)/gm
    while((m=pageRx.exec(src))) app.pages.push({id:m[1],theme:m[2],route:m[3],state:{},queries:[]})
  }
  const out = [
    `# aiplang app — ${file}`,
    '# paste into AI for maintenance/customization',
    '',
    '## MODELS'
  ]
  for (const m of app.models||[]) {
    const fields = m.fields.map(f=>`${f.name}:${f.type}${f.modifiers?.length?':'+f.modifiers.join(':'):''}`).join(' ')
    out.push(`model ${m.name} { ${fields} }`)
  }
  out.push('')
  out.push('## ROUTES')
  for (const r of app.apis||[]) {
    const g = r.guards?.length ? ` [${r.guards.join(',')}]` : ''
    const v = r.validate?.length ? ` validate:${r.validate.length}` : ''
    out.push(`${r.method.padEnd(7)}${r.path}${g}${v}`)
  }
  out.push('')
  out.push('## PAGES')
  for (const p of app.pages||[]) {
    const state = Object.keys(p.state||{}).map(k=>`@${k}`).join(' ')
    const queries = (p.queries||[]).map(q=>`${q.trigger}:${q.path}`).join(' ')
    out.push(`%${p.id} ${p.theme||'dark'} ${p.route} | state:${state||'none'} | queries:${queries||'none'}`)
  }
  if (app.db) { out.push(''); out.push(`## CONFIG\ndb:${app.db.driver} auth:${app.auth?'jwt':'none'}`) }
  const ctx = out.join('\n')
  console.log(ctx)
  console.log(`\n# ~${Math.ceil(ctx.length/4)} tokens`)
  process.exit(0)
}

if (cmd==='build') {
  const outIdx=args.indexOf('--out')
  const outDir=outIdx!==-1?args[outIdx+1]:'dist'
  const input=args.filter((a,i)=>!a.startsWith('--')&&i!==outIdx+1)[0]||'pages/'
  const files=[]
  if(fs.existsSync(input)&&fs.statSync(input).isDirectory()){
    fs.readdirSync(input).filter(f=>f.endsWith('.aip')).forEach(f=>files.push(path.join(input,f)))
  } else if(input.endsWith('.aip')&&fs.existsSync(input)){ files.push(input) }
  if(!files.length){console.error(`\n  ✗  No .aip files in: ${input}\n`);process.exit(1)}

  function resolveImports(content, baseDir, seen=new Set()) {
    return content.replace(/^~import\s+["']?([^"'\n]+)["']?$/mg, (_, importPath) => {
      const resolved = path.resolve(baseDir, importPath.trim())
      if (seen.has(resolved)) return '' // circular import protection
      try {
        seen.add(resolved)
        const imported = fs.readFileSync(resolved, 'utf8')
        return resolveImports(imported, path.dirname(resolved), seen)
      } catch { return `# ~import failed: ${importPath}` }
    })
  }
  const src=files.map(f=>resolveImports(fs.readFileSync(f,'utf8'), path.dirname(f))).join('\n---\n')
  const pages=parsePages(src)
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
  if(fs.existsSync('public'))fs.readdirSync('public').filter(f=>!f.endsWith('.aip')).forEach(f=>fs.copyFileSync(path.join('public',f),path.join(outDir,f)))
  console.log(`\n  ${pages.length} page(s) — ${hSize(total)} total\n\n  Preview: npx serve ${outDir}\n  Deploy:  Vercel, Netlify, S3, any static host\n`)
  process.exit(0)
}

if (cmd==='serve'||cmd==='dev') {
  const root=path.resolve(args[0]||'.')
  const port=parseInt(process.env.PORT||'3000')
  const MIME={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.aip':'text/plain','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'}
  let clients=[]
  const mtimes={}
  setInterval(()=>{
    const pd=path.join(root,'pages')
    if(!fs.existsSync(pd))return
    fs.readdirSync(pd).filter(f=>f.endsWith('.aip')).forEach(f=>{
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
    if(!fp&&p.endsWith('.aip')){const c=path.join(root,'pages',path.basename(p));if(fs.existsSync(c))fp=c}
    if(!fp){res.writeHead(404);res.end('Not found');return}
    let content=fs.readFileSync(fp)
    if(path.extname(fp)==='.html'){
      const inject=`\n<script>const __es=new EventSource('/__aiplang_reload');__es.onmessage=e=>{if(e.data==='reload')location.reload()}</script>`
      content=content.toString().replace('</body>',inject+'</body>')
    }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Access-Control-Allow-Origin':'*'})
    res.end(content)
  }).listen(port,()=>console.log(`\n  ✓  aiplang dev server\n\n  →  http://localhost:${port}\n\n  Hot reload ON — edit .aip files and browser refreshes.\n  Ctrl+C to stop.\n`))
  return
}

if (cmd === 'start' || cmd === 'run') {
  const aipFile = args[0]
  if (!aipFile || !fs.existsSync(aipFile)) {
    console.error(`\n  ✗  Usage: aiplang start <app.aip>\n`)
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

function parsePages(src) {
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

  let extraClass=null, animate=null
  const _cm=line.match(/\bclass:(\S+)/)
  if(_cm){extraClass=_cm[1];line=line.replace(_cm[0],'').trim()}
  const _am=line.match(/\banimate:(\S+)/)
  if(_am){animate=_am[1];line=line.replace(_am[0],'').trim()}
  let variant=null
  const _vm=line.match(/\bvariant:(\S+)/)
  if(_vm){variant=_vm[1];line=line.replace(_vm[0],'').trim()}
  let style=null
  const _sm=line.match(/\bstyle:\{([^}]+)\}/)
  if(_sm){style=_sm[1];line=line.replace(_sm[0],'').trim()}
  let bg=null
  const _bgm=line.match(/\bbg:(#[0-9a-fA-F]+|[a-z]+)/)
  if(_bgm){bg=_bgm[1];line=line.replace(_bgm[0],'').trim()}

  if(line.startsWith('raw{')) {
    return{kind:'raw',html:line.slice(4,line.lastIndexOf('}')),extraClass,animate}
  }

  if(line.startsWith('table ') || line.startsWith('table{')) {
    const idx=line.indexOf('{');if(idx===-1) return null
    const start=line.startsWith('table{')?6:6
    const binding=line.slice(start,idx).trim().replace(/^@/,'@')
    const content=line.slice(idx+1,line.lastIndexOf('}')).trim()
    const em=content.match(/edit\s+(PUT|PATCH)\s+(\S+)/), dm=content.match(/delete\s+(?:DELETE\s+)?(\S+)/)
    const fallbackM=content.match(/fallback\s*:\s*([^|]+)/)
    const retryM=content.match(/retry\s*:\s*(\S+)/)
    const clean=content
      .replace(/edit\s+(PUT|PATCH)\s+\S+/g,'')
      .replace(/delete\s+(?:DELETE\s+)?\S+/g,'')
      .replace(/fallback\s*:[^|]+/g,'')
      .replace(/retry\s*:\s*\S+/g,'')
    const cols=parseCols(clean)
    return{kind:'table',binding,cols:Array.isArray(cols)?cols:[],empty:parseEmpty(clean),editPath:em?.[2]||null,editMethod:em?.[1]||'PUT',deletePath:dm?.[1]||null,deleteKey:'id',fallback:fallbackM?.[1]?.trim()||null,retry:retryM?.[1]||null,extraClass,animate,variant,style,bg}
  }

  if(line.startsWith('form ') || line.startsWith('form{')) {
    const bi=line.indexOf('{');if(bi===-1) return null
    let head=line.slice(line.startsWith('form{')?4:5,bi).trim()
    const content=line.slice(bi+1,line.lastIndexOf('}')).trim()
    let action='', optimistic=false; const ai=head.indexOf('=>')
    if(ai!==-1){
      action=head.slice(ai+2).trim()

      if(action.includes('.optimistic(')){optimistic=true;action=action.replace('.optimistic','')}
      head=head.slice(0,ai).trim()
    }
    const parts=head.trim().split(/\s+/)
    const method=parts[0]&&['GET','POST','PUT','PATCH','DELETE'].includes(parts[0].toUpperCase())?parts[0].toUpperCase():'POST'
    const bpath=parts[method===parts[0].toUpperCase()?1:0]||''
    return{kind:'form',method,bpath,action,optimistic,fields:parseFields(content)||[],extraClass,animate,variant,style,bg}
  }

  if(line.startsWith('pricing{')) {
    const body=line.slice(8,line.lastIndexOf('}')).trim()
    const plans=body.split('|').map(p=>{
      const pts=p.trim().split('>').map(x=>x.trim())
      return{name:pts[0],price:pts[1],desc:pts[2],linkRaw:pts[3]}
    }).filter(p=>p.name)
    return{kind:'pricing',plans,extraClass,animate,variant,style,bg}
  }

  if(line.startsWith('code{'))      { const m=line.match(/^code\{([^}]*)\}/);if(m){const pts=m[1].split('|');const vm=line.match(/variant:(\S+)/);const am=line.match(/animate:(\S+)/);return{kind:'code',lang:pts[0]?.trim()||'aip',lines:pts.slice(1).map(l=>l.trim()),variant:vm?.[1],animate:am?.[1]}} }
  if(line.startsWith('benchmark{')) { const m=line.match(/^benchmark\{([^}]*)\}/);if(m){const vm=line.match(/variant:(\S+)/);const am=line.match(/animate:(\S+)/);return{kind:'benchmark',items:m[1].split('|').map(it=>{const p=it.trim().split(':');return{num:p[0]?.trim(),label:p[1]?.trim(),vs:p[2]?.trim(),pct:parseInt(p[3])||0}}),variant:vm?.[1],animate:am?.[1]}} }
  if(line.startsWith('install{'))   { const m=line.match(/^install\{([^}]*)\}/);if(m){const vm=line.match(/variant:(\S+)/);return{kind:'install',cmds:m[1].split('|').map(c=>c.trim()).filter(Boolean),variant:vm?.[1]}} }
  if(line.startsWith('feature{'))   { const b=parseBlock(line.replace(/^feature/,'row3'));if(b){b.variant='feature'};return b }
  if(line.startsWith('marquee{'))   { const m=line.match(/^marquee\{([^}]*)\}/);if(m){const vm=line.match(/variant:(\S+)/);return{kind:'marquee',items:m[1].split('|').map(s=>s.trim()).filter(Boolean),variant:vm?.[1]}} }
  if(line.startsWith('cta{'))        { const m=line.match(/^cta\{([^}]*)\}/);if(m){const pts=m[1].split('|');let t='',s='',links=[];pts.forEach(p=>{const lm=p.match(/^([^>]+)>([^>]+)$/);if(lm)links.push({label:lm[1].trim(),path:lm[2].trim()});else if(!t)t=p.trim();else s=p.trim()});const vm=line.match(/variant:(\S+)/);return{kind:'cta',title:t,sub:s,links,variant:vm?.[1]}} }
  if(line.startsWith('steps{'))      { const m=line.match(/^steps\{([^}]*)\}/);if(m){const vm=line.match(/variant:(\S+)/);return{kind:'steps',items:m[1].split('|').map(it=>{const p=it.trim().split('>');return{num:p[0]?.trim(),title:p[1]?.trim(),desc:p[2]?.trim()}}),variant:vm?.[1]}} }
  if(line.startsWith('compare{'))    { const m=line.match(/^compare\{([^}]*)\}/);if(m){const vm=line.match(/variant:(\S+)/);return{kind:'compare',rows:m[1].split('|').map(r=>r.trim().split(':').map(c=>c.trim())),variant:vm?.[1]}} }
  if(line.startsWith('video{'))      { const m=line.match(/^video\{([^}]*)\}/);if(m){const pts=m[1].split('|');return{kind:'video',url:pts[0]?.trim(),poster:pts[1]?.trim()}} }
  if(line.startsWith('faq{')) {
    const body=line.slice(4,line.lastIndexOf('}')).trim()
    const items=body.split('|').map(i=>{const idx=i.indexOf('>');return{q:i.slice(0,idx).trim(),a:i.slice(idx+1).trim()}}).filter(i=>i.q&&i.a)
    return{kind:'faq',items,extraClass,animate}
  }

  if(line.startsWith('testimonial{')) {
    const body=line.slice(12,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const imgPart=parts.find(p=>p.startsWith('img:'))
    return{kind:'testimonial',author:parts[0],quote:parts[1]?.replace(/^"|"$/g,''),img:imgPart?.slice(4)||null,extraClass,animate}
  }

  if(line.startsWith('gallery{')) {
    return{kind:'gallery',imgs:line.slice(8,line.lastIndexOf('}')).trim().split('|').map(x=>x.trim()).filter(Boolean),extraClass,animate}
  }

  if(line.startsWith('btn{')) {
    const parts=line.slice(4,line.lastIndexOf('}')).split('>').map(p=>p.trim())
    const label=parts[0]||'Click', method=parts[1]?.split(' ')[0]||'POST'
    const bpath=parts[1]?.split(' ').slice(1).join(' ')||'#'
    const confirm=parts.find(p=>p.startsWith('confirm:'))?.slice(8)||null
    const action=parts.find(p=>!p.startsWith('confirm:')&&p!==parts[0]&&p!==parts[1])||''
    return{kind:'btn',label,method,bpath,action,confirm,extraClass,animate}
  }

  if(line.startsWith('card{') || line.startsWith('card ')) {
    const bi=line.indexOf('{'); if(bi===-1) return null
    const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const imgPart=parts.find(p=>p.startsWith('img:'))
    const linkPart=parts.find(p=>p.startsWith('/'))
    const title=parts.find(p=>!p.startsWith('img:')&&!p.startsWith('/')&&!p.startsWith('@')&&!p.startsWith('#'))||''
    const subtitle=parts.filter(p=>!p.startsWith('img:')&&!p.startsWith('/')&&!p.startsWith('@')&&!p.startsWith('#'))[1]||''
    const badge=parts.find(p=>p.startsWith('#'))?.slice(1)||null
    const bind=parts.find(p=>p.startsWith('@'))||null
    return{kind:'card',title,subtitle,img:imgPart?.slice(4)||null,link:linkPart||null,badge,bind,extraClass,animate,variant,style,bg}
  }

  if(line.startsWith('cols{') || (line.startsWith('cols ') && line.includes('{'))) {
    const bi=line.indexOf('{'); if(bi===-1) return null
    const head=line.slice(0,bi).trim()
    const m=head.match(/cols(\d+)/)
    const n=m?parseInt(m[1]):2
    const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
    const items=body.split('||').map(col=>col.trim()).filter(Boolean)
    return{kind:'cols',n,items,extraClass,animate,variant,style,bg}
  }

  if(line.startsWith('divider') || line.startsWith('hr{')) {
    const label=line.match(/\{([^}]*)\}/)?.[1]?.trim()||null
    return{kind:'divider',label,extraClass,animate,variant,style}
  }

  if(line.startsWith('badge{') || line.startsWith('tag{')) {
    const content=line.slice(line.indexOf('{')+1,line.lastIndexOf('}')).trim()
    return{kind:'badge',content,extraClass,animate,variant,style}
  }

  if(line.startsWith('select ')) {
    const bi=line.indexOf('{')
    const varName=bi!==-1?line.slice(7,bi).trim():line.slice(7).trim()
    const body=bi!==-1?line.slice(bi+1,line.lastIndexOf('}')).trim():''
    return{kind:'select',binding:varName,options:body.split('|').map(o=>o.trim()).filter(Boolean),extraClass,animate}
  }

  if(line.startsWith('if ')) {
    const bi=line.indexOf('{');if(bi===-1) return null
    return{kind:'if',cond:line.slice(3,bi).trim(),inner:line.slice(bi+1,line.lastIndexOf('}')).trim(),extraClass,animate}
  }

  if(line.startsWith('chart{') || line.startsWith('chart ')) {
    const bi=line.indexOf('{'); if(bi===-1) return null
    const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const type=parts.find(p=>['bar','line','pie','area','donut'].includes(p))||'bar'
    const binding=parts.find(p=>p.startsWith('@'))||''
    const labels=parts.find(p=>p.startsWith('x:'))?.slice(2)||'label'
    const values=parts.find(p=>p.startsWith('y:'))?.slice(2)||'value'
    const title=parts.find(p=>!p.startsWith('@')&&!['bar','line','pie','area','donut'].includes(p)&&!p.startsWith('x:')&&!p.startsWith('y:'))||''
    return{kind:'chart',type,binding,labels,values,title,extraClass,animate,variant,style}
  }

  if(line.startsWith('kanban{') || line.startsWith('kanban ')) {
    const bi=line.indexOf('{'); if(bi===-1) return null
    const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const binding=parts.find(p=>p.startsWith('@'))||''
    const cols=parts.filter(p=>!p.startsWith('@')&&!p.startsWith('status:'))
    const statusField=parts.find(p=>p.startsWith('status:'))?.slice(7)||'status'
    const updatePath=parts.find(p=>p.startsWith('PUT ')||p.startsWith('PATCH '))||''
    return{kind:'kanban',binding,cols,statusField,updatePath,extraClass,animate,style}
  }

  if(line.startsWith('editor{') || line.startsWith('editor ')) {
    const bi=line.indexOf('{'); if(bi===-1) return null
    const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
    const parts=body.split('|').map(x=>x.trim())
    const name=parts[0]||'content'
    const placeholder=parts[1]||'Start writing...'
    const submitPath=parts.find(p=>p.startsWith('POST ')||p.startsWith('PUT '))||''
    return{kind:'editor',name,placeholder,submitPath,extraClass,animate,style}
  }

  if(line.startsWith('each ')) {
    const bi=line.indexOf('{');if(bi===-1) return null
    const binding=line.slice(5,bi).trim()
    const tpl=line.slice(bi+1,line.lastIndexOf('}')).trim()
    return{kind:'each',binding,tpl,extraClass,animate,variant}
  }

  if(line.startsWith('spacer{') || line.startsWith('spacer ')) {
    const h=line.match(/[{\s](\S+)[}]?/)?.[1]||'3rem'
    return{kind:'spacer',height:h,extraClass,animate}
  }

  if(line.startsWith('html{')) {
    return{kind:'html',content:line.slice(5,line.lastIndexOf('}')),extraClass,animate}
  }

  const bi=line.indexOf('{');if(bi===-1) return null
  const head=line.slice(0,bi).trim()
  const body=line.slice(bi+1,line.lastIndexOf('}')).trim()
  const m=head.match(/^([a-z]+)(\d+)$/)
  return{kind:m?m[1]:head,cols:m?parseInt(m[2]):3,items:parseItems(body),extraClass,animate,variant,style,bg}
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

function applyMods(html, b) {
  if(!html||(!b.extraClass&&!b.animate)) return html
  const cls=[(b.extraClass||''),(b.animate?'fx-anim-'+b.animate:'')].filter(Boolean).join(' ')

  return html.replace(/class="([^"]*)"/, (_,c)=>`class="${c} ${cls}"`)
}

function renderPage(page, allPages) {
  const needsJS=page.queries.length>0||page.blocks.some(b=>['table','list','form','if','btn','select','faq'].includes(b.kind))
  const body=page.blocks.map(b=>{try{return applyMods(renderBlock(b,page),b)}catch(e){console.error('[aiplang] Block render error:',b.kind,e.message);return ''}}).join('')

  const tableBlocks = page.blocks.filter(b => b.kind === 'table' && b.binding && b.cols && b.cols.length)
  const numericKeys = ['score','count','total','amount','price','value','qty','age','rank','num','int','float','rate','pct','percent']
  const compiledDiffs = tableBlocks.map(b => {
    const binding = b.binding.replace(/^@/, '')

    const safeId = s => (s||'').replace(/[^a-zA-Z0-9_]/g, '_').slice(0,64) || 'col'
    const safeBinding = safeId(binding)
    const colDefs = b.cols.map((col, j) => ({
      key: safeId(col.key),
      origKey: col.key,
      idx: j,
      numeric: numericKeys.some(kw => col.key.toLowerCase().includes(kw))
    }))
    const initParts = colDefs.map(d =>
      d.numeric ? `c${d.idx}:new Float64Array(rows.map(r=>+(r.${JSON.stringify(d.origKey)}===undefined?r['${d.origKey}']:r[${JSON.stringify(d.origKey)}])||0))`
                : `c${d.idx}:rows.map(r=>r[${JSON.stringify(d.origKey)}]??'')`
    ).join(',')
    const diffParts = colDefs.map(d => {
      const k = JSON.stringify(d.origKey)
      return d.numeric
        ? `if(c${d.idx}[i]!==(r[${k}]||0)){c${d.idx}[i]=r[${k}]||0;p.push(i<<4|${d.idx})}`
        : `if(c${d.idx}[i]!==r[${k}]){c${d.idx}[i]=r[${k}];p.push(i<<4|${d.idx})}`
    }).join(';')
    return [
      `window.__aip_init_${safeBinding}=function(rows){return{${initParts}}};`,
      `window.__aip_diff_${safeBinding}=function(rows,cache){`,
      `const n=rows.length,p=[],${colDefs.map(d=>`c${d.idx}=cache.c${d.idx}`).join(',')};`,
      `for(let i=0;i<n;i++){const r=rows[i];${diffParts}}return p};`
    ].join('')
  }).join('\n')
  const compiledScript = compiledDiffs.length
    ? `<script>/* aiplang compiled-diffs */\n${compiledDiffs}\n</script>`
    : ''
  const config=needsJS?JSON.stringify({id:page.id,theme:page.theme,routes:allPages.map(p=>p.route),state:page.state,queries:page.queries,stores:page.stores||[],computed:page.computed||{},compiledTables:tableBlocks.map(b=>(b.binding||'').replace(/^@/,'').replace(/[^a-zA-Z0-9_]/g,'_').slice(0,64))}):''
  const hydrate=needsJS?`\n<script>window.__AIPLANG_PAGE__=${config};</script>\n<script src="./aiplang-hydrate.js" defer></script>`:''
  const customVars=page.customTheme?genCustomThemeVars(page.customTheme):''
  const themeVarCSS=page.themeVars?genThemeVarCSS(page.themeVars):''

  const _navBlock = page.blocks.find(b=>b.kind==='nav')
  const _brand = _navBlock?.brand || ''
  const _title = _brand ? `${esc(_brand)} — ${esc(page.id.charAt(0).toUpperCase()+page.id.slice(1))}` : esc(page.id.charAt(0).toUpperCase()+page.id.slice(1))
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${_title}</title>
<link rel="canonical" href="${esc(page.route)}">
<meta name="robots" content="index,follow">
<meta name="description" content="${esc((()=>{const h=page.blocks.find(b=>b.kind==='hero');if(!h)return '';const m=h.rawLine&&h.rawLine.match(/\{([^}]+)\}/);if(!m)return '';const p=m[1].split('>');const s=p[0].split('|')[1];return s?s.trim():''})())}">
<meta property="og:title" content="${_title}">
<meta property="og:type" content="website">
<meta property="og:type" content="website">
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
    case 'code':        return rCode(b)
    case 'benchmark':   return rBenchmark(b)
    case 'install':     return rInstall(b)
    case 'feature':     return rRow(b)
    case 'testimonial': return rTestimonial(b)
    case 'marquee':     return rMarquee(b)
    case 'cta':         return rCta(b)
    case 'steps':       return rSteps(b)
    case 'compare':     return rCompare(b)
    case 'video':       return rVideo(b)
    case 'gallery':     return rGallery(b)
    case 'raw':         return (b.html||'')+'\n'
    case 'html':        return `<div class="fx-html">${b.content||''}</div>\n`
    case 'spacer':      return `<div class="fx-spacer" style="height:${esc(b.height||'2rem')}"></div>\n`
    case 'divider':     return b.label?`<div class="fx-divider"><span class="fx-divider-label">${esc(b.label)}</span></div>\n`:`<hr class="fx-hr">\n`
    case 'badge':       return `<div class="fx-badge-row"><span class="fx-badge-tag">${esc(b.content||'')}</span></div>\n`
    case 'card':        return rCardBlock(b)
    case 'cols':        return rColsBlock(b)
    case 'chart':       return rChart(b)
    case 'kanban':      return rKanban(b)
    case 'editor':      return rEditor(b)
    case 'each':        return `<div class="fx-each fx-each-${b.variant||'list'}" data-fx-each="${esc(b.binding||'')}" data-fx-tpl="${esc(b.tpl||'')}"${b.style?` style="${b.style.replace(/,/g,';')}"`:''}>\n<div class="fx-each-empty fx-td-empty">Loading...</div></div>\n`
    case 'if':          return `<div class="fx-if-wrap" data-fx-if="${esc(b.cond)}" style="display:none"></div>\n`
    default: return ''
  }
}

function rChart(b) {
  const id = 'chart_' + Math.random().toString(36).slice(2,8)
  const binding = b.binding || ''
  const style = b.style ? ` style="${b.style.replace(/,/g,';')}"` : ''
  return `<div class="fx-chart-wrap"${style}>
  ${b.title ? `<div class="fx-chart-title">${esc(b.title)}</div>` : ''}
  <canvas id="${id}" class="fx-chart" data-fx-chart="${esc(binding)}" data-chart-type="${esc(b.type||'bar')}" data-chart-labels="${esc(b.labels||'label')}" data-chart-values="${esc(b.values||'value')}"></canvas>
</div>\n`
}

function rKanban(b) {
  const cols = (b.cols||['Todo','In Progress','Done'])
  const colsHtml = cols.map(col => `
    <div class="fx-kanban-col" data-col="${esc(col)}">
      <div class="fx-kanban-col-title">${esc(col)}</div>
      <div class="fx-kanban-cards" data-status="${esc(col)}"></div>
    </div>`).join('')
  const style = b.style ? ` style="${b.style.replace(/,/g,';')}"` : ''
  return `<div class="fx-kanban" data-fx-kanban="${esc(b.binding||'')}" data-status-field="${esc(b.statusField||'status')}" data-update-path="${esc(b.updatePath||'')}"${style}>${colsHtml}</div>\n`
}

function rEditor(b) {
  const style = b.style ? ` style="${b.style.replace(/,/g,';')}"` : ''
  return `<div class="fx-editor-wrap"${style}>
  <div class="fx-editor-toolbar">
    <button type="button" onclick="document.execCommand('bold')" class="fx-editor-btn" title="Bold"><b>B</b></button>
    <button type="button" onclick="document.execCommand('italic')" class="fx-editor-btn" title="Italic"><i>I</i></button>
    <button type="button" onclick="document.execCommand('underline')" class="fx-editor-btn" title="Underline"><u>U</u></button>
    <button type="button" onclick="document.execCommand('insertUnorderedList')" class="fx-editor-btn" title="List">≡</button>
    <button type="button" onclick="document.execCommand('createLink',false,prompt('URL:'))" class="fx-editor-btn" title="Link">🔗</button>
    ${b.submitPath ? `<button type="button" class="fx-editor-save fx-btn" data-editor-save="${esc(b.submitPath)}" data-editor-field="${esc(b.name||'content')}">Save</button>` : ''}
  </div>
  <div class="fx-editor" contenteditable="true" data-fx-editor="${esc(b.name||'content')}" placeholder="${esc(b.placeholder||'Start writing...')}"></div>
  <input type="hidden" name="${esc(b.name||'content')}" class="fx-editor-hidden">
</div>\n`
}

function rCardBlock(b) {
  const img=b.img?`<img src="${esc(b.img)}" class="fx-card-img" alt="${esc(b.title||'')}" loading="lazy">`:'';
  const badge=b.badge?`<span class="fx-card-badge">${esc(b.badge)}</span>`:'';
  const title=b.title?`<h3 class="fx-card-title">${esc(b.title)}</h3>`:'';
  const sub=b.subtitle?`<p class="fx-card-body">${esc(b.subtitle)}</p>`:'';
  const link=b.link?`<a href="${esc(b.link.split(':')[0])}" class="fx-card-link">${esc(b.link.split(':')[1]||'View')} →</a>`:'';
  const bg=b.bg?` style="background:${b.bg}"`:b.style?` style="${b.style.replace(/,/g,';')}"`:''
  return`<div class="fx-card"${bg}>${img}${badge}${title}${sub}${link}</div>\n`
}
function rColsBlock(b) {
  const cols=(b.items||[]).map(col=>`<div class="fx-col">${col}</div>`).join('')
  const style=b.style?` style="${b.style.replace(/,/g,';')}"`:''
  return`<div class="fx-cols fx-cols-${b.n||2}"${style}>${cols}</div>\n`
}

function rNav(b) {
  if(!b.items?.[0]) return ''
  const it=b.items[0]
  const brand=!it[0]?.isLink?`<span class="fx-brand">${esc(it[0].text)}</span>`:''
  const start=!it[0]?.isLink?1:0
  const links=it.slice(start).filter(f=>f.isLink).map(f=>`<a href="${esc(f.path)}" class="fx-nav-link">${esc(f.label)}</a>`).join('')
  return `<nav class="fx-nav">${brand}<button class="fx-hamburger" onclick="this.classList.toggle('open');document.querySelector('.fx-nav-links').classList.toggle('open')" aria-label="Menu"><span></span><span></span><span></span></button><div class="fx-nav-links">${links}</div></nav>\n`
}



// ── Parser: code{lang|linha1|linha2} ─────────────────────────────
function parseCode(line) {
  const m = line.match(/^code\{([^}]*)\}/)
  if (!m) return null
  const parts = m[1].split('|')
  const lang = parts[0]?.trim() || 'aip'
  const lines = parts.slice(1).map(l => l.trim())
  const b = parseBlockMeta(line)
  return { ...b, kind:'code', lang, lines }
}

// ── Parser: benchmark{Num:Label:vs texto|...} ─────────────────────
function parseBenchmark(line) {
  const m = line.match(/^benchmark\{([^}]*)\}/)
  if (!m) return null
  const items = m[1].split('|').map(item => {
    const parts = item.trim().split(':')
    return { num: parts[0]?.trim(), label: parts[1]?.trim(), vs: parts[2]?.trim(), pct: parts[3]?.trim() }
  })
  const b = parseBlockMeta(line)
  return { ...b, kind:'benchmark', items }
}

// ── Parser: install{cmd1|cmd2|...} ───────────────────────────────
function parseInstall(line) {
  const m = line.match(/^install\{([^}]*)\}/)
  if (!m) return null
  const cmds = m[1].split('|').map(c => c.trim()).filter(Boolean)
  const b = parseBlockMeta(line)
  return { ...b, kind:'install', cmds }
}

// ── Parser: feature{emoji>Título>Desc | ...} (alias row3 otimizado)
function parseFeature(line) {
  // Converte feature{} em row{} com cols=3 e variant=feature
  const inner = line.replace(/^feature/, 'row3')
  const b = parseRow(inner)
  if (b) b.variant = 'feature'
  return b
}

function rHero(b) {
  let h1='',sub='',img='',ctas=''
  let heroBadge = ''
  for(const item of (b.items||[])) for(const f of item){
    if(f.text?.startsWith('badge:')) { heroBadge=`<div class="fx-hero-badge"><span class="fx-hero-badge-dot"></span>${esc(f.text.slice(6).trim())}</div>`; continue }
    if(f.isImg) img=`<img src="${esc(f.src)}" class="fx-hero-img" alt="hero" loading="eager">`
    else if(f.isLink) ctas+=`<a href="${esc(f.path)}" class="fx-cta">${esc(f.label)}</a>`
    else if(!h1) {
      // *texto* entre asteriscos = gradient text
      const gt = f.text.match(/^\*(.*?)\*$/)
      if(gt) h1=`<h1 class="fx-title"><span class="fx-gradient-text">${esc(gt[1])}</span></h1>`
      else h1=`<h1 class="fx-title">${esc(f.text)}</h1>`
    }
    else sub+=`<p class="fx-sub">${esc(f.text)}</p>`
  }
  const v = b.variant || (img ? 'split' : 'centered')
  const bgStyle = b.bg ? ` style="background:${b.bg}"` : b.style ? ` style="${b.style.replace(/,/g,';')}"` : ''
  const inlineStyle = b.style && !b.bg ? ` style="${b.style.replace(/,/g,';')}"` : ''
  if (v === 'landing') {
    return `<section class="fx-hero fx-hero-landing"${bgStyle}><div class="fx-hero-grid"></div><div class="fx-hero-inner">${h1}${sub}${ctas}</div></section>
`
  }
  if (h1) h1 = heroBadge + h1
  if (v === 'minimal') {
    return `<section class="fx-hero fx-hero-minimal"${bgStyle}><div class="fx-hero-inner">${h1}${sub}${ctas}</div></section>\n`
  }
  if (v === 'tall') {
    return `<section class="fx-hero fx-hero-tall"${bgStyle}><div class="fx-hero-inner">${h1}${sub}${ctas}</div>${img}</section>\n`
  }
  if (v === 'left') {
    return `<section class="fx-hero fx-hero-left"${bgStyle}><div class="fx-hero-inner fx-hero-left-inner">${h1}${sub}${ctas}</div>${img}</section>\n`
  }
  if (v === 'dark-cta') {
    return `<section class="fx-hero fx-hero-dark-cta"${bgStyle}><div class="fx-hero-inner">${h1}${sub}<div class="fx-hero-ctas-dark">${ctas}</div></div></section>\n`
  }
  if (img) {
    return `<section class="fx-hero fx-hero-split"${bgStyle}><div class="fx-hero-inner">${h1}${sub}${ctas}</div>${img}</section>\n`
  }
  return `<section class="fx-hero"${bgStyle}><div class="fx-hero-inner">${h1}${sub}${ctas}</div></section>\n`
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
  const ACCENT_COLORS = {
    red:'#f43f5e',orange:'#fb923c',yellow:'#fbbf24',green:'#22c55e',
    teal:'#14b8a6',blue:'#3b82f6',indigo:'#6366f1',purple:'#a855f7',
    pink:'#ec4899',cyan:'#06b6d4',lime:'#84cc16',amber:'#f59e0b'
  }
  const cards=(b.items||[]).map(item=>{

    let colorStyle='', firstIdx=0
    if(item[0]&&!item[0].isImg&&!item[0].isLink){
      const colorKey=item[0].text?.toLowerCase()
      if(ACCENT_COLORS[colorKey]){
        colorStyle=` style="--card-accent:${ACCENT_COLORS[colorKey]};border-top:2px solid ${ACCENT_COLORS[colorKey]}"`
        firstIdx=1
      }
    }
    const inner=item.slice(firstIdx).map((f,fi)=>{
      if(f.isImg) return`<img src="${esc(f.src)}" class="fx-card-img" alt="" loading="lazy">`
      if(f.isLink) return`<a href="${esc(f.path)}" class="fx-card-link">${esc(f.label)} →</a>`
      if(fi===0) return`<div class="fx-icon" style="${ACCENT_COLORS[f.text?.toLowerCase()]?'color:var(--card-accent)':''}">${ic(f.text)}</div>`
      if(fi===1) return`<h3 class="fx-card-title">${esc(f.text)}</h3>`
      return`<p class="fx-card-body">${esc(f.text)}</p>`
    }).join('')
    const bgStyle=b.bg?` style="background:${b.bg}"`:(b.variant==='bordered'?` style="border:1px solid var(--accent,#2563eb)22"`:colorStyle)
    return`<div class="fx-card"${bgStyle}>${inner}</div>`
  }).join('')
  const v=b.variant||''
  const wrapStyle=b.style?` style="${b.style.replace(/,/g,';')}"`:''
  return `<div class="fx-grid fx-grid-${b.cols||3}${v?' fx-grid-'+v:''} fx-animate-stagger"${wrapStyle}>${cards}</div>\n`
}

function rSect(b) {
  let inner=''
  const items = b.items || []
  items.forEach((item,ii)=>(item||[]).forEach(f=>{
    if(f.isLink) inner+=`<a href="${esc(f.path)}" class="fx-sect-link">${esc(f.label)}</a>`
    else if(ii===0) inner+=`<h2 class="fx-sect-title">${esc(f.text)}</h2>`
    else inner+=`<p class="fx-sect-body">${esc(f.text)}</p>`
  }))
  const bgStyle=b.bg?` style="background:${b.bg}"`:(b.style?` style="${b.style.replace(/,/g,';')}"`:'' )
  const v = b.variant||''
  const cls = v ? ` fx-sect-${v}` : ''
  return `<section class="fx-sect${cls} fx-animate"${bgStyle}>${inner}</section>\n`
}


// ── rCode: code window com syntax highlight ───────────────────────
function rCode(b) {
  const lang = b.lang || 'aip'
  const id = 'code_' + Math.random().toString(36).slice(2,7)
  const highlighted = (b.lines||[]).map(line => {
    let l = esc(line)
    if(lang==='aip'||lang==='aiplang') {
      l = l.replace(/^(~\w+)/g,'<span class="fx-kw">$1</span>')
      l = l.replace(/\$([\w.]+)/g,'<span class="fx-nb">$$$1</span>')
      l = l.replace(/(\{[^}]*\})/g,'<span class="fx-op">$1</span>')
      l = l.replace(/(#[\w-]+(?:\.\w+)*)/g,'<span class="fx-comment">$1</span>')
    } else if(lang==='bash'||lang==='sh') {
      l = l.replace(/^(\$ )/,'<span class="fx-kw">$1</span>')
      l = l.replace(/(#.*$)/,'<span class="fx-comment">$1</span>')
      l = l.replace(/(npx aiplang \w+)/g,'<span class="fx-fn">$1</span>')
    } else if(lang==='js'||lang==='ts') {
      l = l.replace(/\b(const|let|var|function|async|await|return|import|from|export|if|else|for)\b/g,'<span class="fx-kw">$1</span>')
      l = l.replace(/(\/\/.*$)/,'<span class="fx-comment">$1</span>')
      l = l.replace(/(['"`][^'"`]*['"`])/g,'<span class="fx-st">$1</span>')
    }
    return `<div class="fx-code-line">${l}</div>`
  }).join('')
  const copyBtn = `<button class="fx-code-copy" onclick="(function(b){navigator.clipboard&&navigator.clipboard.writeText(b.querySelectorAll('.fx-code-line').length?Array.from(b.querySelectorAll('.fx-code-line')).map(l=>l.innerText).join('\\n'):'');var t=b.querySelector('.fx-code-copy');t&&(t.textContent='copiado!',setTimeout(()=>t.textContent='copiar',1500))})(this.closest('.fx-code-window'))">copiar</button>`
  return `<div class="fx-code-window"><div class="fx-code-bar"><div class="fx-dots"><span></span><span></span><span></span></div><span class="fx-code-lang">${esc(lang)}</span>${copyBtn}</div><div class="fx-code-body" id="${id}">${highlighted}</div></div>\n`
}

// ── rBenchmark: cards de benchmark com número + barra ─────────────
function rBenchmark(b) {
  const cards = (b.items||[]).map(item => {
    const pct = item.pct || (item.num && item.num.includes('%') ? parseInt(item.num) : 85)
    const n = item.num || ''
    const isLow = pct < 20
    return `<div class="fx-bench-card">
  <div class="fx-bench-label">${esc(item.label||'')}</div>
  <div class="fx-bench-num">${esc(n)}</div>
  ${item.vs ? `<div class="fx-bench-vs">${esc(item.vs)}</div>` : ''}
  <div class="fx-bench-bar"><div class="fx-bench-fill" style="width:${isLow?pct+'%':pct+'%'}"></div></div>
</div>`
  }).join('')
  return `<div class="fx-benchmark fx-animate-stagger">${cards}</div>\n`
}

// ── rInstall: multi-step code box com botões ──────────────────────
function rInstall(b) {
  const steps = (b.cmds||[]).map((cmd,i) => {
    const isComment = cmd.startsWith('#')
    if(isComment) return `<div class="fx-install-comment">${esc(cmd.slice(1).trim())}</div>`
    return `<div class="fx-install-line"><span class="fx-install-prompt">$</span><span class="fx-install-cmd">${esc(cmd)}</span></div>`
  }).join('')
  const firstCmd = (b.cmds||[]).find(c => !c.startsWith('#')) || ''
  const copy = `navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(firstCmd)})`
  return `<div class="fx-install-wrap">
  <div class="fx-code-bar"><div class="fx-dots"><span></span><span></span><span></span></div><span class="fx-code-lang">terminal</span><button class="fx-code-copy" onclick="${copy};var t=this;t.textContent='copiado!';setTimeout(()=>t.textContent='copiar',1500)">copiar</button></div>
  <div class="fx-install-body">${steps}</div>
</div>\n`
}

// ── rStats upgrade: suporte a subtítulo via "val:label:vs" ────────
function rStatsUpgraded(b) {
  const cells = (b.items||[]).map(item => {
    const raw = item[0]?.text || ''
    const parts = raw.split(':')
    const val = parts[0]?.trim()
    const lbl = parts[1]?.trim()
    const vs  = parts[2]?.trim()
    const bind = isDyn(val) ? ` data-fx-bind="${esc(val)}"` : ''
    // Números → animados com counter
    const isNum = !isDyn(val) && /^[\d.,]+[KkMmBb%]?$/.test(val?.replace(/ms|KB|GB|px/,''))
    const numAttr = isNum && !isDyn(val) ? ` data-to="${val.replace(/[^\d.]/g,'')}" data-dec="${val.includes('.')?val.split('.')[1]?.replace(/[^\d]/g,'').length||0:0}"` : ''
    const countCls = isNum && !isDyn(val) ? ' fx-count' : ''
    return `<div class="fx-stat">
  <div class="fx-stat-val${countCls}"${bind}${numAttr}>${esc(val)}</div>
  <div class="fx-stat-lbl">${esc(lbl||'')}</div>
  ${vs ? `<div class="fx-stat-vs">${esc(vs)}</div>` : ''}
</div>`
  }).join('')
  return `<div class="fx-stats">${cells}</div>\n`
}



// ── rMarquee: faixa de logos/texto em loop infinito ───────────────
function rMarquee(b) {
  const speed = b.variant === 'fast' ? '15s' : b.variant === 'slow' ? '40s' : '25s'
  const items = (b.items||[]).map(item =>
    `<span class="fx-marquee-item">${esc(item)}</span><span class="fx-marquee-sep">·</span>`
  ).join('')
  // Duplicar para loop contínuo
  return `<div class="fx-marquee"><div class="fx-marquee-track" style="animation-duration:${speed}">${items}${items}</div></div>\n`
}

// ── rCta: seção call-to-action com glow ───────────────────────────
function rCta(b) {
  const btns = (b.links||[]).map((l,i) =>
    `<a href="${esc(l.path)}" class="fx-cta${i===0?'':' fx-cta-outline'}">${esc(l.label)}</a>`
  ).join('')
  const v = b.variant || 'default'
  return `<section class="fx-cta-section fx-cta-${v}">
  <div class="fx-cta-glow"></div>
  <div class="fx-cta-inner">
    ${b.title?`<h2 class="fx-cta-title">${esc(b.title)}</h2>`:''}
    ${b.sub?`<p class="fx-cta-sub">${esc(b.sub)}</p>`:''}
    <div class="fx-cta-actions">${btns}</div>
  </div>
</section>\n`
}

// ── rSteps: passos 1-2-3 com linha conectora ──────────────────────
function rSteps(b) {
  const items = (b.items||[]).map((step, i) =>
    `<div class="fx-step">
  <div class="fx-step-num">${esc(step.num||String(i+1))}</div>
  <div class="fx-step-body">
    <div class="fx-step-title">${esc(step.title||'')}</div>
    <div class="fx-step-desc">${esc(step.desc||'')}</div>
  </div>
</div>`
  ).join('')
  const v = b.variant === 'vertical' ? ' fx-steps-vertical' : ''
  return `<div class="fx-steps${v} fx-animate-stagger">${items}</div>\n`
}

// ── rCompare: tabela X vs Y ───────────────────────────────────────
function rCompare(b) {
  const rows = b.rows || []
  if (!rows.length) return ''
  // Primeira linha = cabeçalho se tiver textos
  const header = rows[0]
  const isHeader = header.length > 1 && !header[0].startsWith('✅') && !header[0].startsWith('❌')
  const headerHtml = isHeader
    ? `<div class="fx-compare-header">${header.map((h,i) => `<div class="fx-compare-cell${i===0?' fx-compare-feature':i===1?' fx-compare-col-a':' fx-compare-col-b'}">${esc(h)}</div>`).join('')}</div>`
    : ''
  const dataRows = isHeader ? rows.slice(1) : rows
  const bodyHtml = dataRows.map(row => {
    const feature = row[0] || ''
    const a = row[1] || ''
    const b2 = row[2] || ''
    const checkA = a === '✅' || a === 'sim' || a === 'yes' ? '✅' : a === '❌' || a === 'nao' || a === 'no' ? '❌' : esc(a)
    const checkB = b2 === '✅' || b2 === 'sim' || b2 === 'yes' ? '✅' : b2 === '❌' || b2 === 'nao' || b2 === 'no' ? '❌' : esc(b2)
    return `<div class="fx-compare-row">
  <div class="fx-compare-cell fx-compare-feature">${esc(feature)}</div>
  <div class="fx-compare-cell fx-compare-col-a">${checkA}</div>
  <div class="fx-compare-cell fx-compare-col-b">${checkB}</div>
</div>`
  }).join('')
  return `<div class="fx-compare">${headerHtml}${bodyHtml}</div>\n`
}

// ── rVideo: embed de vídeo ou youtube ─────────────────────────────
function rVideo(b) {
  const url = b.url || ''
  const poster = b.poster || ''
  // Detectar YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) {
    const id = ytMatch[1]
    return `<div class="fx-video-wrap"><div class="fx-video-yt"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0" frameborder="0" allowfullscreen loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div></div>\n`
  }
  // Vídeo HTML5
  return `<div class="fx-video-wrap"><video class="fx-video" controls${poster?` poster="${esc(poster)}"`:''}  preload="metadata"><source src="${esc(url)}"></video></div>\n`
}

// ── autoYear: substitui © YYYY por © <span data-fx-year></span> ──
function autoYear(text) {
  // Substitui padrões como "© 2024", "© 2025", "© 2026" ou só "©" pelo ano dinâmico
  const replaced = esc(text).replace(/©\s*(\d{4})?/g, (_, yr) =>
    `© <span class="fx-year">${yr||new Date().getFullYear()}</span>`
  )
  return replaced
}

function rFoot(b) {
  const _yearScript = `<script>document.querySelectorAll('.fx-year').forEach(function(el){el.textContent=new Date().getFullYear()})</script>`
  let brand='', links='', note=''
  let itemIdx = 0
  for(const item of (b.items||[])) for(const f of item){
    if(f.isLink) links+=`<a href="${esc(f.path)}" class="fx-footer-link">${esc(f.label)}</a>`
    else if(itemIdx===0) { brand=`<span class="fx-footer-brand">${esc(f.text)}</span>`; itemIdx++ }
    else note=`<span class="fx-footer-note">${autoYear(f.text)}</span>`
  }
  if(brand||links){
    return `<footer class="fx-footer"><div class="fx-footer-inner">${brand}<div class="fx-footer-links">${links}</div>${note}</div></footer>${_yearScript}
`
  }
  // fallback centrado
  let inner=''
  for(const item of (b.items||[])) for(const f of item){
    if(f.isLink) inner+=`<a href="${esc(f.path)}" class="fx-footer-link">${esc(f.label)}</a>`
    else inner+=`<p class="fx-footer-text">${autoYear(f.text)}</p>`
  }
  return `<footer class="fx-footer">${inner}</footer>
`
}

function rTable(b) {
  const cols=Array.isArray(b.cols)?b.cols:[]
  const ths=cols.map(c=>`<th class="fx-th">${esc(c.label)}</th>`).join('')
  const keys=JSON.stringify(cols.map(c=>c.key))
  const cm=JSON.stringify(cols.map(c=>({label:c.label,key:c.key})))
  const ea=b.editPath?` data-fx-edit="${esc(b.editPath)}" data-fx-edit-method="${esc(b.editMethod)}"`:''
  const da=b.deletePath?` data-fx-delete="${esc(b.deletePath)}"`:''
  const at=(b.editPath||b.deletePath)?'<th class="fx-th fx-th-actions">Actions</th>':''
  const span=cols.length+((b.editPath||b.deletePath)?1:0)
  const fallbackAttr=b.fallback?` data-fx-fallback="${esc(b.fallback)}"`:''
  const retryAttr=b.retry?` data-fx-retry="${esc(b.retry)}"`:''
  const exitAttr=b.animateExit?` data-fx-exit="${esc(b.animateExit)}"`:'';
  return `<div class="fx-table-wrap"><table class="fx-table"${exitAttr} data-fx-table="${esc(b.binding)}" data-fx-cols='${keys}' data-fx-col-map='${cm}'${ea}${da}${fallbackAttr}${retryAttr}><thead><tr>${ths}${at}</tr></thead><tbody class="fx-tbody"><tr><td colspan="${span}" class="fx-td-empty">${esc(b.empty)}</td></tr></tbody></table></div>\n`
}

function rForm(b) {
  const fields=(b.fields||[]).map(f=>{
    if(!f) return ''
    const inp=f.type==='select'
      ?`<select class="fx-input" name="${esc(f.name)}"><option value="">Select...</option></select>`
      :(() => {
        const _ft = (f.type||'text').toLowerCase()
        const _htmlType = {
          email:'email', url:'url', phone:'tel', tel:'tel',
          integer:'number', int:'number', float:'number', number:'number',
          date:'date', datetime:'datetime-local', timestamp:'datetime-local',
          bool:'checkbox', boolean:'checkbox',
          password:'password', hashed:'password',
          color:'color', range:'range', file:'file'
        }[_ft] || 'text'
        const _numAttrs = (_htmlType==='number' && f.constraints)
          ? (f.constraints.min!=null?` min="${f.constraints.min}"`:'')+
            (f.constraints.max!=null?` max="${f.constraints.max}"`:'')
          : ''
        const _required = f.required ? ' required' : ''
        if (_ft === 'textarea' || _ft === 'longtext') {
          return `<textarea class="fx-input" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}"${_required}></textarea>`
        }
        if (_htmlType === 'checkbox') {
          return `<label class="fx-checkbox-label"><input class="fx-checkbox" type="checkbox" name="${esc(f.name)}"${_required}> ${esc(f.placeholder||f.label||f.name)}</label>`
        }
        return `<input class="fx-input" type="${_htmlType}" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}"${_numAttrs}${_required}>`
      })()
    return`<div class="fx-field"><label class="fx-label">${esc(f.label)}</label>${inp}</div>`
  }).join('')
  const label=b.submitLabel||'Enviar'
  const bgStyle=b.bg?` style="background:${b.bg}"`:b.style?` style="${b.style.replace(/,/g,';')}"`:''
  const v = b.variant||''
  if(v==='inline') {
    return `<div class="fx-form-inline"><form class="fx-form fx-form-inline-form" data-fx-form="${esc(b.bpath)}" data-fx-method="${esc(b.method)}" data-fx-action="${esc(b.action)}">${fields}<button type="submit" class="fx-btn fx-btn-inline">${esc(label)}</button><div class="fx-form-msg"></div></form></div>\n`
  }
  if(v==='minimal') {
    return `<div class="fx-form-minimal"><form data-fx-form="${esc(b.bpath)}" data-fx-method="${esc(b.method)}" data-fx-action="${esc(b.action)}">${fields}<div class="fx-form-msg"></div><button type="submit" class="fx-btn">${esc(label)}</button></form></div>\n`
  }
  const optAttr=b.optimistic?' data-fx-optimistic="true"':''
  return `<div class="fx-form-wrap"><form class="fx-form"${bgStyle}${optAttr} data-fx-form="${esc(b.bpath)}" data-fx-method="${esc(b.method)}" data-fx-action="${esc(b.action)}">${fields}<div class="fx-form-msg"></div><button type="submit" class="fx-btn">${esc(label)}</button></form></div>\n`
}

function rBtn(b) {
  const ca=b.confirm?` data-fx-confirm="${esc(b.confirm)}"`:''
  const aa=b.action?` data-fx-action="${esc(b.action)}"`:''
  return `<div class="fx-btn-wrap"><button class="fx-btn fx-standalone-btn" data-fx-btn="${esc(b.bpath)}" data-fx-method="${esc(b.method)}"${aa}${ca}>${esc(b.label)}</button></div>\n`
}

function rSelectBlock(b) {
  const opts=(b.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')
  return `<div class="fx-select-wrap"><select class="fx-input fx-select-block" data-fx-model="${esc(b.binding)}">${opts}</select></div>\n`
}

function rPricing(b) {
  const v = b.variant||''
  const cards=(b.plans||[]).map((p,i)=>{
    let lh='#',ll='Começar'
    if(p.linkRaw){const m=p.linkRaw.match(/\/([^:]+):(.+)/);if(m){lh='/'+m[1];ll=m[2]}}
    const f=i===1?' fx-pricing-featured':''
    const badge=i===1?'<div class="fx-pricing-badge">Mais popular</div>':''
    if(v==='compact') return`<div class="fx-pricing-compact${i===1?' fx-pricing-featured':''}">${badge}<span class="fx-pricing-name">${esc(p.name)}</span><span class="fx-pricing-price fx-pricing-price-sm">${esc(p.price)}</span><p class="fx-pricing-desc">${esc(p.desc)}</p><a href="${esc(lh)}" class="fx-cta fx-pricing-cta">${esc(ll)}</a></div>`
    return`<div class="fx-pricing-card${f}">${badge}<div class="fx-pricing-name">${esc(p.name)}</div><div class="fx-pricing-price">${esc(p.price)}</div><p class="fx-pricing-desc">${esc(p.desc)}</p><a href="${esc(lh)}" class="fx-cta fx-pricing-cta">${esc(ll)}</a></div>`
  }).join('')
  return `<div class="fx-pricing">${cards}</div>\n`
}

function rFaq(b) {
  const items=(b.items||[]).map(i=>`<div class="fx-faq-item" onclick="this.classList.toggle('open')"><div class="fx-faq-q">${esc(i.q)}<span class="fx-faq-arrow">▸</span></div><div class="fx-faq-a">${esc(i.a)}</div></div>`).join('')
  return `<section class="fx-sect"><div class="fx-faq">${items}</div></section>\n`
}

function rTestimonial(b) {
  const img=b.img?`<img src="${esc(b.img)}" class="fx-testi-img" alt="${esc(b.author)}" loading="lazy">`:`<div class="fx-testi-avatar">${esc((b.author||'?').charAt(0))}</div>`
  return `<section class="fx-testi-wrap"><div class="fx-testi">${img}<blockquote class="fx-testi-quote">"${esc(b.quote)}"</blockquote><div class="fx-testi-author">${esc(b.author)}</div></div></section>\n`
}

function rGallery(b) {
  const imgs=(b.imgs||[]).map(src=>`<div class="fx-gallery-item"><img src="${esc(src)}" alt="" loading="lazy"></div>`).join('')
  return `<div class="fx-gallery">${imgs}</div>\n`
}

function genCustomThemeVars(ct) {
  return `body{background:${ct.bg};color:${ct.text}}.fx-nav{background:${ct.bg}cc;border-bottom:1px solid ${ct.text}18}.fx-cta,.fx-btn{background:${ct.accent};color:#fff}.fx-card{background:${ct.surface||ct.bg};border:1px solid ${ct.text}15}.fx-form{background:${ct.surface||ct.bg};border:1px solid ${ct.text}15}.fx-input{background:${ct.bg};border:1px solid ${ct.text}30;color:${ct.text}}.fx-stat-lbl,.fx-card-body,.fx-sub,.fx-sect-body,.fx-footer-text{color:${ct.text}88}.fx-th,.fx-nav-link{color:${ct.text}77}.fx-footer{border-top:1px solid ${ct.text}15}.fx-th{border-bottom:1px solid ${ct.text}15}`
}

function genThemeVarCSS(t) {
  const r=[]
  const rv=[]
  function h2r(h){h=h.replace('#','');return h.length===6?parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16):'255,255,255'}
  if(t.accent){rv.push('--aip-accent:'+t.accent);rv.push('--aip-accent-rgb:'+h2r(t.accent))}
  if(t.bg){var rgb=h2r(t.bg);rv.push('--ds-background-100:'+t.bg);rv.push('--ds-background-100-rgb:'+rgb);rv.push('--ds-background-200:'+t.bg)}
  if(t.text){rv.push('--ds-gray-1000:'+t.text)}
  if(t.radius){rv.push('--radius-sm:'+t.radius);rv.push('--radius-md:'+t.radius)}
  if(rv.length) r.push(':root{'+rv.join(';')+'}')
  if(t.font) r.push("body{font-family:'"+t.font+"',var(--geist-font)!important}")
  if(t.accent) r.push('.fx-cta,.fx-btn,.fx-pricing-cta,.fx-nav-cta{background:'+t.accent+'!important;color:#fff!important}')
  if(t.bg) r.push('body,html{background:'+t.bg+'!important}')
  if(t.text) r.push('body{color:'+t.text+'!important}')
  return r.join('')
}


function css(theme) {
  // ════════════════════════════════════════════════════════════════
  // GEIST DESIGN SYSTEM — Vercel's design language for aiplang
  // Principles: precision, minimalism, Swiss typography, semantic tokens
  // Fonts: Geist Sans + Geist Mono (Google Fonts)
  // ════════════════════════════════════════════════════════════════
  const base = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;700&display=swap');

:root {
  --geist-font:'Geist','Geist Sans',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --geist-mono:'Geist Mono','Geist_Mono',ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace;
  /* Spacing scale (4px base) */
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;
  --space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;--space-12:48px;
  /* Radius */
  --radius-sm:4px;--radius-md:8px;--radius-lg:12px;--radius-xl:16px;--radius-full:9999px;
  /* Easing - Vercel guidelines */
  --ease-out:cubic-bezier(.16,1,.3,1);
  --ease-in-out:cubic-bezier(.4,0,.2,1);
  --ease-spring:cubic-bezier(.34,1.56,.64,1);
  /* Transitions - only opacity + transform per guidelines */
  --duration-fast:100ms;--duration-normal:150ms;--duration-slow:250ms;
}

/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{
  font-size:16px;
  scroll-behavior:smooth;
  text-size-adjust:100%;
  -webkit-text-size-adjust:100%;
  /* Vercel: tabular nums by default for consistency */
  font-feature-settings:'ss01','ss02','cv01','cv02';
}
body{
  font-family:var(--geist-font);
  background:var(--ds-background-100);
  color:var(--ds-gray-1000);
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  min-height:100vh;
  overflow-x:hidden;
  /* Reduce banding from gradients */
  text-rendering:optimizeLegibility;
}
a{text-decoration:none;color:inherit}
img{max-width:100%;height:auto;display:block}
input,button,select,textarea{font-family:var(--geist-font);font-size:inherit}
button{cursor:pointer;border:none;background:none}
code,pre,kbd{font-family:var(--geist-mono)}
/* Vercel guideline: touch-action on interactive elements */
button,a,[role=button]{touch-action:manipulation}
/* Vercel: visible focus ring */
:focus-visible{
  outline:2px solid var(--ds-blue-700);
  outline-offset:2px;
  border-radius:var(--radius-sm);
}
/* Vercel: honor prefers-reduced-motion */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}

/* ═══════════════════════════════════════════
   NAV — Geist nav style
═══════════════════════════════════════════ */
.fx-nav{
  position:sticky;top:0;z-index:200;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 var(--space-6);height:54px;
  background:var(--ds-background-100);
  border-bottom:1px solid var(--ds-gray-alpha-400);
  /* Vercel: backdrop-blur for glass effect */
  backdrop-filter:blur(16px) saturate(200%);
  -webkit-backdrop-filter:blur(16px) saturate(200%);
  background:rgba(var(--ds-background-100-rgb),.92);
  flex-wrap:wrap;gap:var(--space-2);
  transition:border-color var(--duration-slow) var(--ease-in-out);
}
.fx-nav.scrolled{border-bottom-color:var(--ds-gray-alpha-400)}
.fx-brand{
  font-size:14px;font-weight:600;letter-spacing:-.02em;
  color:var(--ds-gray-1000);
}
.fx-nav-links{display:flex;align-items:center;gap:2px}
.fx-nav-link{
  display:inline-flex;align-items:center;
  font-size:13px;font-weight:400;
  color:var(--ds-gray-900);
  padding:5px 10px;border-radius:var(--radius-md);
  /* Only transition opacity + transform per Vercel guidelines */
  transition:color var(--duration-normal) var(--ease-in-out),background var(--duration-normal) var(--ease-in-out);
}
.fx-nav-link:hover{
  color:var(--ds-gray-1000);
  background:var(--ds-gray-alpha-200);
}
/* Vercel CTA button style */
.fx-nav-cta{
  display:inline-flex;align-items:center;gap:6px;
  height:32px;padding:0 12px;
  background:var(--ds-gray-1000);
  color:var(--ds-background-100);
  font-size:13px;font-weight:500;
  border-radius:var(--radius-md);
  transition:opacity var(--duration-normal) var(--ease-in-out);
  white-space:nowrap;
}
.fx-nav-cta:hover{opacity:.85}
.fx-hamburger{display:none;flex-direction:column;gap:5px;padding:6px;border-radius:var(--radius-md)}
.fx-hamburger span{display:block;width:18px;height:1px;background:var(--ds-gray-900);transition:all var(--duration-normal) var(--ease-in-out)}
.fx-hamburger.open span:nth-child(1){transform:rotate(45deg) translate(4px,4px)}
.fx-hamburger.open span:nth-child(2){opacity:0}
.fx-hamburger.open span:nth-child(3){transform:rotate(-45deg) translate(4px,-4px)}
@media(max-width:640px){
  .fx-hamburger{display:flex}
  .fx-nav-links{
    display:none;width:100%;
    flex-direction:column;align-items:stretch;
    padding:8px 0;gap:1px;
    border-top:1px solid var(--ds-gray-alpha-400);margin-top:8px;
  }
  .fx-nav-links.open{display:flex}
  .fx-nav-link{padding:8px 10px}
}

/* ═══════════════════════════════════════════
   HERO
═══════════════════════════════════════════ */
.fx-hero{
  display:flex;align-items:center;justify-content:center;
  min-height:calc(100svh - 54px);
  padding:80px 24px 64px;
  position:relative;overflow:hidden;
}
.fx-hero-inner{
  max-width:960px;width:100%;
  text-align:center;
  display:flex;flex-direction:column;align-items:center;
  gap:24px;
  position:relative;z-index:1;
}
.fx-hero-minimal{min-height:50vh!important}
.fx-hero-tall{min-height:100svh!important}
/* Landing: Vercel-style grid + radial */
.fx-hero-landing{overflow:hidden}
.fx-hero-grid{
  position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(var(--ds-gray-alpha-200) 1px,transparent 1px),
    linear-gradient(90deg,var(--ds-gray-alpha-200) 1px,transparent 1px);
  background-size:48px 48px;
  mask-image:radial-gradient(ellipse 80% 70% at 50% 0%,black 40%,transparent 100%);
  -webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 0%,black 40%,transparent 100%);
}
/* Vercel-style ambient glow */
.fx-hero-landing::after{
  content:'';position:absolute;
  width:80vw;height:40vh;max-width:900px;
  border-radius:50%;
  background:radial-gradient(ellipse,rgba(var(--aip-accent-rgb),.08) 0%,transparent 60%);
  left:50%;top:0;transform:translate(-50%,-20%);
  pointer-events:none;
  animation:fx-glow 8s ease-in-out infinite;
}
@keyframes fx-glow{0%,100%{opacity:.6}50%{opacity:1}}
/* Vercel hero typography */
.fx-title{
  font-size:clamp(40px,6vw,80px);
  font-weight:700;
  letter-spacing:-.04em;
  line-height:1.05;
  color:var(--ds-gray-1000);
}
.fx-gradient-text{
  background:linear-gradient(90deg,var(--ds-gray-1000) 0%,var(--ds-gray-700) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
/* Override with accent when set */
.fx-gradient-text-accent{
  background:linear-gradient(135deg,var(--ds-gray-1000) 30%,rgba(var(--aip-accent-rgb),1) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.fx-sub{
  font-size:clamp(15px,2vw,18px);
  line-height:1.65;
  color:var(--ds-gray-900);
  max-width:540px;font-weight:400;
}
/* Vercel hero badge */
.fx-hero-badge{
  display:inline-flex;align-items:center;gap:6px;
  height:28px;padding:0 10px;
  background:var(--ds-gray-alpha-100);
  border:1px solid var(--ds-gray-alpha-400);
  border-radius:var(--radius-full);
  font-size:12px;font-weight:500;color:var(--ds-gray-900);
  letter-spacing:.01em;
}
.fx-hero-badge-dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--ds-green-700);
  animation:fx-pulse 3s ease infinite;flex-shrink:0;
}
@keyframes fx-pulse{0%,100%{opacity:1}50%{opacity:.4}}
/* Vercel CTA button */
.fx-cta{
  display:inline-flex;align-items:center;gap:6px;
  height:40px;padding:0 20px;
  background:var(--ds-gray-1000);
  color:var(--ds-background-100);
  font-size:14px;font-weight:500;letter-spacing:-.01em;
  border-radius:var(--radius-md);
  /* Only transform per Vercel guidelines */
  transition:opacity var(--duration-normal) var(--ease-in-out),transform var(--duration-normal) var(--ease-out);
}
.fx-cta:hover{opacity:.88;transform:translateY(-1px)}
.fx-cta:active{transform:translateY(0)}
.fx-cta-outline{
  background:transparent!important;
  border:1px solid var(--ds-gray-alpha-400)!important;
  color:var(--ds-gray-900)!important;
}
.fx-cta-outline:hover{background:var(--ds-gray-alpha-100)!important}
/* Vercel hero split */
.fx-hero-split{
  display:grid;grid-template-columns:1fr 1fr;gap:64px;
  align-items:center;padding:80px 40px;min-height:80vh;
}
@media(max-width:768px){.fx-hero-split{grid-template-columns:1fr;padding:48px 24px;min-height:auto}}
.fx-hero-split .fx-hero-inner{text-align:left;align-items:flex-start;max-width:none}
.fx-hero-img{width:100%;border-radius:var(--radius-lg);border:1px solid var(--ds-gray-alpha-400)}

/* ═══════════════════════════════════════════
   STATS BAR — Geist big number style
═══════════════════════════════════════════ */
.fx-stats{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
  border-top:1px solid var(--ds-gray-alpha-400);
  border-bottom:1px solid var(--ds-gray-alpha-400);
}
.fx-stat{
  padding:40px 24px;text-align:center;
  border-right:1px solid var(--ds-gray-alpha-400);
  transition:background var(--duration-normal) var(--ease-in-out);
}
.fx-stat:last-child{border-right:none}
.fx-stat:hover{background:var(--ds-gray-alpha-100)}
.fx-stat-val{
  font-size:clamp(28px,4vw,40px);
  font-weight:700;letter-spacing:-.04em;line-height:1;
  color:var(--ds-gray-1000);
  font-variant-numeric:tabular-nums;
}
.fx-stat-lbl{
  font-size:12px;font-weight:500;
  text-transform:uppercase;letter-spacing:.08em;
  color:var(--ds-gray-700);
  margin-top:8px;
}
.fx-stat-vs{font-size:11px;color:var(--ds-gray-600);margin-top:4px;letter-spacing:.01em}
@media(max-width:640px){
  .fx-stats{grid-template-columns:repeat(2,1fr)}
  .fx-stat{border-right:none;border-bottom:1px solid var(--ds-gray-alpha-400)}
  .fx-stat:nth-child(odd){border-right:1px solid var(--ds-gray-alpha-400)}
  .fx-stat:last-child,:nth-last-child(-n+2):nth-child(even){border-bottom:none}
}

/* ═══════════════════════════════════════════
   SECTIONS
═══════════════════════════════════════════ */
.fx-sect{padding:80px 40px;position:relative}
@media(max-width:768px){.fx-sect{padding:64px 24px}}
.fx-sect-title{
  font-size:clamp(24px,3.5vw,40px);
  font-weight:700;letter-spacing:-.03em;line-height:1.15;
  margin-bottom:12px;text-align:center;color:var(--ds-gray-1000);
}
.fx-sect-body{
  font-size:15px;line-height:1.7;text-align:center;
  color:var(--ds-gray-900);max-width:480px;margin:0 auto;
}
.fx-sect-link{font-size:13px;font-weight:500;color:var(--ds-blue-700);display:inline-block;margin-top:12px}

/* ═══════════════════════════════════════════
   CARDS / GRID — Geist card style
═══════════════════════════════════════════ */
.fx-grid{display:grid;gap:12px;padding:0 40px 80px}
.fx-grid-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.fx-grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.fx-grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
@media(max-width:640px){.fx-grid{padding:0 24px 48px}.fx-grid-2,.fx-grid-3,.fx-grid-4{grid-template-columns:1fr}}
.fx-card{
  border-radius:var(--radius-lg);
  padding:24px;
  background:var(--ds-background-200);
  border:1px solid var(--ds-gray-alpha-400);
  transition:border-color var(--duration-normal) var(--ease-in-out),transform var(--duration-slow) var(--ease-out);
  position:relative;overflow:hidden;
}
.fx-card:hover{
  border-color:var(--ds-gray-alpha-700);
  transform:translateY(-1px);
}
.fx-card-img{width:100%;border-radius:var(--radius-md);height:180px;object-fit:cover;margin-bottom:16px;border:1px solid var(--ds-gray-alpha-400)}
.fx-icon{
  font-size:20px;
  margin-bottom:16px;
  width:40px;height:40px;
  display:flex;align-items:center;justify-content:center;
  border-radius:var(--radius-md);
  background:var(--ds-gray-alpha-200);
  border:1px solid var(--ds-gray-alpha-400);
}
.fx-card-title{
  font-size:14px;font-weight:600;letter-spacing:-.015em;
  margin-bottom:6px;color:var(--ds-gray-1000);line-height:1.4;
}
.fx-card-body{font-size:13px;line-height:1.65;color:var(--ds-gray-900)}
.fx-card-link{font-size:13px;font-weight:500;color:var(--ds-blue-700);display:inline-block;margin-top:12px}
.fx-grid-feature .fx-card:hover{border-color:rgba(var(--aip-accent-rgb),.4)}
.fx-grid-feature .fx-icon{background:rgba(var(--aip-accent-rgb),.06);border-color:rgba(var(--aip-accent-rgb),.15)}

/* ═══════════════════════════════════════════
   FORMS — Geist input style
═══════════════════════════════════════════ */
.fx-form-wrap{padding:48px 40px;display:flex;justify-content:center}
.fx-form{
  width:100%;max-width:400px;
  background:var(--ds-background-200);
  border:1px solid var(--ds-gray-alpha-400);
  border-radius:var(--radius-xl);padding:32px;
}
.fx-field{margin-bottom:16px}
.fx-label{
  display:block;font-size:13px;font-weight:500;
  color:var(--ds-gray-1000);margin-bottom:6px;letter-spacing:-.01em;
}
.fx-input{
  width:100%;height:40px;padding:0 12px;
  background:var(--ds-background-100);
  border:1px solid var(--ds-gray-alpha-400);
  border-radius:var(--radius-md);
  color:var(--ds-gray-1000);font-size:14px;
  outline:none;-webkit-appearance:none;
  transition:border-color var(--duration-normal) var(--ease-in-out),box-shadow var(--duration-normal) var(--ease-in-out);
}
.fx-input:hover{border-color:var(--ds-gray-alpha-700)}
.fx-input:focus{
  border-color:var(--ds-blue-700);
  box-shadow:0 0 0 3px rgba(var(--ds-blue-rgb),.15);
}
.fx-input::placeholder{color:var(--ds-gray-600)}
textarea.fx-input{height:auto;padding:10px 12px;resize:vertical;min-height:80px;line-height:1.5}
.fx-btn{
  width:100%;height:40px;padding:0 16px;
  background:var(--ds-gray-1000);color:var(--ds-background-100);
  font-size:14px;font-weight:500;letter-spacing:-.01em;
  border-radius:var(--radius-md);
  margin-top:4px;
  transition:opacity var(--duration-normal) var(--ease-in-out),transform var(--duration-normal) var(--ease-out);
}
.fx-btn:hover{opacity:.88;transform:translateY(-1px)}
.fx-btn:active{transform:translateY(0)}
.fx-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.fx-btn-wrap{padding:0 40px 24px}
.fx-standalone-btn{width:auto;padding:0 20px;margin-top:0}
.fx-form-msg{font-size:13px;padding:6px 0;min-height:24px;text-align:center;font-weight:500}
.fx-form-err{color:var(--ds-red-700)}.fx-form-ok{color:var(--ds-green-700)}

/* ═══════════════════════════════════════════
   TABLE — Geist table style
═══════════════════════════════════════════ */
.fx-table-wrap{overflow-x:auto;padding:0 40px 64px}
.fx-table{width:100%;border-collapse:collapse;font-size:13px}
.fx-th{
  text-align:left;padding:0 12px 10px;
  font-size:11px;font-weight:600;text-transform:uppercase;
  letter-spacing:.06em;color:var(--ds-gray-700);
  border-bottom:1px solid var(--ds-gray-alpha-400);white-space:nowrap;
}
.fx-th-actions{opacity:.5}
.fx-tr{border-bottom:1px solid var(--ds-gray-alpha-200);transition:background var(--duration-fast) var(--ease-in-out)}
.fx-tr:last-child{border-bottom:none}
.fx-tr:hover{background:var(--ds-gray-alpha-100)}
.fx-td{padding:12px;color:var(--ds-gray-900);vertical-align:middle}
.fx-td:first-child{color:var(--ds-gray-1000);font-weight:500}
.fx-td-empty{padding:48px 12px;text-align:center;color:var(--ds-gray-600);font-size:13px}
.fx-td-actions{white-space:nowrap;padding:6px 12px!important}
.fx-action-btn{
  height:28px;padding:0 10px;border-radius:var(--radius-md);
  font-size:12px;font-weight:500;margin-right:4px;
  transition:background var(--duration-normal) var(--ease-in-out);
}
.fx-edit-btn{background:var(--ds-blue-100);color:var(--ds-blue-700)}
.fx-edit-btn:hover{background:var(--ds-blue-200)}
.fx-delete-btn{background:var(--ds-red-100);color:var(--ds-red-700)}
.fx-delete-btn:hover{background:var(--ds-red-200)}

/* ═══════════════════════════════════════════
   PRICING — Geist pricing style
═══════════════════════════════════════════ */
.fx-pricing{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:16px;padding:24px 40px 80px;align-items:start;
}
.fx-pricing-card{
  border-radius:var(--radius-xl);padding:32px;
  background:var(--ds-background-200);
  border:1px solid var(--ds-gray-alpha-400);
  position:relative;
  transition:border-color var(--duration-normal) var(--ease-in-out);
}
.fx-pricing-featured{border-color:var(--ds-gray-alpha-700)!important}
.fx-pricing-badge{
  position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  background:var(--ds-gray-1000);color:var(--ds-background-100);
  font-size:11px;font-weight:600;padding:3px 10px;
  border-radius:var(--radius-full);white-space:nowrap;letter-spacing:.04em;
}
.fx-pricing-name{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--ds-gray-700);margin-bottom:12px}
.fx-pricing-price{font-size:40px;font-weight:700;letter-spacing:-.05em;line-height:1;margin-bottom:8px;color:var(--ds-gray-1000);font-variant-numeric:tabular-nums}
.fx-pricing-price-sm{font-size:28px}
.fx-pricing-desc{font-size:13px;line-height:1.6;margin-bottom:24px;color:var(--ds-gray-900)}
.fx-pricing-cta{
  display:block;text-align:center;height:36px;line-height:36px;
  border-radius:var(--radius-md);font-size:13px;font-weight:500;
  background:var(--ds-gray-1000);color:var(--ds-background-100);
  transition:opacity var(--duration-normal) var(--ease-in-out);
}
.fx-pricing-cta:hover{opacity:.85}

/* ═══════════════════════════════════════════
   FAQ — Geist collapse style
═══════════════════════════════════════════ */
.fx-faq-wrap{padding:0 40px 64px}
.fx-faq{max-width:640px;margin:0 auto}
.fx-faq-item{
  border-bottom:1px solid var(--ds-gray-alpha-400);
  cursor:pointer;
}
.fx-faq-item:first-child{border-top:1px solid var(--ds-gray-alpha-400)}
.fx-faq-q{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 0;
  font-size:14px;font-weight:500;color:var(--ds-gray-1000);
  user-select:none;
}
.fx-faq-arrow{
  width:16px;height:16px;color:var(--ds-gray-700);flex-shrink:0;
  transition:transform var(--duration-normal) var(--ease-in-out);
}
.fx-faq-arrow::after{
  content:'↓';font-size:12px;display:block;text-align:center;line-height:16px;
}
.fx-faq-item.open .fx-faq-arrow{transform:rotate(180deg)}
.fx-faq-a{
  max-height:0;overflow:hidden;
  font-size:14px;line-height:1.65;color:var(--ds-gray-900);
  transition:max-height var(--duration-slow) var(--ease-out),padding var(--duration-slow) var(--ease-out);
  padding:0;
}
.fx-faq-item.open .fx-faq-a{max-height:300px;padding:0 0 16px}

/* ═══════════════════════════════════════════
   CODE WINDOW — Geist snippet style
═══════════════════════════════════════════ */
.fx-code-window{
  border-radius:var(--radius-lg);overflow:hidden;
  border:1px solid var(--ds-gray-alpha-400);
  background:var(--ds-background-200);
  margin:0 40px 24px;
}
.fx-code-bar{
  display:flex;align-items:center;gap:8px;
  padding:10px 16px;
  background:var(--ds-background-200);
  border-bottom:1px solid var(--ds-gray-alpha-400);
}
.fx-dots{display:flex;gap:5px}
.fx-dots span{width:10px;height:10px;border-radius:50%}
.fx-dots span:nth-child(1){background:#ff5f57}
.fx-dots span:nth-child(2){background:#febc2e}
.fx-dots span:nth-child(3){background:#28c840}
.fx-code-lang{
  font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ds-gray-700);margin-left:4px;font-family:var(--geist-mono);font-weight:500;
}
.fx-code-copy{
  margin-left:auto;height:24px;padding:0 8px;
  font-family:var(--geist-mono);font-size:11px;letter-spacing:.04em;
  background:var(--ds-gray-alpha-200);
  border:1px solid var(--ds-gray-alpha-400);
  color:var(--ds-gray-900);border-radius:var(--radius-sm);cursor:pointer;
  transition:background var(--duration-normal),color var(--duration-normal);
}
.fx-code-copy:hover{background:var(--ds-gray-alpha-400);color:var(--ds-gray-1000)}
.fx-code-body{padding:20px 24px;overflow-x:auto}
.fx-code-line{font-family:var(--geist-mono);font-size:13px;line-height:1.75;color:var(--ds-gray-800);white-space:pre}
.fx-kw{color:#c792ea}.fx-st{color:#a6e3a1}.fx-fn{color:#89b4fa}
.fx-nb{color:#fab387}.fx-op{color:rgba(var(--aip-accent-rgb),1)}.fx-comment{color:var(--ds-gray-600);font-style:italic}

/* ═══════════════════════════════════════════
   INSTALL BLOCK
═══════════════════════════════════════════ */
.fx-install-wrap{
  border-radius:var(--radius-lg);overflow:hidden;
  border:1px solid var(--ds-gray-alpha-400);
  background:var(--ds-background-200);
  margin:0 40px 24px;max-width:480px;
}
.fx-install-body{padding:20px 24px}
.fx-install-line{display:flex;gap:10px;padding:3px 0;font-family:var(--geist-mono);font-size:13px;line-height:1.6}
.fx-install-prompt{color:rgba(var(--aip-accent-rgb),1);flex-shrink:0;font-weight:700}
.fx-install-cmd{color:var(--ds-gray-1000)}
.fx-install-comment{font-family:var(--geist-mono);font-size:12px;color:var(--ds-gray-700);padding:3px 0;font-style:italic}

/* ═══════════════════════════════════════════
   BENCHMARK CARDS
═══════════════════════════════════════════ */
.fx-benchmark{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:12px;padding:0 40px 64px;
}
.fx-bench-card{
  border-radius:var(--radius-lg);padding:24px;
  background:var(--ds-background-200);
  border:1px solid var(--ds-gray-alpha-400);
  position:relative;overflow:hidden;
  transition:border-color var(--duration-normal) var(--ease-in-out);
}
.fx-bench-card:hover{border-color:var(--ds-gray-alpha-700)}
/* Subtle top accent line */
.fx-bench-card::after{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(var(--aip-accent-rgb),.6),transparent);
}
.fx-bench-label{
  font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ds-gray-700);margin-bottom:10px;font-weight:600;
}
.fx-bench-num{
  font-size:clamp(24px,4vw,36px);font-weight:700;
  letter-spacing:-.04em;line-height:1;
  color:var(--ds-gray-1000);font-variant-numeric:tabular-nums;
}
.fx-bench-vs{font-size:12px;color:var(--ds-gray-700);margin-top:6px;font-family:var(--geist-mono)}
.fx-bench-bar{margin-top:16px;height:3px;background:var(--ds-gray-alpha-200);border-radius:999px;overflow:hidden}
.fx-bench-fill{height:100%;border-radius:999px;background:rgba(var(--aip-accent-rgb),1);transition:width 1.2s var(--ease-out)}

/* ═══════════════════════════════════════════
   MARQUEE — smooth infinite scroll
═══════════════════════════════════════════ */
.fx-marquee{
  overflow:hidden;padding:20px 0;
  border-top:1px solid var(--ds-gray-alpha-400);
  border-bottom:1px solid var(--ds-gray-alpha-400);
  -webkit-mask:linear-gradient(90deg,transparent,black 10%,black 90%,transparent);
  mask:linear-gradient(90deg,transparent,black 10%,black 90%,transparent);
}
.fx-marquee-track{display:flex;width:max-content;animation:fx-marquee 30s linear infinite}
.fx-marquee:hover .fx-marquee-track{animation-play-state:paused}
@keyframes fx-marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.fx-marquee-item{
  font-size:13px;font-weight:500;
  color:var(--ds-gray-700);
  white-space:nowrap;padding:0 24px;
  transition:color var(--duration-normal);
}
.fx-marquee-item:hover{color:var(--ds-gray-1000)}
.fx-marquee-sep{color:var(--ds-gray-alpha-400)}

/* ═══════════════════════════════════════════
   CTA SECTION
═══════════════════════════════════════════ */
.fx-cta-section{
  position:relative;padding:120px 40px;text-align:center;overflow:hidden;
  border-top:1px solid var(--ds-gray-alpha-400);
}
.fx-cta-glow{
  position:absolute;
  width:700px;height:350px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(var(--aip-accent-rgb),.06),transparent 60%);
  left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;
}
.fx-cta-inner{position:relative;z-index:1;max-width:560px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:24px}
.fx-cta-title{
  font-size:clamp(28px,4vw,48px);font-weight:700;
  letter-spacing:-.04em;line-height:1.1;color:var(--ds-gray-1000);
}
.fx-cta-sub{font-size:15px;line-height:1.65;color:var(--ds-gray-900);max-width:440px}
.fx-cta-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}

/* ═══════════════════════════════════════════
   STEPS — numbered with connector
═══════════════════════════════════════════ */
.fx-steps{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:40px;padding:16px 40px 80px;position:relative;
}
.fx-steps::before{
  content:'';position:absolute;top:36px;
  left:calc(40px + 20px);right:calc(40px + 20px);
  height:1px;background:var(--ds-gray-alpha-400);pointer-events:none;
}
@media(max-width:640px){.fx-steps::before{display:none}.fx-steps{gap:32px;padding:0 24px 48px}}
.fx-step{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
.fx-step-num{
  width:36px;height:36px;border-radius:50%;
  background:var(--ds-gray-alpha-200);
  border:1px solid var(--ds-gray-alpha-400);
  color:var(--ds-gray-1000);
  font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;position:relative;z-index:1;
}
.fx-step-title{font-size:14px;font-weight:600;letter-spacing:-.015em;color:var(--ds-gray-1000)}
.fx-step-desc{font-size:13px;line-height:1.6;color:var(--ds-gray-900)}

/* ═══════════════════════════════════════════
   COMPARE — visual feature table
═══════════════════════════════════════════ */
.fx-compare{
  max-width:560px;margin:0 auto 64px;padding:0 40px;
  border-radius:var(--radius-xl);overflow:hidden;
  border:1px solid var(--ds-gray-alpha-400);
}
.fx-compare-header{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  padding:12px 16px;
  background:var(--ds-background-200);
  font-size:11px;font-weight:700;text-transform:uppercase;
  letter-spacing:.08em;color:var(--ds-gray-700);
  border-bottom:1px solid var(--ds-gray-alpha-400);
}
.fx-compare-row{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  padding:12px 16px;border-bottom:1px solid var(--ds-gray-alpha-200);
  transition:background var(--duration-fast);
}
.fx-compare-row:last-child{border-bottom:none}
.fx-compare-row:hover{background:var(--ds-gray-alpha-100)}
.fx-compare-feature{font-size:13px;color:var(--ds-gray-900)}
.fx-compare-col-a{text-align:center;font-size:14px;font-weight:600;color:var(--ds-green-700)}
.fx-compare-col-b{text-align:center;font-size:14px;color:var(--ds-gray-600)}

/* ═══════════════════════════════════════════
   VIDEO
═══════════════════════════════════════════ */
.fx-video-wrap{padding:0 40px 48px}
.fx-video-yt{
  position:relative;padding-bottom:56.25%;height:0;overflow:hidden;
  border-radius:var(--radius-xl);border:1px solid var(--ds-gray-alpha-400);
  background:var(--ds-background-200);
}
.fx-video-yt iframe{position:absolute;top:0;left:0;width:100%;height:100%}
.fx-video{width:100%;border-radius:var(--radius-xl);border:1px solid var(--ds-gray-alpha-400)}

/* ═══════════════════════════════════════════
   TESTIMONIAL
═══════════════════════════════════════════ */
.fx-testi-wrap{padding:80px 40px;display:flex;justify-content:center}
.fx-testi{max-width:560px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px}
.fx-testi-img,.fx-testi-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover}
.fx-testi-avatar{
  display:flex;align-items:center;justify-content:center;
  font-size:18px;font-weight:700;
  background:var(--ds-background-200);
  border:1px solid var(--ds-gray-alpha-400);
  color:var(--ds-gray-1000);
}
.fx-testi-quote{font-size:18px;line-height:1.65;color:var(--ds-gray-900);letter-spacing:-.01em}
.fx-testi-author{font-size:13px;font-weight:500;color:var(--ds-gray-700)}

/* ═══════════════════════════════════════════
   GALLERY
═══════════════════════════════════════════ */
.fx-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:16px 40px 64px}
.fx-gallery-item{border-radius:var(--radius-lg);overflow:hidden;aspect-ratio:4/3;border:1px solid var(--ds-gray-alpha-400)}
.fx-gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform var(--duration-slow) var(--ease-out)}
.fx-gallery-item:hover img{transform:scale(1.03)}

/* ═══════════════════════════════════════════
   MISC COMPONENTS
═══════════════════════════════════════════ */
.fx-divider{
  display:flex;align-items:center;gap:12px;
  padding:12px 40px;color:var(--ds-gray-700);font-size:12px;font-weight:500;
}
.fx-divider::before,.fx-divider::after{content:'';flex:1;height:1px;background:var(--ds-gray-alpha-400)}
.fx-hr{border:none;height:1px;background:var(--ds-gray-alpha-400);margin:0 40px}
.fx-badge-row{padding:6px 40px}
.fx-badge-tag{
  font-size:11px;font-weight:600;padding:3px 8px;border-radius:var(--radius-full);
  background:rgba(var(--aip-accent-rgb),.08);color:rgba(var(--aip-accent-rgb),1);
  border:1px solid rgba(var(--aip-accent-rgb),.2);letter-spacing:.03em;
}
.fx-spacer{flex-shrink:0}
.fx-html{padding:0 40px}
.fx-cols{display:grid;gap:24px;padding:16px 40px 48px}
.fx-col{min-width:0}
.fx-chart-container{padding:0 40px 48px}
.fx-select-wrap{padding:6px 40px}
.fx-select-block{width:auto;min-width:180px;height:36px;margin-top:0}
.fx-each{padding:0 40px 24px}
.fx-each-empty{padding:48px;text-align:center;color:var(--ds-gray-700);font-size:13px}
.fx-if-wrap{display:contents}
.fx-editor-wrap{padding:0 40px 24px}

/* ═══════════════════════════════════════════
   SCROLL ANIMATIONS — GPU only per Vercel guidelines
═══════════════════════════════════════════ */
.fx-animate{
  opacity:0;transform:translateY(12px);
  transition:opacity .5s var(--ease-out),transform .5s var(--ease-out);
}
.fx-animate.fx-visible{opacity:1;transform:none}
.fx-animate-stagger>*{
  opacity:0;transform:translateY(8px);
  transition:opacity .45s var(--ease-out),transform .45s var(--ease-out);
}
.fx-animate-stagger.fx-visible>*:nth-child(1){opacity:1;transform:none;transition-delay:.04s}
.fx-animate-stagger.fx-visible>*:nth-child(2){opacity:1;transform:none;transition-delay:.1s}
.fx-animate-stagger.fx-visible>*:nth-child(3){opacity:1;transform:none;transition-delay:.16s}
.fx-animate-stagger.fx-visible>*:nth-child(4){opacity:1;transform:none;transition-delay:.22s}
.fx-animate-stagger.fx-visible>*:nth-child(5){opacity:1;transform:none;transition-delay:.28s}
.fx-animate-stagger.fx-visible>*:nth-child(6){opacity:1;transform:none;transition-delay:.34s}

/* Counter + year */
.fx-count,.fx-year{font-variant-numeric:tabular-nums;display:inline-block}

/* ═══════════════════════════════════════════
   FOOTER — Geist footer style
═══════════════════════════════════════════ */
.fx-footer{padding:32px 40px;border-top:1px solid var(--ds-gray-alpha-400)}
.fx-footer-inner{
  max-width:1200px;margin:0 auto;
  display:flex;justify-content:space-between;align-items:center;
  flex-wrap:wrap;gap:16px;
}
.fx-footer-brand{font-size:13px;font-weight:600;letter-spacing:-.02em;color:var(--ds-gray-1000)}
.fx-footer-links{display:flex;gap:24px;flex-wrap:wrap}
.fx-footer-link{font-size:13px;color:var(--ds-gray-700);transition:color var(--duration-normal)}
.fx-footer-link:hover{color:var(--ds-gray-1000)}
.fx-footer-note{font-size:12px;color:var(--ds-gray-600);font-family:var(--geist-mono)}
.fx-footer-text{font-size:13px;color:var(--ds-gray-700)}
@media(max-width:640px){.fx-footer{padding:24px}.fx-footer-inner{flex-direction:column;align-items:flex-start;gap:12px}}
`

  // ════════════════════════════════════════════════════════════════
  // GEIST COLOR TOKENS — Semantic scale, light + dark
  // Based on vercel.com/geist/colors
  // Backgrounds → Surfaces → Borders → Text
  // ════════════════════════════════════════════════════════════════
  const T = {
    dark: `
:root {
  /* Backgrounds */
  --ds-background-100:#000000;
  --ds-background-100-rgb:0,0,0;
  --ds-background-200:#0a0a0a;

  /* Gray scale (Geist) */
  --ds-gray-100:#0a0a0a;
  --ds-gray-200:#111111;
  --ds-gray-300:#1a1a1a;
  --ds-gray-400:#222222;
  --ds-gray-500:#2a2a2a;
  --ds-gray-600:#666666;
  --ds-gray-700:#888888;
  --ds-gray-800:#999999;
  --ds-gray-900:#aaaaaa;
  --ds-gray-1000:#ededed;

  /* Gray alpha */
  --ds-gray-alpha-100:rgba(255,255,255,.04);
  --ds-gray-alpha-200:rgba(255,255,255,.07);
  --ds-gray-alpha-400:rgba(255,255,255,.12);
  --ds-gray-alpha-700:rgba(255,255,255,.24);

  /* Accent colors */
  --ds-blue-100:rgba(0,112,243,.08);
  --ds-blue-200:rgba(0,112,243,.15);
  --ds-blue-700:#0070f3;
  --ds-blue-rgb:0,112,243;
  --ds-red-100:rgba(255,0,0,.08);
  --ds-red-200:rgba(255,0,0,.15);
  --ds-red-700:#ff0000;
  --ds-green-100:rgba(0,188,112,.08);
  --ds-green-700:#00bc70;
}`,
    light: `
:root {
  --ds-background-100:#ffffff;
  --ds-background-100-rgb:255,255,255;
  --ds-background-200:#fafafa;

  --ds-gray-100:#fafafa;
  --ds-gray-200:#f5f5f5;
  --ds-gray-300:#ebebeb;
  --ds-gray-400:#e6e6e6;
  --ds-gray-500:#e0e0e0;
  --ds-gray-600:#888888;
  --ds-gray-700:#666666;
  --ds-gray-800:#444444;
  --ds-gray-900:#333333;
  --ds-gray-1000:#111111;

  --ds-gray-alpha-100:rgba(0,0,0,.04);
  --ds-gray-alpha-200:rgba(0,0,0,.07);
  --ds-gray-alpha-400:rgba(0,0,0,.12);
  --ds-gray-alpha-700:rgba(0,0,0,.24);

  --ds-blue-100:rgba(0,112,243,.06);
  --ds-blue-200:rgba(0,112,243,.12);
  --ds-blue-700:#0070f3;
  --ds-blue-rgb:0,112,243;
  --ds-red-100:rgba(255,0,0,.06);
  --ds-red-200:rgba(255,0,0,.12);
  --ds-red-700:#c00;
  --ds-green-100:rgba(0,188,112,.06);
  --ds-green-700:#007a45;
}`,
  }
  return base + (T[theme] || T.dark)
}


