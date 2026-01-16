# AidStation 🏃‍♂️⛰️

AI-powered race planning for endurance athletes.

## Overview

AidStation helps ultra-marathon and endurance race athletes plan their race strategy by:

- **Finding race information** using AI to search for race details, aid stations, and cutoff times
- **Analyzing past performances** from uploaded GPX files to understand your capabilities
- **Predicting race times** using scientific approaches (Minetti equations, Riegel formula)
- **Creating personalized race plans** with aid station arrival times and cutoff buffers

## Tech Stack

### Frontend ("Web")
- **Next.js 14** with TypeScript and App Router
- **Mapbox GL JS** for course visualization
- **Recharts** for elevation profiles and charts

### Backend ("API")
- **Fastify** (Node.js) - API Gateway and WebSockets
- **Python (FastAPI + Celery)** - GPX/FIT analysis and ML predictions
- **Redis + BullMQ** - Job queue for async processing

### Database
- **PostgreSQL** with PostGIS (geospatial) and TimescaleDB (time-series)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker and Docker Compose
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/hesher/AidStation.git
   cd AidStation
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Start the database and Redis**
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Set up Python worker**
   ```bash
   cd workers/python
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

5. **Start development servers**
   ```bash
   # In one terminal - start web and API
   npm run dev

   # In another terminal - start Python worker
   cd workers/python && celery -A src.celery_app worker --loglevel=info
   ```

6. **Open the app**
   - Web: http://localhost:3000
   - API: http://localhost:3001

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

### Project Structure

```
aidstation/
├── docs/                    # Documentation and plan tracking
│   └── PLAN.md             # Implementation plan
├── apps/
│   ├── web/                # Next.js frontend
│   └── api/                # Fastify API gateway
├── workers/
│   └── python/             # Python analysis workers
├── packages/
│   └── shared/             # Shared types/utilities
├── docker-compose.yml
└── playwright.config.ts
```

## License

MIT

## Contributing

See [docs/PLAN.md](docs/PLAN.md) for the implementation roadmap and current status.
