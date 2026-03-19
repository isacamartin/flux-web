/**
 * flux-hydrate.js — FLUX Hydration Runtime v1.1
 * Handles: state, queries, table, list, form, if, edit, delete, btn, select
 */

(function () {
'use strict'

const cfg = window.__AIPLANG_PAGE__
if (!cfg) return

// ── State ────────────────────────────────────────────────────────
const _state = {}
const _watchers = {}

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
  return () => { _watchers[key] = _watchers[key].filter(f => f !== cb) }
}

function notify(key) {
  ;(_watchers[key] || []).forEach(cb => cb(_state[key]))
}

function resolve(str) {
  if (!str || (!str.includes('@') && !str.includes('$'))) return str
  return str.replace(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g, m => {
    const path = m.slice(1).split('.')
    let val = _state[path[0]]
    for (let i = 1; i < path.length; i++) val = val?.[path[i]]
    return val == null ? '' : String(val)
  })
}

// Resolve path with row data: /api/users/{id} + {id:1} → /api/users/1
function resolvePath(tmpl, row) {
  return tmpl.replace(/\{([^}]+)\}/g, (_, k) => row?.[k] ?? get(k) ?? '')
}

// ── Query Engine ─────────────────────────────────────────────────
const _intervals = []

async function runQuery(q) {
  const path = resolve(q.path)
  const opts = { method: q.method, headers: { 'Content-Type': 'application/json' } }
  if (q.body) opts.body = JSON.stringify(q.body)
  try {
    const res  = await fetch(path, opts)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    applyAction(data, q.target, q.action)
    return data
  } catch (e) {
    console.warn('[FLUX]', q.method, path, e.message)
    return null
  }
}

function applyAction(data, target, action) {
  if (!target && !action) return
  if (action) {
    if (action.startsWith('redirect ')) { window.location.href = action.slice(9).trim(); return }
    if (action === 'reload')            { window.location.reload(); return }
    const pm = action.match(/^@([a-zA-Z_]+)\.push\(\$result\)$/)
    if (pm) { set(pm[1], [...(get(pm[1]) || []), data]); return }
    const fm = action.match(/^@([a-zA-Z_]+)\.filter\((.+)\)$/)
    if (fm) { try { set(fm[1], (get(fm[1])||[]).filter(new Function('item', `return (${fm[2]})(item)`))) } catch {} return }
    const am = action.match(/^@([a-zA-Z_]+)\s*=\s*\$result$/)
    if (am) { set(am[1], data); return }
  }
  if (target && target.startsWith('@')) set(target.slice(1), data)
}

function mountQueries() {
  for (const q of cfg.queries || []) {
    if (q.trigger === 'mount')    { runQuery(q) }
    else if (q.trigger === 'interval') {
      runQuery(q)
      _intervals.push(setInterval(() => runQuery(q), q.interval))
    }
  }
}

// ── HTTP helper ──────────────────────────────────────────────────
async function http(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res  = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// ── Toast notifications ──────────────────────────────────────────
function toast(msg, type) {
  const t = document.createElement('div')
  t.textContent = msg
  t.style.cssText = `
    position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
    padding:.75rem 1.25rem;border-radius:.625rem;font-size:.8125rem;font-weight:600;
    font-family:-apple-system,'Segoe UI',system-ui,sans-serif;
    box-shadow:0 8px 24px rgba(0,0,0,.3);
    transition:opacity .3s;
    background:${type === 'ok' ? '#22c55e' : type === 'err' ? '#ef4444' : '#334155'};
    color:#fff;
  `
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300) }, 2500)
}

// ── Confirm modal ────────────────────────────────────────────────
function confirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)'
    const box = document.createElement('div')
    box.style.cssText = 'background:#0f172a;border:1px solid #1e293b;border-radius:1rem;padding:2rem;max-width:320px;width:90%;text-align:center;font-family:-apple-system,system-ui,sans-serif'
    box.innerHTML = `
      <p style="color:#f1f5f9;font-size:.9375rem;margin-bottom:1.5rem;line-height:1.6">${msg}</p>
      <div style="display:flex;gap:.75rem;justify-content:center">
        <button id="fx-cancel" style="flex:1;padding:.75rem;border:1px solid #1e293b;background:transparent;color:#94a3b8;border-radius:.5rem;cursor:pointer;font-size:.875rem">Cancel</button>
        <button id="fx-confirm" style="flex:1;padding:.75rem;border:none;background:#ef4444;color:#fff;border-radius:.5rem;cursor:pointer;font-size:.875rem;font-weight:700">Delete</button>
      </div>
    `
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    box.querySelector('#fx-cancel').onclick  = () => { overlay.remove(); resolve(false) }
    box.querySelector('#fx-confirm').onclick = () => { overlay.remove(); resolve(true) }
  })
}

// ── Edit modal ───────────────────────────────────────────────────
function editModal(row, cols, path, method, stateKey) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)'
    const box = document.createElement('div')
    box.style.cssText = 'background:#0f172a;border:1px solid #1e293b;border-radius:1rem;padding:2rem;max-width:400px;width:90%;font-family:-apple-system,system-ui,sans-serif'

    const fields = cols.map(col => `
      <div style="margin-bottom:1rem">
        <label style="display:block;font-size:.8rem;color:#94a3b8;font-weight:600;margin-bottom:.4rem">${col.label}</label>
        <input name="${col.key}" value="${row[col.key] || ''}"
          style="width:100%;padding:.75rem 1rem;background:#020617;border:1px solid #1e293b;color:#f1f5f9;border-radius:.5rem;font-size:.875rem;outline:none;box-sizing:border-box">
      </div>
    `).join('')

    box.innerHTML = `
      <h3 style="color:#f1f5f9;font-size:1rem;font-weight:700;margin-bottom:1.5rem">Edit record</h3>
      ${fields}
      <div id="fx-edit-msg" style="font-size:.8rem;min-height:1.25rem;margin-bottom:.75rem;text-align:center"></div>
      <div style="display:flex;gap:.75rem">
        <button id="fx-edit-cancel" style="flex:1;padding:.75rem;border:1px solid #1e293b;background:transparent;color:#94a3b8;border-radius:.5rem;cursor:pointer;font-size:.875rem">Cancel</button>
        <button id="fx-edit-save" style="flex:1;padding:.75rem;border:none;background:#2563eb;color:#fff;border-radius:.5rem;cursor:pointer;font-size:.875rem;font-weight:700">Save</button>
      </div>
    `
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    box.querySelector('#fx-edit-cancel').onclick = () => { overlay.remove(); resolve(null) }
    box.querySelector('#fx-edit-save').onclick = async () => {
      const btn = box.querySelector('#fx-edit-save')
      const msg = box.querySelector('#fx-edit-msg')
      btn.disabled = true; btn.textContent = 'Saving...'
      const body = {}
      box.querySelectorAll('input').forEach(inp => body[inp.name] = inp.value)
      const { ok, data } = await http(method, resolvePath(path, row), body)
      if (ok) {
        overlay.remove()
        resolve(data)
        toast('Saved', 'ok')
      } else {
        msg.style.color = '#f87171'
        msg.textContent = data.message || data.error || 'Error saving'
        btn.disabled = false; btn.textContent = 'Save'
      }
    }
  })
}

// ── Hydrate tables with CRUD ─────────────────────────────────────
function hydrateTables() {
  document.querySelectorAll('[data-fx-table]').forEach(tbl => {
    const binding   = tbl.getAttribute('data-fx-table')
    const colsJSON  = tbl.getAttribute('data-fx-cols')
    const editPath  = tbl.getAttribute('data-fx-edit')    // e.g. /api/users/{id}
    const editMethod= tbl.getAttribute('data-fx-edit-method') || 'PUT'
    const delPath   = tbl.getAttribute('data-fx-delete')  // e.g. /api/users/{id}
    const delKey    = tbl.getAttribute('data-fx-delete-key') || 'id'

    const cols  = colsJSON ? JSON.parse(colsJSON) : []
    const tbody = tbl.querySelector('tbody')
    if (!tbody) return

    // Add action column headers if needed
    if ((editPath || delPath) && tbl.querySelector('thead tr')) {
      const thead = tbl.querySelector('thead tr')
      if (!thead.querySelector('.fx-th-actions')) {
        const th = document.createElement('th')
        th.className = 'fx-th fx-th-actions'
        th.textContent = 'Actions'
        thead.appendChild(th)
      }
    }

    const render = () => {
      const key  = binding.startsWith('@') ? binding.slice(1) : binding
      let rows   = get(key)
      if (!Array.isArray(rows)) rows = []
      tbody.innerHTML = ''

      if (!rows.length) {
        const tr = document.createElement('tr')
        const td = document.createElement('td')
        td.colSpan = cols.length + (editPath || delPath ? 1 : 0)
        td.className = 'fx-td-empty'
        td.textContent = tbl.getAttribute('data-fx-empty') || 'No data.'
        tr.appendChild(td); tbody.appendChild(tr)
        return
      }

      rows.forEach((row, idx) => {
        const tr = document.createElement('tr')
        tr.className = 'fx-tr'

        // Data cells
        for (const col of cols) {
          const td = document.createElement('td')
          td.className = 'fx-td'
          td.textContent = row[col.key] != null ? row[col.key] : ''
          tr.appendChild(td)
        }

        // Action cell
        if (editPath || delPath) {
          const td = document.createElement('td')
          td.className = 'fx-td fx-td-actions'
          td.style.cssText = 'white-space:nowrap'

          if (editPath) {
            const btn = document.createElement('button')
            btn.className = 'fx-action-btn fx-edit-btn'
            btn.textContent = '✎ Edit'
            btn.onclick = async () => {
              const updated = await editModal(row, cols, editPath, editMethod, binding.slice(1))
              if (!updated) return
              const key = binding.slice(1)
              const arr = [...(get(key) || [])]
              arr[idx] = { ...row, ...updated }
              set(key, arr)
            }
            td.appendChild(btn)
          }

          if (delPath) {
            const btn = document.createElement('button')
            btn.className = 'fx-action-btn fx-delete-btn'
            btn.textContent = '✕ Delete'
            btn.onclick = async () => {
              const ok = await confirm('Delete this record? This cannot be undone.')
              if (!ok) return
              const path = resolvePath(delPath, row)
              const { ok: success, data } = await http('DELETE', path, null)
              if (success) {
                const key = binding.slice(1)
                set(key, (get(key) || []).filter((_, i) => i !== idx))
                toast('Deleted', 'ok')
              } else {
                toast(data.message || 'Error deleting', 'err')
              }
            }
            td.appendChild(btn)
          }

          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      })
    }

    const stateKey = binding.startsWith('@') ? binding.slice(1) : binding
    watch(stateKey, render)
    render()
  })
}

// ── Hydrate lists ────────────────────────────────────────────────
function hydrateLists() {
  document.querySelectorAll('[data-fx-list]').forEach(wrap => {
    const binding  = wrap.getAttribute('data-fx-list')
    const colsJSON = wrap.getAttribute('data-fx-cols')
    const cols     = colsJSON ? JSON.parse(colsJSON) : []

    const render = () => {
      let items = get(binding.startsWith('@') ? binding.slice(1) : binding)
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

    watch(binding.slice(1), render)
    render()
  })
}

// ── Hydrate forms ─────────────────────────────────────────────────
function hydrateForms() {
  document.querySelectorAll('[data-fx-form]').forEach(form => {
    const path   = form.getAttribute('data-fx-form')
    const method = form.getAttribute('data-fx-method') || 'POST'
    const action = form.getAttribute('data-fx-action') || ''
    const msg    = form.querySelector('.fx-form-msg')
    const btn    = form.querySelector('button[type="submit"]')

    form.addEventListener('submit', async e => {
      e.preventDefault()
      if (btn) { btn.disabled = true; btn.textContent = 'Loading...' }
      if (msg) { msg.className = 'fx-form-msg'; msg.textContent = '' }

      const body = {}
      for (const inp of form.querySelectorAll('input,select,textarea')) {
        if (inp.name) body[inp.name] = inp.value
      }

      const { ok, data } = await http(method, resolve(path), body)
      if (ok) {
        if (action) applyAction(data, null, action)
        if (msg) { msg.className = 'fx-form-msg fx-form-ok'; msg.textContent = 'Done!' }
        toast('Saved successfully', 'ok')
        form.reset()
      } else {
        const errMsg = data.message || data.error || 'Error. Try again.'
        if (msg) { msg.className = 'fx-form-msg fx-form-err'; msg.textContent = errMsg }
        toast(errMsg, 'err')
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Submit' }
    })
  })
}

// ── Hydrate btns ──────────────────────────────────────────────────
// <button data-fx-btn="/api/path" data-fx-method="POST" data-fx-action="...">
function hydrateBtns() {
  document.querySelectorAll('[data-fx-btn]').forEach(btn => {
    const path   = btn.getAttribute('data-fx-btn')
    const method = btn.getAttribute('data-fx-method') || 'POST'
    const action = btn.getAttribute('data-fx-action') || ''
    const confirm_msg = btn.getAttribute('data-fx-confirm')
    const origText = btn.textContent

    btn.addEventListener('click', async () => {
      if (confirm_msg) {
        const ok = await confirm(confirm_msg)
        if (!ok) return
      }
      btn.disabled = true; btn.textContent = 'Loading...'
      const { ok, data } = await http(method, resolve(path), null)
      if (ok) {
        if (action) applyAction(data, null, action)
        toast('Done', 'ok')
      } else {
        toast(data.message || data.error || 'Error', 'err')
      }
      btn.disabled = false; btn.textContent = origText
    })
  })
}

// ── Hydrate select dropdowns ──────────────────────────────────────
// <select data-fx-model="@filter"> sets @filter on change
function hydrateSelects() {
  document.querySelectorAll('[data-fx-model]').forEach(sel => {
    const binding = sel.getAttribute('data-fx-model')
    const key     = binding.replace(/^[@$]/, '')
    sel.value     = get(key) || ''
    sel.addEventListener('change', () => set(key, sel.value))
    watch(key, v => { if (sel.value !== String(v)) sel.value = v })
  })
}

// ── Hydrate text bindings ─────────────────────────────────────────
function hydrateBindings() {
  document.querySelectorAll('[data-fx-bind]').forEach(el => {
    const expr = el.getAttribute('data-fx-bind')
    const keys = (expr.match(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g) || []).map(m => m.slice(1).split('.')[0])
    const update = () => { el.textContent = resolve(expr) }
    for (const key of keys) watch(key, update)
    update()
  })
}

// ── Hydrate conditionals ──────────────────────────────────────────
function hydrateIfs() {
  document.querySelectorAll('[data-fx-if]').forEach(wrap => {
    const cond = wrap.getAttribute('data-fx-if')
    const neg  = cond.startsWith('!')
    const expr = neg ? cond.slice(1) : cond

    const evalCond = () => {
      const path = expr.replace(/^[@$]/, '').split('.')
      let val = get(path[0])
      for (let i = 1; i < path.length; i++) val = val?.[path[i]]
      const t = Array.isArray(val) ? val.length > 0 : !!val
      return neg ? !t : t
    }

    const update = () => { wrap.style.display = evalCond() ? '' : 'none' }
    watch(expr.replace(/^[@$!]/, '').split('.')[0], update)
    update()
  })
}

// ── Inject action column CSS ──────────────────────────────────────
function injectActionCSS() {
  const style = document.createElement('style')
  style.textContent = `
    .fx-td-actions { padding: .5rem 1rem !important; }
    .fx-action-btn {
      border: none; cursor: pointer; font-size: .75rem; font-weight: 600;
      padding: .3rem .75rem; border-radius: .375rem; margin-right: .375rem;
      font-family: inherit; transition: opacity .15s, transform .1s;
    }
    .fx-action-btn:hover { opacity: .85; transform: translateY(-1px); }
    .fx-action-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }
    .fx-edit-btn   { background: #1e40af; color: #93c5fd; }
    .fx-delete-btn { background: #7f1d1d; color: #fca5a5; }
    .fx-th-actions { color: #475569 !important; }
  `
  document.head.appendChild(style)
}

// ── Boot ──────────────────────────────────────────────────────────
function boot() {
  injectActionCSS()
  hydrateBindings()
  hydrateTables()
  hydrateLists()
  hydrateForms()
  hydrateBtns()
  hydrateSelects()
  hydrateIfs()
  mountQueries()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

})()
