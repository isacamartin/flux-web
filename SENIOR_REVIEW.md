# Senior Review — aiplang v2.4.1

Avaliação técnica por alguém que já construiu linguagens, runtimes e frameworks de produção.
Contexto: projeto AI-first, zero uso humano direto do código.

---

## 🔴 CRÍTICO — Segurança e dados

### 1. SQL Injection em `opts.order`
```js
// server.js:138 — DIRETO NA QUERY SEM SANITIZAR
sql += ` ORDER BY ${opts.order}`
```
**Problema:** `User.all(order=created_at desc)` — `opts.order` vem do `.aip` parseado.
Se Claude gerar `order=id; DROP TABLE users--` por engano, funciona.
**Fix:**
```js
const SAFE_ORDER = /^[a-zA-Z_][a-zA-Z0-9_]*(\s+(asc|desc))?$/i
if (opts.order && SAFE_ORDER.test(opts.order)) sql += ` ORDER BY ${opts.order}`
```

### 2. SQL Injection em `findBy(field, value)`
```js
// server.js:151 — field vai direto na query
`WHERE ${field} = ?`
```
`field` vem do código `.aip` (interno, não de input do usuário), mas ainda assim precisa validação de coluna.

### 3. Sem rate limit nos endpoints de auth
`/api/auth/login` e `/api/auth/register` sem throttle por padrão.
Brute force em senhas é trivial. O `~use rate-limit` existe mas é global, não por endpoint.
**Fix:** rate limit automático em `/api/auth/*` — 10 req/min por IP.

### 4. JWT sem refresh token
Token de 7 dias expira e o usuário cai fora sem aviso. Sem mecanismo de renovação.
**Fix:** `~auth jwt expire=7d refresh=30d` → POST /api/auth/refresh

### 5. bcrypt cost 12 — ok em dev, lento em prod
```js
bcrypt.hash(ctx.body[f], 12)
```
Cost 12 = ~250ms por hash. Aceitável. Deixa assim.

---

## 🟠 PERFORMANCE — Problemas reais

### 6. `persistDB()` chamado em TODA escrita
```js
function dbRun(sql, params = []) { _db.run(sql, params); persistDB() }
// persistDB() → fs.writeFileSync(DB_FILE, Buffer.from(_db.export()))
```
**Problema:** Cada INSERT/UPDATE exporta o banco inteiro para disco.
Com 10k registros = ~50ms de I/O bloqueante por query.
**Fix:** Write-ahead com debounce:
```js
let _dirty = false, _persistTimer = null
function dbRun(sql, params = []) {
  _db.run(sql, params)
  _dirty = true
  if (!_persistTimer) _persistTimer = setTimeout(() => {
    if (_dirty) { persistDB(); _dirty = false }
    _persistTimer = null
  }, 200) // flush a cada 200ms no máximo
}
```

### 7. Sem índices nas tabelas
```js
// migrateModels() — CREATE TABLE sem CREATE INDEX
```
`User.findBy(email=...)` → full table scan.
Com 100k usuários, login demora 800ms.
**Fix:** Auto-criar índice em campos com `unique` e `~index`:
```js
if (f.modifiers.includes('unique') || f.modifiers.includes('index')) {
  dbRun(`CREATE INDEX IF NOT EXISTS idx_${table}_${colName} ON ${table}(${colName})`)
}
```

### 8. Server single-threaded sem cluster
Node.js single process. CPU-bound = trava tudo.
**Fix simples:** No `startServer`, detect `cluster` mode via env:
```js
// PORT=3000 WORKERS=4 aiplang start app.aip
```

### 9. Sem compressão por padrão
Respostas JSON sem gzip. `~use compression` existe mas é opt-in.
**Fix:** Ativar gzip automático no AiplangServer.handle() para respostas > 1KB.

---

## 🟡 ARQUITETURA — Design issues

### 10. Estado global compartilhado (big one)
```js
// server.js — tudo global
let _db = null        // ← singleton global
let JWT_SECRET = ...  // ← global mutável
let STRIPE = null     // ← global
let S3_CLIENT = null  // ← global
const QUEUE = []      // ← global
```
**Problema:** Impossível rodar 2 apps no mesmo processo. Sem isolamento.
**Fix:** Encapsular tudo num `AiplangApp` class:
```js
class AiplangApp {
  constructor() {
    this.db = null; this.jwtSecret = null
    this.stripe = null; this.s3 = null; this.queue = []
  }
}
```

### 11. `__DONE__` como sentinel value
```js
if (result === '__DONE__') return  // hack
```
Usar exceção ou flag no ctx:
```js
ctx._done = true
if (ctx._done) return
```

### 12. Parser sem AST real — tudo string matching
```js
if (line.startsWith('insert ')) { ... }
if (line.startsWith('update ')) { ... }
```
Frágil. `insert` no meio de um comentário pode triggerar.
**Fix:** Tokenizer → AST → interpreter. Mais robusto para erros e extensível.
Não é prioridade agora (AI gera o código), mas vai ser necessário em v3.

### 13. Sem validação de schema em runtime
Model define `email : text : required unique`, mas se alguém passar `{email: ["array"]}`, o banco recebe um `[object Array]` como string.
**Fix:** Coerção de tipo automática antes do INSERT.

---

## 🟢 O QUE ESTÁ BEM

- **Parameterized queries em tudo exceto `order`** — INSERT/UPDATE/DELETE corretos
- **bcrypt cost 12** — seguro
- **CORS headers** — corretos
- **Soft deletes com `deleted_at IS NULL`** — implementação certa
- **JWT com claims mínimos** — id, email, role — não vaza dados
- **Multipart puro Node.js** — sem dependência, bom
- **Mock mode para S3/Stripe** — DX excelente
- **Plugin system** — design correto, extensível
- **19.6KB de hydrate** — impressionante para o que faz

---

## Prioridade de execução

| # | Fix | Impacto | Esforço |
|---|-----|---------|---------|
| 6 | persistDB debounce | Alto | 15min |
| 7 | Auto-index em unique | Alto | 20min |
| 1 | Sanitize opts.order | Crítico | 10min |
| 3 | Rate limit auth | Crítico | 20min |
| 4 | JWT refresh token | Médio | 1h |
| 10 | Encapsular estado global | Alto | 2h |
| 9 | Gzip por padrão | Médio | 30min |
| 12 | AST parser real | Baixo (AI gera) | Grande |
