# AidStation Deployment Guide

This guide covers deploying AidStation to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Architecture Overview](#architecture-overview)
4. [Configuration](#configuration)
5. [Deployment Options](#deployment-options)
6. [Database Setup](#database-setup)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [Scaling](#scaling)
10. [Backup & Recovery](#backup--recovery)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **Node.js** 20.x (for local development)
- **Python** 3.11+ (for worker development)

### Required Accounts & API Keys

- **OpenAI API Key**: For AI-powered race search
- **Mapbox Token**: For course map visualization
- **(Optional) Docker Hub**: For pushing container images
- **(Optional) AWS Account**: For S3 file storage

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/hesher/AidStation.git
cd AidStation
```

### 2. Configure environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env
```

### 3. Start production stack

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d --build

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Run database migrations

```bash
# Enter the API container
docker-compose -f docker-compose.prod.yml exec api sh

# Run migrations
cd apps/api && npx drizzle-kit push
```

### 5. Verify deployment

```bash
# Check health endpoints
curl http://localhost:3001/health
curl http://localhost:3000
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
│                    Port 80/443 (SSL)                        │
└─────────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│      Web (Next.js)       │   │    API (Fastify/Node)    │
│        Port 3000         │   │       Port 3001          │
└──────────────────────────┘   └──────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
         ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
         │   PostgreSQL     │ │      Redis       │ │  Python Worker   │
         │   (PostGIS)      │ │   (Queue/Cache)  │ │    (Celery)      │
         │   Port 5432      │ │   Port 6379      │ │                  │
         └──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Services

| Service | Purpose | Port |
|---------|---------|------|
| **web** | Next.js frontend application | 3000 |
| **api** | Fastify API gateway | 3001 |
| **worker** | Python Celery worker for GPX analysis | - |
| **postgres** | PostgreSQL database with PostGIS | 5432 |
| **redis** | Message queue (BullMQ) and caching | 6379 |
| **nginx** | Reverse proxy with SSL (optional) | 80/443 |

---

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

#### Required Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong password for PostgreSQL |
| `SESSION_SECRET` | Random string for session encryption |
| `OPENAI_API_KEY` | OpenAI API key for race search |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public token for maps |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `S3_BUCKET` | S3 bucket for file storage | (local storage) |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `SENTRY_DSN` | Sentry error tracking | (disabled) |

### Generating Secure Secrets

```bash
# Generate SESSION_SECRET
openssl rand -base64 32

# Generate POSTGRES_PASSWORD
openssl rand -base64 24
```

---

## Deployment Options

### Option 1: Docker Compose (Recommended for single server)

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d --build

# With Nginx reverse proxy
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
```

### Option 2: Kubernetes (Enterprise scale)

For Kubernetes deployment, convert docker-compose to k8s manifests:

```bash
# Using kompose
kompose convert -f docker-compose.prod.yml -o k8s/
```

### Option 3: Cloud Platforms

#### AWS (ECS/Fargate)

1. Push images to ECR
2. Create ECS task definitions from Dockerfiles
3. Set up Application Load Balancer
4. Configure RDS for PostgreSQL with PostGIS
5. Use ElastiCache for Redis

#### Google Cloud (Cloud Run)

1. Push images to Container Registry
2. Deploy services to Cloud Run
3. Use Cloud SQL for PostgreSQL
4. Use Memorystore for Redis

---

## Database Setup

### Initial Setup

The PostgreSQL container automatically initializes PostGIS extension. For additional setup:

```sql
-- Enable TimescaleDB for time-series data (optional)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Running Migrations

```bash
# From host (development)
cd apps/api && npx drizzle-kit push

# From container (production)
docker-compose -f docker-compose.prod.yml exec api \
  sh -c "cd apps/api && npx drizzle-kit push"
```

### Database Maintenance

```bash
# Vacuum and analyze
docker-compose exec postgres psql -U aidstation -c "VACUUM ANALYZE;"

# Check database size
docker-compose exec postgres psql -U aidstation -c "SELECT pg_size_pretty(pg_database_size('aidstation'));"
```

---

## SSL/TLS Configuration

### Using Let's Encrypt (Recommended)

1. Install certbot on your server
2. Obtain certificates:

```bash
certbot certonly --standalone -d your-domain.com
```

3. Copy certificates to docker volume:

```bash
mkdir -p docker/ssl
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/ssl/key.pem
```

4. Start with nginx profile:

```bash
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
```

### Auto-renewal

```bash
# Add to crontab
0 0 * * * certbot renew --quiet && docker-compose restart nginx
```

---

## Monitoring & Logging

### Log Aggregation

All services log to stdout/stderr, accessible via Docker:

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api

# With timestamps
docker-compose -f docker-compose.prod.yml logs -f -t
```

### Health Checks

Built-in health endpoints:

```bash
# API health
curl http://localhost:3001/health

# Web health (via nginx)
curl http://localhost/health
```

### Metrics (Optional)

For production monitoring, consider adding:

- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Sentry**: Error tracking (set `SENTRY_DSN`)

---

## Scaling

### Horizontal Scaling

#### API Service

```bash
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

#### Python Workers

```bash
docker-compose -f docker-compose.prod.yml up -d --scale worker=4
```

### Vertical Scaling

Adjust container resources in docker-compose:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Database Scaling

For high-traffic deployments:

1. **Read Replicas**: Set up PostgreSQL streaming replication
2. **Connection Pooling**: Use PgBouncer
3. **Caching**: Increase Redis memory and use Redis Cluster

---

## Backup & Recovery

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U aidstation -Fc aidstation > backup_$(date +%Y%m%d).dump

# Restore backup
docker-compose exec -T postgres pg_restore -U aidstation -d aidstation < backup_20240101.dump
```

### Automated Backups

```bash
#!/bin/bash
# backup.sh - Run daily via cron

BACKUP_DIR="/backups/aidstation"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
docker-compose -f /app/docker-compose.prod.yml exec -T postgres \
  pg_dump -U aidstation -Fc aidstation > "$BACKUP_DIR/db_$DATE.dump"

# Keep only last 7 days
find "$BACKUP_DIR" -name "db_*.dump" -mtime +7 -delete
```

### Volume Backups

```bash
# Backup all volumes
docker run --rm -v aidstation_postgres-data:/data -v $(pwd):/backup alpine \
  tar cvf /backup/postgres-data.tar /data
```

---

## Troubleshooting

### Common Issues

#### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs api

# Check container status
docker-compose -f docker-compose.prod.yml ps
```

#### Database connection errors

```bash
# Verify database is ready
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Check connection from API container
docker-compose -f docker-compose.prod.yml exec api \
  sh -c "nc -zv postgres 5432"
```

#### Redis connection errors

```bash
# Verify Redis is running
docker-compose -f docker-compose.prod.yml exec redis redis-cli ping
```

#### API returns 502 Bad Gateway

1. Check if API container is running
2. Verify health endpoint responds
3. Check nginx logs for upstream errors

### Performance Issues

```bash
# Check container resource usage
docker stats

# Check database slow queries
docker-compose exec postgres psql -U aidstation -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC
LIMIT 10;
"
```

### Getting Help

- Check application logs: `docker-compose logs -f`
- GitHub Issues: https://github.com/hesher/AidStation/issues
- Documentation: `/docs/PLAN.md`

---

## Security Checklist

Before going to production, ensure:

- [ ] Strong, unique passwords for all services
- [ ] SESSION_SECRET is randomly generated
- [ ] SSL/TLS is enabled with valid certificates
- [ ] API keys are not committed to git
- [ ] Database is not exposed to public internet
- [ ] Firewall allows only necessary ports (80, 443)
- [ ] Regular security updates applied
- [ ] Backups are configured and tested
- [ ] Monitoring and alerting is set up
