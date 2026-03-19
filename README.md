# FLUX

> Machine-to-machine web language. Competes with React/Next. Written by AI, not humans.

**[→ Live Demo](https://isacamartin.github.io/flux)** · [Spec](./SPEC.md)

---

## What FLUX does that React/Next also does

| Feature | React/Next | FLUX |
|---|---|---|
| Reactive state | `useState` | `@var = []` |
| Data fetching | `useEffect + fetch` | `~mount GET /api/users => @users` |
| Polling | `setInterval + fetch` | `~interval 5000 GET /api/stats => @stats` |
| Data binding | `{users.map(...)}` | `table @users { Name:name \| Email:email }` |
| Forms + POST | `onSubmit + fetch` | `form POST /api/users => @users.push($result) {...}` |
| Auth redirect | `router.push('/dashboard')` | `form POST /api/login => redirect /dashboard {...}` |
| Client routing | `next/router` | built-in (`---` page separator) |
| Conditional render | `{condition && <Component/>}` | `if @loading { sect{Loading...} }` |

## What FLUX is faster at (for AI generation)

```
React dashboard with table + form + polling + routing:  ~250 lines
FLUX same app:                                          ~20 lines
```

---

## Example — Full SaaS app (3 pages)

```flux
%home dark /

@stats = {}
~mount GET /api/stats => @stats

nav{AppName>/dashboard:Dashboard>/login:Sign in}
hero{Ship faster with AI|Real-time, zero config.>/dashboard:Open app}
stats{@stats.users:Users|@stats.mrr:MRR|@stats.uptime:Uptime}
row3{rocket>Deploy instantly>3 seconds from push to live.|shield>Enterprise>SOC2, GDPR, SSO built-in.|chart>Observability>Real-time errors and performance.}
foot{© 2025 AppName}

---

%dashboard dark /dashboard

@users = []
@stats = {}
~mount GET /api/users => @users
~mount GET /api/stats => @stats
~interval 10000 GET /api/stats => @stats

nav{AppName>/logout:Sign out}
stats{@stats.users:Users|@stats.mrr:MRR|@stats.retention:Retention}
sect{Users}
table @users {
  Name:name | Email:email | Plan:plan | Status:status | MRR:mrr
  empty: No users yet.
}
form POST /api/users => @users.push($result) {
  Full name : text : Alice Johnson
  Email : email : alice@company.com
  Plan : select : starter,pro,enterprise
}
foot{AppName Dashboard © 2025}

---

%login dark /login

nav{AppName}
hero{Welcome back|Sign in to continue.}
form POST /api/auth/login => redirect /dashboard {
  Email : email : you@company.com
  Password : password :
}
foot{© 2025 AppName}
```

**3 pages. Routing. Live data. Polling every 10s. Form with POST. Auth with redirect. 35 lines.**

React equivalent: ~400 lines across 6+ files.

---

## Language primitives

```
%id theme /route          page declaration
---                       page separator (multi-page app)
@var = value              reactive state
$computed = @expr         computed value (auto-updates)
~mount GET /path => @var  fetch on load
~interval N GET /path => @var  polling

nav{Brand>/path:Link}
hero{Title|Subtitle>/path:CTA}
stats{@val:label|@val:label}
rowN{icon>Title>Body}
sect{Title|Body}
foot{text>/path:Link}

table @var { Col:field | Col:field   empty: message }
list @var  { field | field }
form METHOD /path => action { Field:type:placeholder | ... }
if @condition { block{...} }
```

## Form actions

```
=> @list.push($result)      add response to array
=> @var = $result           replace state with response
=> redirect /path           navigate to route
=> reload                   reload page
```

---

## Use in browser

```html
<div id="app"></div>
<script src="flux-runtime.js"></script>
<script type="text/flux" target="#app">
  %home dark /
  nav{MyApp>/login:Sign in}
  hero{Hello World|Built with FLUX.>/signup:Get started}
  foot{© 2025}
</script>
```

---

## Use with Laravel

```php
Route::get('/{any}', fn() => view('flux'))->where('any', '.*');
```

```blade
<div id="app"></div>
<script src="{{ asset('flux-runtime.js') }}"></script>
<script>
  fetch('/flux/app.flux')
    .then(r => r.text())
    .then(src => FLUX.boot(src, document.getElementById('app')))
</script>
```

---

## Runtime size

- `flux-runtime.js` — ~28KB unminified / ~9KB gzip
- Zero external dependencies
- Full SPA: state + routing + data fetching + reactive DOM

---

## AI workflow

Ask Claude:
> *"Create a CRM with users list, add user form, stats that refresh every 30 seconds, dark theme"*

Claude responds in 10 seconds with a `.flux` file. Paste it. Done.

---

## License

MIT
