/**
 * aiplang-runtime.js — aiplang Runtime v2.1
 * Reactive state + SPA routing + DOM engine + query engine
 * Zero dependencies. ~28KB unminified.
 */

const AIPLANG = (() => {

// ─────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────

const ICONS = {
  bolt:'⚡',leaf:'🌱',map:'🗺',chart:'📊',lock:'🔒',star:'⭐',
  heart:'❤',check:'✓',alert:'⚠',user:'👤',car:'🚗',money:'💰',
  phone:'📱',shield:'🛡',fire:'🔥',rocket:'🚀',clock:'🕐',
  globe:'🌐',gear:'⚙',pin:'📍',flash:'⚡',eye:'◉',tag:'◈',
  plus:'+',minus:'−',edit:'✎',trash:'🗑',search:'⌕',bell:'🔔',
  home:'⌂',mail:'✉',download:'↓',upload:'↑',link:'⛓',
}

// ─────────────────────────────────────────────────────────────
// REACTIVE STATE
// ─────────────────────────────────────────────────────────────

class State {
  constructor() {
    this._data = {}
    this._computed = {}
    this._watchers = {}   // key → Set of callbacks
    this._batching = false
    this._dirty = new Set()
  }

  set(key, value) {
    const old = this._data[key]
    if (JSON.stringify(old) === JSON.stringify(value)) return
    this._data[key] = value
    if (this._batching) {
      this._dirty.add(key)
    } else {
      this._notify(key)
      this._recompute()
    }
  }

  get(key) {
    return this._data[key]
  }

  // Evaluate expression against current state
  // Supports: @var, @var.field, @var.length, simple JS
  eval(expr) {
    if (!expr) return undefined
    expr = expr.trim()

    // Simple @var lookup
    if (expr.startsWith('@')) {
      const path = expr.slice(1).split('.')
      let val = this._data[path[0]]
      for (let i = 1; i < path.length; i++) {
        if (val == null) return undefined
        val = val[path[i]]
      }
      return val
    }

    // $computed
    if (expr.startsWith('$')) {
      return this._computed[expr.slice(1)]
    }

    // Template string with @bindings: "Hello {@user.name}"
    if (expr.includes('{@') || expr.includes('{$')) {
      return expr.replace(/\{[@$][^}]+\}/g, m => {
        const inner = m.slice(1, -1)
        const v = this.eval(inner)
        return v == null ? '' : v
      })
    }

    return expr
  }

  // Resolve bindings in a string: "Hello @user.name" or plain text
  resolve(str) {
    if (!str) return ''
    if (!str.includes('@') && !str.includes('$')) return str
    return str.replace(/[@$][a-zA-Z_][a-zA-Z0-9_.[\]]*/g, m => {
      const v = this.eval(m)
      return v == null ? '' : String(v)
    })
  }

  defineComputed(name, expr) {
    this._computed[name] = null
    this._computedExprs = this._computedExprs || {}
    this._computedExprs[name] = expr
    this._recompute()
  }

  _recompute() {
    if (!this._computedExprs) return
    for (const [name, expr] of Object.entries(this._computedExprs)) {
      try {
        const fn = new Function(
          ...Object.keys(this._data).map(k => '_'+k),
          `try { return (${expr}) } catch(e) { return null }`
        )
        const val = fn(...Object.keys(this._data).map(k => this._data[k]))
        if (JSON.stringify(this._computed[name]) !== JSON.stringify(val)) {
          this._computed[name] = val
          this._notify('$'+name)
        }
      } catch(e) {}
    }
  }

  watch(key, cb) {
    if (!this._watchers[key]) this._watchers[key] = new Set()
    this._watchers[key].add(cb)
    return () => this._watchers[key].delete(cb)
  }

  _notify(key) {
    if (this._watchers[key]) {
      for (const cb of this._watchers[key]) cb(this._data[key])
    }
    // Wildcard watchers
    if (this._watchers['*']) {
      for (const cb of this._watchers['*']) cb(key, this._data[key])
    }
  }

  batch(fn) {
    this._batching = true
    fn()
    this._batching = false
    for (const key of this._dirty) this._notify(key)
    this._dirty.clear()
    this._recompute()
  }
}

// ─────────────────────────────────────────────────────────────
// QUERY ENGINE
// ─────────────────────────────────────────────────────────────

class QueryEngine {
  constructor(state) {
    this.state = state
    this.intervals = []
  }

  async run(q) {
    // q = { method, path, target, action, body }
    const path = this.state.resolve(q.path)
    const opts = { method: q.method, headers: { 'Content-Type': 'application/json' } }
    if (q.body) opts.body = JSON.stringify(q.body)

    try {
      const res = await fetch(path, opts)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      this._applyResult(data, q.target, q.action)
      return data
    } catch (e) {
      console.warn('[aiplang] query failed:', q.method, path, e.message)
      return null
    }
  }

  _applyResult(data, target, action) {
    if (!target && !action) return
    const state = this.state

    if (action) {
      // action: "redirect /path" | "@var = $result" | "@list.push($result)"
      if (action.startsWith('redirect ')) {
        Router.push(action.slice(9).trim())
        return
      }
      if (action.startsWith('reload')) {
        window.location.reload()
        return
      }
      // @list.push($result)
      const pushMatch = action.match(/^@([a-zA-Z_]+)\.push\(\$result\)$/)
      if (pushMatch) {
        const arr = state.get(pushMatch[1]) || []
        state.set(pushMatch[1], [...arr, data])
        return
      }
      // @list.filter(...)
      const filterMatch = action.match(/^@([a-zA-Z_]+)\s*=\s*@\1\.filter\((.+)\)$/)
      if (filterMatch) {
        const arr = state.get(filterMatch[1]) || []
        try {
          const fn = new Function('item', `return (${filterMatch[2]})(item)`)
          state.set(filterMatch[1], arr.filter(fn))
        } catch(e) {}
        return
      }
      // @var = $result
      const assignMatch = action.match(/^@([a-zA-Z_]+)\s*=\s*\$result$/)
      if (assignMatch) {
        state.set(assignMatch[1], data)
        return
      }
    }

    if (target) {
      // target: "@varname"
      if (target.startsWith('@')) {
        state.set(target.slice(1), data)
      }
    }
  }

  mountAll(queries) {
    for (const q of queries) {
      if (q.trigger === 'mount') {
        this.run(q)
      } else if (q.trigger === 'interval') {
        this.run(q)
        const id = setInterval(() => this.run(q), q.interval)
        this.intervals.push(id)
      }
    }
  }

  destroy() {
    for (const id of this.intervals) clearInterval(id)
    this.intervals = []
  }
}

// ─────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────

function parseFlux(src) {
  // Split into pages by --- separator
  const pageSections = src.split(/^---$/m)
  return pageSections.map(section => parsePage(section.trim())).filter(p => p)
}

function parsePage(src) {
  const lines = src.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (!lines.length) return null

  const page = {
    id: 'page',
    theme: 'dark',
    route: '/',
    state: {},      // @var = value
    computed: {},   // $var = expr
    queries: [],    // ~mount / ~interval
    blocks: [],     // nav, hero, etc.
  }

  for (const line of lines) {
    // Meta: %id theme /route
    if (line.startsWith('%')) {
      const parts = line.slice(1).trim().split(/\s+/)
      page.id    = parts[0] || 'page'
      page.theme = parts[1] || 'dark'
      page.route = parts[2] || '/'
      continue
    }

    // State: @var = value
    if (line.startsWith('@')) {
      const eq = line.indexOf('=')
      if (eq !== -1) {
        const key = line.slice(1, eq).trim()
        const val = line.slice(eq+1).trim()
        try { page.state[key] = JSON.parse(val) }
        catch { page.state[key] = val }
      }
      continue
    }

    // Computed: $var = expr
    if (line.startsWith('$')) {
      const eq = line.indexOf('=')
      if (eq !== -1) {
        const key = line.slice(1, eq).trim()
        const expr = line.slice(eq+1).trim()
        page.computed[key] = expr
      }
      continue
    }

    // Lifecycle: ~mount GET /path => @var  OR  ~mount GET /path @var
    if (line.startsWith('~')) {
      const q = parseQuery(line.slice(1).trim())
      if (q) page.queries.push(q)
      continue
    }

    // Block with state binding: table @var { ... }
    const tableMatch = line.match(/^table\s+(@[a-zA-Z_$][a-zA-Z0-9_.]*)\s*\{(.*)/)
    if (tableMatch) {
      const content = tableMatch[2].endsWith('}')
        ? tableMatch[2].slice(0, -1)
        : tableMatch[2]
      page.blocks.push({
        kind: 'table',
        binding: tableMatch[1],
        cols: parseTableCols(content),
        empty: parseTableEmpty(content),
      })
      continue
    }

    // list @var { ... }
    const listMatch = line.match(/^list\s+(@[a-zA-Z_$][a-zA-Z0-9_.]*)\s*\{(.*)/)
    if (listMatch) {
      const content = listMatch[2].endsWith('}') ? listMatch[2].slice(0,-1) : listMatch[2]
      page.blocks.push({
        kind: 'list',
        binding: listMatch[1],
        fields: parseTableCols(content),
      })
      continue
    }

    // form METHOD /path => action { ... }
    const formMatch = line.match(/^form\s+(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\s*=>\s*([^{]+))?\s*\{(.*)/)
    if (formMatch) {
      const content = formMatch[4].endsWith('}') ? formMatch[4].slice(0,-1) : formMatch[4]
      page.blocks.push({
        kind: 'form',
        method: formMatch[1],
        path: formMatch[2],
        action: (formMatch[3]||'').trim(),
        fields: parseFormFields(content),
      })
      continue
    }

    // if @condition { block }
    const ifMatch = line.match(/^if\s+(!?[@$][a-zA-Z_0-9.]+)\s*\{(.*)/)
    if (ifMatch) {
      const content = ifMatch[2].endsWith('}') ? ifMatch[2].slice(0,-1) : ifMatch[2]
      page.blocks.push({
        kind: 'if',
        condition: ifMatch[1],
        inner: content.trim(),
      })
      continue
    }

    // Regular block: nav{...} hero{...} etc
    const bi = line.indexOf('{')
    if (bi !== -1) {
      const head = line.slice(0, bi).trim()
      const body = line.slice(bi+1, line.lastIndexOf('}')).trim()
      const m = head.match(/^([a-z]+)(\d+)?$/)
      const kind = m ? m[1] : head
      const cols = m && m[2] ? parseInt(m[2]) : 3
      const items = parseItems(body)
      page.blocks.push({ kind, cols, items })
    }
  }

  return page
}

function parseQuery(s) {
  // "mount GET /api/users => @users"
  // "mount GET /api/users @users"
  // "interval 5000 GET /api/stats => @stats"
  const parts = s.split(/\s+/)
  if (parts[0] === 'mount') {
    const arrowIdx = parts.indexOf('=>')
    if (arrowIdx !== -1) {
      return {
        trigger: 'mount',
        method: parts[1],
        path: parts[2],
        target: null,
        action: parts.slice(arrowIdx+1).join(' ').trim(),
      }
    }
    return { trigger:'mount', method:parts[1], path:parts[2], target:parts[3], action:null }
  }
  if (parts[0] === 'interval') {
    const arrowIdx = parts.indexOf('=>')
    if (arrowIdx !== -1) {
      return {
        trigger:'interval', interval:parseInt(parts[1]),
        method:parts[2], path:parts[3],
        target:null, action:parts.slice(arrowIdx+1).join(' ').trim(),
      }
    }
    return { trigger:'interval', interval:parseInt(parts[1]), method:parts[2], path:parts[3], target:parts[4], action:null }
  }
  return null
}

function parseItems(body) {
  return body.split('|').map(item =>
    item.trim().split('>').map(f => {
      f = f.trim()
      if (f.startsWith('/')) {
        const [path, label] = f.split(':')
        return { isLink:true, path:path.trim(), label:(label||'').trim() }
      }
      return { isLink:false, text:f }
    })
  ).filter(i => i.length > 0 && (i[0].text || i[0].isLink))
}

function parseTableCols(s) {
  // "Name:name | Email:email | Status:status"
  return s.split('|')
    .map(c => {
      c = c.trim()
      if (c.startsWith('empty:')) return null
      const [label, key] = c.split(':').map(x => x.trim())
      return key ? { label, key } : null
    })
    .filter(Boolean)
}

function parseTableEmpty(s) {
  const m = s.match(/empty:\s*([^|]+)/)
  return m ? m[1].trim() : 'No data.'
}

function parseFormFields(s) {
  // "Name : text : placeholder | Email : email : hint"
  return s.split('|').map(f => {
    const parts = f.split(':').map(p => p.trim())
    return {
      label: parts[0],
      type: parts[1] || 'text',
      placeholder: parts[2] || '',
      name: (parts[0]||'').toLowerCase().replace(/\s+/g,'_'),
    }
  }).filter(f => f.label)
}

// ─────────────────────────────────────────────────────────────
// DOM RENDERER
// ─────────────────────────────────────────────────────────────

class Renderer {
  constructor(state, container) {
    this.state = state
    this.container = container
    this._cleanups = []
  }

  render(page) {
    this.container.innerHTML = ''
    this.container.className = `flux-root flux-theme-${page.theme}`
    for (const block of page.blocks) {
      const el = this.renderBlock(block)
      if (el) this.container.appendChild(el)
    }
  }

  renderBlock(block) {
    switch(block.kind) {
      case 'nav':    return this.renderNav(block)
      case 'hero':   return this.renderHero(block)
      case 'stats':  return this.renderStats(block)
      case 'row':    return this.renderRow(block)
      case 'sect':   return this.renderSect(block)
      case 'foot':   return this.renderFoot(block)
      case 'table':  return this.renderTable(block)
      case 'list':   return this.renderList(block)
      case 'form':   return this.renderForm(block)
      case 'if':     return this.renderIf(block)
      case 'alert':  return this.renderAlert(block)
      default: return null
    }
  }

  // Resolve bindings in text
  t(str) { return this.state.resolve(str) }

  // Create element helper
  el(tag, cls, inner) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (inner) e.innerHTML = inner
    return e
  }

  renderNav(block) {
    const nav = this.el('nav', 'fx-nav')
    if (!block.items?.[0]) return nav
    const item = block.items[0]
    let ls = 0
    if (!item[0]?.isLink) {
      const brand = this.el('span', 'fx-brand')
      brand.textContent = this.t(item[0].text)
      nav.appendChild(brand)
      ls = 1
    }
    const links = this.el('div', 'fx-nav-links')
    for (const f of item.slice(ls)) {
      if (f.isLink) {
        const a = document.createElement('a')
        a.className = 'fx-nav-link'
        a.href = f.path
        a.textContent = f.label
        a.addEventListener('click', e => { e.preventDefault(); Router.push(f.path) })
        links.appendChild(a)
      }
    }
    nav.appendChild(links)
    return nav
  }

  renderHero(block) {
    const sec = this.el('section', 'fx-hero')
    const inner = this.el('div', 'fx-hero-inner')
    sec.appendChild(inner)
    let h1 = false
    for (const item of block.items) {
      for (const f of item) {
        if (f.isLink) {
          const a = this.el('a', 'fx-cta')
          a.href = f.path
          a.textContent = f.label
          a.addEventListener('click', e => { e.preventDefault(); Router.push(f.path) })
          inner.appendChild(a)
        } else if (!h1) {
          const el = this.el('h1', 'fx-title')
          el.textContent = this.t(f.text)
          inner.appendChild(el)
          h1 = true
          // Reactive bind
          if (f.text.includes('@') || f.text.includes('$')) {
            const orig = f.text
            const stop = this.state.watch('*', () => { el.textContent = this.t(orig) })
            this._cleanups.push(stop)
          }
        } else {
          const el = this.el('p', 'fx-sub')
          el.textContent = this.t(f.text)
          inner.appendChild(el)
        }
      }
    }
    return sec
  }

  renderStats(block) {
    const wrap = this.el('div', 'fx-stats')
    for (const item of block.items) {
      const raw = item[0]?.text || ''
      const [val, lbl] = raw.split(':')
      const cell = this.el('div', 'fx-stat')
      const valEl = this.el('div', 'fx-stat-val')
      const lblEl = this.el('div', 'fx-stat-lbl')
      valEl.textContent = this.t(val?.trim())
      lblEl.textContent = this.t(lbl?.trim())
      cell.appendChild(valEl)
      cell.appendChild(lblEl)
      wrap.appendChild(cell)
      // Reactive
      if (raw.includes('@') || raw.includes('$')) {
        const origVal = val?.trim(), origLbl = lbl?.trim()
        const stop = this.state.watch('*', () => {
          valEl.textContent = this.t(origVal)
          lblEl.textContent = this.t(origLbl)
        })
        this._cleanups.push(stop)
      }
    }
    return wrap
  }

  renderRow(block) {
    const grid = this.el('div', `fx-grid fx-grid-${block.cols || 3}`)
    for (const item of block.items) {
      const card = this.el('div', 'fx-card')
      item.forEach((f, fi) => {
        if (f.isLink) {
          const a = this.el('a', 'fx-card-link')
          a.href = f.path
          a.textContent = `${f.label} →`
          a.addEventListener('click', e => { e.preventDefault(); Router.push(f.path) })
          card.appendChild(a)
        } else if (fi === 0) {
          const ico = this.el('div', 'fx-icon')
          ico.textContent = ICONS[f.text] || f.text
          card.appendChild(ico)
        } else if (fi === 1) {
          const h = this.el('h3', 'fx-card-title')
          h.textContent = this.t(f.text)
          card.appendChild(h)
        } else {
          const p = this.el('p', 'fx-card-body')
          p.textContent = this.t(f.text)
          card.appendChild(p)
        }
      })
      grid.appendChild(card)
    }
    return grid
  }

  renderSect(block) {
    const sec = this.el('section', 'fx-sect')
    block.items.forEach((item, ii) => {
      for (const f of item) {
        if (f.isLink) {
          const a = this.el('a', 'fx-sect-link')
          a.href = f.path; a.textContent = f.label
          a.addEventListener('click', e => { e.preventDefault(); Router.push(f.path) })
          sec.appendChild(a)
        } else if (ii === 0) {
          const h = this.el('h2', 'fx-sect-title')
          h.textContent = this.t(f.text)
          sec.appendChild(h)
        } else {
          const p = this.el('p', 'fx-sect-body')
          p.textContent = this.t(f.text)
          sec.appendChild(p)
        }
      }
    })
    return sec
  }

  renderFoot(block) {
    const foot = this.el('footer', 'fx-footer')
    for (const item of block.items) {
      for (const f of item) {
        if (f.isLink) {
          const a = this.el('a', 'fx-footer-link')
          a.href = f.path; a.textContent = f.label
          foot.appendChild(a)
        } else {
          const p = this.el('p', 'fx-footer-text')
          p.textContent = this.t(f.text)
          foot.appendChild(p)
        }
      }
    }
    return foot
  }

  renderTable(block) {
    const wrap = this.el('div', 'fx-table-wrap')
    const table = document.createElement('table')
    table.className = 'fx-table'
    const thead = document.createElement('thead')
    const tr = document.createElement('tr')
    tr.className = 'fx-thead-row'
    for (const col of block.cols) {
      const th = document.createElement('th')
      th.className = 'fx-th'
      th.textContent = col.label
      tr.appendChild(th)
    }
    thead.appendChild(tr)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    tbody.className = 'fx-tbody'
    table.appendChild(tbody)
    wrap.appendChild(table)

    const render = () => {
      let rows = this.state.eval(block.binding)
      if (!Array.isArray(rows)) rows = []
      tbody.innerHTML = ''
      if (rows.length === 0) {
        const tr = document.createElement('tr')
        const td = document.createElement('td')
        td.colSpan = block.cols.length
        td.className = 'fx-td-empty'
        td.textContent = block.empty || 'No data.'
        tr.appendChild(td)
        tbody.appendChild(tr)
        return
      }
      for (const row of rows) {
        const tr = document.createElement('tr')
        tr.className = 'fx-tr'
        for (const col of block.cols) {
          const td = document.createElement('td')
          td.className = 'fx-td'
          td.textContent = row[col.key] != null ? row[col.key] : ''
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
    }

    render()
    const key = block.binding.slice(1)
    const stop = this.state.watch(key, render)
    this._cleanups.push(stop)
    // Also watch computed
    if (block.binding.startsWith('$')) {
      const stop2 = this.state.watch(block.binding, render)
      this._cleanups.push(stop2)
    }

    return wrap
  }

  renderList(block) {
    const wrap = this.el('div', 'fx-list-wrap')

    const render = () => {
      let items = this.state.eval(block.binding)
      if (!Array.isArray(items)) items = []
      wrap.innerHTML = ''
      for (const item of items) {
        const card = this.el('div', 'fx-list-item')
        for (const f of block.fields) {
          if (f.isLink) {
            const href = f.path.replace(/\{([^}]+)\}/g, (_, k) => item[k] || '')
            const a = this.el('a', 'fx-list-link')
            a.href = href; a.textContent = f.label
            a.addEventListener('click', e => { e.preventDefault(); Router.push(href) })
            card.appendChild(a)
          } else {
            const p = this.el('p', 'fx-list-field')
            p.textContent = item[f.key] || ''
            card.appendChild(p)
          }
        }
        wrap.appendChild(card)
      }
    }

    render()
    const key = block.binding.slice(1)
    const stop = this.state.watch(key, render)
    this._cleanups.push(stop)
    return wrap
  }

  renderForm(block) {
    const wrap = this.el('div', 'fx-form-wrap')
    const form = document.createElement('form')
    form.className = 'fx-form'

    for (const f of block.fields) {
      const fieldWrap = this.el('div', 'fx-field')
      const label = this.el('label', 'fx-label')
      label.textContent = f.label
      fieldWrap.appendChild(label)

      if (f.type === 'select' && f.placeholder) {
        const sel = document.createElement('select')
        sel.className = 'fx-input'
        sel.name = f.name
        for (const opt of f.placeholder.split(',')) {
          const o = document.createElement('option')
          o.value = opt.trim(); o.textContent = opt.trim()
          sel.appendChild(o)
        }
        fieldWrap.appendChild(sel)
      } else {
        const inp = document.createElement('input')
        inp.className = 'fx-input'
        inp.type = f.type
        inp.name = f.name
        inp.placeholder = f.placeholder
        if (f.type !== 'password') inp.autocomplete = 'on'
        fieldWrap.appendChild(inp)
      }
      form.appendChild(fieldWrap)
    }

    // Error/success message area
    const msg = this.el('div', 'fx-form-msg')
    form.appendChild(msg)

    const btn = document.createElement('button')
    btn.type = 'submit'
    btn.className = 'fx-btn'
    btn.textContent = 'Submit'
    form.appendChild(btn)

    form.addEventListener('submit', async e => {
      e.preventDefault()
      btn.disabled = true
      btn.textContent = 'Loading...'
      msg.textContent = ''

      const data = {}
      for (const inp of form.querySelectorAll('input,select')) {
        data[inp.name] = inp.value
      }

      const path = this.state.resolve(block.path)
      try {
        const res = await fetch(path, {
          method: block.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        if (!res.ok) {
          msg.className = 'fx-form-msg fx-form-err'
          msg.textContent = result.message || result.error || 'Error. Try again.'
          btn.disabled = false
          btn.textContent = 'Submit'
          return
        }
        if (block.action) {
          const qe = new QueryEngine(this.state)
          qe._applyResult(result, null, block.action)
        }
        msg.className = 'fx-form-msg fx-form-ok'
        msg.textContent = 'Done!'
      } catch(err) {
        msg.className = 'fx-form-msg fx-form-err'
        msg.textContent = 'Network error. Try again.'
      }
      btn.disabled = false
      btn.textContent = 'Submit'
    })

    wrap.appendChild(form)
    return wrap
  }

  renderIf(block) {
    const wrap = this.el('div', 'fx-if-wrap')

    const evalCond = () => {
      const cond = block.condition
      const neg = cond.startsWith('!')
      const expr = neg ? cond.slice(1) : cond
      const val = this.state.eval(expr)
      const truthy = Array.isArray(val) ? val.length > 0 : !!val
      return neg ? !truthy : truthy
    }

    const render = () => {
      wrap.innerHTML = ''
      if (evalCond()) {
        // Parse and render inner block
        const innerLine = block.inner
        const bi = innerLine.indexOf('{')
        if (bi !== -1) {
          const head = innerLine.slice(0,bi).trim()
          const body = innerLine.slice(bi+1, innerLine.lastIndexOf('}')).trim()
          const m = head.match(/^([a-z]+)(\d+)?$/)
          const innerBlock = {
            kind: m ? m[1] : head,
            cols: m && m[2] ? parseInt(m[2]) : 3,
            items: parseItems(body),
          }
          const el = this.renderBlock(innerBlock)
          if (el) wrap.appendChild(el)
        }
      }
    }

    render()

    // Watch all @vars in condition
    const matches = block.condition.match(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g) || []
    for (const m of matches) {
      const key = m.startsWith('@') || m.startsWith('$') ? m.slice(1) : m
      const stop = this.state.watch(key, render)
      this._cleanups.push(stop)
    }

    return wrap
  }

  renderAlert(block) {
    const div = this.el('div', 'fx-alert')
    if (block.items?.[0]?.[0]) {
      div.textContent = this.t(block.items[0][0].text)
    }
    return div
  }

  destroy() {
    for (const fn of this._cleanups) fn()
    this._cleanups = []
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────

const Router = {
  pages: [],
  container: null,
  currentRenderer: null,
  currentQE: null,

  init(pages, container) {
    this.pages = pages
    this.container = container
    window.addEventListener('popstate', () => this._render(location.pathname))
    this._render(location.pathname)
  },

  push(path) {
    if (path === location.pathname) return
    history.pushState({}, '', path)
    this._render(path)
  },

  _render(path) {
    // Match route
    let page = this.pages.find(p => p.route === path)
    if (!page) {
      // Try prefix match
      page = this.pages.find(p => path.startsWith(p.route) && p.route !== '/')
    }
    if (!page) page = this.pages.find(p => p.route === '/')
    if (!page) return

    // Destroy previous
    if (this.currentRenderer) this.currentRenderer.destroy()
    if (this.currentQE) this.currentQE.destroy()

    // New state for this page
    const state = new State()
    for (const [k, v] of Object.entries(page.state || {})) state.set(k, v)
    for (const [k, expr] of Object.entries(page.computed || {})) {
      state.defineComputed(k, expr.replace(/@([a-zA-Z_]+)/g, '_$1').replace(/\$([a-zA-Z_]+)/g, 'computed.$1'))
    }

    // Render
    const renderer = new Renderer(state, this.container)
    renderer.render(page)
    this.currentRenderer = renderer

    // Queries
    const qe = new QueryEngine(state)
    qe.mountAll(page.queries)
    this.currentQE = qe

    // Update page title
    document.title = page.id.charAt(0).toUpperCase() + page.id.slice(1)
  }
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
input,button,select{font-family:inherit}
.aiplang-root{min-height:100vh}
.aiplang-theme-dark{background:#030712;color:#f1f5f9}
.aiplang-theme-light{background:#fff;color:#0f172a}
.aiplang-theme-acid{background:#000;color:#a3e635}
.fx-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 2.5rem;position:sticky;top:0;z-index:50;backdrop-filter:blur(12px)}
.aiplang-theme-dark .fx-nav{border-bottom:1px solid #1e293b;background:rgba(3,7,18,.85)}
.aiplang-theme-light .fx-nav{border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.85)}
.aiplang-theme-acid .fx-nav{border-bottom:1px solid #1a2e05;background:rgba(0,0,0,.9)}
.fx-brand{font-size:1.25rem;font-weight:800;letter-spacing:-.03em}
.fx-nav-links{display:flex;align-items:center;gap:1.75rem}
.fx-nav-link{font-size:.875rem;font-weight:500;opacity:.65;transition:opacity .15s;cursor:pointer}
.fx-nav-link:hover{opacity:1}
.aiplang-theme-dark .fx-nav-link{color:#cbd5e1}
.aiplang-theme-light .fx-nav-link{color:#475569}
.aiplang-theme-acid .fx-nav-link{color:#86efac}
.fx-hero{display:flex;align-items:center;justify-content:center;min-height:92vh;padding:4rem 1.5rem}
.fx-hero-inner{max-width:56rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.5rem}
.fx-title{font-size:clamp(2.5rem,8vw,5.5rem);font-weight:900;letter-spacing:-.04em;line-height:1}
.fx-sub{font-size:clamp(1rem,2vw,1.25rem);line-height:1.75;max-width:40rem}
.aiplang-theme-dark .fx-sub{color:#94a3b8}
.aiplang-theme-light .fx-sub{color:#475569}
.fx-cta{display:inline-flex;align-items:center;padding:.875rem 2.5rem;border-radius:.75rem;font-weight:700;font-size:1rem;letter-spacing:-.01em;transition:transform .15s,box-shadow .15s;margin:.25rem;cursor:pointer}
.fx-cta:hover{transform:translateY(-1px)}
.aiplang-theme-dark .fx-cta{background:#2563eb;color:#fff;box-shadow:0 8px 24px rgba(37,99,235,.35)}
.aiplang-theme-light .fx-cta{background:#2563eb;color:#fff}
.aiplang-theme-acid .fx-cta{background:#a3e635;color:#000;font-weight:800}
.fx-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3rem;padding:5rem 2.5rem;text-align:center}
.fx-stat-val{font-size:clamp(2.5rem,5vw,4rem);font-weight:900;letter-spacing:-.04em;line-height:1}
.fx-stat-lbl{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:.5rem}
.aiplang-theme-dark .fx-stat-lbl{color:#64748b}
.aiplang-theme-light .fx-stat-lbl{color:#94a3b8}
.fx-grid{display:grid;gap:1.25rem;padding:1rem 2.5rem 5rem}
.fx-grid-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.fx-grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.fx-grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.fx-card{border-radius:1rem;padding:1.75rem;transition:transform .2s,box-shadow .2s}
.fx-card:hover{transform:translateY(-2px)}
.aiplang-theme-dark .fx-card{background:#0f172a;border:1px solid #1e293b}
.aiplang-theme-light .fx-card{background:#f8fafc;border:1px solid #e2e8f0}
.aiplang-theme-acid .fx-card{background:#0a0f00;border:1px solid #1a2e05}
.aiplang-theme-dark .fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.5)}
.aiplang-theme-light .fx-card:hover{box-shadow:0 20px 40px rgba(0,0,0,.08)}
.fx-icon{font-size:2rem;margin-bottom:1rem}
.fx-card-title{font-size:1.0625rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.5rem}
.fx-card-body{font-size:.875rem;line-height:1.65}
.aiplang-theme-dark .fx-card-body{color:#64748b}
.aiplang-theme-light .fx-card-body{color:#475569}
.fx-card-link{font-size:.8125rem;font-weight:600;display:inline-block;margin-top:1rem;opacity:.6;transition:opacity .15s}
.fx-card-link:hover{opacity:1}
.fx-sect{padding:5rem 2.5rem}
.fx-sect-title{font-size:clamp(1.75rem,4vw,3rem);font-weight:800;letter-spacing:-.04em;margin-bottom:1.5rem;text-align:center}
.fx-sect-body{font-size:1rem;line-height:1.75;text-align:center;max-width:48rem;margin:0 auto}
.aiplang-theme-dark .fx-sect-body{color:#64748b}
.fx-form-wrap{padding:3rem 2.5rem;display:flex;justify-content:center}
.fx-form{width:100%;max-width:28rem;border-radius:1.25rem;padding:2.5rem}
.aiplang-theme-dark .fx-form{background:#0f172a;border:1px solid #1e293b}
.aiplang-theme-light .fx-form{background:#f8fafc;border:1px solid #e2e8f0}
.fx-field{margin-bottom:1.25rem}
.fx-label{display:block;font-size:.8125rem;font-weight:600;margin-bottom:.5rem}
.aiplang-theme-dark .fx-label{color:#94a3b8}
.aiplang-theme-light .fx-label{color:#475569}
.fx-input{width:100%;padding:.75rem 1rem;border-radius:.625rem;font-size:.9375rem;outline:none;transition:box-shadow .15s;background:transparent}
.fx-input:focus{box-shadow:0 0 0 3px rgba(37,99,235,.35)}
.aiplang-theme-dark .fx-input{background:#020617;border:1px solid #1e293b;color:#f1f5f9}
.aiplang-theme-dark .fx-input::placeholder{color:#334155}
.aiplang-theme-light .fx-input{background:#fff;border:1px solid #cbd5e1;color:#0f172a}
.aiplang-theme-acid .fx-input{background:#000;border:1px solid #1a2e05;color:#a3e635}
.fx-btn{width:100%;padding:.875rem 1.5rem;border:none;border-radius:.625rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-top:.5rem;transition:transform .15s,opacity .15s;letter-spacing:-.01em}
.fx-btn:hover{transform:translateY(-1px)}
.fx-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.aiplang-theme-dark .fx-btn{background:#2563eb;color:#fff;box-shadow:0 4px 14px rgba(37,99,235,.4)}
.aiplang-theme-light .fx-btn{background:#2563eb;color:#fff}
.aiplang-theme-acid .fx-btn{background:#a3e635;color:#000;font-weight:800}
.fx-form-msg{font-size:.8125rem;padding:.5rem 0;min-height:1.5rem;text-align:center}
.fx-form-err{color:#f87171}
.fx-form-ok{color:#4ade80}
.fx-table-wrap{overflow-x:auto;padding:0 2.5rem 4rem}
.fx-table{width:100%;border-collapse:collapse;font-size:.875rem}
.fx-th{text-align:left;padding:.875rem 1.25rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.aiplang-theme-dark .fx-th{color:#475569;border-bottom:1px solid #1e293b}
.aiplang-theme-light .fx-th{color:#94a3b8;border-bottom:1px solid #e2e8f0}
.fx-tr{transition:background .1s}
.fx-td{padding:.875rem 1.25rem}
.aiplang-theme-dark .fx-tr:hover{background:#0f172a}
.aiplang-theme-light .fx-tr:hover{background:#f8fafc}
.aiplang-theme-dark .fx-td{border-bottom:1px solid #0f172a}
.aiplang-theme-light .fx-td{border-bottom:1px solid #f1f5f9}
.fx-td-empty{padding:2rem 1.25rem;text-align:center;opacity:.4}
.fx-list-wrap{padding:1rem 2.5rem 4rem;display:flex;flex-direction:column;gap:.75rem}
.fx-list-item{border-radius:.75rem;padding:1.25rem 1.5rem}
.aiplang-theme-dark .fx-list-item{background:#0f172a;border:1px solid #1e293b}
.fx-list-field{font-size:.9375rem;line-height:1.5}
.fx-list-link{font-size:.8125rem;font-weight:600;opacity:.6;transition:opacity .15s}
.fx-list-link:hover{opacity:1}
.fx-alert{padding:1rem 2.5rem;font-size:.9375rem;font-weight:500;border-radius:.75rem;margin:1rem 2.5rem}
.aiplang-theme-dark .fx-alert{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#fca5a5}
.fx-if-wrap{display:contents}
.fx-footer{padding:3rem 2.5rem;text-align:center}
.aiplang-theme-dark .fx-footer{border-top:1px solid #1e293b}
.aiplang-theme-light .fx-footer{border-top:1px solid #e2e8f0}
.fx-footer-text{font-size:.8125rem}
.aiplang-theme-dark .fx-footer-text{color:#334155}
.fx-footer-link{font-size:.8125rem;margin:0 .75rem;opacity:.5;transition:opacity .15s}
.fx-footer-link:hover{opacity:1}
`

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────

function boot(src, container) {
  // Inject CSS once
  if (!document.getElementById('flux-css')) {
    const style = document.createElement('style')
    style.id = 'flux-css'
    style.textContent = CSS
    document.head.appendChild(style)
  }

  const pages = parseFlux(src)
  if (!pages.length) {
    container.textContent = '[aiplang] no pages found'
    return
  }

  Router.init(pages, container)
}

return { boot, parseFlux, State, Renderer, Router, QueryEngine }

})()

// Auto-boot from <script type="text/flux">
document.addEventListener('DOMContentLoaded', () => {
  const script = document.querySelector('script[type="text/flux"]')
  if (script) {
    const targetSel = script.getAttribute('target') || '#app'
    const container = document.querySelector(targetSel)
    if (container) AIPLANG.boot(script.textContent, container)
  }
})
