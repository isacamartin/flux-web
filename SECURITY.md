# Security Policy — aiplang

## Overview

aiplang is designed to be secure by default. This document describes the security model, known limitations, and how to report vulnerabilities.

## What's built-in (automatic)

| Feature | Status | Details |
|---|---|---|
| Password hashing | ✅ | bcrypt cost 12 — ~250ms per hash |
| JWT authentication | ✅ | HS256, configurable expiry |
| SQL injection | ✅ | Parameterized queries everywhere |
| Body size limit | ✅ | 1MB default (set MAX_BODY_BYTES) |
| Auth rate limiting | ✅ | 20 req/min per IP on /api/auth/* |
| Security headers | ✅ | `~use helmet` — X-Frame, nosniff, etc. |
| CORS control | ✅ | `~use cors origins=https://yourdomain.com` |
| HttpOnly admin cookie | ✅ | Admin panel uses HttpOnly+SameSite=Strict |
| Input validation | ✅ | `~validate` directive |
| Env var protection | ✅ | `~env VAR required` — fail-fast if missing |

## Known limitations (be aware of these)

### ⚠ Not production-ready out of the box
aiplang is **alpha software**. Review generated code before deploying to production.

### ⚠ SQLite is not for high-traffic production
SQLite supports ~5k reads/sec and ~1k writes/sec. For production traffic, use:
```aip
~db postgres $DATABASE_URL
```

### ⚠ No CSRF protection on API routes
API routes use JWT Bearer tokens (stateless), so CSRF is not applicable for API calls.
Admin panel uses SameSite=Strict cookies which provides CSRF protection.

### ⚠ No input sanitization for XSS (server-side)
aiplang validates field formats (email, min/max, numeric) but does not sanitize HTML.
If you render user-provided content as HTML, sanitize it in your plugin or before storage.

### ⚠ File uploads go to ./uploads/ by default
In mock mode (no S3 configured), uploads are stored locally. Validate file types:
```aip
~s3 $KEY secret=$S bucket=$B allow=image/jpeg,image/png,application/pdf maxSize=5mb
```

### ⚠ Rate limiting is in-memory
`~use rate-limit` stores counters in Node.js memory. Restarting the server resets limits.
For distributed deployments, implement Redis-backed rate limiting via a plugin.

### ⚠ No audit log
aiplang does not automatically log who changed what. Add `~use logger` for request logging.

## Environment variables security

Never commit `.env` to version control. Required variables:

```bash
JWT_SECRET=<32+ random chars>    # Required — fatal in production if missing
DATABASE_URL=<postgres url>       # For production PostgreSQL
STRIPE_SECRET_KEY=sk_live_...     # Only in production
MAIL_FROM=noreply@yourdomain.com  # Optional
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Threat Model

| Threat | Mitigation |
|---|---|
| SQL injection | Parameterized queries (all ORM operations) |
| Brute force login | Auto rate-limit 20 req/min on /api/auth/* |
| Large payload DoS | 1MB body limit, 413 response |
| Weak JWT secret | process.exit(1) in NODE_ENV=production if not set |
| XSS via admin | SameSite=Strict + HttpOnly cookies |
| Path traversal | Single-segment :param routing blocks traversal |
| SMTP injection | nodemailer handles escaping |

## Reporting a Vulnerability

Open an issue on GitHub with the label `security` or email directly.
Do **not** include exploit details in public issues.

Response time: within 72 hours for critical issues.

## Audits

- Internal review: DevOps security pass (March 2026)
- External audit: not yet conducted
