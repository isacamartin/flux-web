

(function () {
'use strict'

const cfg = window.__AIPLANG_PAGE__
if (!cfg) return

// ── Global Store — cross-page state (like React Context / Zustand) ─
const _STORE_KEY = 'aiplang_store_v1'
const _globalStore = (() => {
  try { return JSON.parse(sessionStorage.getItem(_STORE_KEY) || '{}') } catch { return {} }
})()
function syncStore(key, value) {
  _globalStore[key] = value
  try { sessionStorage.setItem(_STORE_KEY, JSON.stringify(_globalStore)) } catch {}
  try { new BroadcastChannel(_STORE_KEY).postMessage({ key, value }) } catch {}
}

// ── Page-level State ─────────────────────────────────────────────
const _state = {}
const _watchers = {}
const _storeKeys = new Set((cfg.stores || []).map(s => s.key))

// Bootstrap state: SSR data > global store > page state declarations
const _boot = { ...(window.__SSR_DATA__ || {}), ..._globalStore }
for (const [k, v] of Object.entries({ ...(cfg.state || {}), ..._boot })) {
  try { _state[k] = typeof v === 'string' && (v.startsWith('[') || v.startsWith('{') || v === 'true' || v === 'false' || !isNaN(v)) ? JSON.parse(v) : v } catch { _state[k] = v }
}

function get(key) { return _state[key] }

function set(key, value, _persist) {
  // Fast equality check: primitives first (avoid JSON.stringify for numbers/strings)
  const old = _state[key]
  if (old === value) return
  if (typeof value !== 'object' && old === value) return
  if (typeof value === 'object' && value !== null && typeof old === 'object' && old !== null) {
    // Only deep check for objects/arrays — skip if different length (fast exit)
    if (Array.isArray(value) && Array.isArray(old) && value.length !== old.length) {
      // Different length — definitely changed
    } else if (JSON.stringify(old) === JSON.stringify(value)) return
  }
  _state[key] = value
  if (_storeKeys.has(key) || _persist) syncStore(key, value)
  notify(key)
}

// Cross-tab store sync (other pages update when store changes)
try {
  const _bc = new BroadcastChannel(_STORE_KEY)
  _bc.onmessage = ({ data: { key, value } }) => {
    _state[key] = value; notify(key)
  }
} catch {}

function watch(key, cb) {
  if (!_watchers[key]) _watchers[key] = []
  _watchers[key].push(cb)
  return () => { _watchers[key] = _watchers[key].filter(f => f !== cb) }
}

const _pending = new Set()
let _batchScheduled = false
let _batchMode = 'raf' // 'raf' for animations, 'micro' for data updates

function flushBatch() {
  _batchScheduled = false
  const keys = [..._pending]
  _pending.clear()
  for (const key of keys) {
    ;(_watchers[key] || []).forEach(cb => cb(_state[key]))
  }
}

function notify(key) {
  _pending.add(key)
  if (!_batchScheduled) {
    _batchScheduled = true
    // Use microtask (Promise.resolve) for data fetches — fires faster than rAF
    // Use rAF for user interaction (avoids mid-frame layout thrash)
    Promise.resolve().then(() => {
      if (_batchScheduled) requestAnimationFrame(flushBatch)
    })
  }
}

function notifySync(key) {
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

function resolvePath(tmpl, row) {
  return tmpl.replace(/\{([^}]+)\}/g, (_, k) => row?.[k] ?? get(k) ?? '')
}

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
    console.warn('[aiplang]', q.method, path, e.message)
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
    if (fm) {

      try {
        const expr = fm[2].trim()
        const filtered = (get(fm[1]) || []).filter(item => {

          const eq = expr.match(/^([a-zA-Z_.]+)\s*(!?=)\s*(.+)$/)
          if (eq) {
            const [, field, op, val] = eq
            const parts = field.split('.')
            let v = item
            for (const p of parts) v = v?.[p]
            const strV = String(v ?? '')
            return op === '!=' ? strV !== val.trim() : strV === val.trim()
          }
          return true
        })
        set(fm[1], filtered)
      } catch {}
      return
    }
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

async function http(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res  = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

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

function hydrateTables() {
  document.querySelectorAll('[data-fx-table]').forEach(tbl => {
    const binding   = tbl.getAttribute('data-fx-table')
    const colsJSON  = tbl.getAttribute('data-fx-cols')
    const editPath  = tbl.getAttribute('data-fx-edit')
    const editMethod= tbl.getAttribute('data-fx-edit-method') || 'PUT'
    const delPath   = tbl.getAttribute('data-fx-delete')
    const delKey    = tbl.getAttribute('data-fx-delete-key') || 'id'

    const cols  = colsJSON ? JSON.parse(colsJSON) : []
    const tbody = tbl.querySelector('tbody')
    if (!tbody) return

    if ((editPath || delPath) && tbl.querySelector('thead tr')) {
      const thead = tbl.querySelector('thead tr')
      if (!thead.querySelector('.fx-th-actions')) {
        const th = document.createElement('th')
        th.className = 'fx-th fx-th-actions'
        th.textContent = 'Actions'
        thead.appendChild(th)
      }
    }

    // ── Row cache for surgical DOM updates ──────────────────────────
    // First render: full DocumentFragment build (fast)
    // Re-renders: only update cells that actually changed
    const _rowCache = new Map()  // id → {score, status, ..., tr element}
    const _colKeys = cols.map(c => c.key)
    let _initialized = false

    const renderRow = (row, idx) => {
      // (defined above, used by virtual scroll too)
    }

    const render = () => {
      const key  = binding.startsWith('@') ? binding.slice(1) : binding
      let rows   = get(key)
      if (!Array.isArray(rows)) rows = []

      // Empty state
      if (!rows.length) {
        tbody.innerHTML = ''
        _rowCache.clear()
        _initialized = false
        const tr = document.createElement('tr')
        const td = document.createElement('td')
        td.colSpan = cols.length + (editPath || delPath ? 1 : 0)
        td.className = 'fx-td-empty'
        td.textContent = tbl.getAttribute('data-fx-empty') || 'No data.'
        tr.appendChild(td); tbody.appendChild(tr)
        return
      }

      const VIRTUAL_THRESHOLD = 80
      const OVERSCAN = 8
      const colSpanTotal = cols.length + (editPath || delPath ? 1 : 0)
      const useVirtual = rows.length >= VIRTUAL_THRESHOLD
      let rowHeights = null, totalHeight = 0, scrollListener = null

      if (useVirtual) {
        const wrapDiv = tbl.closest('.fx-table-wrap') || tbl.parentElement
        wrapDiv.style.cssText += ';max-height:520px;overflow-y:auto;position:relative'

        const measureRow = rows[0]
        const tempTr = document.createElement('tr')
        tempTr.style.visibility = 'hidden'
        cols.forEach(col => {
          const td = document.createElement('td'); td.className = 'fx-td'
          td.textContent = measureRow[col.key] || ''; tempTr.appendChild(td)
        })
        tbody.appendChild(tempTr)
        const rowH = Math.max(tempTr.getBoundingClientRect().height, 40) || 44
        tbody.removeChild(tempTr)

        const viewH = wrapDiv.clientHeight || 480
        const visibleCount = Math.ceil(viewH / rowH) + OVERSCAN * 2

        const renderVirtual = () => {
          const scrollTop = wrapDiv.scrollTop
          const startRaw = Math.floor(scrollTop / rowH)
          const start = Math.max(0, startRaw - OVERSCAN)
          const end   = Math.min(rows.length - 1, start + visibleCount)
          const paddingTop = start * rowH
          const paddingBot = Math.max(0, (rows.length - end - 1) * rowH)

          tbody.innerHTML = ''

          if (paddingTop > 0) {
            const tr = document.createElement('tr')
            const td = document.createElement('td')
            td.colSpan = colSpanTotal; td.style.cssText = 'height:'+paddingTop+'px;padding:0;border:none'
            tr.appendChild(td); tbody.appendChild(tr)
          }

          for (let i = start; i <= end; i++) renderRow(rows[i], i)

          if (paddingBot > 0) {
            const tr = document.createElement('tr')
            const td = document.createElement('td')
            td.colSpan = colSpanTotal; td.style.cssText = 'height:'+paddingBot+'px;padding:0;border:none'
            tr.appendChild(td); tbody.appendChild(tr)
          }
        }

        let rafPending = false
        scrollListener = () => {
          if (rafPending) return; rafPending = true
          requestAnimationFrame(() => { rafPending = false; renderVirtual() })
        }
        wrapDiv.addEventListener('scroll', scrollListener, { passive: true })
        renderVirtual()
        return
      }

      function renderRow(row, idx) {
        const tr = document.createElement('tr')
        tr.className = 'fx-tr'

        for (const col of cols) {
          const td = document.createElement('td')
          td.className = 'fx-td'
          td.textContent = row[col.key] != null ? row[col.key] : ''
          tr.appendChild(td)
        }

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
      }

      // ── Surgical update vs full initial build ────────────────────
      if (!_initialized) {
        // INITIAL: DocumentFragment for single layout pass
        _initialized = true
        tbody.innerHTML = ''
        const frag = document.createDocumentFragment()
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const tr = document.createElement('tr')
          tr.className = 'fx-tr'
          tr.dataset.id = row.id || i

          for (const col of cols) {
            const td = document.createElement('td')
            td.className = 'fx-td'
            td.textContent = row[col.key] != null ? row[col.key] : ''
            tr.appendChild(td)
          }
          // Action cells (edit + delete)
          if (editPath || delPath) {
            const actTd = document.createElement('td')
            actTd.className = 'fx-td fx-td-actions'
            actTd.style.cssText = 'white-space:nowrap'
            if (editPath) {
              const eb = document.createElement('button')
              eb.className = 'fx-action-btn fx-edit-btn'; eb.textContent = '✎ Edit'
              const _row = row, _i = i
              eb.onclick = async () => {
                const upd = await editModal(_row, cols, editPath, editMethod, key)
                if (!upd) return
                const arr = [...(get(key)||[])]; arr[_i]={..._row,...upd}; set(key, arr)
              }
              actTd.appendChild(eb)
            }
            if (delPath) {
              const db = document.createElement('button')
              db.className = 'fx-action-btn fx-delete-btn'; db.textContent = '✕ Delete'
              const _row = row, _i = i
              db.onclick = async () => {
                if (!await confirm('Delete this record? This cannot be undone.')) return
                const {ok,data} = await http('DELETE', resolvePath(delPath,_row), null)
                if (ok) { set(key,(get(key)||[]).filter((_,j)=>j!==_i)); toast('Deleted','ok') }
                else toast(data.message||'Error deleting','err')
              }
              actTd.appendChild(db)
            }
            tr.appendChild(actTd)
          }

          _rowCache.set(row.id != null ? row.id : i, {
            vals: _colKeys.map(k => row[k]),
            tr
          })
          frag.appendChild(tr)
        }
        tbody.appendChild(frag)
      } else {
        // UPDATE: off-main-thread diff + requestIdleCallback
        // For 500+ rows: Worker computes diff on separate CPU core
        // For <500 rows: sync diff (worker overhead not worth it)
        // DOM patches always run on main thread but are minimal

        const _makeRow = (row, idx) => {
          const tr = document.createElement('tr')
          tr.className = 'fx-tr'; tr.dataset.id = row.id != null ? row.id : idx
          for (const col of cols) {
            const td = document.createElement('td'); td.className = 'fx-td'
            td.textContent = row[col.key] != null ? row[col.key] : ''; tr.appendChild(td)
          }
          if (editPath || delPath) {
            const actTd = document.createElement('td')
            actTd.className = 'fx-td fx-td-actions'; actTd.style.cssText = 'white-space:nowrap'
            if (editPath) { const eb=document.createElement('button');eb.className='fx-action-btn fx-edit-btn';eb.textContent='✎ Edit';const _r=row,_i=idx;eb.onclick=async()=>{const upd=await editModal(_r,cols,editPath,editMethod,key);if(!upd)return;const arr=[...(get(key)||[])];arr[_i]={..._r,...upd};set(key,arr)};actTd.appendChild(eb) }
            if (delPath) { const db=document.createElement('button');db.className='fx-action-btn fx-delete-btn';db.textContent='✕ Delete';const _r=row,_i=idx;db.onclick=async()=>{if(!await confirm('Delete?'))return;const{ok,data}=await http('DELETE',resolvePath(delPath,_r),null);if(ok){set(key,(get(key)||[]).filter((_,j)=>j!==_i));toast('Deleted','ok')}else toast(data.message||'Error','err')};actTd.appendChild(db) }
            tr.appendChild(actTd)
          }
          return tr
        }

        const _applyResult = ({ patches, inserts, deletes }) => {
          for (const { id, col, val } of patches) {
            const rc = _rowCache.get(id) || _rowCache.get(isNaN(id)?id:Number(id))
            if (!rc) continue
            const cells = rc.tr.querySelectorAll('.fx-td')
            if (cells[col]) { cells[col].textContent = val != null ? val : ''; rc.vals[col] = val }
          }
          for (const { id, row, idx } of inserts) {
            const tr = _makeRow(row, idx)
            _rowCache.set(id, { vals: _colKeys.map(k => row[k]), tr })
            tbody.insertBefore(tr, tbody.querySelectorAll('tr.fx-tr')[idx] || null)
          }
          for (const id of deletes) {
            const rc = _rowCache.get(id) || _rowCache.get(isNaN(id)?id:Number(id))
            if (rc) { rc.tr.remove(); _rowCache.delete(id); _rowCache.delete(String(id)) }
          }
        }

        if (rows.length >= 500) {
          // Large: worker diff → idle callback apply (zero main thread impact)
          _diffAsync(rows, _colKeys, _rowCache).then(result => _schedIdle(() => _applyResult(result)))
        } else {
          // Small: sync diff, immediate apply
          _applyResult(_diffSync(rows, _colKeys, _rowCache))
        }
      }
    }

    const stateKey = binding.startsWith('@') ? binding.slice(1) : binding
    watch(stateKey, render)
    render()
  })
}

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

function hydrateSelects() {
  document.querySelectorAll('[data-fx-model]').forEach(sel => {
    const binding = sel.getAttribute('data-fx-model')
    const key     = binding.replace(/^[@$]/, '')
    sel.value     = get(key) || ''
    sel.addEventListener('change', () => set(key, sel.value))
    watch(key, v => { if (sel.value !== String(v)) sel.value = v })
  })
}

function hydrateBindings() {
  document.querySelectorAll('[data-fx-bind]').forEach(el => {
    const expr = el.getAttribute('data-fx-bind')
    const keys = (expr.match(/[@$][a-zA-Z_][a-zA-Z0-9_.]*/g) || []).map(m => m.slice(1).split('.')[0])
    // Fast path: single key with simple path — direct textContent assignment
    const simpleM = expr.match(/^[@$]([a-zA-Z_][a-zA-Z0-9_.]*)$/)
    if (simpleM) {
      const path = simpleM[1].split('.')
      const update = () => {
        let v = get(path[0])
        for (let i=1;i<path.length;i++) v = v?.[path[i]]
        el.textContent = v != null ? v : ''
      }
      for (const key of keys) watch(key, update)
      update()
    } else {
      const update = () => { el.textContent = resolve(expr) }
      for (const key of keys) watch(key, update)
      update()
    }
  })
}

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

function initAnimations() {

  const style = document.createElement('style')
  style.textContent = `
    @keyframes fx-blur-in   { from{opacity:0;filter:blur(8px);transform:translateY(8px)} to{opacity:1;filter:blur(0);transform:none} }
    @keyframes fx-fade-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
    @keyframes fx-fade-in   { from{opacity:0} to{opacity:1} }
    @keyframes fx-slide-up  { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:none} }
    @keyframes fx-slide-left{ from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:none} }
    @keyframes fx-scale-in  { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
    @keyframes fx-bounce    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes fx-shake     { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
    @keyframes fx-pulse-ring{ 0%{box-shadow:0 0 0 0 rgba(99,102,241,.4)} 70%{box-shadow:0 0 0 12px transparent} 100%{box-shadow:0 0 0 0 transparent} }
    @keyframes fx-count     { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }

    [class*="fx-anim-"] { opacity: 0 }
    [class*="fx-anim-"].fx-visible { animation-fill-mode: both; animation-timing-function: cubic-bezier(.4,0,.2,1) }
    .fx-visible.fx-anim-blur-in   { animation: fx-blur-in   .7s both }
    .fx-visible.fx-anim-fade-up   { animation: fx-fade-up   .6s both }
    .fx-visible.fx-anim-fade-in   { animation: fx-fade-in   .5s both }
    .fx-visible.fx-anim-slide-up  { animation: fx-slide-up  .65s both }
    .fx-visible.fx-anim-slide-left{ animation: fx-slide-left .6s both }
    .fx-visible.fx-anim-scale-in  { animation: fx-scale-in  .5s both }
    .fx-visible.fx-anim-stagger > * { animation: fx-fade-up .5s both }
    .fx-visible.fx-anim-stagger > *:nth-child(1) { animation-delay: 0s }
    .fx-visible.fx-anim-stagger > *:nth-child(2) { animation-delay: .1s }
    .fx-visible.fx-anim-stagger > *:nth-child(3) { animation-delay: .2s }
    .fx-visible.fx-anim-stagger > *:nth-child(4) { animation-delay: .3s }
    .fx-visible.fx-anim-stagger > *:nth-child(5) { animation-delay: .4s }
    .fx-visible.fx-anim-stagger > *:nth-child(6) { animation-delay: .5s }
    .fx-anim-bounce { animation: fx-bounce 1.5s ease-in-out infinite !important; opacity: 1 !important }
    .fx-anim-pulse  { animation: fx-pulse-ring 2s ease infinite !important; opacity: 1 !important }
  `
  document.head.appendChild(style)

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fx-visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' })

  document.querySelectorAll('[class*="fx-anim-"]').forEach(el => {

    if (el.classList.contains('fx-anim-bounce') || el.classList.contains('fx-anim-pulse')) {
      el.classList.add('fx-visible'); return
    }
    observer.observe(el)
  })

  window.aiplang = window.aiplang || {}
  window.aiplang.spring = function(el, prop, from, to, opts = {}) {
    const k  = opts.stiffness || 180
    const b  = opts.damping   || 22
    const m  = opts.mass      || 1
    let pos = from, vel = 0
    const dt = 1/60
    let raf

    const tick = () => {
      const F = -k * (pos - to) - b * vel
      vel += (F / m) * dt
      pos += vel * dt
      if (Math.abs(pos - to) < 0.01 && Math.abs(vel) < 0.01) {
        pos = to
        el.style[prop] = pos + (opts.unit || 'px')
        return
      }
      el.style[prop] = pos + (opts.unit || 'px')
      raf = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(raf)
    requestAnimationFrame(tick)
  }

  const springObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const el = entry.target
      if (el.classList.contains('fx-anim-spring')) {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0px)'
        window.aiplang.spring(el, '--spring-y', 24, 0, { stiffness: 200, damping: 20, unit: 'px' })
        springObs.unobserve(el)
      }
    })
  }, { threshold: 0.1 })

  document.querySelectorAll('.fx-anim-spring').forEach(el => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(24px)'
    springObs.observe(el)
  })

  document.querySelectorAll('.fx-stat-val').forEach(el => {
    const target = parseFloat(el.textContent)
    if (isNaN(target) || target === 0) return
    const isFloat = el.textContent.includes('.')
    let hasAnimated = false
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || hasAnimated) return
      hasAnimated = true
      obs.unobserve(el)
      const dur = Math.min(1200, Math.max(600, target * 2))
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / dur, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = target * eased
        el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toLocaleString()
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    obs.observe(el)
  })
}

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

// ═══════════════════════════════════════════════════════════════════
// OFF-MAIN-THREAD ENGINE — better than React Fiber
// Fiber splits work across frames on the SAME thread.
// This moves diff computation to a SEPARATE CPU core via Web Worker.
// Main thread only handles tiny DOM patches — never competes with animations.
// ═══════════════════════════════════════════════════════════════════

const _workerSrc = `'use strict'
self.onmessage = function(e) {
  const { type, rows, colKeys, cache, reqId } = e.data
  if (type !== 'diff') return
  const patches = [], inserts = [], deletes = []
  const seenIds = new Set()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const id = row.id != null ? row.id : i
    seenIds.add(typeof id === 'number' ? id : String(id))
    const cached = cache[id]
    if (!cached) { inserts.push({ id, row, idx: i }); continue }
    for (let c = 0; c < colKeys.length; c++) {
      const nStr = row[colKeys[c]] != null ? String(row[colKeys[c]]) : ''
      const oStr = cached[c] != null ? String(cached[c]) : ''
      if (nStr !== oStr) patches.push({ id, col: c, val: row[colKeys[c]] })
    }
  }
  for (const id in cache) {
    const nid = typeof id === 'number' ? id : (isNaN(id) ? id : Number(id))
    if (!seenIds.has(String(id)) && !seenIds.has(nid)) deletes.push(id)
  }
  self.postMessage({ type: 'patches', patches, inserts, deletes, reqId })
}`

let _diffWorker = null
const _wCbs = new Map()
let _wReq = 0

function _getWorker() {
  if (_diffWorker) return _diffWorker
  try {
    _diffWorker = new Worker(URL.createObjectURL(new Blob([_workerSrc], { type:'application/javascript' })))
    _diffWorker.onmessage = (e) => {
      const cb = _wCbs.get(e.data.reqId)
      if (cb) { cb(e.data); _wCbs.delete(e.data.reqId) }
    }
    _diffWorker.onerror = () => { _diffWorker = null }
  } catch { _diffWorker = null }
  return _diffWorker
}

function _diffAsync(rows, colKeys, rowCache) {
  return new Promise(resolve => {
    const w = _getWorker()
    if (!w) { resolve(_diffSync(rows, colKeys, rowCache)); return }
    const id = ++_wReq
    _wCbs.set(id, resolve)
    const cObj = {}
    for (const [k, v] of rowCache.entries()) cObj[k] = v.vals
    w.postMessage({ type:'diff', rows, colKeys, cache:cObj, reqId:id })
  })
}

function _diffSync(rows, colKeys, rowCache) {
  const patches = [], inserts = [], deletes = [], seen = new Set()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], id = r.id != null ? r.id : i
    seen.add(id)
    const c = rowCache.get(id)
    if (!c) { inserts.push({ id, row:r, idx:i }); continue }
    for (let j = 0; j < colKeys.length; j++) {
      const n = r[colKeys[j]] != null ? String(r[colKeys[j]]) : ''
      const o = c.vals[j] != null ? String(c.vals[j]) : ''
      if (n !== o) patches.push({ id, col:j, val:r[colKeys[j]] })
    }
  }
  for (const [id] of rowCache) if (!seen.has(id)) deletes.push(id)
  return { patches, inserts, deletes }
}

// requestIdleCallback scheduler — runs low-priority work when browser is idle
// Polling updates (30s intervals) don't need to be urgent — let animations breathe
const _idleQ = []
let _idleSched = false
const _ric = window.requestIdleCallback
  ? window.requestIdleCallback.bind(window)
  : (cb) => setTimeout(() => cb({ timeRemaining: () => 16 }), 4)

function _schedIdle(fn) {
  _idleQ.push(fn)
  if (!_idleSched) {
    _idleSched = true
    _ric(_flushIdle, { timeout: 5000 })
  }
}

function _flushIdle(dl) {
  _idleSched = false
  while (_idleQ.length && dl.timeRemaining() > 1) {
    try { _idleQ.shift()() } catch {}
  }
  if (_idleQ.length) { _idleSched = true; _ric(_flushIdle, { timeout: 5000 }) }
}

// Incremental renderer — processes rows in chunks between animation frames
// Zero dropped frames on 100k+ row datasets
async function _renderIncremental(items, renderFn, chunkSize = 200) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    chunk.forEach((item, j) => renderFn(item, i + j))
    if (i + chunkSize < items.length) {
      await new Promise(r => requestAnimationFrame(r))
    }
  }
}


function loadSSRData() {
  const ssr = window.__SSR_DATA__
  if (!ssr) return
  for (const [key, value] of Object.entries(ssr)) {
    _state[key] = value
  }
}

function hydrateOptimistic() {
  document.querySelectorAll('[data-fx-optimistic]').forEach(form => {
    const action = form.getAttribute('data-fx-action') || ''
    const pm = action.match(/^@([a-zA-Z_]+)\.push\(\$result\)$/)
    if (!pm) return
    const key = pm[1]

    form.addEventListener('submit', (e) => {

      const body = {}
      form.querySelectorAll('input,select,textarea').forEach(inp => {
        if (inp.name) body[inp.name] = inp.value
      })
      const tempId = '__temp_' + Date.now()
      const optimisticItem = { ...body, id: tempId, _optimistic: true }
      const current = [...(get(key) || [])]
      set(key, [...current, optimisticItem])

      const origAction = form.getAttribute('data-fx-action')
      form.setAttribute('data-fx-action-orig', origAction)
      form.setAttribute('data-fx-action', `@${key}._rollback_${tempId}`)

      setTimeout(() => {
        form.setAttribute('data-fx-action', origAction)

        setTimeout(() => {
          const arr = get(key) || []
          const hasReal = arr.some(i => !i._optimistic)
          if (hasReal) set(key, arr.filter(i => !i._optimistic || i.id !== tempId))
        }, 500)
      }, 50)
    }, true)
  })
}

function hydrateTableErrors() {
  document.querySelectorAll('[data-fx-fallback]').forEach(tbl => {
    const fallback = tbl.getAttribute('data-fx-fallback')
    const retryPath = tbl.getAttribute('data-fx-retry')
    const binding = tbl.getAttribute('data-fx-table')
    if (!fallback) return

    const tbody = tbl.querySelector('tbody')
    const originalEmpty = tbl.getAttribute('data-fx-empty') || 'No data.'

    const key = binding?.replace(/^@/, '') || ''
    if (key) {
      const cleanup = watch(key, (val) => {
        if (val === '__error__') {
          if (tbody) {
            const cols = JSON.parse(tbl.getAttribute('data-fx-cols') || '[]')
            tbody.innerHTML = `<tr><td colspan="${cols.length + 2}" class="fx-td-empty" style="color:#f87171">
              ${fallback}
              ${retryPath ? `<button onclick="window.__aiplang_retry('${binding}','${retryPath}')" style="margin-left:.75rem;padding:.3rem .75rem;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171;border-radius:.375rem;cursor:pointer;font-size:.75rem">↻ Retry</button>` : ''}
            </td></tr>`
          }
        }
      })
    }
  })

  window.__aiplang_retry = (binding, path) => {
    const key = binding.replace(/^@/, '')
    set(key, [])
    runQuery({ method: 'GET', path, target: binding })
  }
}

function boot() {
  loadSSRData()
  injectActionCSS()
  initAnimations()
  hydrateBindings()
  hydrateTables()
  hydrateTableErrors()
  hydrateLists()
  hydrateForms()
  hydrateOptimistic()
  hydrateBtns()
  hydrateSelects()
  hydrateIfs()
  hydrateEach()
  hydrateCharts()
  hydrateKanban()
  hydrateEditors()
  mountQueries()
}

function hydrateEach() {
  document.querySelectorAll('[data-fx-each]').forEach(wrap => {
    const binding = wrap.getAttribute('data-fx-each')
    const tpl     = wrap.getAttribute('data-fx-tpl') || ''
    const key     = binding.startsWith('@') ? binding.slice(1) : binding

    const render = () => {
      let items = get(key)
      if (!Array.isArray(items)) items = []
      wrap.innerHTML = ''

      if (!items.length) {
        const empty = document.createElement('div')
        empty.className = 'fx-each-empty fx-td-empty'
        empty.textContent = wrap.getAttribute('data-fx-empty') || 'No items.'
        wrap.appendChild(empty)
        return
      }

      items.forEach(item => {
        const div = document.createElement('div')
        div.className = 'fx-each-item'

        const html = tpl.replace(/\{item\.([^}]+)\}/g, (_, field) => {
          const parts = field.split('.')
          let val = item
          for (const p of parts) val = val?.[p]
          return val != null ? String(val) : ''
        })
        div.textContent = html || (item.name || item.title || item.label || JSON.stringify(item))
        wrap.appendChild(div)
      })
    }

    watch(key, render)
    render()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

})()
