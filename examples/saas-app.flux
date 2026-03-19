%home dark /

@stats = {}
~mount GET /api/stats => @stats

nav{AppName>/dashboard:Dashboard>/pricing:Pricing>/login:Sign in}
hero{Ship faster with AI|Real-time data, zero config, infinite scale.>/dashboard:Open dashboard}
stats{@stats.users:Active users|@stats.mrr:MRR|@stats.uptime:Uptime}
row3{rocket>Deploy instantly>Push to git, live in seconds.|shield>Enterprise ready>SOC2, GDPR, SSO built-in.|chart>Full observability>Real-time errors and performance.}
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
sect{Add user}
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
