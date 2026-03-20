# aiplang — syntax reference
File extension: `.aip` (e.g. `app.aip`, `home.aip`)
Generate ONLY aiplang code. No React, HTML, or other frameworks. No explanations unless asked.

## File structure
```
~env VAR required          # env validation
~db sqlite ./app.db        # or: postgres $DATABASE_URL
~auth jwt $JWT_SECRET expire=7d
~mail smtp host=x user=$U pass=$P
~s3 $KEY secret=$S bucket=$B region=us-east-1 prefix=uploads/ maxSize=10mb
~stripe $KEY webhook=$WH success=/ok cancel=/pricing
~plan free=price_x pro=price_y
~admin /admin
~use cors origins=https://x.com
~use rate-limit max=100 window=60s
~use helmet | ~use logger | ~use compression
~plugin ./my-plugin.js

model Name {
  id    : uuid  : pk auto
  field : type  : modifier
  ~soft-delete
  ~belongs OtherModel
}
# types: uuid text int float bool timestamp json enum
# modifiers: pk auto required unique hashed default=val index

api METHOD /path/:id {
  ~guard auth | admin | subscribed | owner
  ~validate field required | field email | field min=8 | field numeric
  ~query page=1 limit=20
  ~unique Model field $body.field | 409
  ~hash field
  ~check password $body.pw $user.pw | 401
  ~mail $user.email "Subject" "Body"
  ~dispatch jobName $body
  ~emit event.name $body
  $var = Model.findBy(field=$body.field)
  insert Model($body)
  update Model($id, $body)
  delete Model($id)
  restore Model($id)
  return $inserted | $updated | $auth.user | Model.all(order=created_at desc)
  return Model.paginate($page, $limit)
  return Model.count() | Model.sum(field) | Model.avg(field)
  return jwt($user) 200
}

%id theme /route           # dark | light | acid | #bg,#text,#accent
~theme accent=#hex bg=#hex text=#hex font=Name radius=1rem surface=#hex navbg=#hex
@var = []                  # state: [] or {} or "string" or 0
~mount GET /api => @var
~interval 10000 GET /api => @var

blocks...
---                        # page separator
```

## All blocks
```
nav{Brand>/path:Link>/path:Link}
hero{Title|Sub>/path:CTA} | hero{Title|Sub>/path:CTA|img:https://url}
stats{@val:Label|99%:Uptime|$0:Free}
row2{icon>Title>Body} | row3{...} | row4{...}
sect{Title|Optional body}
table @list { Col:field | edit PUT /api/{id} | delete /api/{id} | empty: msg }
form POST /api => @list.push($result) { Label:type:placeholder | Label:select:a,b,c }
form POST /api => redirect /path { Label:type | Label:password }
pricing{Name>Price>Desc>/path:CTA|Name>Price>Desc>/path:CTA}
faq{Question?>Answer.|Q2?>A2.}
testimonial{Name, Role @ Co|"Quote."|img:https://url}
gallery{https://img1|https://img2|https://img3}
btn{Label > METHOD /api/path} | btn{Label > DELETE /api > confirm:Sure?}
select @filterVar { All | Active | Inactive }
if @var { blocks }
raw{<div>any HTML</div>}
foot{© 2025 Name>/path:Link}
```

## Block modifiers (any block)
`animate:fade-up | fade-in | blur-in | slide-left | slide-right | zoom-in | stagger`
`class:my-class`

## S3 auto-routes
`POST /api/upload` · `DELETE /api/upload/:key` · `GET /api/upload/presign?key=x`

## Stripe auto-routes
`POST /api/stripe/checkout` · `POST /api/stripe/portal` · `GET /api/stripe/subscription`

## Rules
1. Dark theme default
2. `@var = []` + `~mount` for all dynamic data
3. Tables always have `edit` + `delete` unless readonly
4. Forms: `=> @list.push($result)` or `=> redirect /path`
5. `~theme` before `%` declarations
6. Separate pages with `---`
7. Full-stack: `~db` + `~auth` + `model` + `api` before pages
