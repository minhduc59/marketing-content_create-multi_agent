# AWS Deployment Architecture

Full system deployment guide for **Marketing Content** — the AI-powered TikTok content pipeline.

## 1. System Overview

Three deployable services + shared infrastructure:

| Service | Runtime | Port | Role |
|---------|---------|------|------|
| `ai-service` | Python / FastAPI | 8000 | LangGraph pipelines, OpenAI, TikTok API |
| `backend` | Node.js / NestJS | 3000 | Auth gateway, Prisma ORM, JWT |
| `frontend` | Node.js / Next.js | 3001 | React UI (SSR) |

Shared infrastructure: PostgreSQL 16, Redis 7, S3, CloudFront.

---

## 2. AWS Architecture

### 2.1 High-Level Diagram

```
Internet
    │
    ▼
Route 53 (DNS)
    ├── api.yourdomain.com  → ALB (HTTPS:443)
    └── media.yourdomain.com → CloudFront → S3
    └── app.yourdomain.com  → ALB → Frontend (Next.js)

ALB
    ├── /v1/*          → backend ECS service (NestJS :3000)
    └── /              → frontend ECS service (Next.js :3001)

backend ECS   → (internal VPC)  → ai-service ECS (:8000)
ai-service    → RDS PostgreSQL (ai schema)
backend       → RDS PostgreSQL (app schema)
ai-service    → ElastiCache Redis
backend       → ElastiCache Redis (optional, for session cache)
ai-service    → S3 (write images, reports)
ai-service    → OpenAI API (internet)
ai-service    → TikTok API (internet)
```

### 2.2 VPC Design

```
VPC: 10.0.0.0/16  (ap-southeast-1)

Public subnets (2 AZs — for ALB + NAT Gateway):
  10.0.0.0/24   ap-southeast-1a
  10.0.1.0/24   ap-southeast-1b

Private subnets (2 AZs — for ECS, RDS, ElastiCache):
  10.0.10.0/24  ap-southeast-1a
  10.0.11.0/24  ap-southeast-1b
```

All ECS tasks and databases run in **private subnets**. Egress to internet (OpenAI, TikTok, etc.) flows through a **NAT Gateway** in the public subnet.

### 2.3 Security Groups

| Name | Inbound | Outbound | Attached to |
|------|---------|----------|-------------|
| `sg-alb` | 443 from 0.0.0.0/0 | All | ALB |
| `sg-frontend` | 3001 from `sg-alb` | All | Frontend ECS |
| `sg-backend` | 3000 from `sg-alb` | All | Backend ECS |
| `sg-ai-service` | 8000 from `sg-backend` | All | ai-service ECS |
| `sg-rds` | 5432 from `sg-backend`, `sg-ai-service` | None | RDS |
| `sg-redis` | 6379 from `sg-backend`, `sg-ai-service` | None | ElastiCache |

The ai-service is **not reachable from the ALB** — only the backend gateway talks to it.

---

## 3. AWS Services Required

### 3.1 Compute — Amazon ECS Fargate

All three services run as **ECS Fargate** tasks (serverless containers, no EC2 to manage).

**Cluster**: `marketing-content-cluster`

#### ai-service task definition

```json
{
  "family": "ai-service",
  "cpu": "2048",
  "memory": "4096",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ai-service-task-role",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecs-execution-role",
  "containerDefinitions": [{
    "name": "ai-service",
    "image": "ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/ai-service:latest",
    "portMappings": [{"containerPort": 8000}],
    "environment": [
      {"name": "APP_ENV", "value": "production"},
      {"name": "S3_BUCKET", "value": "marketing-content-media-prod"},
      {"name": "S3_REGION", "value": "ap-southeast-1"},
      {"name": "S3_PREFIX", "value": "trending-scanner"},
      {"name": "CLOUDFRONT_URL", "value": "https://media.yourdomain.com"}
    ],
    "secrets": [
      {"name": "DATABASE_URL",        "valueFrom": "arn:aws:secretsmanager:…:ai-service/db-url"},
      {"name": "REDIS_URL",           "valueFrom": "arn:aws:secretsmanager:…:ai-service/redis-url"},
      {"name": "OPENAI_API_KEY",      "valueFrom": "arn:aws:secretsmanager:…:openai-key"},
      {"name": "TIKTOK_CLIENT_KEY",   "valueFrom": "arn:aws:secretsmanager:…:tiktok-client-key"},
      {"name": "TIKTOK_CLIENT_SECRET","valueFrom": "arn:aws:secretsmanager:…:tiktok-client-secret"},
      {"name": "TOKEN_ENCRYPTION_KEY","valueFrom": "arn:aws:secretsmanager:…:token-encryption-key"},
      {"name": "INTERNAL_API_KEY",    "valueFrom": "arn:aws:secretsmanager:…:internal-api-key"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/ai-service",
        "awslogs-region": "ap-southeast-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

#### backend task definition

```
cpu: 1024   memory: 2048
image: ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/backend:latest
port: 3000
secrets: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
         GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AI_SERVICE_INTERNAL_API_KEY
env: AI_SERVICE_URL=http://{ai-service-private-dns}:8000
```

#### frontend task definition

```
cpu: 512    memory: 1024
image: ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/frontend:latest
port: 3001
env: NEXT_PUBLIC_API_URL=https://api.yourdomain.com/v1
     NEXT_PUBLIC_MEDIA_URL=https://media.yourdomain.com
```

#### ECS Services

```
ai-service:  desired=1, min=1, max=3  (CPU/memory auto-scaling)
backend:     desired=2, min=2, max=6  (CPU auto-scaling, multi-AZ)
frontend:    desired=2, min=2, max=4  (CPU auto-scaling, multi-AZ)
```

**Service Discovery**: use **AWS Cloud Map** to assign the ai-service a stable internal DNS name (`ai-service.marketing-content.local:8000`). The backend resolves it without needing a load balancer between them.

### 3.2 Container Registry — Amazon ECR

Three repositories:
- `marketing-content/ai-service`
- `marketing-content/backend`
- `marketing-content/frontend`

Enable **image scanning on push** and **lifecycle policy** to keep only the last 10 images.

### 3.3 Load Balancer — Application Load Balancer (ALB)

**One internet-facing ALB** handles all public traffic:

| Listener | Target Group | Health Check |
|----------|-------------|--------------|
| HTTPS:443 `/v1/*` | backend :3000 | `GET /v1/health` |
| HTTPS:443 `/*` (default) | frontend :3001 | `GET /` |

For TikTok OAuth callback the URL must be public:
- `GET /api/v1/auth/tiktok/callback` → routes through backend → ai-service

If you want to expose ai-service Swagger docs only in staging, add a separate internal ALB (not internet-facing) in the private subnet.

### 3.4 Database — Amazon RDS PostgreSQL 16

```
Instance:           db.t4g.medium (2 vCPU, 4 GB RAM) — upgrade to db.r7g.large for prod load
Engine:             PostgreSQL 16.x
Storage:            100 GB gp3, autoscale to 500 GB
Multi-AZ:           Yes (standby replica in ap-southeast-1b)
Encryption:         Yes (AWS-managed KMS key)
Backup:             7-day automated backup, point-in-time restore
Parameter group:    pg16 with max_connections=200, shared_buffers=1GB
Security group:     sg-rds (only ECS tasks can connect)
```

**Two database schemas** on the same RDS instance:
- `app` schema — owned by `backend_svc` role (Prisma migrations)
- `ai` schema — owned by `ai_svc` role (Alembic migrations)

The `init-db.sql` from `backend/docker/init-db.sql` must run once during first-time setup (creates roles and schemas).

**Connection strings**:
```
ai-service:  postgresql+asyncpg://ai_svc:{pass}@rds-endpoint:5432/marketing_content
backend:     postgresql://backend_svc:{pass}@rds-endpoint:5432/marketing_content
```

### 3.5 Cache — Amazon ElastiCache Redis 7

```
Engine:     Redis 7.x (Valkey compatible)
Node type:  cache.t4g.micro → upgrade to cache.r7g.large for prod
Cluster:    Single-node (add replica for HA)
Encryption: In-transit (TLS) + at-rest (KMS)
Auth:       Redis AUTH token (stored in Secrets Manager)
```

Used by ai-service for:
- Rate limiting sliding window (HN: 30 req/60s)
- Trend dedup cache (30-min TTL)
- APScheduler job store (golden-hour delayed publish jobs)

### 3.6 Object Storage — Amazon S3

```
Bucket:           marketing-content-media-prod
Region:           ap-southeast-1
Versioning:       Enabled (protects against accidental deletes)
Block public access: All public access blocked (OAC via CloudFront only)
Encryption:       SSE-S3 (AES-256)
Lifecycle rules:
  - images/: transition to S3-IA after 90 days
  - reports/: expire after 365 days
CORS:             GET, HEAD from app.yourdomain.com
```

**Directory layout** (see image-storage-architecture.md for full details):
```
trending-scanner/
├── posts/{scan_run_id}/images/{post_id}.png
├── posts/{scan_run_id}/{post_id}.json
├── posts/{scan_run_id}/output.json
├── reports/{scan_run_id}/report.md
└── strategy/{scan_run_id}/strategy_update.json
```

### 3.7 CDN — Amazon CloudFront

```
Distribution name:   marketing-content-media
Origin:              marketing-content-media-prod.s3.ap-southeast-1.amazonaws.com
Origin access:       OAC (Origin Access Control) — NOT OAI (deprecated)
Origin path:         /trending-scanner
Alternate domain:    media.yourdomain.com
SSL certificate:     ACM (us-east-1 — required for CloudFront)
Cache policy:        CachingOptimized (images: 30-day TTL)
Compress:            Yes (gzip/brotli for JSON files)
Price class:         PriceClass_200 (US, EU, Asia)
```

The CloudFront URL (`https://media.yourdomain.com/{key}`) is what gets stored as the accessible image URL. TikTok's PULL_FROM_URL downloads the image from this URL — no expiry, globally cached.

### 3.8 DNS — Amazon Route 53

```
Hosted zone:   yourdomain.com

Records:
  api.yourdomain.com   A   ALIAS → ALB DNS name
  app.yourdomain.com   A   ALIAS → ALB DNS name  (or separate ALB)
  media.yourdomain.com A   ALIAS → CloudFront distribution domain
```

### 3.9 TLS — AWS Certificate Manager (ACM)

Two certificates needed:
- `api.yourdomain.com`, `app.yourdomain.com` → provisioned in **ap-southeast-1** (for ALB)
- `media.yourdomain.com` → provisioned in **us-east-1** (CloudFront requires us-east-1)

Use DNS validation with Route 53 for automatic renewal.

### 3.10 Secrets — AWS Secrets Manager

All sensitive environment variables are stored as Secrets Manager secrets and injected into ECS containers at launch time (not baked into Docker images):

| Secret path | Contents |
|-------------|----------|
| `marketing-content/ai-service/db-url` | PostgreSQL connection string (ai_svc) |
| `marketing-content/backend/db-url` | PostgreSQL connection string (backend_svc) |
| `marketing-content/ai-service/redis-url` | Redis URL with AUTH token |
| `marketing-content/openai-key` | `OPENAI_API_KEY` |
| `marketing-content/tiktok` | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| `marketing-content/token-encryption-key` | Fernet key for TikTok OAuth token storage |
| `marketing-content/internal-api-key` | `INTERNAL_API_KEY` (shared between backend ↔ ai-service) |
| `marketing-content/jwt` | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |
| `marketing-content/google-oauth` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

### 3.11 Logging — Amazon CloudWatch Logs

Each ECS service writes to its own log group via the `awslogs` driver:

| Log group | Retention |
|-----------|-----------|
| `/ecs/ai-service` | 30 days |
| `/ecs/backend` | 30 days |
| `/ecs/frontend` | 14 days |

Enable **CloudWatch Container Insights** on the ECS cluster for CPU/memory metrics per task.

Create CloudWatch Alarms for:
- ai-service 5xx error rate > 1% (5-min window)
- RDS CPU > 80%
- ElastiCache memory > 80%
- ALB unhealthy host count > 0

### 3.12 IAM Roles

#### `ecs-execution-role` (shared)
Allows ECS to pull images from ECR and fetch secrets from Secrets Manager:
```json
{
  "ManagedPolicies": [
    "AmazonECSTaskExecutionRolePolicy",
    "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
  ]
}
```

#### `ai-service-task-role`
Allows ai-service to write/read S3:
```json
{
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:HeadObject"],
    "Resource": "arn:aws:s3:::marketing-content-media-prod/trending-scanner/*"
  }]
}
```

#### `backend-task-role`
No AWS resource access needed (database via connection string, no S3 write).

---

## 4. Deployment Plan (Step-by-Step)

### Phase 1 — Foundation (Day 1–2)

1. **Create VPC** with public/private subnets, NAT Gateway, Internet Gateway, route tables
2. **Create security groups** (sg-alb, sg-frontend, sg-backend, sg-ai-service, sg-rds, sg-redis)
3. **Create RDS PostgreSQL 16** in private subnets with Multi-AZ, enable automated backups
4. **Create ElastiCache Redis 7** cluster in private subnets
5. **Create S3 bucket** with versioning, block public access, lifecycle rules
6. **Create ECR repositories** for all three services
7. **Create IAM roles** (ecs-execution-role, ai-service-task-role, backend-task-role)
8. **Populate Secrets Manager** with all credentials

### Phase 2 — Database Init (Day 2)

9. Connect to RDS via AWS Session Manager bastion:
   ```bash
   # One-time DB bootstrap
   psql -h rds-endpoint -U postgres -f backend/docker/init-db.sql
   ```
10. Run Alembic migrations for `ai` schema:
    ```bash
    # From a temporary ECS task or bastion
    alembic upgrade head
    ```
11. Run Prisma migrations for `app` schema:
    ```bash
    npx prisma migrate deploy
    ```

### Phase 3 — Container Build & Push (Day 2–3)

12. Build Docker images with production targets:
    ```bash
    # ai-service
    docker build -t ai-service:latest ./ai-service
    docker tag ai-service:latest ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/marketing-content/ai-service:latest
    docker push ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/marketing-content/ai-service:latest

    # backend
    docker build -t backend:latest ./backend
    docker tag ...
    docker push ...

    # frontend
    docker build -t frontend:latest ./frontend \
      --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/v1 \
      --build-arg NEXT_PUBLIC_MEDIA_URL=https://media.yourdomain.com
    docker push ...
    ```

13. Create **Dockerfiles** for each service if not yet present (see Section 5).

### Phase 4 — ECS Services (Day 3–4)

14. Create ECS cluster: `marketing-content-cluster` (Fargate)
15. Register task definitions (ai-service, backend, frontend) with secrets references
16. Create **Cloud Map** namespace: `marketing-content.local`
17. Create ECS services with service discovery:
    - `ai-service` → `ai-service.marketing-content.local`
    - `backend` → registers with ALB target group
    - `frontend` → registers with ALB target group

### Phase 5 — Load Balancer & TLS (Day 4)

18. Request ACM certificates (DNS validation via Route 53)
19. Create ALB with listeners:
    - HTTP:80 → redirect to HTTPS:443
    - HTTPS:443 → listener rules (see Section 3.3)
20. Create target groups for backend and frontend with health checks
21. Attach ECS services to target groups

### Phase 6 — CloudFront & DNS (Day 5)

22. Create CloudFront distribution with S3 origin + OAC
23. Attach ACM certificate (us-east-1) to CloudFront
24. Create Route 53 A records (ALB alias, CloudFront alias)
25. Test media delivery: upload a test image to S3, verify `https://media.yourdomain.com/trending-scanner/test.png` is accessible

### Phase 7 — Validation (Day 5–6)

26. Smoke test all API endpoints via `https://api.yourdomain.com/v1/health`
27. Run full pipeline end-to-end:
    - Trigger scan → poll status → generate posts → verify images load in UI → approve post → publish to TikTok
28. Verify TikTok `PULL_FROM_URL` uses CloudFront URL (check ai-service logs: `resolve: validated`)
29. Verify CloudWatch logs for all three services
30. Set up CloudWatch alarms and test PagerDuty/SNS integration

---

## 5. Dockerfiles

### 5.1 ai-service/Dockerfile

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS builder
RUN pip install --no-cache-dir pip setuptools wheel
COPY pyproject.toml setup.cfg* ./
RUN pip install --no-cache-dir -e ".[prod]" --target /deps

FROM base AS runtime
COPY --from=builder /deps /usr/local/lib/python3.11/site-packages
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 5.2 backend/Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main"]
```

### 5.3 frontend/Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MEDIA_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
```

Add `output: 'standalone'` to `frontend/next.config.js` for the standalone build.

---

## 6. CI/CD Pipeline (GitHub Actions)

Recommended workflow per service:

```yaml
# .github/workflows/deploy-ai-service.yml
on:
  push:
    branches: [main]
    paths: [ai-service/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # for OIDC → assume AWS role
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions-deploy
          aws-region: ap-southeast-1

      - name: Build and push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS \
            --password-stdin ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com
          docker build -t ai-service ./ai-service
          docker tag ai-service:latest ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/marketing-content/ai-service:${{ github.sha }}
          docker push ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/marketing-content/ai-service:${{ github.sha }}

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster marketing-content-cluster \
            --service ai-service \
            --force-new-deployment
```

Use **OIDC federation** (not static AWS access keys) for GitHub Actions. Create an IAM role that trusts the GitHub OIDC provider with a condition on the repository name.

---

## 7. Environment Variables Summary

### ai-service (ECS task)

| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | Secrets Manager | `postgresql+asyncpg://ai_svc:…@rds:5432/mc` |
| `REDIS_URL` | Secrets Manager | `rediss://:token@cache.xxx.cache.amazonaws.com:6379/0` |
| `OPENAI_API_KEY` | Secrets Manager | `sk-…` |
| `TIKTOK_CLIENT_KEY` | Secrets Manager | |
| `TIKTOK_CLIENT_SECRET` | Secrets Manager | |
| `TOKEN_ENCRYPTION_KEY` | Secrets Manager | Fernet key |
| `INTERNAL_API_KEY` | Secrets Manager | random 32-char hex |
| `APP_ENV` | Task definition env | `production` |
| `S3_BUCKET` | Task definition env | `marketing-content-media-prod` |
| `S3_REGION` | Task definition env | `ap-southeast-1` |
| `S3_PREFIX` | Task definition env | `trending-scanner` |
| `CLOUDFRONT_URL` | Task definition env | `https://media.yourdomain.com` |
| `STORAGE_PUBLIC_BASE_URL` | Task definition env | `https://media.yourdomain.com` |
| `REQUIRE_INTERNAL_AUTH` | Task definition env | `true` |
| `BACKEND_ORIGIN` | Task definition env | `https://api.yourdomain.com` |
| `TIKTOK_REDIRECT_URI` | Task definition env | `https://api.yourdomain.com/v1/auth/tiktok/callback` |
| `LOG_LEVEL` | Task definition env | `INFO` |
| `TIMEZONE` | Task definition env | `Asia/Ho_Chi_Minh` |

### backend (ECS task)

| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | Secrets Manager | `postgresql://backend_svc:…@rds:5432/mc` |
| `JWT_ACCESS_SECRET` | Secrets Manager | |
| `JWT_REFRESH_SECRET` | Secrets Manager | |
| `GOOGLE_CLIENT_ID` | Secrets Manager | |
| `GOOGLE_CLIENT_SECRET` | Secrets Manager | |
| `AI_SERVICE_INTERNAL_API_KEY` | Secrets Manager | same as `INTERNAL_API_KEY` |
| `AI_SERVICE_URL` | Task definition env | `http://ai-service.marketing-content.local:8000` |
| `CLOUDFRONT_URL` | Task definition env | `https://media.yourdomain.com` |
| `NODE_ENV` | Task definition env | `production` |

### frontend (ECS task — Next.js `NEXT_PUBLIC_*` baked at build time)

| Variable | Baked at | Example |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Docker build arg | `https://api.yourdomain.com/v1` |
| `NEXT_PUBLIC_MEDIA_URL` | Docker build arg | `https://media.yourdomain.com` |

---

## 8. Cost Estimate (ap-southeast-1, monthly)

| Service | Spec | Est. Cost/month |
|---------|------|-----------------|
| ECS Fargate — ai-service | 2 vCPU, 4 GB, 730h | ~$75 |
| ECS Fargate — backend (×2) | 1 vCPU, 2 GB, 730h | ~$60 |
| ECS Fargate — frontend (×2) | 0.5 vCPU, 1 GB, 730h | ~$25 |
| RDS PostgreSQL 16 db.t4g.medium Multi-AZ | | ~$100 |
| ElastiCache Redis cache.t4g.micro | | ~$15 |
| NAT Gateway | ~100 GB/month egress | ~$45 |
| ALB | ~10 LCU | ~$25 |
| S3 | 50 GB storage + requests | ~$5 |
| CloudFront | 100 GB transfer | ~$10 |
| ECR | 3 repos, image storage | ~$3 |
| Secrets Manager | ~15 secrets | ~$5 |
| CloudWatch Logs | 30 GB/month | ~$15 |
| **Total estimate** | | **~$383/month** |

For a thesis project with low traffic, scale down to:
- `db.t4g.micro` Single-AZ RDS: ~$25
- Single ECS task per service: halve compute costs
- Estimated minimum: **~$150/month**

---

## 9. Migration from Development to Production

### Key configuration differences

| Setting | Development | Production |
|---------|-------------|------------|
| `APP_ENV` | `development` | `production` |
| Storage backend | `LocalStorage` (filesystem) | `S3Storage` |
| Image URLs | `http://localhost:8000/static/…` | `https://media.yourdomain.com/…` |
| CORS origins | `*` | `https://app.yourdomain.com` |
| TikTok redirect URI | `http://localhost:8000/…` | `https://api.yourdomain.com/…` |
| Static file mount | FastAPI `/static` | Disabled |
| APScheduler jobstore | Redis (local) | ElastiCache Redis (TLS) |
| `REQUIRE_INTERNAL_AUTH` | `false` | `true` |

### Checklist before go-live

- [ ] TikTok developer portal: update redirect URI to `https://api.yourdomain.com/v1/auth/tiktok/callback`
- [ ] TikTok developer portal: add production domain to allowed domains
- [ ] OpenAI API: set spending limits appropriate for production traffic
- [ ] RDS: snapshot taken before first Alembic/Prisma migration
- [ ] CloudFront: verify OAC is attached, bucket policy is correct, test image URL
- [ ] ALB: confirm health checks pass for all services
- [ ] CloudWatch alarms: SNS topic created and email/PagerDuty subscription confirmed
- [ ] Route 53: propagation complete, HTTPS working end-to-end
- [ ] Run full publish pipeline with a real TikTok account to verify CloudFront URL is accepted
