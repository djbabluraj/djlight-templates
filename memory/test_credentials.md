# Test Credentials

## Admin Account (DJ Light Templates) — RESET 2026-06-15
- Email: `admin@djlights.com`
- Password: `DjLights2026!`

Login endpoint: `POST /api/admin/login` with form-encoded body
`username=admin@djlights.com&password=DjLights2026!`.

Use the returned `access_token` as `Authorization: Bearer <token>` for `/api/admin/*` routes.

Verified working via curl after backend restart on 2026-06-15.
