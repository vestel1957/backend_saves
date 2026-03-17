# Admin Panel API

NestJS REST API with JWT authentication, RBAC, real-time notifications via WebSocket, and audit logging.

## Prerequisites

- Node.js 18+
- PostgreSQL 16+
- pnpm

## Setup

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database URL, JWT secret, SMTP credentials

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (creates admin user + base permissions)
pnpm seed

# Start development server
pnpm start:dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 64-char hex string for JWT signing |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (465 for SSL, 587 for TLS) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `SMTP_FROM_NAME` | No | Email sender name (default: Admin Panel) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `ADMIN_EMAIL` | No | Seed admin email (default: admin@app.com) |
| `ADMIN_PASSWORD` | No | Seed admin password (default: Admin123!@#) |

## API Documentation

Swagger docs available at `/api/docs` (non-production only).

### Key Endpoints

- `POST /api/v1/auth/login` - Login with email/password
- `POST /api/v1/auth/refresh` - Refresh tokens
- `GET /api/v1/auth/me` - Get current user profile
- `GET /api/v1/users` - List users (paginated)
- `GET /api/v1/roles` - List roles
- `GET /api/v1/permissions` - List permissions
- `GET /api/v1/notifications` - List notifications
- `WS /notifications` - Real-time notification WebSocket

## Testing

```bash
pnpm test          # Run unit tests
pnpm test:cov      # Run with coverage
pnpm test:e2e      # Run e2e tests
```

## Adding a New Module

1. Generate module: `nest g module modules/your-module`
2. Create service, controller, DTOs
3. Add permissions to `prisma/seed.ts`
4. Run `pnpm seed` to create permissions
5. Protect endpoints with `@UseGuards(JwtGuard, PermissionGuard)` and `@RequirePermission('module', 'submodule', 'action')`

## Docker

```bash
docker-compose up -d
```
