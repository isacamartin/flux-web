'use strict'
// aiplang Full-Stack Server v2 — Laravel-competitive
// Features: ORM+relations, email, jobs/queues, admin panel, OAuth, soft deletes, events

const http    = require('http')
const fs      = require('fs')
const path    = require('path')
const url     = require('url')
const crypto  = require('crypto')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const nodemailer = require('nodemailer').createTransport ? require('nodemailer') : null

// ── SQL.js (pure JS SQLite) ───────────────────────────────────────
let SQL, DB_FILE, _db = null
async function getDB(dbFile = ':memory:') {
  if (_db) return _db
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()
  if (dbFile !== ':memory:' && fs.existsSync(dbFile)) {
    _db = new SQL.Database(fs.readFileSync(dbFile))
  } else {
    _db = new SQL.Database()
  }
  DB_FILE = dbFile
  return _db
}
function persistDB() {
  if (!_db || !DB_FILE || DB_FILE === ':memory:') return
  try { fs.writeFileSync(DB_FILE, Buffer.from(_db.export())) } catch {}
}
let _dirty = false, _persistTimer = null
function dbRun(sql, params = []) {
  _db.run(sql, params)
  _dirty = true
  if (!_persistTimer) _persistTimer = setTimeout(() => {
    if (_dirty) { try { persistDB() } catch {} _dirty = false }
    _persistTimer = null
  }, 200)
}
function dbAll(sql, params = []) {
  const stmt = _db.prepare(sql); stmt.bind(params)
  const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free()
  return rows
}
function dbGet(sql, params = []) { return dbAll(sql, params)[0] || null }

// ── Helpers ───────────────────────────────────────────────────────
const uuid  = () => crypto.randomUUID()
const now   = () => new Date().toISOString()
const esc   = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const ic    = n => ({bolt:'⚡',rocket:'🚀',shield:'🛡',chart:'📊',star:'⭐',check:'✓',globe:'🌐',lock:'🔒',user:'👤',gear:'⚙',fire:'🔥',money:'💰',bell:'🔔',mail:'✉',heart:'❤',eye:'👁',tag:'🏷',search:'🔍',home:'🏠',plus:'＋',edit:'✏',trash:'🗑',info:'ℹ'}[n] || n)

// ── JWT ───────────────────────────────────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET || 'aiplang-secret-dev'
// Warn loudly if using dev secret in what looks like production
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[aiplang] FATAL: JWT_SECRET not set in production. Set JWT_SECRET env var.')
    process.exit(1)
  }
  console.warn('[aiplang] WARNING: JWT_SECRET not set. Using insecure dev default. Set JWT_SECRET in .env')
}
let JWT_EXPIRE = '7d'
const generateJWT = (user) => jwt.sign({ id: user.id, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRE })
const verifyJWT   = (token) => { try { return jwt.verify(token, JWT_SECRET) } catch { return null } }

// ── Queue system ──────────────────────────────────────────────────
const QUEUE = []
const WORKERS = {}
let QUEUE_RUNNING = false
function dispatch(jobName, payload) {
  QUEUE.push({ job: jobName, payload, id: uuid(), created: now(), attempts: 0 })
  if (!QUEUE_RUNNING) processQueue()
}
async function processQueue() {
  QUEUE_RUNNING = true
  while (QUEUE.length > 0) {
    const item = QUEUE.shift()
    const worker = WORKERS[item.job]
    if (worker) {
      try { await worker(item.payload) }
      catch (e) {
        item.attempts++
        if (item.attempts < 3) QUEUE.push(item)
        else console.error(`[aiplang:queue] Job ${item.job} failed after 3 attempts:`, e.message)
      }
    }
  }
  QUEUE_RUNNING = false
}

// ── Email ─────────────────────────────────────────────────────────
let MAIL_CONFIG = null
let MAIL_TRANSPORTER = null
function setupMail(config) {
  MAIL_CONFIG = config
  if (!nodemailer) return
  try {
    MAIL_TRANSPORTER = nodemailer.createTransport({
      host: config.host || 'smtp.gmail.com',
      port: parseInt(config.port || '587'),
      secure: config.port === '465',
      auth: { user: resolveEnv(config.user), pass: resolveEnv(config.pass) }
    })
  } catch {}
}
async function sendMail(opts) {
  if (!MAIL_TRANSPORTER) {
    console.log(`[aiplang:mail] MOCK — To: ${opts.to} | Subject: ${opts.subject}`)
    return { messageId: 'mock-' + uuid() }
  }
  return MAIL_TRANSPORTER.sendMail({
    from: MAIL_CONFIG?.from || process.env.MAIL_FROM || 'noreply@localhost',
    ...opts
  })
}

// ── Events system (simple pub/sub) ───────────────────────────────
const EVENT_LISTENERS = {}
function emit(event, data) {
  const listeners = EVENT_LISTENERS[event] || []
  listeners.forEach(fn => { try { fn(data) } catch {} })
}
function on(event, fn) {
  EVENT_LISTENERS[event] = EVENT_LISTENERS[event] || []
  EVENT_LISTENERS[event].push(fn)
}

// ═══════════════════════════════════════════════════════════════════
// ORM — enhanced Model
// ═══════════════════════════════════════════════════════════════════
const MODEL_DEFS = {}

function toTable(name) { return name.toLowerCase().replace(/([A-Z])/g,'_$1').replace(/^_/,'') + 's' }
function toCol(field) { return field.replace(/([A-Z])/g,'_$1').toLowerCase() }

class Model {
  constructor(name, def = null) {
    this.modelName  = name
    this.tableName  = toTable(name)
    this.def        = def || MODEL_DEFS[name] || {}
    this.softDelete = this.def.softDelete || false
    this.timestamps = this.def.timestamps !== false
  }

  // ── Core queries ────────────────────────────────────────────────
  all(opts = {}) {
    let sql = `SELECT * FROM ${this.tableName}`
    const params = [], conditions = []
    if (this.softDelete) conditions.push('deleted_at IS NULL')
    if (opts.where) { conditions.push(opts.where); if (opts.whereParams) params.push(...opts.whereParams) }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
    if (opts.order) {
      const safeOrder = /^[a-zA-Z_][a-zA-Z0-9_]*(\s+(asc|desc))?$/i
      if (safeOrder.test(String(opts.order))) sql += ` ORDER BY ${opts.order}`
    }
    if (opts.limit)  sql += ` LIMIT ${opts.limit}`
    if (opts.offset) sql += ` OFFSET ${opts.offset}`
    return dbAll(sql, params)
  }

  find(id) {
    let sql = `SELECT * FROM ${this.tableName} WHERE id = ?`
    if (this.softDelete) sql += ' AND deleted_at IS NULL'
    return dbGet(sql, [id])
  }

  findBy(field, value) {
    let sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ? LIMIT 1`
    if (this.softDelete) sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ? AND deleted_at IS NULL LIMIT 1`
    return dbGet(sql, [value])
  }

  where(field, op, value) {
    let sql = `SELECT * FROM ${this.tableName} WHERE ${field} ${op} ?`
    if (this.softDelete) sql += ' AND deleted_at IS NULL'
    return dbAll(sql, [value])
  }

  scope(name) {
    const scopeDef = this.def.scopes?.[name]
    if (!scopeDef) return this.all()
    return this.all({ where: scopeDef.where, order: scopeDef.order })
  }

  paginate(page = 1, perPage = 15, opts = {}) {
    const offset = (page - 1) * perPage
    let countSql = `SELECT COUNT(*) as count FROM ${this.tableName}`
    if (this.softDelete) countSql += ' WHERE deleted_at IS NULL'
    const total = dbGet(countSql)?.count || 0
    const data = this.all({ ...opts, limit: perPage, offset })
    return { data, meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage), from: offset + 1, to: Math.min(offset + perPage, total) } }
  }

  create(data) {
    const row = { ...data }
    if (!row.id) row.id = uuid()
    if (this.timestamps) {
      if (!row.created_at) row.created_at = now()
      if (!row.updated_at) row.updated_at = now()
    }
    const keys = Object.keys(row), vals = Object.values(row)
    dbRun(`INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, vals)
    emit(`${this.modelName}.created`, row)
    return row
  }

  update(id, data) {
    const row = { ...data }
    delete row.id; delete row.created_at; delete row.password
    if (this.timestamps) row.updated_at = now()
    const sets = Object.keys(row).map(k => `${k} = ?`).join(', ')
    dbRun(`UPDATE ${this.tableName} SET ${sets} WHERE id = ?`, [...Object.values(row), id])
    const updated = this.find(id)
    emit(`${this.modelName}.updated`, updated)
    return updated
  }

  delete(id) {
    if (this.softDelete) {
      dbRun(`UPDATE ${this.tableName} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), id])
      emit(`${this.modelName}.softDeleted`, { id })
    } else {
      dbRun(`DELETE FROM ${this.tableName} WHERE id = ?`, [id])
      emit(`${this.modelName}.deleted`, { id })
    }
  }

  restore(id) {
    if (this.softDelete) {
      dbRun(`UPDATE ${this.tableName} SET deleted_at = NULL WHERE id = ?`, [id])
    }
  }

  count(opts = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`
    const conditions = []
    if (this.softDelete) conditions.push('deleted_at IS NULL')
    if (opts.where) conditions.push(opts.where)
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
    return dbGet(sql)?.count || 0
  }

  sum(field, opts = {}) {
    let sql = `SELECT SUM(${field}) as total FROM ${this.tableName}`
    if (this.softDelete) sql += ' WHERE deleted_at IS NULL'
    return dbGet(sql)?.total || 0
  }

  avg(field) {
    let sql = `SELECT AVG(${field}) as avg FROM ${this.tableName}`
    if (this.softDelete) sql += ' WHERE deleted_at IS NULL'
    return parseFloat(dbGet(sql)?.avg || 0).toFixed(2)
  }

  // ── Relationships ───────────────────────────────────────────────
  hasMany(relModel, fk) {
    const m = new Model(relModel)
    return (parentId) => dbAll(`SELECT * FROM ${m.tableName} WHERE ${fk || this.modelName.toLowerCase() + '_id'} = ?`, [parentId])
  }
  belongsTo(relModel, fk) {
    const m = new Model(relModel)
    return (row) => m.find(row[fk || relModel.toLowerCase() + '_id'])
  }
  hasOne(relModel, fk) {
    const m = new Model(relModel)
    return (parentId) => dbGet(`SELECT * FROM ${m.tableName} WHERE ${fk || this.modelName.toLowerCase() + '_id'} = ? LIMIT 1`, [parentId])
  }

  // ── Observers / hooks ───────────────────────────────────────────
  observe(event, fn) { on(`${this.modelName}.${event}`, fn) }
}

// ═══════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════
function migrateModels(models) {
  for (const model of models) {
    const table = toTable(model.name)
    const cols = []
    for (const f of model.fields) {
      let sqlType = { uuid:'TEXT',int:'INTEGER',float:'REAL',bool:'INTEGER',timestamp:'TEXT',json:'TEXT',enum:'TEXT',text:'TEXT' }[f.type] || 'TEXT'
      let def = `${toCol(f.name)} ${sqlType}`
      if (f.modifiers.includes('pk')) def += ' PRIMARY KEY'
      if (f.modifiers.includes('required')) def += ' NOT NULL'
      if (f.modifiers.includes('unique')) def += ' UNIQUE'
      if (f.default !== null) def += ` DEFAULT '${f.default}'`
      cols.push(def)
    }
    for (const rel of model.relationships || []) {
      if (rel.type === 'belongsTo') cols.push(`${rel.model.toLowerCase()}_id TEXT`)
    }
    if (!cols.some(c=>c.startsWith('created_at'))) cols.push('created_at TEXT')
    if (!cols.some(c=>c.startsWith('updated_at'))) cols.push('updated_at TEXT')
    if (model.softDelete) { if (!cols.some(c=>c.startsWith('deleted_at'))) cols.push('deleted_at TEXT') }
    try { dbRun(`CREATE TABLE IF NOT EXISTS ${table} (${cols.join(', ')})`) } catch {}
    // Auto-index on unique + indexed fields
    for (const f of model.fields) {
      const colName = toCol(f.name)
      if (f.modifiers.includes('unique') || f.modifiers.includes('index')) {
        try { dbRun(`CREATE INDEX IF NOT EXISTS idx_${table}_${colName} ON ${table}(${colName})`) } catch {}
      }
    }
    // Always index created_at for pagination performance
    try { dbRun(`CREATE INDEX IF NOT EXISTS idx_${table}_created_at ON ${table}(created_at)`) } catch {}
    console.log(`[aiplang] ✓  ${table} (${cols.length} cols${model.softDelete ? ', soft-delete' : ''})`)
    MODEL_DEFS[model.name] = { softDelete: model.softDelete, timestamps: true }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════════════
function parseApp(src) {
  const app = { env:[], db:null, auth:null, mail:null, stripe:null, s3:null, plugins:[], middleware:[], models:[], apis:[], pages:[], jobs:[], events:[], admin:null }
  const lines = src.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))
  let i=0, inModel=false, inAPI=false, curModel=null, curAPI=null, pageLines=[], inPage=false

  while (i < lines.length) {
    const line = lines[i]
    if (line === '---') {
      if (inPage && pageLines.length) app.pages.push(parseFrontPage(pageLines.join('\n')))
      pageLines=[]; inPage=false; inModel=false; inAPI=false; curModel=null; curAPI=null; i++; continue
    }
    if (line.startsWith('%')) { inPage=true; inModel=false; inAPI=false; curModel=null; curAPI=null; pageLines.push(line); i++; continue }
    if (inPage) { pageLines.push(line); i++; continue }

    if (line.startsWith('~env '))         { app.env.push(parseEnvLine(line.slice(5))); i++; continue }
    if (line.startsWith('~db '))          { app.db = parseDBLine(line.slice(4)); i++; continue }
    if (line.startsWith('~auth '))        { app.auth = parseAuthLine(line.slice(6)); i++; continue }
    if (line.startsWith('~mail '))        { app.mail = parseMailLine(line.slice(6)); i++; continue }
    if (line.startsWith('~middleware '))  { app.middleware = line.slice(12).split('|').map(s=>s.trim()); i++; continue }
    if (line.startsWith('~admin'))        { app.admin = parseAdminLine(line); i++; continue }
    if (line.startsWith('~stripe '))       { app.stripe = parseStripeLine(line.slice(8)); i++; continue }
    if (line.startsWith('~plan '))         { app.stripe = app.stripe || {}; app.stripe.plans = app.stripe.plans || {}; parsePlanLine(line.slice(6), app.stripe.plans); i++; continue }
    if (line.startsWith('~s3 '))           { app.s3 = parseS3Line(line.slice(4)); i++; continue }
    if (line.startsWith('~plugin ') || line.startsWith('~use ')) { app.plugins.push(parsePluginLine(line)); i++; continue }
    if (line.startsWith('~job '))         { app.jobs.push(parseJobLine(line.slice(5))); i++; continue }
    if (line.startsWith('~on '))          { app.events.push(parseEventLine(line.slice(4))); i++; continue }

    if (line.startsWith('model ')) {
      if (inModel && curModel) app.models.push(curModel)
      curModel = { name: line.slice(6).replace('{','').trim(), fields:[], relationships:[], hooks:[], softDelete:false }
      inModel=true; inAPI=false; i++; continue
    }
    if (inModel && line === '}') { if (curModel) app.models.push(curModel); curModel=null; inModel=false; i++; continue }
    if (inModel && curModel) {
      if (line.startsWith('~has-many '))    curModel.relationships.push({ type:'hasMany', model:line.slice(10).trim() })
      else if (line.startsWith('~has-one '))curModel.relationships.push({ type:'hasOne', model:line.slice(9).trim() })
      else if (line.startsWith('~belongs '))curModel.relationships.push({ type:'belongsTo', model:line.slice(9).trim() })
      else if (line.startsWith('~hook '))   curModel.hooks.push(line.slice(6).trim())
      else if (line === '~soft-delete')     curModel.softDelete = true
      else if (line && line !== '{')        curModel.fields.push(parseField(line))
      i++; continue
    }

    if (line.startsWith('api ')) {
      if (inAPI && curAPI) app.apis.push(curAPI)
      const pts = line.slice(4).replace('{','').trim().split(/\s+/)
      curAPI = { method:pts[0], path:pts[1], guards:[], validate:[], query:[], body:[], return:null }
      inAPI=true; i++; continue
    }
    if (inAPI && line === '}') { if (curAPI) app.apis.push(curAPI); curAPI=null; inAPI=false; i++; continue }
    if (inAPI && curAPI) { parseAPILine(line, curAPI); i++; continue }
    i++
  }
  if (inPage && pageLines.length) app.pages.push(parseFrontPage(pageLines.join('\n')))
  if (inModel && curModel) app.models.push(curModel)
  if (inAPI && curAPI) app.apis.push(curAPI)
  return app
}

function parseEnvLine(s) { const p=s.split(/\s+/); const ev={name:'',required:false,default:null}; for(const x of p){if(x==='required')ev.required=true;else if(x.includes('=')){const[k,v]=x.split('=');ev.name=k;ev.default=v}else ev.name=x}; return ev }
function parseDBLine(s) { const p=s.split(/\s+/); return{driver:p[0]||'sqlite',dsn:p[1]||'./app.db'} }
function parseAuthLine(s) { const p=s.split(/\s+/); const a={provider:'jwt',secret:p[1]||'$JWT_SECRET',expire:'7d'}; for(const x of p){if(x.startsWith('expire='))a.expire=x.slice(7);if(x==='google')a.oauth=['google'];if(x==='github')a.oauth=[...(a.oauth||[]),'google']}; return a }
function parseMailLine(s) { const parts=s.split(/\s+/); const m={driver:parts[0]||'smtp'}; for(const x of parts.slice(1)){const[k,v]=x.split('='); m[k]=v}; return m }
function parseStripeLine(s) {
  const parts = s.split(/\s+/)
  const cfg = { key: parts[0] || '$STRIPE_SECRET_KEY', plans: {}, mode: 'subscription' }
  for (const p of parts.slice(1)) {
    if (p.startsWith('webhook=')) cfg.webhookSecret = p.slice(8)
    if (p.startsWith('success=')) cfg.successUrl = p.slice(8)
    if (p.startsWith('cancel='))  cfg.cancelUrl = p.slice(7)
    if (p === 'payment')          cfg.mode = 'payment'
  }
  return cfg
}
function parsePlanLine(s, plans) {
  // ~plan starter=price_xxx pro=price_yyy enterprise=price_zzz
  s.split(/\s+/).forEach(pair => {
    const eq = pair.indexOf('='); if (eq !== -1) plans[pair.slice(0,eq)] = pair.slice(eq+1)
  })
}
function parseS3Line(s) {
  // ~s3 $AWS_ACCESS_KEY_ID secret=$AWS_SECRET_ACCESS_KEY bucket=$S3_BUCKET region=us-east-1
  // ~s3 bucket=my-bucket region=eu-west-1 acl=public-read prefix=uploads/
  const parts = s.trim().split(/\s+/)
  const cfg = { key: null, secret: null, bucket: null, region: 'us-east-1', acl: 'private', prefix: '', maxSize: '10mb', allowedTypes: null }
  for (const p of parts) {
    if (p.startsWith('secret='))   cfg.secret = p.slice(7)
    else if (p.startsWith('bucket='))  cfg.bucket = p.slice(7)
    else if (p.startsWith('region='))  cfg.region = p.slice(7)
    else if (p.startsWith('acl='))     cfg.acl = p.slice(4)
    else if (p.startsWith('prefix='))  cfg.prefix = p.slice(7)
    else if (p.startsWith('maxSize=')) cfg.maxSize = p.slice(8)
    else if (p.startsWith('allow='))   cfg.allowedTypes = p.slice(6).split(',')
    else if (p.startsWith('endpoint='))cfg.endpoint = p.slice(9)  // custom endpoint (R2, MinIO, etc)
    else if (p && !p.includes('='))    cfg.key = p  // first bare token = access key
  }
  return cfg
}
function parsePluginLine(s) {
  // ~plugin ./my-plugin.js
  // ~use rate-limit max=100 window=60s
  // ~use cors origins=https://myapp.com,https://www.myapp.com
  const isUse = s.startsWith('~use ')
  const rest = s.slice(isUse ? 5 : 8).trim()
  const parts = rest.split(/\s+/)
  const name = parts[0]
  const opts = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq !== -1) opts[p.slice(0, eq)] = p.slice(eq + 1)
    else opts[p] = true
  }
  return { name, opts, inline: isUse }
}
function parseAdminLine(s) { const m=s.match(/~admin\s+(\S+)/); return{prefix:m?.[1]||'/admin',guard:'admin'} }
function parseJobLine(s) { const[name,...rest]=s.split(/\s+/); return{name,action:rest.join(' ')} }
function parseEventLine(s) { const m=s.match(/^(\S+)\s*=>\s*(.+)$/); return{event:m?.[1],action:m?.[2]} }
function parseField(line) {
  const p=line.split(':').map(s=>s.trim())
  const f={name:p[0],type:p[1]||'text',modifiers:[],enumVals:[],default:null}
  for(let j=2;j<p.length;j++){const x=p[j];if(x.startsWith('default='))f.default=x.slice(8);else if(x.startsWith('enum:'))f.enumVals=x.slice(5).split(',');else if(x)f.modifiers.push(x)}
  return f
}
function parseAPILine(line, route) {
  if(line.startsWith('~guard '))    route.guards=line.slice(7).split('|').map(s=>s.trim())
  else if(line.startsWith('~validate ')) line.slice(10).split('|').forEach(v=>{const p=v.trim().split(/\s+/);if(p[0])route.validate.push({field:p[0],rules:p.slice(1)})})
  else if(line.startsWith('~query '))   line.slice(7).split('|').forEach(q=>{q=q.trim();const eq=q.indexOf('=');route.query.push(eq!==-1?{name:q.slice(0,eq),default:q.slice(eq+1)}:{name:q,default:null})})
  else route.body.push(line)
}
function parseFrontPage(src) {
  const lines=src.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))
  const p={id:'page',theme:'dark',route:'/',themeVars:null,state:{},queries:[],blocks:[]}
  for(const line of lines){
    if(line.startsWith('%')){const pts=line.slice(1).trim().split(/\s+/);p.id=pts[0]||'page';p.route=pts[2]||'/';const rt=pts[1]||'dark';if(rt.includes('#')){const c=rt.split(',');p.theme='custom';p.customTheme={bg:c[0],text:c[1]||'#f1f5f9',accent:c[2]||'#2563eb'}}else p.theme=rt}
    else if(line.startsWith('~theme ')){p.themeVars=p.themeVars||{};line.slice(7).trim().split(/\s+/).forEach(pair=>{const eq=pair.indexOf('=');if(eq!==-1)p.themeVars[pair.slice(0,eq)]=pair.slice(eq+1)})}
    else if(line.startsWith('@')&&line.includes('=')){const eq=line.indexOf('=');p.state[line.slice(1,eq).trim()]=line.slice(eq+1).trim()}
    else if(line.startsWith('~')){const pts=line.slice(1).trim().split(/\s+/);const ai=pts.indexOf('=>');if(pts[0]==='mount')p.queries.push({trigger:'mount',method:pts[1],path:pts[2],target:ai===-1?pts[3]:null,action:ai!==-1?pts.slice(ai+1).join(' '):null});else if(pts[0]==='interval')p.queries.push({trigger:'interval',interval:parseInt(pts[1]),method:pts[2],path:pts[3],target:ai===-1?pts[4]:null,action:ai!==-1?pts.slice(ai+1).join(' '):null})}
    else p.blocks.push({kind:blockKind(line),rawLine:line})
  }
  return p
}
function blockKind(line){const bi=line.indexOf('{');if(bi===-1)return'unknown';const h=line.slice(0,bi).trim();const m=h.match(/^([a-z]+)\d+$/);return m?m[1]:h}

// ═══════════════════════════════════════════════════════════════════
// ROUTE COMPILER
// ═══════════════════════════════════════════════════════════════════
function compileRoute(route, server) {
  server.addRoute(route.method, route.path, async (req, res) => {
    const ctx = { req, res, params:req.params, body:req.body, query:req.query, user:req.user, vars:{}, models:server.models }

    // Guards
    for (const guard of route.guards) {
      if (guard === 'auth' && !req.user)                            { res.error(401, 'Unauthorized'); return }
      if (guard === 'admin' && req.user?.role !== 'admin')          { res.error(403, 'Forbidden'); return }
      if (guard === 'subscribed') {
        const activeStatuses = ['active', 'trialing']
        if (!req.user || (!activeStatuses.includes(req.user.subscription_status) && req.user.plan === 'free')) {
          res.error(402, 'Active subscription required')
          return
        }
      }
      if (guard === 'owner') {
        if (!req.user) { res.error(401, 'Unauthorized'); return }
        // owner check happens in ops
      }
    }

    // Query params
    for (const qp of route.query) ctx.vars[qp.name] = req.query[qp.name] ?? qp.default

    // Validation
    for (const v of route.validate) {
      const val = ctx.body[v.field]
      for (const rule of v.rules) {
        if (rule === 'required' && (!val && val !== 0)) { res.error(422, `${v.field} is required`); return }
        if (rule === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { res.error(422, `${v.field} must be a valid email`); return }
        if (rule.startsWith('min=') && (!val || String(val).length < parseInt(rule.slice(4)))) { res.error(422, `${v.field} min length is ${rule.slice(4)}`); return }
        if (rule.startsWith('max=') && val && String(val).length > parseInt(rule.slice(4))) { res.error(422, `${v.field} max length is ${rule.slice(4)}`); return }
        if (rule === 'numeric' && val && isNaN(Number(val))) { res.error(422, `${v.field} must be numeric`); return }
        if (rule.startsWith('in:') && val && !rule.slice(3).split(',').includes(val)) { res.error(422, `${v.field} must be one of: ${rule.slice(3)}`); return }
        if (rule.startsWith('unique:')) { const m=server.models[rule.slice(7)]; if(m&&m.findBy(v.field,val)){ res.error(409,`${v.field} already exists`); return } }
        if (rule.startsWith('exists:')) { const m=server.models[rule.slice(7)]; if(m&&!m.find(val)){ res.error(422,`${v.field} not found`); return } }
      }
    }

    // Execute ops
    for (const op of route.body) {
      const result = await execOp(op, ctx, server)
      if (result === '__DONE__') return
      if (result !== null && result !== undefined) ctx.lastResult = result
    }

    if (!res.writableEnded) res.json(200, ctx.lastResult ?? {})
  })
}

async function execOp(line, ctx, server) {
  line = line.trim(); if (!line) return null

  // ~hash field
  if (line.startsWith('~hash ')) { const f=line.slice(6).trim(); if(ctx.body[f])ctx.body[f]=await bcrypt.hash(ctx.body[f],12); return null }

  // ~check password plain hashed | status
  if (line.startsWith('~check ')) {
    const p=line.slice(7).trim().split(/\s+/)
    const plain=resolveVar(p[1],ctx), hashed=resolveVar(p[2],ctx), status=parseInt(p[4])||401
    const ok=await bcrypt.compare(String(plain||''),String(hashed||''))
    if (!ok) { ctx.res.error(status,'Invalid credentials'); return '__DONE__' }
    return null
  }

  // ~unique Model field value | status
  if (line.startsWith('~unique ')) {
    const p=line.slice(8).trim().split(/\s+/)
    const m=server.models[p[0]]; if(m&&m.findBy(p[1],resolveVar(p[2],ctx))){ ctx.res.error(parseInt(p[4])||409,`${p[1]} already exists`); return '__DONE__' }
    return null
  }

  // ~dispatch jobName payload
  if (line.startsWith('~dispatch ')) {
    const p=line.slice(10).trim().split(/\s+/)
    dispatch(p[0], resolveVar(p.slice(1).join(' '), ctx))
    return null
  }

  // ~mail to subject body
  if (line.startsWith('~mail ')) {
    const expr=line.slice(6).trim()
    const m=expr.match(/^(\S+)\s+"([^"]+)"\s+"([^"]+)"/)
    if (m) await sendMail({ to:resolveVar(m[1],ctx), subject:m[2], text:m[3] })
    return null
  }

  // ~emit event data
  if (line.startsWith('~emit ')) {
    const p=line.slice(6).trim().split(/\s+/)
    emit(p[0], resolveVar(p.slice(1).join(' '),ctx))
    return null
  }

  // $var = expr
  if (line.startsWith('$') && line.includes('=')) {
    const eq=line.indexOf('=')
    const varName=line.slice(1,eq).trim()
    ctx.vars[varName] = evalExpr(line.slice(eq+1).trim(), ctx, server)
    return null
  }

  // insert Model($body)
  if (line.startsWith('insert ')) {
    const modelName=line.match(/insert\s+(\w+)/)?.[1]; const m=server.models[modelName]
    if (m) { ctx.vars['inserted']=m.create({...ctx.body}); return ctx.vars['inserted'] }
    return null
  }

  // update Model($id, $body)
  if (line.startsWith('update ')) {
    const modelName=line.match(/update\s+(\w+)/)?.[1]; const m=server.models[modelName]
    if (m) { const id=ctx.params.id||ctx.vars['id']; ctx.vars['updated']=m.update(id,{...ctx.body}); return ctx.vars['updated'] }
    return null
  }

  // delete Model($id)
  if (line.startsWith('delete ')) {
    const modelName=line.match(/delete\s+(\w+)/)?.[1]; const m=server.models[modelName]
    if (m) { m.delete(ctx.params.id||ctx.vars['id']); ctx.res.noContent(); return '__DONE__' }
    return null
  }

  // restore Model($id) - soft delete restore
  if (line.startsWith('restore ')) {
    const modelName=line.match(/restore\s+(\w+)/)?.[1]; const m=server.models[modelName]
    if (m) { m.restore(ctx.params.id); return m.find(ctx.params.id) }
    return null
  }

  // return expr status
  if (line.startsWith('return ')) {
    const p=line.slice(7).trim().split(/\s+/)
    const status=parseInt(p[p.length-1])||200
    const exprParts=isNaN(parseInt(p[p.length-1]))?p:p.slice(0,-1)
    let result=evalExpr(exprParts.join(' '),ctx,server)
    if(result===null||result===undefined)result=ctx.vars['inserted']||ctx.vars['updated']||{}
    ctx.res.json(status,result); return '__DONE__'
  }

  return null
}

function evalExpr(expr, ctx, server) {
  expr=expr.trim()
  if (expr.startsWith('jwt('))       { const vn=expr.match(/jwt\(\$([^)]+)\)/)?.[1]; const u=vn?ctx.vars[vn]:ctx.body; return{token:generateJWT(u),user:sanitize(u)} }
  if (expr==='$auth.user'||expr==='$auth') return ctx.user
  if (expr.includes('.all('))        { return evalModelOp('all', expr, ctx, server) }
  if (expr.includes('.find('))       { return evalModelOp('find', expr, ctx, server) }
  if (expr.includes('.findBy('))     { return evalModelOp('findBy', expr, ctx, server) }
  if (expr.includes('.paginate('))   { return evalModelOp('paginate', expr, ctx, server) }
  if (expr.includes('.count('))      { return evalModelOp('count', expr, ctx, server) }
  if (expr.includes('.sum('))        { return evalModelOp('sum', expr, ctx, server) }
  if (expr.includes('.avg('))        { return evalModelOp('avg', expr, ctx, server) }
  if (expr.includes('.where('))      { return evalModelOp('where', expr, ctx, server) }
  if (expr.includes('.scope('))      { return evalModelOp('scope', expr, ctx, server) }
  if (expr.startsWith('$'))          { return resolveVar(expr, ctx) }
  return expr
}

function evalModelOp(op, expr, ctx, server) {
  const modelName=expr.match(/^(\w+)\./)?.[1]; const m=server.models[modelName]; if(!m)return op==='all'?[]:null
  const inner=expr.match(/\.\w+\(([^)]*)\)/)?.[1]||''
  const getArg=(key)=>{ const r=inner.match(new RegExp(key+'=([^,)]+)')); return r?resolveVar(r[1],ctx):null }
  if(op==='all') return m.all({limit:getArg('limit'),offset:getArg('offset')||evalMath(getArg('_offset')||'0',ctx),order:getArg('order'),where:getArg('where')})
  if(op==='find') { const id=inner.trim(); return m.find(resolveVar(id,ctx)||ctx.params.id) }
  if(op==='findBy') { const[f,v]=inner.split('='); return m.findBy(f.trim(),resolveVar(v?.trim(),ctx)) }
  if(op==='paginate') { const[pg,pp]=inner.split(','); return m.paginate(parseInt(resolveVar(pg?.trim(),ctx))||1,parseInt(resolveVar(pp?.trim(),ctx))||15) }
  if(op==='count') return m.count()
  if(op==='sum') return m.sum(inner.trim())
  if(op==='avg') return m.avg(inner.trim())
  if(op==='where') { const p=inner.split(','); return m.where(p[0]?.trim(),p[1]?.trim()||'=',resolveVar(p[2]?.trim(),ctx)) }
  if(op==='scope') return m.scope(inner.trim())
  return null
}

function resolveVar(expr, ctx) {
  if (!expr) return undefined; expr=expr.trim()
  if (expr.startsWith('$body.'))  return ctx.body[expr.slice(6)]
  if (expr==='$id'||expr==='$params.id') return ctx.params.id
  if (expr.startsWith('$params.'))return ctx.params[expr.slice(8)]
  if (expr.startsWith('$query.')) return ctx.query[expr.slice(7)]
  if (expr.startsWith('$auth.'))  return ctx.user?.[expr.slice(6)]
  if (expr.startsWith('$')) { const path=expr.slice(1).split('.'); let v=ctx.vars[path[0]]; for(let i=1;i<path.length;i++)v=v?.[path[i]]; return v }
  return expr
}
function evalMath(expr,ctx){try{const r=expr.replace(/\$[\w.]+/g,m=>resolveVar(m,ctx)||0);return Function('"use strict";return('+r+')')()}catch{return 0}}
function sanitize(o){if(!o)return o;const s={...o};delete s.password;return s}
function resolveEnv(v){if(!v)return v;if(v.startsWith('$'))return process.env[v.slice(1)]||null;return v}

// ═══════════════════════════════════════════════════════════════════
// AUTO ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════
function registerAdminPanel(server, adminConfig, models) {
  const prefix = adminConfig.prefix || '/admin'
  const guard  = adminConfig.guard || 'admin'

  // Admin dashboard
  server.addRoute('GET', prefix, (req, res) => {
    if (guard === 'admin' && req.user?.role !== 'admin') {
      res.writeHead(302, { Location: prefix + '/login' }); res.end(); return
    }
    const html = renderAdminDashboard(prefix, models, server.models)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html)
  })

  // Admin login page
  server.addRoute('GET', prefix + '/login', (req, res) => {
    const html = renderAdminLogin(prefix)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html)
  })

  // Admin API: list model records
  server.addRoute('GET', prefix + '/api/:model', (req, res) => {
    if (guard === 'admin' && req.user?.role !== 'admin') { res.error(403, 'Forbidden'); return }
    const modelName = req.params.model.charAt(0).toUpperCase() + req.params.model.slice(1).replace(/s$/, '')
    const m = server.models[modelName]
    if (!m) { res.error(404, 'Model not found'); return }
    const page = parseInt(req.query.page) || 1
    res.json(200, m.paginate(page, 20))
  })

  // Admin API: delete record
  server.addRoute('DELETE', prefix + '/api/:model/:id', (req, res) => {
    if (guard === 'admin' && req.user?.role !== 'admin') { res.error(403, 'Forbidden'); return }
    const modelName = req.params.model.charAt(0).toUpperCase() + req.params.model.slice(1).replace(/s$/, '')
    const m = server.models[modelName]
    if (!m) { res.error(404, 'Model not found'); return }
    m.delete(req.params.id)
    res.noContent()
  })

  // Admin API: update record
  server.addRoute('PUT', prefix + '/api/:model/:id', (req, res) => {
    if (guard === 'admin' && req.user?.role !== 'admin') { res.error(403, 'Forbidden'); return }
    const modelName = req.params.model.charAt(0).toUpperCase() + req.params.model.slice(1).replace(/s$/, '')
    const m = server.models[modelName]
    if (!m) { res.error(404, 'Model not found'); return }
    const updated = m.update(req.params.id, req.body)
    res.json(200, updated)
  })

  console.log(`[aiplang] Admin: ${prefix} (guard: ${guard})`)
}

function renderAdminDashboard(prefix, modelDefs, models) {
  const modelNames = modelDefs.map(m => m.name)
  const stats = modelNames.map(name => {
    const m = models[name]; const count = m?.count() || 0
    return `<div class="stat-card"><div class="stat-num">${count}</div><div class="stat-label">${name}s</div></div>`
  }).join('')
  const nav = modelNames.map(name =>
    `<a href="#" onclick="loadModel('${name}')" class="nav-link">${name}s</a>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>aiplang Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#030712;color:#f1f5f9;min-height:100vh}
.sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:#0f172a;border-right:1px solid #1e293b;padding:1.5rem}
.sidebar .brand{font-size:1.25rem;font-weight:800;color:#2563eb;margin-bottom:2rem}
.sidebar .brand span{color:#64748b;font-weight:400;font-size:.875rem;display:block;margin-top:.25rem}
.nav-link{display:block;padding:.625rem 1rem;border-radius:.5rem;color:#94a3b8;font-size:.875rem;font-weight:500;cursor:pointer;text-decoration:none;margin-bottom:.25rem}
.nav-link:hover{background:#1e293b;color:#f1f5f9}.main{margin-left:240px;padding:2rem}
.header{margin-bottom:2rem}.header h1{font-size:1.75rem;font-weight:800;letter-spacing:-.03em}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:2rem}
.stat-card{background:#0f172a;border:1px solid #1e293b;border-radius:1rem;padding:1.5rem;text-align:center}
.stat-num{font-size:2.5rem;font-weight:900;color:#2563eb;letter-spacing:-.05em;line-height:1}
.stat-label{font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:.5rem;font-weight:600}
.table-wrap{background:#0f172a;border:1px solid #1e293b;border-radius:1rem;overflow:hidden}
.table-header{padding:1.25rem 1.5rem;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between}
.table-title{font-weight:700;font-size:1rem}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{padding:.875rem 1.25rem;text-align:left;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;border-bottom:1px solid #1e293b}
td{padding:.875rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);color:#94a3b8;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-sm{border:none;cursor:pointer;font-size:.75rem;font-weight:600;padding:.3rem .75rem;border-radius:.375rem;font-family:inherit}
.btn-delete{background:#7f1d1d;color:#fca5a5}.btn-delete:hover{background:#991b1b}
.pagination{padding:1rem 1.5rem;display:flex;gap:.5rem;justify-content:flex-end}
.page-btn{padding:.375rem .75rem;border-radius:.375rem;border:1px solid #1e293b;background:transparent;color:#64748b;cursor:pointer;font-size:.8125rem}
.page-btn.active{background:#2563eb;color:#fff;border-color:#2563eb}
.empty{text-align:center;padding:3rem;color:#334155}
#content{min-height:200px}
</style></head><body>
<div class="sidebar">
  <div class="brand">aiplang Admin<span>v2.0.1</span></div>
  <a href="${prefix}" class="nav-link" style="color:#f1f5f9;background:#1e293b">📊 Dashboard</a>
  ${nav}
</div>
<div class="main">
  <div class="header"><h1>Dashboard</h1></div>
  <div class="stats">${stats}</div>
  <div id="content"><div class="table-wrap"><div class="empty">← Selecione um modelo na sidebar</div></div></div>
</div>
<script>
const prefix = '${prefix}'
// API calls use credentials:include — HttpOnly cookie is sent automatically
async function api(method, path, body) {
  const r = await fetch(prefix + '/api' + path, {
    method,
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  })
  return r.json()
}
async function loadModel(name, page=1) {
  const table = name.toLowerCase() + 's'
  const data = await api('GET', '/' + table + '?page=' + page)
  const rows = data.data || []
  const meta = data.meta || {}
  const cols = rows.length ? Object.keys(rows[0]).filter(k => !['password','deleted_at'].includes(k)) : []
  const ths = cols.map(c=>'<th>'+c+'</th>').join('') + '<th>Actions</th>'
  const trs = rows.map(r=>{
    const tds = cols.map(c=>'<td title="'+String(r[c]||'').replace(/"/g,'&quot;')+'">'+String(r[c]||'-').slice(0,40)+'</td>').join('')
    return '<tr>'+tds+'<td><button class="btn-sm btn-delete" onclick="del(\\'' + table + '\\',\\''+r.id+'\\')">Delete</button></td></tr>'
  }).join('')
  const pages = Array.from({length:meta.last_page||1},(_,i)=>'<button class="page-btn'+(i+1===page?' active':'')+'" onclick="loadModel(\\'' + name + '\\',' + (i+1) + ')">'+(i+1)+'</button>').join('')
  document.getElementById('content').innerHTML = '<div class="table-wrap"><div class="table-header"><span class="table-title">'+name+'s</span><span style="color:#64748b;font-size:.8125rem">'+meta.total+' records</span></div>' + (rows.length ? '<table><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table>' : '<div class="empty">No records</div>') + '<div class="pagination">'+pages+'</div></div>'
}
async function del(table, id) {
  if (!confirm('Delete this record?')) return
  await api('DELETE', '/' + table + '/' + id)
  const name = table.charAt(0).toUpperCase() + table.slice(1).replace(/s$/, '')
  loadModel(name)
}
</script></body></html>`
}

function renderAdminLogin(prefix) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin Login</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#030712;color:#f1f5f9;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#0f172a;border:1px solid #1e293b;border-radius:1.25rem;padding:2.5rem;width:100%;max-width:360px}.h1{font-size:1.5rem;font-weight:800;margin-bottom:1.75rem;letter-spacing:-.03em}.field{margin-bottom:1.25rem}label{display:block;font-size:.8125rem;font-weight:600;margin-bottom:.5rem;color:#94a3b8}input{width:100%;padding:.75rem 1rem;background:#020617;border:1px solid #1e293b;border-radius:.625rem;color:#f1f5f9;font-size:.9375rem;outline:none}input:focus{border-color:#2563eb}button{width:100%;padding:.875rem;background:#2563eb;color:#fff;border:none;border-radius:.625rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-top:.5rem}.err{color:#f87171;font-size:.8125rem;margin-top:.5rem;min-height:1.25rem}</style></head>
<body><div class="card"><div class="h1">aiplang Admin</div>
<div class="field"><label>Email</label><input id="email" type="email" placeholder="admin@app.com"></div>
<div class="field"><label>Password</label><input id="pass" type="password" placeholder="••••••••"></div>
<div class="err" id="err"></div>
<button onclick="login()">Sign in</button></div>
<script>
async function login(){
  const r=await fetch('${prefix}/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('pass').value}),credentials:'same-origin'})
  const d=await r.json()
  if(d.ok){location.href='${prefix}'}
  else document.getElementById('err').textContent=d.error||'Invalid credentials'
}
document.addEventListener('keydown',e=>{if(e.key==='Enter')login()})
</script></body></html>`
}

// ═══════════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════════
class AiplangServer {
  constructor() { this.routes=[]; this.models={} }
  addRoute(method, p, handler) { this.routes.push({method:method.toUpperCase(),path:p,handler,params:p.split('/').filter(s=>s.startsWith(':')).map(s=>s.slice(1))}) }
  registerModel(name, def) { this.models[name]=new Model(name, def); return this.models[name] }

  async handle(req, res) {
    const _start = Date.now()

    // Multipart — don't pre-parse, let S3 upload handler do it
    const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data')
    const hasJsonCT = (req.headers['content-type'] || '').includes('application/json')
    if (req.method !== 'GET' && req.method !== 'DELETE' && !isMultipart) {
      req.body = await parseBody(req)
      if (req.body.__tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' })); return
      }
    } else if (!isMultipart) req.body = {}

    const parsed = url.parse(req.url, true)
    req.query = parsed.query; req.path = parsed.pathname
    req.user = extractToken(req) ? verifyJWT(extractToken(req)) : null

    // Plugin: rate-limit
    if (this._rateLimiter && this._rateLimiter(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Too many requests' })); return
    }
    // Auto rate-limit on auth endpoints
    if (this._authRateLimit && this._authRateLimit(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Too many requests. Try again in 1 minute.' })); return
    }

    // CORS — use plugin config if set, otherwise allow all
    const origins = this._corsOrigins || ['*']
    const origin = req.headers['origin'] || ''
    // Warn once if using wildcard CORS in production
    if (origins.includes('*') && process.env.NODE_ENV === 'production' && !this._corsWarned) {
      this._corsWarned = true
      console.warn('[aiplang] WARNING: CORS is set to * (allow all origins). Use ~use cors origins=https://yourdomain.com in production')
    }
    const allowOrigin = origins.includes('*') ? '*' : (origins.includes(origin) ? origin : origins[0])
    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization')
    if (req.method==='OPTIONS') { res.writeHead(204); res.end(); return }

    // Plugin: helmet (security headers)
    if (this._helmetHeaders) {
      for (const [k, v] of Object.entries(this._helmetHeaders)) res.setHeader(k, v)
    }

    for (const route of this.routes) {
      if (route.method !== req.method) continue
      const match = matchRoute(route.path, req.path); if (!match) continue
      req.params = match
      res.json    = (s, d) => { if(typeof s==='object'){d=s;s=200}; res.writeHead(s,{'Content-Type':'application/json'}); res.end(JSON.stringify(d)) }
      res.error   = (s, m) => res.json(s, {error:m})
      res.noContent = () => { res.writeHead(204); res.end() }
      res.redirect  = (u) => { res.writeHead(302,{Location:u}); res.end() }
      try { await route.handler(req, res) } catch(e) { console.error('[aiplang] Error:', e.message); if(!res.writableEnded) res.json(500,{error:'Internal server error'}) }
      if (this._requestLogger) this._requestLogger(req, Date.now() - _start)
      return
    }
    res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Not found'}))
  }

  listen(port) {
    http.createServer((req,res)=>this.handle(req,res)).listen(port,()=>console.log(`[aiplang] Server → http://localhost:${port}`))
  }
}

// ── Utils ─────────────────────────────────────────────────────────
function matchRoute(pattern, reqPath) {
  const pp=pattern.split('/'), rp=reqPath.split('/')
  if(pp.length!==rp.length)return null
  const params={}
  for(let i=0;i<pp.length;i++){if(pp[i].startsWith(':'))params[pp[i].slice(1)]=rp[i];else if(pp[i]!==rp[i])return null}
  return params
}
function extractToken(req) {
  // 1. Bearer token from Authorization header
  const a = req.headers.authorization
  if (a?.startsWith('Bearer ')) return a.slice(7)
  // 2. HttpOnly cookie (admin panel)
  const cookies = req.headers['cookie'] || ''
  const adminCookie = cookies.split(';').map(s=>s.trim()).find(s=>s.startsWith('aiplang_admin='))
  if (adminCookie) return adminCookie.slice('aiplang_admin='.length)
  return null
}
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || '1048576') // 1MB default
async function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0, done = false
    req.on('data', chunk => {
      if (done) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) { done = true; resolve({ __tooBig: true }); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (done) return
      done = true
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch { resolve({}) }
    })
    req.on('error', () => { if (!done) { done = true; resolve({}) } })
  })
}

// ═══════════════════════════════════════════════════════════════════
// FRONTEND RENDERER (same as v1)
// ═══════════════════════════════════════════════════════════════════
function renderHTML(page, allPages) {
  const needsJS=page.queries.length>0||page.blocks.some(b=>['table','form','if','btn','select','faq'].includes(b.kind))
  const body=page.blocks.map(b=>renderBlock(b)).join('')
  const config=needsJS?JSON.stringify({id:page.id,theme:page.theme,state:page.state,routes:allPages.map(p=>p.route),queries:page.queries}):''
  const hydrate=needsJS?`<script>window.__AIPLANG_PAGE__=${config};</script><script src="/aiplang-hydrate.js" defer></script>`:''
  const themeCSS=page.themeVars?genThemeCSS(page.themeVars):''
  const customCSS=page.customTheme?`body{background:${page.customTheme.bg};color:${page.customTheme.text}}.fx-cta,.fx-btn{background:${page.customTheme.accent};color:#fff}`  :''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.id}</title><style>${baseCSS(page.theme)}${customCSS}${themeCSS}</style></head><body>${body}${hydrate}</body></html>`
}

function renderBlock(b) {
  const line=b.rawLine
  let animate='',extraClass=''
  const am=line.match(/\banimate:(\S+)/); if(am)animate='fx-anim-'+am[1]
  const cm=line.match(/\bclass:(\S+)/); if(cm)extraClass=cm[1]
  const addCls=(html)=>animate||extraClass?html.replace(/class="([^"]*)"/, (_,c)=>`class="${c} ${animate} ${extraClass}".trim().replace(/  +/g,' ')`):html

  switch(b.kind){
    case 'nav':  return addCls(rNav(line))
    case 'hero': return addCls(rHero(line))
    case 'stats':return addCls(rStats(line))
    case 'row':  return addCls(rRow(line))
    case 'sect': return addCls(rSect(line))
    case 'foot': return addCls(rFoot(line))
    case 'table':return rTable(line)
    case 'form': return rForm(line)
    case 'pricing':return rPricing(line)
    case 'faq': return rFaq(line)
    case 'testimonial':return rTestimonial(line)
    case 'gallery':return rGallery(line)
    case 'raw': return extractBody(line)+'\n'
    case 'if':  return `<div class="fx-if-wrap" data-fx-if="${esc(extractCond(line))}" style="display:none"></div>\n`
    default: return ''
  }
}

function extractBody(line){const bi=line.indexOf('{'),li=line.lastIndexOf('}');return bi!==-1&&li!==-1?line.slice(bi+1,li).trim():''}
function extractCond(line){return line.slice(3,line.indexOf('{')).trim()}
function parseItems(body){return body.split('|').map(raw=>{raw=raw.trim();if(!raw)return null;return raw.split('>').map(f=>{f=f.trim();if(f.startsWith('img:'))return{isImg:true,src:f.slice(4)};if(f.startsWith('/'))return{isLink:true,path:f.split(':')[0].trim(),label:(f.split(':')[1]||'').trim()};return{isLink:false,text:f}})}).filter(Boolean)}

function rNav(line){const items=parseItems(extractBody(line));if(!items[0])return '';const it=items[0],brand=!it[0]?.isLink?`<span class="fx-brand">${esc(it[0].text)}</span>`:'';const start=!it[0]?.isLink?1:0;const links=it.slice(start).filter(f=>f.isLink).map(f=>`<a href="${esc(f.path)}" class="fx-nav-link">${esc(f.label)}</a>`).join('');return`<nav class="fx-nav">${brand}<button class="fx-hamburger" onclick="this.classList.toggle('open');document.querySelector('.fx-nav-links').classList.toggle('open')"><span></span><span></span><span></span></button><div class="fx-nav-links">${links}</div></nav>\n`}
function rHero(line){const items=parseItems(extractBody(line));let h1='',sub='',img='',ctas='';for(const item of items)for(const f of item){if(f.isImg)img=`<img src="${esc(f.src)}" class="fx-hero-img" alt="hero" loading="eager">`;else if(f.isLink)ctas+=`<a href="${esc(f.path)}" class="fx-cta">${esc(f.label)}</a>`;else if(!h1)h1=`<h1 class="fx-title">${esc(f.text)}</h1>`;else sub+=`<p class="fx-sub">${esc(f.text)}</p>`};return`<section class="fx-hero${img?' fx-hero-split':''}"><div class="fx-hero-inner">${h1}${sub}${ctas}</div>${img}</section>\n`}
function rStats(line){return`<div class="fx-stats">${parseItems(extractBody(line)).map(item=>{const[val,lbl]=(item[0]?.text||'').split(':');const bind=(val?.includes('@')||val?.includes('$'))?` data-fx-bind="${esc(val?.trim())}"` :'';return`<div class="fx-stat"><div class="fx-stat-val"${bind}>${esc(val?.trim())}</div><div class="fx-stat-lbl">${esc(lbl?.trim())}</div></div>`}).join('')}</div>\n`}
function rRow(line){const bi=line.indexOf('{'),head=line.slice(0,bi).trim(),m=head.match(/row(\d+)/),cols=m?parseInt(m[1]):3;const cards=parseItems(extractBody(line)).map(item=>`<div class="fx-card">${item.map((f,fi)=>f.isImg?`<img src="${esc(f.src)}" class="fx-card-img" alt="" loading="lazy">`:f.isLink?`<a href="${esc(f.path)}" class="fx-card-link">${esc(f.label)} →</a>`:fi===0?`<div class="fx-icon">${ic(f.text)}</div>`:fi===1?`<h3 class="fx-card-title">${esc(f.text)}</h3>`:`<p class="fx-card-body">${esc(f.text)}</p>`).join('')}</div>`).join('');return`<div class="fx-grid fx-grid-${cols}">${cards}</div>\n`}
function rSect(line){let inner='';parseItems(extractBody(line)).forEach((item,ii)=>item.forEach(f=>{if(f.isLink)inner+=`<a href="${esc(f.path)}" class="fx-sect-link">${esc(f.label)}</a>`;else if(ii===0)inner+=`<h2 class="fx-sect-title">${esc(f.text)}</h2>`;else inner+=`<p class="fx-sect-body">${esc(f.text)}</p>`}));return`<section class="fx-sect">${inner}</section>\n`}
function rFoot(line){let inner='';for(const item of parseItems(extractBody(line)))for(const f of item){if(f.isLink)inner+=`<a href="${esc(f.path)}" class="fx-footer-link">${esc(f.label)}</a>`;else inner+=`<p class="fx-footer-text">${esc(f.text)}</p>`};return`<footer class="fx-footer">${inner}</footer>\n`}
function rTable(line){const bi=line.indexOf('{'),binding=line.slice(6,bi).trim(),content=extractBody(line),em=content.match(/edit\s+(PUT|PATCH)\s+(\S+)/),dm=content.match(/delete\s+(?:DELETE\s+)?(\S+)/);const clean=content.replace(/edit\s+(PUT|PATCH)\s+\S+/g,'').replace(/delete\s+(?:DELETE\s+)?\S+/g,'');const cols=clean.split('|').map(c=>{c=c.trim();if(c.startsWith('empty:')||!c)return null;const[l,k]=c.split(':').map(x=>x.trim());return k?{label:l,key:k}:null}).filter(Boolean);const emptyMsg=clean.match(/empty:\s*([^|]+)/)?.[1]||'No data.';const ths=cols.map(c=>`<th class="fx-th">${esc(c.label)}</th>`).join('');const at=(em||dm)?'<th class="fx-th fx-th-actions">Actions</th>':'';return`<div class="fx-table-wrap"><table class="fx-table" data-fx-table="${esc(binding)}" data-fx-cols='${JSON.stringify(cols.map(c=>c.key))}'${em?` data-fx-edit="${esc(em[2])}" data-fx-edit-method="${esc(em[1])}"`  :''  }${dm?` data-fx-delete="${esc(dm[1])}"`  :''  }><thead><tr>${ths}${at}</tr></thead><tbody class="fx-tbody"><tr><td colspan="${cols.length+(em||dm?1:0)}" class="fx-td-empty">${esc(emptyMsg)}</td></tr></tbody></table></div>\n`}
function rForm(line){const bi=line.indexOf('{');let head=line.slice(5,bi).trim(),action='',method='POST',bpath='#';const ai=head.indexOf('=>');if(ai!==-1){action=head.slice(ai+2).trim();head=head.slice(0,ai).trim()};const pts=head.split(/\s+/);method=pts[0]||'POST';bpath=pts[1]||'#';const fields=extractBody(line).split('|').map(f=>{const[label,type,ph]=f.split(':').map(x=>x.trim());if(!label)return'';const name=label.toLowerCase().replace(/\s+/g,'_');const inp=type==='select'?`<select class="fx-input" name="${esc(name)}"><option value="">Select...</option></select>`:`<input class="fx-input" type="${esc(type||'text')}" name="${esc(name)}" placeholder="${esc(ph||'')}">`;return`<div class="fx-field"><label class="fx-label">${esc(label)}</label>${inp}</div>`}).join('');return`<div class="fx-form-wrap"><form class="fx-form" data-fx-form="${esc(bpath)}" data-fx-method="${esc(method)}" data-fx-action="${esc(action)}">${fields}<div class="fx-form-msg"></div><button type="submit" class="fx-btn">Submit</button></form></div>\n`}
function rPricing(line){const plans=extractBody(line).split('|').map(p=>{const pts=p.trim().split('>').map(x=>x.trim());return{name:pts[0],price:pts[1],desc:pts[2],linkRaw:pts[3]}}).filter(p=>p.name);const cards=plans.map((p,i)=>{let lh='#',ll='Get started';if(p.linkRaw){const m=p.linkRaw.match(/\/([^:]+):(.+)/);if(m){lh='/'+m[1];ll=m[2]}};return`<div class="fx-pricing-card${i===1?' fx-pricing-featured':''}">${i===1?'<div class="fx-pricing-badge">Most popular</div>':''}<div class="fx-pricing-name">${esc(p.name)}</div><div class="fx-pricing-price">${esc(p.price)}</div><p class="fx-pricing-desc">${esc(p.desc)}</p><a href="${esc(lh)}" class="fx-cta fx-pricing-cta">${esc(ll)}</a></div>`}).join('');return`<div class="fx-pricing">${cards}</div>\n`}
function rFaq(line){const items=extractBody(line).split('|').map(i=>{const idx=i.indexOf('>');return{q:i.slice(0,idx).trim(),a:i.slice(idx+1).trim()}}).filter(i=>i.q);return`<section class="fx-sect"><div class="fx-faq">${items.map(i=>`<div class="fx-faq-item" onclick="this.classList.toggle('open')"><div class="fx-faq-q">${esc(i.q)}<span class="fx-faq-arrow">▸</span></div><div class="fx-faq-a">${esc(i.a)}</div></div>`).join('')}</div></section>\n`}
function rTestimonial(line){const parts=extractBody(line).split('|').map(x=>x.trim());const imgPart=parts.find(p=>p.startsWith('img:'));const img=imgPart?`<img src="${esc(imgPart.slice(4))}" class="fx-testi-img" alt="${esc(parts[0])}" loading="lazy">`:`<div class="fx-testi-avatar">${esc((parts[0]||'?').charAt(0))}</div>`;return`<section class="fx-testi-wrap"><div class="fx-testi">${img}<blockquote class="fx-testi-quote">"${esc(parts[1]?.replace(/^"|"$/g,''))}"</blockquote><div class="fx-testi-author">${esc(parts[0])}</div></div></section>\n`}
function rGallery(line){return`<div class="fx-gallery">${extractBody(line).split('|').map(src=>`<div class="fx-gallery-item"><img src="${esc(src.trim())}" alt="" loading="lazy"></div>`).join('')}</div>\n`}

function genThemeCSS(t){const r=[];if(t.accent)r.push(`.fx-cta,.fx-btn{background:${t.accent}!important;color:#fff!important}`);if(t.bg)r.push(`body{background:${t.bg}!important}`);if(t.text)r.push(`body{color:${t.text}!important}`);if(t.font)r.push(`@import url('https://fonts.googleapis.com/css2?family=${t.font.replace(/ /g,'+')}:wght@400;700;900&display=swap');body{font-family:'${t.font}',system-ui,sans-serif!important}`);if(t.radius)r.push(`.fx-card,.fx-form,.fx-btn,.fx-input,.fx-cta{border-radius:${t.radius}!important}`);if(t.surface)r.push(`.fx-card,.fx-form{background:${t.surface}!important}`);return r.join('')}

function baseCSS(theme) {
  const base=`*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}a{text-decoration:none;color:inherit}input,button,select{font-family:inherit}img{max-width:100%;height:auto}.fx-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 2.5rem;position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);flex-wrap:wrap;gap:.5rem}.fx-brand{font-size:1.25rem;font-weight:800;letter-spacing:-.03em}.fx-nav-links{display:flex;align-items:center;gap:1.75rem}.fx-nav-link{font-size:.875rem;font-weight:500;opacity:.65;transition:opacity .15s}.fx-nav-link:hover{opacity:1}.fx-hamburger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:.25rem}.fx-hamburger span{display:block;width:22px;height:2px;background:currentColor;transition:all .2s;border-radius:1px}.fx-hamburger.open span:nth-child(1){transform:rotate(45deg) translate(5px,5px)}.fx-hamburger.open span:nth-child(2){opacity:0}.fx-hamburger.open span:nth-child(3){transform:rotate(-45deg) translate(5px,-5px)}@media(max-width:640px){.fx-hamburger{display:flex}.fx-nav-links{display:none;width:100%;flex-direction:column;align-items:flex-start;gap:.75rem;padding:.75rem 0}.fx-nav-links.open{display:flex}}.fx-hero{display:flex;align-items:center;justify-content:center;min-height:92vh;padding:4rem 1.5rem}.fx-hero-split{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center;padding:4rem 2.5rem;min-height:70vh}@media(max-width:768px){.fx-hero-split{grid-template-columns:1fr}}.fx-hero-img{width:100%;border-radius:1.25rem;object-fit:cover;max-height:500px}.fx-hero-inner{max-width:56rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.5rem}.fx-hero-split .fx-hero-inner{text-align:left;align-items:flex-start;max-width:none}.fx-title{font-size:clamp(2.5rem,8vw,5.5rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-sub{font-size:clamp(1rem,2vw,1.25rem);line-height:1.75;max-width:40rem}.fx-cta{display:inline-flex;align-items:center;padding:.875rem 2.5rem;border-radius:.75rem;font-weight:700;font-size:1rem;transition:transform .15s;margin:.25rem}.fx-cta:hover{transform:translateY(-1px)}.fx-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3rem;padding:5rem 2.5rem;text-align:center}.fx-stat-val{font-size:clamp(2.5rem,5vw,4rem);font-weight:900;letter-spacing:-.04em;line-height:1}.fx-stat-lbl{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:.5rem}.fx-grid{display:grid;gap:1.25rem;padding:1rem 2.5rem 5rem}.fx-grid-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.fx-grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.fx-grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.fx-card{border-radius:1rem;padding:1.75rem;transition:transform .2s,box-shadow .2s}.fx-card:hover{transform:translateY(-2px)}.fx-card-img{width:100%;border-radius:.75rem;object-fit:cover;height:180px;margin-bottom:1rem}.fx-icon{font-size:2rem;margin-bottom:1rem}.fx-card-title{font-size:1.0625rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.5rem}.fx-card-body{font-size:.875rem;line-height:1.65}.fx-card-link{font-size:.8125rem;font-weight:600;display:inline-block;margin-top:1rem;opacity:.6;transition:opacity .15s}.fx-card-link:hover{opacity:1}.fx-sect{padding:5rem 2.5rem}.fx-sect-title{font-size:clamp(1.75rem,4vw,3rem);font-weight:800;letter-spacing:-.04em;margin-bottom:1.5rem;text-align:center}.fx-sect-body{font-size:1rem;line-height:1.75;text-align:center;max-width:48rem;margin:0 auto}.fx-form-wrap{padding:3rem 2.5rem;display:flex;justify-content:center}.fx-form{width:100%;max-width:28rem;border-radius:1.25rem;padding:2.5rem}.fx-field{margin-bottom:1.25rem}.fx-label{display:block;font-size:.8125rem;font-weight:600;margin-bottom:.5rem}.fx-input{width:100%;padding:.75rem 1rem;border-radius:.625rem;font-size:.9375rem;outline:none;transition:box-shadow .15s}.fx-input:focus{box-shadow:0 0 0 3px rgba(37,99,235,.35)}.fx-btn{width:100%;padding:.875rem 1.5rem;border:none;border-radius:.625rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-top:.5rem;transition:transform .15s,opacity .15s}.fx-btn:hover{transform:translateY(-1px)}.fx-btn:disabled{opacity:.5;cursor:not-allowed}.fx-form-msg{font-size:.8125rem;padding:.5rem 0;min-height:1.5rem;text-align:center}.fx-form-err{color:#f87171}.fx-form-ok{color:#4ade80}.fx-table-wrap{overflow-x:auto;padding:0 2.5rem 4rem}.fx-table{width:100%;border-collapse:collapse;font-size:.875rem}.fx-th{text-align:left;padding:.875rem 1.25rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.fx-th-actions{opacity:.6}.fx-tr{transition:background .1s}.fx-td{padding:.875rem 1.25rem}.fx-td-empty{padding:2rem 1.25rem;text-align:center;opacity:.4}.fx-td-actions{white-space:nowrap;padding:.5rem 1rem!important}.fx-action-btn{border:none;cursor:pointer;font-size:.75rem;font-weight:600;padding:.3rem .75rem;border-radius:.375rem;margin-right:.375rem;font-family:inherit}.fx-edit-btn{background:#1e40af;color:#93c5fd}.fx-delete-btn{background:#7f1d1d;color:#fca5a5}.fx-pricing{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;padding:2rem 2.5rem 5rem;align-items:start}.fx-pricing-card{border-radius:1.25rem;padding:2rem;position:relative;transition:transform .2s}.fx-pricing-featured{transform:scale(1.03)}.fx-pricing-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;font-size:.7rem;font-weight:700;padding:.25rem .875rem;border-radius:999px;white-space:nowrap}.fx-pricing-name{font-size:.875rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;opacity:.7}.fx-pricing-price{font-size:3rem;font-weight:900;letter-spacing:-.05em;line-height:1;margin-bottom:.75rem}.fx-pricing-desc{font-size:.875rem;line-height:1.65;margin-bottom:1.5rem;opacity:.7}.fx-pricing-cta{display:block;text-align:center;padding:.75rem;border-radius:.625rem;font-weight:700;font-size:.9rem}.fx-faq{max-width:48rem;margin:0 auto}.fx-faq-item{border-radius:.75rem;margin-bottom:.625rem;cursor:pointer;overflow:hidden}.fx-faq-q{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;font-size:.9375rem;font-weight:600}.fx-faq-arrow{transition:transform .2s;font-size:.75rem;opacity:.5}.fx-faq-item.open .fx-faq-arrow{transform:rotate(90deg)}.fx-faq-a{max-height:0;overflow:hidden;padding:0 1.25rem;font-size:.875rem;line-height:1.7;transition:max-height .3s,padding .3s}.fx-faq-item.open .fx-faq-a{max-height:300px;padding:.75rem 1.25rem 1.25rem}.fx-testi-wrap{padding:5rem 2.5rem;display:flex;justify-content:center}.fx-testi{max-width:42rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.25rem}.fx-testi-img{width:64px;height:64px;border-radius:50%;object-fit:cover}.fx-testi-avatar{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;background:#1e293b}.fx-testi-quote{font-size:1.25rem;line-height:1.7;font-style:italic;opacity:.9}.fx-testi-author{font-size:.875rem;font-weight:600;opacity:.5}.fx-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;padding:1rem 2.5rem 4rem}.fx-gallery-item{border-radius:.75rem;overflow:hidden;aspect-ratio:4/3}.fx-gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform .3s}.fx-gallery-item:hover img{transform:scale(1.04)}.fx-if-wrap{display:contents}.fx-footer{padding:3rem 2.5rem;text-align:center}.fx-footer-text{font-size:.8125rem}.fx-footer-link{font-size:.8125rem;margin:0 .75rem;opacity:.5;transition:opacity .15s}.fx-footer-link:hover{opacity:1}@keyframes fx-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}@keyframes fx-blur-in{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:blur(0)}}@keyframes fx-fade-in{from{opacity:0}to{opacity:1}}.fx-anim-fade-up{animation:fx-fade-up .6s cubic-bezier(.4,0,.2,1) both}.fx-anim-fade-in{animation:fx-fade-in .6s ease both}.fx-anim-blur-in{animation:fx-blur-in .7s ease both}.fx-anim-stagger>.fx-card:nth-child(1){animation:fx-fade-up .5s 0s both}.fx-anim-stagger>.fx-card:nth-child(2){animation:fx-fade-up .5s .1s both}.fx-anim-stagger>.fx-card:nth-child(3){animation:fx-fade-up .5s .2s both}.fx-anim-stagger>.fx-card:nth-child(4){animation:fx-fade-up .5s .3s both}.fx-anim-stagger>.fx-card:nth-child(5){animation:fx-fade-up .5s .4s both}.fx-anim-stagger>.fx-card:nth-child(6){animation:fx-fade-up .5s .5s both}`
  const T={dark:`body{background:#030712;color:#f1f5f9}.fx-nav{border-bottom:1px solid #1e293b;background:rgba(3,7,18,.85)}.fx-nav-link{color:#cbd5e1}.fx-sub{color:#94a3b8}.fx-cta{background:#2563eb;color:#fff;box-shadow:0 8px 24px rgba(37,99,235,.35)}.fx-stat-lbl{color:#64748b}.fx-card{background:#0f172a;border:1px solid #1e293b}.fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.5)}.fx-card-body{color:#64748b}.fx-sect-body{color:#64748b}.fx-form{background:#0f172a;border:1px solid #1e293b}.fx-label{color:#94a3b8}.fx-input{background:#020617;border:1px solid #1e293b;color:#f1f5f9}.fx-input::placeholder{color:#334155}.fx-btn{background:#2563eb;color:#fff}.fx-th{color:#475569;border-bottom:1px solid #1e293b}.fx-tr:hover{background:#0f172a}.fx-td{border-bottom:1px solid rgba(255,255,255,.03)}.fx-footer{border-top:1px solid #1e293b}.fx-footer-text{color:#334155}.fx-pricing-card{background:#0f172a;border:1px solid #1e293b}.fx-faq-item{background:#0f172a}`,light:`body{background:#fff;color:#0f172a}.fx-nav{border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.85)}.fx-cta{background:#2563eb;color:#fff}.fx-btn{background:#2563eb;color:#fff}.fx-card{background:#f8fafc;border:1px solid #e2e8f0}.fx-form{background:#f8fafc;border:1px solid #e2e8f0}.fx-input{background:#fff;border:1px solid #cbd5e1;color:#0f172a}.fx-th{color:#94a3b8;border-bottom:1px solid #e2e8f0}.fx-footer{border-top:1px solid #e2e8f0}.fx-pricing-card{background:#f8fafc;border:1px solid #e2e8f0}.fx-faq-item{background:#f8fafc}`}
  return base+(T[theme]||T.dark)
}

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// S3 — Amazon S3 / R2 / MinIO / Compatible Storage
// ═══════════════════════════════════════════════════════════════════

let S3_CONFIG = null
let S3_CLIENT = null

function setupS3(config) {
  S3_CONFIG = {
    key:      resolveEnv(config.key || '$AWS_ACCESS_KEY_ID'),
    secret:   resolveEnv(config.secret || '$AWS_SECRET_ACCESS_KEY'),
    bucket:   resolveEnv(config.bucket || '$S3_BUCKET'),
    region:   resolveEnv(config.region || 'us-east-1'),
    acl:      config.acl || 'private',
    prefix:   config.prefix || '',
    maxSize:  parseSize(config.maxSize || '10mb'),
    allowedTypes: config.allowedTypes || null,
    endpoint: config.endpoint ? resolveEnv(config.endpoint) : null,
  }

  const isMock = !S3_CONFIG.key || S3_CONFIG.key === null || S3_CONFIG.key.startsWith('$') || S3_CONFIG.key.includes('mock')
  if (isMock) {
    console.log('[aiplang] S3: mock mode (set AWS_ACCESS_KEY_ID for real storage)')
    S3_CLIENT = null
    return
  }
  try {
    const { S3Client } = require('@aws-sdk/client-s3')
    const clientOpts = { region: S3_CONFIG.region, credentials: { accessKeyId: S3_CONFIG.key, secretAccessKey: S3_CONFIG.secret } }
    if (S3_CONFIG.endpoint) clientOpts.endpoint = S3_CONFIG.endpoint
    S3_CLIENT = new S3Client(clientOpts)
    console.log(`[aiplang] S3: live mode — bucket=${S3_CONFIG.bucket} region=${S3_CONFIG.region}${S3_CONFIG.endpoint?' endpoint='+S3_CONFIG.endpoint:''}`)
  } catch (e) {
    console.log('[aiplang] S3: AWS SDK not available, using mock. npm install @aws-sdk/client-s3')
    S3_CLIENT = null
  }
}

function parseSize(s) {
  if (typeof s === 'number') return s
  const m = String(s).match(/^(\d+)(kb|mb|gb)?$/i)
  if (!m) return 10 * 1024 * 1024
  const n = parseInt(m[1]), u = (m[2] || 'mb').toLowerCase()
  return n * ({ kb: 1024, mb: 1024*1024, gb: 1024*1024*1024 }[u] || 1024*1024)
}

async function s3Upload(key, buffer, contentType, acl) {
  if (!S3_CLIENT) {
    // Mock: save locally to ./uploads/
    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
    const localPath = path.join(uploadsDir, path.basename(key))
    fs.writeFileSync(localPath, buffer)
    const mockUrl = `http://localhost:${process.env.PORT || 3000}/uploads/${path.basename(key)}`
    console.log(`[aiplang:s3] MOCK upload → ${localPath}`)
    return { key, url: mockUrl, size: buffer.length, mock: true }
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3')
  const cmd = new PutObjectCommand({
    Bucket: S3_CONFIG.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ...(acl !== 'private' ? { ACL: acl } : {})
  })
  await S3_CLIENT.send(cmd)
  const url = S3_CONFIG.endpoint
    ? `${S3_CONFIG.endpoint}/${S3_CONFIG.bucket}/${key}`
    : `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`
  return { key, url, size: buffer.length }
}

async function s3Delete(key) {
  if (!S3_CLIENT) {
    const localPath = path.join(process.cwd(), 'uploads', path.basename(key))
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
    return { deleted: key, mock: true }
  }
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
  await S3_CLIENT.send(new DeleteObjectCommand({ Bucket: S3_CONFIG.bucket, Key: key }))
  return { deleted: key }
}

async function s3PresignedUrl(key, expiresIn = 3600) {
  if (!S3_CLIENT) {
    return { url: `http://localhost:${process.env.PORT || 3000}/uploads/${path.basename(key)}?mock=1`, expires_in: expiresIn }
  }
  const { GetObjectCommand } = require('@aws-sdk/client-s3')
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
  const url = await getSignedUrl(S3_CLIENT, new GetObjectCommand({ Bucket: S3_CONFIG.bucket, Key: key }), { expiresIn })
  return { url, expires_in: expiresIn }
}

// Multipart form parser — no external deps
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks)
        const ct = req.headers['content-type'] || ''
        const bm = ct.match(/boundary=([^\s;]+)/)
        if (!bm) { resolve({ fields: {}, files: [] }); return }
        const boundary = Buffer.from('--' + bm[1])
        const fields = {}, files = []
        const parts = splitBuffer(body, boundary)
        for (const part of parts) {
          if (!part.length) continue
          const sep = part.indexOf('\r\n\r\n')
          if (sep === -1) continue
          const headerStr = part.slice(0, sep).toString()
          const content = part.slice(sep + 4)
          const data = content.slice(0, content.length - 2) // remove trailing \r\n
          const namem = headerStr.match(/name="([^"]+)"/)
          const filem = headerStr.match(/filename="([^"]+)"/)
          const ctm = headerStr.match(/Content-Type:\s*([^\r\n]+)/i)
          if (!namem) continue
          if (filem) {
            files.push({ fieldname: namem[1], originalname: filem[1], mimetype: ctm?.[1]?.trim() || 'application/octet-stream', buffer: data, size: data.length })
          } else {
            fields[namem[1]] = data.toString()
          }
        }
        resolve({ fields, files })
      } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function splitBuffer(buf, separator) {
  const parts = []; let start = 0
  while (true) {
    const idx = indexOfBuffer(buf, separator, start)
    if (idx === -1) break
    parts.push(buf.slice(start, idx))
    start = idx + separator.length + 2 // skip \r\n
  }
  return parts.filter(p => p.length > 0)
}
function indexOfBuffer(buf, sep, offset = 0) {
  for (let i = offset; i <= buf.length - sep.length; i++) {
    if (buf.slice(i, i + sep.length).equals(sep)) return i
  }
  return -1
}

function registerS3Routes(server) {
  const cfg = S3_CONFIG

  // Serve local uploads in mock mode
  if (!S3_CLIENT) {
    server.addRoute('GET', '/uploads/:filename', (req, res) => {
      const fp = path.join(process.cwd(), 'uploads', req.params.filename)
      if (fs.existsSync(fp)) { res.writeHead(200, { 'Content-Type': getMime(req.params.filename) }); res.end(fs.readFileSync(fp)) }
      else { res.writeHead(404); res.end('Not found') }
    })
  }

  // POST /api/upload — upload one or more files
  server.addRoute('POST', '/api/upload', async (req, res) => {
    try {
      const { fields, files } = await parseMultipart(req)
      if (!files.length) { res.error(400, 'No files uploaded'); return }

      const results = []
      for (const file of files) {
        // Size check
        if (file.size > cfg.maxSize) { res.error(413, `File too large. Max: ${cfg.maxSize / 1024 / 1024}MB`); return }
        // Type check
        if (cfg.allowedTypes) {
          const ext = path.extname(file.originalname).slice(1).toLowerCase()
          const okMime = cfg.allowedTypes.some(t => file.mimetype.includes(t) || t === ext)
          if (!okMime) { res.error(415, `File type not allowed. Allowed: ${cfg.allowedTypes.join(', ')}`); return }
        }
        const ext = path.extname(file.originalname)
        const key = cfg.prefix + uuid() + ext
        const result = await s3Upload(key, file.buffer, file.mimetype, cfg.acl)
        results.push({ ...result, originalname: file.originalname, mimetype: file.mimetype, fieldname: file.fieldname })
        emit('s3.uploaded', { key, size: file.size, mimetype: file.mimetype })
      }
      res.json(200, files.length === 1 ? results[0] : results)
    } catch (e) {
      console.error('[aiplang:s3] Upload error:', e.message)
      res.error(500, e.message)
    }
  })

  // DELETE /api/upload/:key — delete a file
  server.addRoute('DELETE', '/api/upload/:key', async (req, res) => {
    try {
      const key = decodeURIComponent(req.params.key)
      const result = await s3Delete(cfg.prefix ? cfg.prefix + key : key)
      emit('s3.deleted', { key })
      res.json(200, result)
    } catch (e) { res.error(500, e.message) }
  })

  // GET /api/upload/presign?key=xxx&expires=3600 — get presigned URL
  server.addRoute('GET', '/api/upload/presign', async (req, res) => {
    const key = req.query.key
    if (!key) { res.error(400, 'key is required'); return }
    const expires = parseInt(req.query.expires || '3600')
    try {
      const result = await s3PresignedUrl(key, expires)
      res.json(200, result)
    } catch (e) { res.error(500, e.message) }
  })

  console.log(`[aiplang] S3: POST /api/upload | DELETE /api/upload/:key | GET /api/upload/presign`)
}

function getMime(filename) {
  const ext = path.extname(filename).toLowerCase()
  const types = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.mp4':'video/mp4','.mp3':'audio/mpeg','.json':'application/json','.txt':'text/plain','.csv':'text/csv','.zip':'application/zip' }
  return types[ext] || 'application/octet-stream'
}

// ═══════════════════════════════════════════════════════════════════
// PLUGIN SYSTEM — ~plugin ./my-plugin.js | ~use rate-limit max=100
// ═══════════════════════════════════════════════════════════════════
//
// A plugin is a JS module that exports:
//   module.exports = {
//     name: 'my-plugin',
//     setup(server, app, utils) {
//       // server  = AiplangServer instance (.addRoute, .models)
//       // app     = parsed .aip app definition
//       // utils   = { uuid, now, emit, on, dispatch, resolveEnv, dbRun, dbAll, dbGet }
//     }
//   }
//
// Or a factory function:
//   module.exports = (opts) => ({ name: '...', setup(srv, app, utils) { ... } })

const PLUGIN_UTILS = {
  uuid, now, emit, on, dispatch, resolveEnv, dbRun, dbAll, dbGet,
  parseSize, s3Upload, s3Delete, s3PresignedUrl,
  generateJWT, verifyJWT,
  getMime,
}

async function loadPlugins(plugins, server, app) {
  for (const plug of plugins) {
    try {
      let mod
      // Local file plugin
      if (plug.name.startsWith('./') || plug.name.startsWith('../') || plug.name.startsWith('/')) {
        const fullPath = path.resolve(path.dirname(process.argv[2] || '.'), plug.name)
        if (!fs.existsSync(fullPath)) { console.warn(`[aiplang:plugin] Not found: ${fullPath}`); continue }
        mod = require(fullPath)
      } else {
        // npm package plugin
        try { mod = require(plug.name) } catch {
          try { mod = require(path.join(process.cwd(), 'node_modules', plug.name)) } catch {
            console.warn(`[aiplang:plugin] Cannot load: ${plug.name} — run: npm install ${plug.name}`)
            continue
          }
        }
      }

      // Support factory function
      if (typeof mod === 'function') mod = mod(plug.opts)
      if (!mod || typeof mod.setup !== 'function') {
        console.warn(`[aiplang:plugin] ${plug.name}: must export { name, setup(srv, app, utils) }`)
        continue
      }

      await mod.setup(server, app, { ...PLUGIN_UTILS, opts: plug.opts })
      console.log(`[aiplang] Plugin: ${mod.name || plug.name} ✓`)
    } catch (e) {
      console.error(`[aiplang:plugin] Error in ${plug.name}:`, e.message)
    }
  }
}

// Built-in ~use plugins (inline, no file needed)
const BUILTIN_PLUGINS = {
  // ~use cors origins=https://myapp.com
  'cors': {
    name: 'cors',
    setup(server, app, { opts }) {
      const origins = opts.origins ? opts.origins.split(',') : ['*']
      const orig = server._corsOrigins = origins
      console.log(`[aiplang] Plugin: cors origins=${orig.join(',')}`)
    }
  },
  // ~use rate-limit max=100 window=60s
  'rate-limit': {
    name: 'rate-limit',
    setup(server, app, { opts }) {
      const max = parseInt(opts.max || '100')
      const windowMs = parseWindow(opts.window || '60s')
      const store = {}
      server._rateLimiter = (req) => {
        const ip = req.socket.remoteAddress || 'unknown'
        const key = `${ip}:${Math.floor(Date.now() / windowMs)}`
        store[key] = (store[key] || 0) + 1
        return store[key] > max
      }
      console.log(`[aiplang] Plugin: rate-limit max=${max} window=${opts.window||'60s'}`)
    }
  },
  // ~use logger format=tiny|combined
  'logger': {
    name: 'logger',
    setup(server, app, { opts }) {
      server._requestLogger = (req, ms) => {
        const fmt = opts.format || 'tiny'
        if (fmt === 'tiny') console.log(`[aiplang] ${req.method} ${req.url} — ${ms}ms`)
        else console.log(`[aiplang] ${new Date().toISOString()} ${req.method} ${req.url} ${req.headers['user-agent'] || '-'} — ${ms}ms`)
      }
      console.log(`[aiplang] Plugin: logger format=${opts.format||'tiny'}`)
    }
  },
  // ~use helmet (basic security headers)
  'helmet': {
    name: 'helmet',
    setup(server, app, { opts }) {
      server._helmetHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        ...(opts.csp ? { 'Content-Security-Policy': opts.csp } : {})
      }
      console.log(`[aiplang] Plugin: helmet (security headers)`)
    }
  },
  // ~use compression (gzip responses)
  'compression': {
    name: 'compression',
    setup(server, app, { opts }) {
      server._compress = true
      console.log(`[aiplang] Plugin: compression (gzip)`)
    }
  },
}

function parseWindow(s) {
  const m = String(s).match(/^(\d+)(s|m|h)?$/)
  if (!m) return 60000
  const n = parseInt(m[1]), u = m[2] || 's'
  return n * ({ s:1000, m:60000, h:3600000 }[u] || 1000)
}

// MAIN
// ═══════════════════════════════════════════════════════════════════
async function startServer(aipFile, port = 3000) {
  const src = fs.readFileSync(aipFile, 'utf8')
  const app = parseApp(src)
  const srv = new AiplangServer()

  // Validate required env vars up front
  const missingEnvs = []
  for (const envDef of app.env) {
    if (envDef.required && !process.env[envDef.name]) {
      missingEnvs.push(envDef.name)
    }
  }
  if (missingEnvs.length) {
    console.error(`[aiplang] FATAL: Missing required env vars: ${missingEnvs.join(', ')}`)
    console.error('[aiplang] Set them in .env or export them before starting')
    process.exit(1)
  }

  // Auth setup
  if (app.auth) {
    JWT_SECRET = resolveEnv(app.auth.secret) || JWT_SECRET
    JWT_EXPIRE = app.auth.expire || '7d'
  }

  // Mail setup
  if (app.mail) setupMail(app.mail)

  // S3 setup
  if (app.s3) {
    setupS3(app.s3)
    registerS3Routes(srv)
  }

  // DB setup
  const dbFile = app.db ? resolveEnv(app.db.dsn) : ':memory:'
  await getDB(dbFile)
  console.log(`[aiplang] DB:     ${dbFile}`)

  // Migrations
  console.log(`[aiplang] Tables:`)
  migrateModels(app.models)

  // Register models
  for (const m of app.models) srv.registerModel(m.name, { softDelete: m.softDelete, timestamps: true })

  // Events
  for (const ev of app.events) on(ev.event, (data) => console.log(`[aiplang:event] ${ev.event}:`, ev.action))

  // Auth rate limiting (automatic — 20 req/min per IP on /api/auth/*)
  const _authAttempts = {}
  srv._authRateLimit = (req) => {
    if (!req.path?.includes('/api/auth/')) return false
    const ip = req.socket?.remoteAddress || 'unknown'
    const key = `${ip}:${Math.floor(Date.now() / 60000)}`
    _authAttempts[key] = (_authAttempts[key] || 0) + 1
    return _authAttempts[key] > 20
  }

  // Routes
  for (const route of app.apis) {
    compileRoute(route, srv)
    console.log(`[aiplang] Route:  ${route.method} ${route.path}${route.guards.length?' ['+route.guards.join('|')+']':''}`)
  }

  // Admin panel
  if (app.admin) registerAdminPanel(srv, app.admin, app.models)

  // Stripe
  if (app.stripe) {
    setupStripe(app.stripe)
    registerStripeRoutes(srv, app.stripe)
    STRIPE_PLANS = app.stripe.plans || {}
  }

  // Plugins — built-in ~use first, then external ~plugin files
  const builtinPlugs = app.plugins.filter(p => p.inline && BUILTIN_PLUGINS[p.name])
  const externalPlugs = app.plugins.filter(p => !p.inline || !BUILTIN_PLUGINS[p.name])
  for (const p of builtinPlugs) {
    try { await BUILTIN_PLUGINS[p.name].setup(srv, app, { ...PLUGIN_UTILS, opts: p.opts }) }
    catch (e) { console.error(`[aiplang:plugin] ${p.name}:`, e.message) }
  }
  if (externalPlugs.length) await loadPlugins(externalPlugs, srv, app)

  // Frontend
  for (const page of app.pages) {
    srv.addRoute('GET', page.route, (req, res) => {
      const html = renderHTML(page, app.pages)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html)
    })
    console.log(`[aiplang] Page:   ${page.route}`)
  }

  // Static assets
  srv.addRoute('GET', '/aiplang-hydrate.js', (req, res) => {
    const p = path.join(__dirname, '..', 'runtime', 'aiplang-hydrate.js')
    if (fs.existsSync(p)) { res.writeHead(200,{'Content-Type':'application/javascript'}); res.end(fs.readFileSync(p)) }
    else { res.writeHead(404); res.end('// not found') }
  })

  // Health
  srv.addRoute('GET', '/health', (req, res) => res.json(200, {
    status:'ok', version:'2.7.4',
    models: app.models.map(m=>m.name),
    routes: app.apis.length, pages: app.pages.length,
    admin: app.admin?.prefix || null,
    mail: !!app.mail, jobs: QUEUE.length,
    s3: app.s3 ? {
      mode: S3_CLIENT ? 'live' : 'mock',
      bucket: S3_CONFIG?.bucket || null,
      region: S3_CONFIG?.region || null,
      endpoint: S3_CONFIG?.endpoint || null,
      routes: ['POST /api/upload', 'DELETE /api/upload/:key', 'GET /api/upload/presign']
    } : null,
    stripe: app.stripe ? {
      mode: STRIPE ? 'live' : 'mock',
      plans: Object.keys(app.stripe.plans || {}),
      routes: ['/api/stripe/checkout', '/api/stripe/portal', '/api/stripe/subscription', '/api/stripe/webhook']
    } : null,
    plugins: app.plugins.map(p => p.name)
  }))

  srv.listen(port)
  return srv
}

module.exports = { startServer, parseApp, Model, getDB, dispatch, on, emit, sendMail, setupStripe, registerStripeRoutes, setupS3, registerS3Routes, s3Upload, s3Delete, s3PresignedUrl, PLUGIN_UTILS }
if (require.main === module) {
  const f=process.argv[2], p=parseInt(process.argv[3]||process.env.PORT||'3000')
  if (!f) { console.error('Usage: node server.js <app.aip> [port]'); process.exit(1) }
  startServer(f, p).catch(e=>{console.error(e);process.exit(1)})
}

// ═══════════════════════════════════════════════════════════════════
// STRIPE — Payments, Subscriptions, Webhooks
// ═══════════════════════════════════════════════════════════════════

let STRIPE = null
let STRIPE_CONFIG = null
let STRIPE_PLANS = {}

function setupStripe(config) {
  STRIPE_CONFIG = config
  const key = resolveEnv(config.key) || ''
  // Use mock if key is placeholder, test/mock value, or SDK unavailable
  const isMock = !key || key === null || key.startsWith('$') || key === 'sk_test_mock' || key.includes('mock')
  if (isMock) {
    console.log('[aiplang] Stripe: mock mode (set STRIPE_SECRET_KEY for real payments)')
    STRIPE = null // will use mockStripe()
    return
  }
  try {
    const Stripe = require('stripe')
    STRIPE = new Stripe(key, { apiVersion: '2024-06-20' })
    console.log(`[aiplang] Stripe: live mode (${key.startsWith('sk_test') ? 'test key' : 'production key'})`)
  } catch (e) {
    console.log('[aiplang] Stripe: SDK error, using mock')
    STRIPE = null
  }
}

function mockStripe() {
  // Mock Stripe for dev/test without real key
  return {
    customers: {
      create: async (opts) => ({ id: 'cus_mock_' + uuid(), email: opts.email }),
      retrieve: async (id) => ({ id, email: 'mock@test.com' })
    },
    checkout: {
      sessions: {
        create: async (opts) => ({
          id: 'cs_mock_' + uuid(),
          url: opts.success_url + '?session_id=mock',
          payment_status: 'unpaid'
        })
      }
    },
    subscriptions: {
      retrieve: async (id) => ({
        id, status: 'active',
        current_period_end: Math.floor(Date.now()/1000) + 86400*30,
        items: { data: [{ price: { id: 'price_mock', nickname: 'Pro' } }] }
      }),
      cancel: async (id) => ({ id, status: 'canceled' })
    },
    billingPortal: {
      sessions: {
        create: async (opts) => ({ url: opts.return_url + '?portal=mock' })
      }
    },
    webhooks: {
      constructEvent: (body, sig, secret) => {
        try { return JSON.parse(body) } catch { throw new Error('Invalid payload') }
      }
    },
    prices: {
      list: async () => ({ data: [] })
    }
  }
}

function getStripe() { return STRIPE || mockStripe() }

function registerStripeRoutes(server, stripeConfig) {
  const stripe = getStripe()
  const plans = stripeConfig.plans || {}
  const webhookSecret = resolveEnv(stripeConfig.webhookSecret || '$STRIPE_WEBHOOK_SECRET')
  const successUrl = stripeConfig.successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/dashboard?payment=success`
  const cancelUrl  = stripeConfig.cancelUrl  || `${process.env.APP_URL || 'http://localhost:3000'}/pricing?payment=cancelled`

  // ── POST /api/stripe/checkout ──────────────────────────────────
  // Creates a Stripe Checkout session
  // Body: { plan: 'pro', email: '...' } or uses logged-in user
  server.addRoute('POST', '/api/stripe/checkout', async (req, res) => {
    try {
      const plan = req.body.plan || req.body.price_id || Object.keys(plans)[0]
      const priceId = plans[plan] || plan // allow passing price_id directly
      const email = req.body.email || req.user?.email

      if (!priceId) { res.error(400, 'Plan not found. Available: ' + Object.keys(plans).join(', ')); return }

      // Get or create Stripe customer
      let customerId = null
      if (req.user?.id) {
        const userModel = Object.values(server.models).find(m => m.tableName === 'users')
        if (userModel) {
          const user = userModel.find(req.user.id)
          if (user?.stripe_customer_id) {
            customerId = user.stripe_customer_id
          } else {
            const customer = await stripe.customers.create({ email, metadata: { user_id: req.user.id } })
            customerId = customer.id
            if (userModel.find(req.user.id)) userModel.update(req.user.id, { stripe_customer_id: customerId })
          }
        }
      }

      const sessionOpts = {
        mode: stripeConfig.mode === 'payment' ? 'payment' : 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl + (successUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      }
      if (customerId)    sessionOpts.customer = customerId
      else if (email)    sessionOpts.customer_email = email
      if (req.body.trial_days) sessionOpts.subscription_data = { trial_period_days: parseInt(req.body.trial_days) }
      if (req.user?.id)  sessionOpts.metadata = { user_id: req.user.id, plan }

      const session = await stripe.checkout.sessions.create(sessionOpts)
      res.json(200, { url: session.url, session_id: session.id })
    } catch (e) {
      console.error('[aiplang:stripe] Checkout error:', e.message)
      res.error(500, e.message)
    }
  })

  // ── POST /api/stripe/portal ────────────────────────────────────
  // Customer billing portal (manage subscription, invoices, card)
  server.addRoute('POST', '/api/stripe/portal', async (req, res) => {
    if (!req.user) { res.error(401, 'Unauthorized'); return }
    try {
      const userModel = Object.values(server.models).find(m => m.tableName === 'users')
      const user = userModel?.find(req.user.id)
      if (!user?.stripe_customer_id) { res.error(404, 'No billing account found'); return }

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: cancelUrl
      })
      res.json(200, { url: session.url })
    } catch (e) {
      res.error(500, e.message)
    }
  })

  // ── GET /api/stripe/subscription ──────────────────────────────
  // Get current user's subscription status
  server.addRoute('GET', '/api/stripe/subscription', async (req, res) => {
    if (!req.user) { res.error(401, 'Unauthorized'); return }
    try {
      const userModel = Object.values(server.models).find(m => m.tableName === 'users')
      const user = userModel?.find(req.user.id)
      res.json(200, {
        plan: user?.plan || 'free',
        status: user?.subscription_status || 'inactive',
        customer_id: user?.stripe_customer_id || null,
        period_end: user?.subscription_period_end || null
      })
    } catch (e) { res.error(500, e.message) }
  })

  // ── DELETE /api/stripe/subscription ───────────────────────────
  // Cancel subscription
  server.addRoute('DELETE', '/api/stripe/subscription', async (req, res) => {
    if (!req.user) { res.error(401, 'Unauthorized'); return }
    try {
      const userModel = Object.values(server.models).find(m => m.tableName === 'users')
      const user = userModel?.find(req.user.id)
      if (!user?.subscription_id) { res.error(404, 'No active subscription'); return }
      await stripe.subscriptions.cancel(user.subscription_id)
      userModel?.update(req.user.id, { subscription_status: 'canceled', plan: 'free' })
      res.json(200, { status: 'canceled' })
    } catch (e) { res.error(500, e.message) }
  })

  // ── POST /api/stripe/webhook ───────────────────────────────────
  // Stripe webhook handler — updates user subscription state
  server.addRoute('POST', '/api/stripe/webhook', async (req, res) => {
    let event
    try {
      const rawBody = await getRawBody(req)
      const sig = req.headers['stripe-signature']
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } else {
        event = JSON.parse(rawBody)
      }
    } catch (e) {
      res.error(400, 'Webhook error: ' + e.message); return
    }

    const userModel = Object.values(server.models).find(m => m.tableName === 'users')
    const data = event.data?.object

    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = data.metadata?.user_id
        if (userId && userModel) {
          const planName = data.metadata?.plan || 'pro'
          userModel.update(userId, {
            plan: planName,
            subscription_status: 'active',
            stripe_customer_id: data.customer || undefined,
            subscription_id: data.subscription || undefined,
          })
          emit('stripe.checkout.completed', { userId, plan: planName, session: data.id })
        }
        break
      }
      case 'customer.subscription.updated': {
        const custId = data.customer
        if (custId && userModel) {
          const user = userModel.findBy('stripe_customer_id', custId)
          if (user) {
            const planItem = data.items?.data?.[0]?.price
            const planName = resolvePlanFromPrice(planItem?.id, plans)
            userModel.update(user.id, {
              subscription_status: data.status,
              plan: planName || user.plan,
              subscription_period_end: data.current_period_end
                ? new Date(data.current_period_end * 1000).toISOString() : undefined
            })
            emit('stripe.subscription.updated', { userId: user.id, status: data.status })
          }
        }
        break
      }
      case 'customer.subscription.deleted': {
        const custId = data.customer
        if (custId && userModel) {
          const user = userModel.findBy('stripe_customer_id', custId)
          if (user) {
            userModel.update(user.id, { subscription_status: 'canceled', plan: 'free' })
            emit('stripe.subscription.canceled', { userId: user.id })
          }
        }
        break
      }
      case 'invoice.payment_failed': {
        const custId = data.customer
        if (custId && userModel) {
          const user = userModel.findBy('stripe_customer_id', custId)
          if (user) {
            userModel.update(user.id, { subscription_status: 'past_due' })
            emit('stripe.payment.failed', { userId: user.id, amount: data.amount_due })
          }
        }
        break
      }
      case 'invoice.payment_succeeded': {
        const custId = data.customer
        if (custId && userModel) {
          const user = userModel.findBy('stripe_customer_id', custId)
          if (user && user.subscription_status === 'past_due') {
            userModel.update(user.id, { subscription_status: 'active' })
          }
          emit('stripe.payment.succeeded', { userId: user?.id, amount: data.amount_paid })
        }
        break
      }
    }

    res.json(200, { received: true, type: event.type })
  })

  console.log(`[aiplang] Stripe: /api/stripe/checkout | /api/stripe/portal | /api/stripe/webhook`)
  console.log(`[aiplang] Stripe: Plans: ${Object.keys(plans).join(', ') || 'none defined'}`)
}

// ── Guard: ~guard subscription ────────────────────────────────────
// Check if user has active subscription
function checkSubscription(req, plan = null) {
  if (!req.user) return false
  const userModel = Object.values({}).find(m => m.tableName === 'users')
  // Simplified: check from JWT claims if we embed subscription_status
  if (req.user.subscription_status === 'active') return true
  if (req.user.plan && req.user.plan !== 'free') return true
  return false
}

function resolvePlanFromPrice(priceId, plans) {
  for (const [name, id] of Object.entries(plans)) {
    if (id === priceId) return name
  }
  return null
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

module.exports.setupStripe = setupStripe
module.exports.registerStripeRoutes = registerStripeRoutes
