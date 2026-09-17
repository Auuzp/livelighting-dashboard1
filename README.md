# Live Lighting - Service Dashboard

A web-based service dashboard system for tracking jobs, travel claims, OT claims, employees, and operations.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Application environment (`development`, `test`, or `production`). In production, set to `production`. | `development` |
| `ENABLE_DIAGNOSTICS` | Enables the `/api/diagnose` endpoint for troubleshooting in non-production environments (`true` / `false`). Disabled by default and strictly disabled in production. | `false` |
| `DATABASE_URL` | Cloud PostgreSQL connection string (e.g. Supabase, Neon). Configure securely in your deployment platform; never commit real credentials. If omitted, falls back to local SQLite (`database.db`). | *(none)* |
| `PORT` | HTTP port the server listens on. | `3000` |

## Health Check Endpoint

- **`GET /healthz`**: Used for uptime monitoring and deployment health checks (e.g. Render).
  - Returns `200` with `{"status":"ok"}` when the server and database connection are operational.
  - Returns `503` with `{"status":"unavailable"}` when the database connection fails or is unavailable.
  - Never leaks sensitive database configuration, table names, or error details.

## Diagnostics Endpoint

- **`GET /api/diagnose`**: Restricted diagnostic endpoint.
  - Returns `404` in production (`NODE_ENV=production`).
  - Returns `404` by default unless `ENABLE_DIAGNOSTICS=true` is explicitly set in development/test.

## Development & Testing

```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Start application server
npm start
```