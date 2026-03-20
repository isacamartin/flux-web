# aiplang Language Specification v1.0

## Philosophy

aiplang is a machine-to-machine web language.
- Written by AI, executed by browser
- Full SPA capabilities: state, routing, data fetching, forms
- Competes with React/Next in features, not in readability
- One .aip file = complete application

---

## File structure

```
# comment
%page-id theme /route        <- page declaration (one per file section)

@var = value                 <- state declaration
$computed = @expr            <- computed value

~mount METHOD /path @var     <- lifecycle query (runs on page load)
~interval 5000 METHOD /path @var   <- polling query

layout {                     <- layout block
  block{...}
  block{...}
}
```

---

## Pages (routing)

Multiple pages in one .aip file:

```aip
%home dark /
%dashboard dark /dashboard
%login dark /login
```

Each `%` declaration starts a new page section.
The runtime handles client-side routing automatically.

---

## State

```aip
@users = []
@user = {}
@count = 0
@loading = true
@filter = "all"
```

State is reactive. Any block bound to `@var` re-renders when it changes.

---

## Computed

```aip
$total = @items.length
$filtered = @items.filter(s => s.status == @filter)
$revenue = @stats.mrr * 12
```

Re-evaluates automatically when dependencies change.

---

## Lifecycle queries

```aip
~mount GET /api/users => @users
~mount GET /api/stats => @stats
~mount POST /api/session {token:@token} => @user
~interval 30000 GET /api/stats => @stats
```

`~mount` runs once on page load.
`~interval N` polls every N milliseconds.

---

## Bindings in blocks

Use `{@var}` or `{@var.field}` anywhere in block content:

```aip
hero{{@user.name}|Welcome back>/dashboard:Go to dashboard}
stat{@stats.total:Users}
```

---

## Blocks (same as AX + reactive)

```aip
nav{Brand>/path:Link}
hero{Title|Sub>/path:CTA}
stats{@val:label|@val:label}
rowN{icon>Title>Body}
sect{Title|Body}
foot{text}
```

---

## Table with data binding

```aip
table @users {
  Name:name | Email:email | Plan:plan | Status:status | MRR:mrr
}
```

Auto-renders rows from `@users` array.
Re-renders when `@users` changes.
Supports empty state:

```aip
table @users {
  Name:name | Email:email | Status:status
  empty: No users found.
}
```

---

## List / feed

```aip
list @posts {
  title:title | body:body | /post/{id}:Read more
}
```

---

## Form

```aip
form POST /api/users => @users.push($result) {
  Name : text : Full name
  Email : email : work@example.com
  Plan : select : starter,pro,enterprise
}
```

`=> @users.push($result)` — what to do with the API response.
Other actions: `=> @users = $result` / `=> reload` / `=> redirect /path`

---

## Form (login — redirect on success)

```aip
form POST /api/auth/login => redirect /dashboard {
  Email : email : you@example.com
  Password : password :
}
```

---

## Conditionals

```aip
if @loading {
  sect{Loading...}
}

if !@user.id {
  sect{Please log in>/login:Sign in}
}

if @error {
  alert{@error}
}
```

---

## Actions (event handlers)

```aip
btn{Delete>/api/users/{@selected.id}:DELETE => @users.filter(u => u.id != @selected.id)}
btn{Refresh>~reload @users}
btn{Filter active>@filter = "active"}
```

---

## Multi-page app example

```aip
%home dark /

~mount GET /api/stats => @stats

nav{AppName>/dashboard:Dashboard>/login:Sign in}
hero{Ship faster|The AI-native platform.>/signup:Start free}
stats{@stats.users:Users|@stats.mrr:MRR|@stats.uptime:Uptime}
foot{© 2025 AppName}

---

%dashboard dark /dashboard

@users = []
@stats = {}
@filter = "all"
$filtered = @users

~mount GET /api/users => @users
~mount GET /api/stats => @stats
~interval 30000 GET /api/stats => @stats

nav{AppName>/logout:Logout}
stats{@stats.total:Users|@stats.mrr:MRR|@stats.retention:Retention}
sect{User Management}
table @filtered {
  Name:name | Email:email | Plan:plan | Status:status | MRR:mrr
  empty: No users yet.
}
foot{AppName Dashboard © 2025}

---

%login dark /login

nav{AppName}
form POST /api/auth/login => redirect /dashboard {
  Email : email : you@company.com
  Password : password :
}
foot{© 2025 AppName}
```

---

## Separator reference

| Token | Meaning |
|-------|---------|
| `\|`  | next item / column |
| `>`   | next field in item |
| `:`   | subfield separator |
| `{}`  | block content |
| `@`   | state variable |
| `$`   | computed variable |
| `~`   | lifecycle hook |
| `---` | page separator |
| `=>`  | action / callback |

---

## Output

aiplang compiles to:
- Single HTML file with inlined runtime (~28KB gzip ~9KB)
- Zero external dependencies
- Full SPA with client-side routing
- Reactive DOM updates (no Virtual DOM — surgical updates)
