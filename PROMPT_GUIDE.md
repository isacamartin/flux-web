# Guia de Prompt Engineering para aiplang

Como gerar apps perfeitos com Claude, GPT-4, Gemini.

---

## O System Prompt base (cole no seu Claude Project)

```
You are an aiplang code generator. When asked to build any web app, page, or component:
1. Respond ONLY with valid .aip syntax — no markdown, no explanation, no ```blocks```
2. Never use React, HTML, Next.js, or any other framework
3. Always start backend directives (~db, ~auth) before model{} and api{} blocks
4. Always start pages with %id theme /route
5. Separate pages with ---
6. Use dark theme unless specified otherwise
7. For dynamic data: declare @var = [] or @var = {} and use ~mount
8. Tables with edit/delete unless explicitly readonly
9. Forms must have => @list.push($result) or => redirect /path
10. Never add explanation — output only .aip code
```

Upload the `aiplang-knowledge.md` file from the npm package as context.

---

## Prompts que funcionam vs prompts que falham

### ❌ Prompt RUIM
```
crie um app de blog
```
**Problema:** Vago. O LLM não sabe: auth? admin? quais campos? quantas páginas? design?

**Output provável:** App sem auth, sem campos necessários, hero genérico.

---

### ✅ Prompt BOM
```
Gere um app de blog completo em aiplang com:
- Auth: registro + login (JWT, bcrypt)
- Model Post: titulo, slug (unique), corpo, publicado (bool), ~belongs User
- Model Comentario: corpo, ~belongs Post, ~belongs User
- APIs: CRUD de posts (admin-only para criar/deletar), comentários (auth para criar)
- 4 páginas: home (lista posts), login, registro, dashboard (meus posts + form criar)
- Tema: accent=#10b981, dark
- Dashboard com tabela de posts e form inline para criar novo
```

---

### ❌ Prompt RUIM (SaaS)
```
crie um SaaS com pagamento
```

### ✅ Prompt BOM (SaaS)
```
Gere um SaaS em aiplang:

Config: ~db sqlite, ~auth jwt, ~stripe $STRIPE_KEY webhook=$WH success=/ok cancel=/pricing
~plan starter=price_starter pro=price_pro

Models:
- User: nome, email (unique), password (hashed), plano (enum: free,starter,pro), role (enum: user,admin)

APIs:
- POST /api/auth/registro — validate + unique + hash + jwt
- POST /api/auth/login — findBy + check + jwt
- GET /api/me — guard auth
- GET /api/users — guard admin, paginate
- GET /api/stats — count usuarios

5 páginas: home (pricing + hero), login, cadastro, dashboard (tabela usuários + stats), obrigado (/ok)
Tema: accent=#6366f1, font=Inter, dark
```

---

## Chain-of-thought para apps complexos

Para apps com muitas features, use este template:

```
Vou gerar um app [TIPO] em aiplang.

Contexto:
- Público: [quem vai usar]
- Principal funcionalidade: [1 frase]
- Dados principais: [lista de entidades]

Gere seguindo esta ordem:
1. Config (~env, ~db, ~auth, ~stripe se necessário, ~use helmet)
2. Models (com todos os campos e relações)
3. APIs (todas as rotas necessárias, com guards corretos)
4. Páginas (home, auth, dashboard)

Requisitos específicos:
- [detalhe 1]
- [detalhe 2]
```

---

## Regras de ouro

### 1. Seja específico sobre campos
```
# ❌
model User { campos básicos }

# ✅  
model User {
  id: uuid: pk auto
  nome: text: required
  email: text: required unique
  password: text: required hashed
  plano: enum: free,pro: default=free
}
```

### 2. Especifique guards explicitamente
```
# ❌
api GET /api/users { return User.all() }

# ✅
api GET /api/users {
  ~guard admin
  ~query page=1
  return User.paginate($page, 20)
}
```

### 3. Diga o tema completo
```
# ❌
tema escuro

# ✅
~theme accent=#6366f1 radius=1rem font=Inter bg=#030712
```

### 4. Especifique ações da tabela
```
# ❌
tabela de usuários

# ✅
table @users { Nome:nome | Email:email | Plano:plano | edit PUT /api/users/{id} | delete DELETE /api/users/{id} | empty: Nenhum usuário. }
```

---

## Exemplos few-shot para o LLM

Inclua isso no prompt para apps de qualidade:

```
Exemplo de app bem gerado:

~env JWT_SECRET required
~db sqlite ./app.db
~auth jwt $JWT_SECRET expire=7d

model Item {
  id     : uuid  : pk auto
  titulo : text  : required
  feito  : bool  : default=false
  ~belongs User
}

api POST /api/items {
  ~guard auth
  ~validate titulo required
  insert Item($body)
  return $inserted 201
}

api GET /api/items {
  ~guard auth
  return Item.all(order=created_at desc)
}

%home dark /
~theme accent=#6366f1 radius=1rem
@items = []
~mount GET /api/items => @items
nav{App>/logout:Sair}
table @items { Título:titulo | Feito:feito | edit PUT /api/items/{id} | delete DELETE /api/items/{id} | empty: Nenhum item. }
form POST /api/items => @items.push($result) { Título:text:Adicionar item... }
foot{© 2025}

Agora gere: [SEU PROMPT AQUI]
```

---

## Checklist de qualidade

Antes de rodar `npx aiplang start app.aip`, verifique:

- [ ] Todas as env vars `required` estão no .env
- [ ] Models têm `id : uuid : pk auto` no primeiro campo
- [ ] APIs com dados sensíveis têm `~guard auth` ou `~guard admin`
- [ ] Forms têm `=> @list.push($result)` ou `=> redirect /path`
- [ ] Tabelas com ações têm `edit PUT /api/.../{id}` e/ou `delete DELETE /api/.../{id}`
- [ ] Páginas com `@state` têm `~mount GET /api/... => @state`
- [ ] Cada página começa com `%id theme /route`

---

## Ferramentas recomendadas

| Caso | Ferramenta |
|---|---|
| Prototipagem rápida | Claude Sonnet + aiplang-knowledge.md no Project |
| App production | Claude + revisão manual do .aip |
| Iteração rápida | `npx aiplang serve` com hot reload |
| Deploy | Vercel (build) ou Railway/Render (start) |
