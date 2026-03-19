# flux-lang

> AI-first web language. Write full apps in 20 lines. Compiles to pre-rendered HTML.

```bash
npx flux-lang init my-app
cd my-app && npx flux-lang serve
```

## What it does

FLUX is a web language designed for AI to write, not humans.
The same dashboard that takes 262 lines in React takes 22 lines in FLUX.

```flux
%dashboard dark /dashboard

@users = []
@stats = {}
~mount GET /api/users => @users
~mount GET /api/stats => @stats
~interval 10000 GET /api/stats => @stats

nav{MyApp>/logout:Sign out}
stats{@stats.users:Users|@stats.mrr:MRR|@stats.retention:Retention}
table @users {
  Name:name | Email:email | Plan:plan | Status:status
  empty: No users yet.
}
form POST /api/users => @users.push($result) {
  Full name : text : Alice Johnson
  Email : email : alice@company.com
  Plan : select : starter,pro,enterprise
}
foot{MyApp © 2025}
```

Compiles to pre-rendered HTML with zero JS for static pages, 10KB hydration script only where needed.

## Commands

```bash
npx flux-lang init [name]         create new project
npx flux-lang serve               dev server → localhost:3000  
npx flux-lang build pages/        compile .flux → static HTML
npx flux-lang new <page>          create new page template
```

## Performance vs React

| | React/Next | flux-lang |
|---|---|---|
| Tokens for Claude to write | ~4,300 | ~440 |
| Lines of code | ~262 | ~22 |
| JS downloaded | 130KB | 10KB |
| First paint | ~320ms | ~40ms |
| SEO | ✓ (SSR) | ✓ (SSG) |

## Links

- GitHub: https://github.com/isacamartin/flux
- Demo: https://isacamartin.github.io/flux
- Spec: https://github.com/isacamartin/flux/blob/main/SPEC.md

## License

MIT
