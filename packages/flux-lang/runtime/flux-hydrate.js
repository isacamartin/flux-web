/**
 * flux-hydrate.js — FLUX Hydration Runtime v1.0
 * ~8KB — loads only when page has dynamic blocks
 *
 * Responsibilities:
 *   1. Read window.__FLUX_PAGE__ config
 *   2. Initialize reactive state
 *   3. Run lifecycle queries (~mount, ~interval)
 *   4. Hydrate dynamic elements:
 *      - [data-fx-bind]   → text bindings
 *      - [data-fx-table]  → populate table tbody from @var
 *      - [data-fx-list]   → populate list from @var
 *      - [data-fx-form]   → attach submit handler
 *      - [data-fx-if]     → conditional show/hide
 *   5. SPA navigation for multi-page apps
 *
 * Static blocks (nav, hero text, cards, footer) are NOT touched.
 * Google already indexed them from the pre-rendered HTML.
 */

(function () {
'use strict'

const cfg = window.__FLUX_PAGE__
if (!cfg) return

// ── Reactive State ────────────────────────────────────────────────

const _state = {}
const _watchers = {}

// Init from page config
for (const [k, v] of Object.entries(cfg.state || {})) {
  try { _state[k] = JSON.parse(v) } catch { _state[k] = v }
}

function get(key) { return _state[key] }

function set(key, value) {
  if (JSON.stringify(_state[key]) === JSON.stringify(value)) return
  _state[key] = value
  notify(key)
}

function watch(key, cb) {
  if (!_watchers[key]) _watchers[key] = []
  _watchers[key].push(cb)
  return () => { _watchers[key] = _watchers[key].filter(fn => fn !== cb) }
}

function notify(key) {
  ;(_watchers[key] || []).forEach(cb => cb(_state[key]))
}

function resolve(str) {
  if (!str || (!str.includes('@') && !str.includes('$'))) return str
  return str.replace(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g, m => {
    const path = m.slice(1).split('.')
    let val = _state[path[0]]
    for (let i = 1; i < path.length; i++) {
      if (val == null) return ''
      val = val[path[i]]
    }
    return val == null ? '' : String(val)
  })
}

// ── Query Engine ──────────────────────────────────────────────────

const _intervals = []

async function runQuery(q) {
  const path = resolve(q.path)
  const opts = { method: q.method, headers: { 'Content-Type': 'application/json' } }
  if (q.body) opts.body = JSON.stringify(q.body)

  try {
    const res = await fetch(path, opts)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    applyAction(data, q.target, q.action)
    return data
  } catch (e) {
    console.warn('[FLUX hydrate] query failed:', q.method, path, e.message)
    return null
  }
}

function applyAction(data, target, action) {
  if (!target && !action) return

  if (action) {
    if (action.startsWith('redirect ')) {
      window.location.href = action.slice(9).trim()
      return
    }
    if (action === 'reload') { window.location.reload(); return }

    const pushMatch = action.match(/^@([a-zA-Z_]+)\.push\(\$result\)$/)
    if (pushMatch) {
      set(pushMatch[1], [...(get(pushMatch[1]) || []), data])
      return
    }
    const assignMatch = action.match(/^@([a-zA-Z_]+)\s*=\s*\$result$/)
    if (assignMatch) { set(assignMatch[1], data); return }
  }

  if (target && target.startsWith('@')) set(target.slice(1), data)
}

function mountQueries() {
  for (const q of cfg.queries || []) {
    if (q.trigger === 'mount') {
      runQuery(q)
    } else if (q.trigger === 'interval') {
      runQuery(q)
      _intervals.push(setInterval(() => runQuery(q), q.interval))
    }
  }
}

// ── DOM Hydration ─────────────────────────────────────────────────

function hydrateTextBindings() {
  document.querySelectorAll('[data-fx-bind]').forEach(el => {
    const expr = el.getAttribute('data-fx-bind')
    const update = () => { el.textContent = resolve(expr) }

    // Extract state keys from expression
    const keys = (expr.match(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g) || [])
      .map(m => m.slice(1).split('.')[0])
    for (const key of keys) watch(key, update)

    // Initial render (will update when queries resolve)
    update()
  })
}

function hydrateTables() {
  document.querySelectorAll('[data-fx-table]').forEach(tbl => {
    const binding = tbl.getAttribute('data-fx-table') // e.g. "@users"
    const colsJSON = tbl.getAttribute('data-fx-cols')
    const cols = colsJSON ? JSON.parse(colsJSON) : []
    const tbody = tbl.querySelector('[class*="fx-tbody"]') || tbl.querySelector('tbody')
    if (!tbody) return

    const render = () => {
      const key = binding.startsWith('@') ? binding.slice(1) : binding
      let rows = get(key)
      if (!Array.isArray(rows)) rows = []
      tbody.innerHTML = ''

      if (!rows.length) {
        const tr = document.createElement('tr')
        const td = document.createElement('td')
        td.colSpan = cols.length || 1
        td.className = 'fx-td-empty'
        td.textContent = tbl.getAttribute('data-fx-empty') || 'No data.'
        tr.appendChild(td)
        tbody.appendChild(tr)
        return
      }

      for (const row of rows) {
        const tr = document.createElement('tr')
        tr.className = 'fx-tr'
        for (const key of cols) {
          const td = document.createElement('td')
          td.className = 'fx-td'
          td.textContent = row[key] != null ? row[key] : ''
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
    }

    const stateKey = binding.startsWith('@') ? binding.slice(1) : binding
    watch(stateKey, render)
    render()
  })
}

function hydrateLists() {
  document.querySelectorAll('[data-fx-list]').forEach(wrap => {
    const binding = wrap.getAttribute('data-fx-list')
    const colsJSON = wrap.getAttribute('data-fx-cols')
    const cols = colsJSON ? JSON.parse(colsJSON) : []

    const render = () => {
      const key = binding.startsWith('@') ? binding.slice(1) : binding
      let items = get(key)
      if (!Array.isArray(items)) items = []
      wrap.innerHTML = ''
      for (const item of items) {
        const card = document.createElement('div')
        card.className = 'fx-list-item'
        for (const col of cols) {
          const p = document.createElement('p')
          p.className = 'fx-list-field'
          p.textContent = item[col] || ''
          card.appendChild(p)
        }
        wrap.appendChild(card)
      }
    }

    const stateKey = binding.startsWith('@') ? binding.slice(1) : binding
    watch(stateKey, render)
    render()
  })
}

function hydrateForms() {
  document.querySelectorAll('[data-fx-form]').forEach(form => {
    const path   = form.getAttribute('data-fx-form')
    const method = form.getAttribute('data-fx-method') || 'POST'
    const action = form.getAttribute('data-fx-action') || ''
    const msg    = form.querySelector('.fx-form-msg')
    const btn    = form.querySelector('button[type="submit"]')

    // Restore select options if type=select was used
    form.querySelectorAll('select').forEach(sel => {
      const placeholder = sel.getAttribute('data-fx-options')
      if (placeholder) {
        for (const opt of placeholder.split(',')) {
          const o = document.createElement('option')
          o.value = opt.trim(); o.textContent = opt.trim()
          sel.appendChild(o)
        }
      }
    })

    form.addEventListener('submit', async e => {
      e.preventDefault()
      if (btn) { btn.disabled = true; btn.textContent = 'Loading...' }
      if (msg) { msg.className = 'fx-form-msg'; msg.textContent = '' }

      const data = {}
      for (const inp of form.querySelectorAll('input,select,textarea')) {
        if (inp.name) data[inp.name] = inp.value
      }

      try {
        const res = await fetch(resolve(path), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        if (!res.ok) {
          if (msg) {
            msg.className = 'fx-form-msg fx-form-err'
            msg.textContent = result.message || result.error || 'Error. Try again.'
          }
        } else {
          if (action) applyAction(result, null, action)
          if (msg) {
            msg.className = 'fx-form-msg fx-form-ok'
            msg.textContent = 'Done!'
          }
          form.reset()
        }
      } catch (err) {
        if (msg) {
          msg.className = 'fx-form-msg fx-form-err'
          msg.textContent = 'Network error. Please try again.'
        }
      }

      if (btn) { btn.disabled = false; btn.textContent = 'Submit' }
    })
  })
}

function hydrateConditionals() {
  document.querySelectorAll('[data-fx-if]').forEach(wrap => {
    const cond = wrap.getAttribute('data-fx-if')
    const neg  = cond.startsWith('!')
    const expr = neg ? cond.slice(1) : cond

    const evalCond = () => {
      const path = expr.startsWith('@') ? expr.slice(1) : expr
      const parts = path.split('.')
      let val = get(parts[0])
      for (let i = 1; i < parts.length; i++) val = val?.[parts[i]]
      const truthy = Array.isArray(val) ? val.length > 0 : !!val
      return neg ? !truthy : truthy
    }

    const update = () => {
      wrap.style.display = evalCond() ? '' : 'none'
    }

    const key = expr.replace(/^[@$]/, '').split('.')[0]
    watch(key, update)
    update()
  })
}

function hydrateNavLinks() {
  // Intercept nav clicks for SPA navigation if multi-page
  const routes = cfg.routes || []
  if (routes.length <= 1) return

  document.querySelectorAll('.fx-nav-link, .fx-cta, .fx-card-link').forEach(a => {
    const href = a.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('//')) return
    if (routes.includes(href)) {
      a.addEventListener('click', e => {
        e.preventDefault()
        window.location.href = href // Full navigation — SSG pages are real HTML files
      })
    }
  })
}

// ── Boot ──────────────────────────────────────────────────────────

function boot() {
  hydrateTextBindings()
  hydrateTables()
  hydrateLists()
  hydrateForms()
  hydrateConditionals()
  hydrateNavLinks()
  mountQueries()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

})()
