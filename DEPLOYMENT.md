# PayRoute MVP Cloud Deployment Guide

This guide details the procedure for deploying PayRoute to a cloud hosting platform (Render, DigitalOcean App Platform, or AWS ECS/CloudFront) using production-grade containers and managed databases.

---

## 1. Cloud Architecture Overview

```
                                      ┌─────────────────────────────────┐
                                      │       Stripe / Razorpay         │
                                      │          (Test Mode)            │
                                      └──────────────┬──────────────────┘
                                                     │ Webhooks (HTTPS)
                                                     ▼
┌───────────────────────┐            ┌───────────────────────────────────┐
│  PayRoute Dashboard   │            │           PayRoute API            │
│ (Static CDN / Nginx)  ├───────────►│       (Container / Port 4000)     │
│ https://dashboard...  │  API Req   │       https://api...              │
└───────────────────────┘ (with JWT) └─────────┬──────────────┬──────────┘
                                               │              │
                                               ▼              ▼
                                       ┌──────────────┐ ┌────────────────┐
                                       │ Redis Cloud  │ │ MongoDB Atlas  │
                                       │ (Queues/Lock)│ │ (Data Store)   │
                                       └───────┬──────┘ └───────┬────────┘
                                               │                │
                                               ▼                ▼
                                      ┌──────────────────────────────────┐
                                      │         PayRoute Worker          │
                                      │      (Container / BullMQ)        │
                                      └──────────────────────────────────┘
```

---

## 2. Prerequisites & Managed Databases

1. **MongoDB Atlas**:
   - Connection URI pointing to the target cluster (`mongodb+srv://...`).
   - Database name: `payroute`.
   - Network access: Allow cloud service IP or `0.0.0.0/0` with SCRAM authentication.
2. **Managed Redis**:
   - Upstash, Redis Cloud, or DigitalOcean Managed Redis (`redis://default:...@host:port`).
   - Must support persistence (AOF/RDB) and eviction policy: `noeviction`.
3. **Gateway Test Credentials**:
   - **Stripe**: Test mode secret key (`sk_test_...`) and webhook signing secret (`whsec_...`).
   - **Razorpay**: Test mode key ID (`rzp_test_...`), key secret, and webhook secret.

---

## 3. Deployment Targets

### Option A: Render (Automated Blueprint)
PayRoute includes a root [`render.yaml`](./render.yaml) blueprint specification that declares the 3 services:
1. Push this repository to GitHub/GitLab.
2. In the Render Dashboard, click **New > Blueprint**.
3. Select your repository. Render will automatically parse `render.yaml` and provision:
   - `payroute-api` (Web Service, Docker)
   - `payroute-worker` (Background Worker, Docker)
   - `payroute-dashboard` (Static Site)
4. Populate the synced environment variables in the Render web console:
   - `MONGODB_URI`
   - `REDIS_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `FRONTEND_URL` (set to `https://payroute-dashboard.onrender.com`)
   - `VITE_API_BASE_URL` (set to `https://payroute-api.onrender.com/api`)

---

### Option B: DigitalOcean App Platform
1. Create a new App in DigitalOcean pointing to the repository.
2. Configure **3 components**:
   - **Service 1 (`api`)**:
     - Build from `docker/backend.Dockerfile`.
     - HTTP Port: `4000`.
     - Health Check Path: `/api/ready`.
   - **Service 2 (`worker`)**:
     - Build from `docker/backend.Dockerfile`.
     - Run Command: `node dist/worker.js`.
   - **Service 3 (`dashboard`)**:
     - Static site built with command `npm run build -w shared && npm run build -w frontend`.
     - Output directory: `frontend/dist`.
     - Catchall rewrite to `/index.html`.
3. Link external managed MongoDB and Redis clusters in the App settings.

---

### Option C: AWS (ECS Fargate + S3/CloudFront)
1. **ECR**: Build and push `docker/backend.Dockerfile` to Amazon ECR.
2. **ECS Task Definition (API)**:
   - Port 4000 mapped to Application Load Balancer (ALB).
   - Target group health check: `/api/ready`.
   - HTTPS listener with AWS Certificate Manager (ACM) certificate.
3. **ECS Task Definition (Worker)**:
   - Override command: `node, dist/worker.js`.
   - Service count: 1 (or autoscaled on BullMQ queue depth).
4. **S3 + CloudFront (Frontend)**:
   - Upload `frontend/dist` to private S3 bucket with CloudFront Origin Access Control (OAC).
   - Custom error response: 404/403 -> `/index.html` (HTTP 200).
   - Route `/api/*` on CloudFront to the ALB domain.

---

## 4. Environment Variables Reference (Production Safe)

| Variable | Format / Constraint | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production logging and caching |
| `PORT` | `4000` | Port for the API server |
| `FRONTEND_URL` | `https://<dashboard-domain>` | Required for CORS allowlist |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB connection string |
| `MONGODB_DB` | `payroute` | MongoDB database name |
| `REDIS_URL` | `redis://...` | Redis connection string for BullMQ |
| `STRIPE_SECRET_KEY` | `sk_test_...` *(Test Mode)* | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe webhook signing secret |
| `RAZORPAY_KEY_ID` | `rzp_test_...` *(Test Mode)* | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | `...` | Razorpay Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | `...` | Razorpay webhook signature secret |
| `JWT_SECRET` | Minimum 32-char high-entropy string | Signs and validates admin/merchant JWT tokens |
| `PRIMARY_GATEWAY` | `stripe` | Default gateway for routing |
| `PAYMENT_MAX_RETRIES` | `2` | Maximum retry attempts per transaction |
| `RETRY_INITIAL_DELAY_MS`| `1000` | Initial exponential backoff delay in ms |
| `GATEWAY_TIMEOUT_MS` | `8000` | Gateway HTTP client timeout |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Consecutive failures before circuit trips |

---

## 5. Gateway Webhook Configuration

After the API service is deployed and has a public HTTPS URL:

1. **Stripe Developer Dashboard (Test Mode)**:
   - Endpoint URL: `https://<YOUR_API_DOMAIN>/api/webhooks/stripe`
   - Events to send:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
   - Copy the **Signing Secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

2. **Razorpay Developer Dashboard (Test Mode)**:
   - Webhook URL: `https://<YOUR_API_DOMAIN>/api/webhooks/razorpay`
   - Secret: Enter a strong random secret and copy it into `RAZORPAY_WEBHOOK_SECRET`.
   - Events to send:
     - `payment.authorized`
     - `payment.captured`
     - `payment.failed`
     - `order.paid`

---

## 6. Post-Deployment Verification Checklist

Execute these verification checks immediately after services are up:

1. **Liveness & Readiness Probes**:
   ```bash
   curl -i https://<YOUR_API_DOMAIN>/api/health
   # Expected: HTTP 200 {"status":"ok"}

   curl -i https://<YOUR_API_DOMAIN>/api/ready
   # Expected: HTTP 200 {"status":"ready"} (MongoDB & Redis healthy)
   ```

2. **Worker Heartbeat Verification**:
   Query Redis key `payroute:worker:heartbeat`. Ensure timestamp age is `< 15s`.

3. **Frontend Dashboard Loading**:
   Open `https://<YOUR_DASHBOARD_DOMAIN>`.
   - Verify Light Theme loads cleanly with zero CSS or asset loading errors.
   - Verify login with seeded credentials (`admin@example.com`).

4. **Authenticated Payment Creation**:
   ```bash
   curl -i -X POST https://<YOUR_API_DOMAIN>/api/payments \
     -H "Authorization: Bearer <ADMIN_JWT>" \
     -H "Idempotency-Key: deploy_test_key_001" \
     -H "Content-Type: application/json" \
     -d '{"amount": 10000, "currency": "inr", "customer": {"reference": "cust_deploy_1"}, "paymentMethod": {"type": "test_token"}}'
   # Expected: HTTP 202 with transaction data
   ```

5. **Idempotency Replay Verification**:
   Re-run the exact same curl request:
   - Expected: HTTP 202 with header `Idempotent-Replayed: true` and identical transaction ID.
