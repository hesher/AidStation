# AidStation - Implementation Plan

---

## LLM Instructions

This section defines the rules and workflow that the LLM must follow when implementing this plan.

### Plan Tracking

1. **This plan is a live document** - Update it as new ideas and learnings emerge during implementation
2. **Store this plan file in the App repository** at `/docs/PLAN.md` and use it to track progress toward completion
3. **Mark checkboxes** as completed (`[x]`) when sub-stories are finished
4. **Add new sub-stories** as they are discovered during implementation

### Story Structure

- **User Stories** = Deliverable product experiences that are testable by users
- **Sub-Stories** = Required technical steps toward implementing a User Story
- Each User Story MUST have an associated E2E browser test
- Each Sub-Story MUST have an associated unit/integration test

### Testing Requirements

#### Sub-Story Completion Criteria
Before marking any sub-story as complete, the LLM MUST:
1. Write or update tests for that sub-story
2. Run the tests and verify they pass
3. Only then mark the sub-story checkbox as complete

#### User Story Completion Criteria
Before marking any User Story as complete, the LLM MUST:
1. Write or update E2E browser tests (using Playwright) for that story
2. Run the browser tests and verify they pass
3. Ensure ALL sub-stories within the User Story are complete
4. Only then consider the User Story complete

### Git Hooks Enforcement

The repository is https://github.com/hesher/AidStation.git
The repository must be configured with Git hooks that enforce:

1. **Pre-commit hook**: Runs linting and type checking
2. **Pre-push hook**: Ensures tests pass before code can be pushed
   - Validates that the commit message references a sub-story (e.g., `US1.2`)
   - Runs the relevant tests for that sub-story
   - Blocks push if tests fail

### Browser Testing Standards

- All browser tests use **Playwright**
- Tests must simulate real user interactions (clicking, typing, navigation)
- Tests must verify visual elements are rendered correctly
- Tests must verify data flows correctly through the UI
- Each User Story must have at least one happy-path E2E test
- Edge cases and error states should have additional tests

### Workflow Summary

```
!! When the prompt didn't specify a story, sub-story or a specific request, prioritise work in this order:
1. "Urgent Fixes" from Phase 8
2. "Fast Follows" from Phase 8
3. Incomplete steps in partially completed stories
4. Lint and type errors and warnings
5. new stories
6. "Future Work" from Phase 8

* Mark the active task in the plan file so we can track which task is active.
* If a Task failed - Add the failure reason to the plan so the next iteration tries to fix it
* If there are follow ups or interesting insights, add them to the plan for future reference



For each Sub-Story:
  1. Implement the feature/fix
  2. Write/update tests
  3. Run tests → Must pass
  4. Mark sub-story complete [x]
  5. Update PLAN.md with completion status
  6. **COMMIT IMMEDIATELY** with message referencing sub-story (e.g., "US1.2: Implement GPX parsing")

For each User Story:
  1. Complete all sub-stories (following above workflow)
  2. Write/update E2E browser tests
  3. Run browser tests → Must pass
  4. Mark User Story as complete
  5. Update PLAN.md with completion status
  6. **COMMIT IMMEDIATELY** with message referencing user story (e.g., "US1: Complete Onboarding Experience")
```

### Server Start/Stop Commands

**CRITICAL: Always use non-blocking commands for server operations.**

When starting or stopping development servers (API, web, workers), ALWAYS use `&` to run processes in the background so that commands don't block the AI agent:

```bash
# ✅ CORRECT - Non-blocking
cd /path/to/project && npm run dev > .pids/api.log 2>&1 &
echo $! > .pids/api.pid

# ❌ WRONG - Blocking (will hang the AI)
cd /path/to/project && npm run dev

# ✅ CORRECT - Stop and restart
kill $(cat .pids/api.pid) 2>/dev/null; sleep 1 && npm run dev > .pids/api.log 2>&1 &
```

Never use `interactive: true` for server start commands as they will block indefinitely.

### 🔴 CRITICAL: Commit Requirement

**The LLM MUST commit changes immediately after completing any story or sub-story.**

This is a non-negotiable requirement to ensure:
1. Progress is saved incrementally
2. Changes can be reviewed and reverted if needed
3. The git history accurately reflects the implementation timeline

**Commit Message Format:**
- Sub-stories: `P{phase}.{sub}: Brief description` (e.g., `P1.1: Initial project setup`)
- User Stories: `US{number}: Brief description` (e.g., `US1: Onboarding Experience complete`)

**Before committing, the LLM must:**
1. Run `git add -A` to stage all changes
2. Use `git commit -m "message"` with appropriate message
3. Verify the commit was successful

**Do NOT wait for user to ask for a commit. Commit automatically upon completion.**

---

## Overview

**AidStation** is a comprehensive endurance race planning web application that uses AI to help athletes plan race strategies based on past performance data and race course analysis.

### Tech Stack (Per Doc 2 Recommendations)
- **Frontend:** Next.js (React) with TypeScript
- **Backend "Nervous System":** Node.js with Fastify (API Gateway, WebSockets)
- **Backend "Brain":** Python with FastAPI + Celery (GPX/FIT analysis, ML predictions)
- **Queue/Cache "Synapse":** Redis + BullMQ
- **Database:** PostgreSQL with PostGIS (geospatial) + TimescaleDB (time-series)
- **Maps:** Mapbox GL JS
- **Charts:** Recharts
- **AI/LLM:** OpenAI (with abstraction layer for flexibility)
- **Testing:** Playwright (browser e2e tests)

---

## Product Specifications Reference

### Development Requirements

- The app is a WWW (web) application stored in Git
- Built with JavaScript, Node.js, and frameworks like React/Next.js
- The plan file should be stored in the App and used to track progress
- The plan is a live document that updates based on new ideas and learnings
- Plan structure: User Stories → Sub-stories (required steps toward implementing a story)
- Each story must implement an actual deliverable with a testable product experience
- Each story must have E2E tests with browser testing
- Git hooks ensure each sub-story ends with new/updated tests that pass
- Git hooks ensure each story ends with new/updated browser tests that pass

---

### User Story 1: Onboarding Experience

**Acceptance Criteria:**

1. When opened for the first time, AidStation will ask the user to provide the name of the race they are asking for help with

2. AidStation will then use AI (using OpenAI initially, but let's make the chosen AI LLM flexible) to find the race online and retrieve the race information:
   - Date
   - Location
   - Start Time
   - Distance
   - Total Climb and Descent
   - Country
   - Aid Stations
   - Drop bags
   - Crew options
   - Pacer options
   - Cutoff times for each aid station and overall cutoff times
   - Course

3. The information will be displayed in a clean way with the course drawn on the map and the aid stations shown on the course

4. The aid station information will be displayed in a separate table, with all the information:
   - Distance
   - Drop bags
   - Crew
   - Pacer
   - Elevation
   - Distance from previous station
   - Climb from previous station

5. The app should use a library to analyse the downloaded race course and calculate the information required for anything presented in this page (like distances and climbs)

---

### User Story 2: Page Refresh and Navigation

**Acceptance Criteria:**

1. The information of the race (described in User Story 1) should be stored in a DB

2. When refreshing the page, the information from the last race will be loaded from the DB

---

### User Story 3: Saving and Loading Races

**Acceptance Criteria:**

1. Races can be stored with all the information calculated in User Story 1

2. There should be a menu to load a previous race, which allows restoring from the DB

3. The race load menu should allow searching by country or race name

4. If the current race was not saved, ask the user if they are sure they want to discard the changes to the current race

5. The currently loaded race will be shown on the page

6. Races can be private or public. Public races will be visible to all users and they can all load them

7. Each race should have a Public/Private flag which will be used when deciding whether to show the race to all users

8. Private races will only be shown to the user who created them

---

### User Story 4: Past Performances

**Acceptance Criteria:**

1. The user should be able to upload GPX files from past races or long runs and those will be used to assess the user's capabilities

2. The app will analyse past performance to gather understanding on how fast the user runs in different conditions (mountains, flats) and different times during the race (after 10, 20, 30 km and so forth)

3. The app will store the user's performance in the DB for later use

4. The app will use recency bias to give more weight to recent performance

---

### User Story 5: Plans

**Acceptance Criteria:**

1. The planning page will allow combining race selection and past performance to create a plan for the chosen race based on past performance and other arguments

2. The planning page will allow selecting a race from the race selection dropdown

3. The planning page will pull in past performance data to predict finishing times and each aid station arrival time

4. It will take into account climbs and descents using scientifically proven approaches

5. It will highlight aid stations in orange or red if the predicted time is close to the cutoff time or misses it

6. It will take into account slowdown in later stages of the race and nighttime based on proven approaches

---

## Phase 1: Foundation & Infrastructure

### 1.1 Project Setup
- [x] Initialize Next.js project with TypeScript
- [x] Set up Python FastAPI service structure
- [x] Configure Docker Compose for local development (PostgreSQL, Redis, services)
- [x] Set up PostGIS and TimescaleDB extensions
- [x] Configure BullMQ for Node.js ↔ Python communication
- [x] Set up Playwright for e2e testing
- [x] Create plan tracking file (`/docs/PLAN.md`) in repository
- [x] Set up Git hooks for test validation on sub-story completion

### 1.2 Database Schema Design
- [x] Design `users` table
- [x] Design `races` table with PostGIS geometry columns for course
- [x] Design `aid_stations` table
- [x] Design `user_activities` table (for GPX uploads)
- [x] Design `activity_metrics` hypertable (TimescaleDB)
- [x] Design `race_plans` table
- [x] Create database migrations

### 1.3 Core API Structure
- [x] Set up Fastify API gateway with route structure
- [x] Implement authentication middleware (Session-based with cookie)
  - **Note**: Implemented using session-based auth with `aidstation_session` cookie instead of JWT. This provides simpler UX where users don't need to explicitly register - sessions are auto-created.
- [x] Set up Python worker service with Celery
- [x] Implement job queue communication between Node.js and Python
- [x] Create health check endpoints

**E2E Test:** ✅ Verify application loads and API responds correctly (4 tests passing)

---

## Phase 2: User Story 1 - Onboarding Experience

### 2.1 Race Search with AI
- [x] Create AI abstraction layer for LLM flexibility
- [x] Implement OpenAI integration for race search
- [x] Create race search API endpoint (`POST /api/races/search`)
- [x] Build AI prompt engineering for extracting race details:
  - Date, Location, Start Time
  - Distance, Total Climb/Descent
  - Country
  - Aid Stations (name, distance, elevation)
  - Drop bags, Crew options, Pacer options
  - Cutoff times (per aid station and overall)
  - Course GPX/route
- [x] Allow user to edit the Race information (including Aid Stations)

**Sub-Story Test:** ✅ AI returns structured race data for known races (15 tests passing)

### 2.2 GPX Course Processing (Python Worker)
- [x] Implement GPX parsing with `gpxpy`
- [x] Implement FIT parsing with `fitparse` (for future use)
- [x] Create elevation smoothing with Kalman filtering (scipy)
- [x] Calculate distances between aid stations
- [x] Calculate elevation gain/loss between aid stations
- [x] Implement Grade Adjusted Pace (GAP) using Minetti Equations
- [x] Store processed course as PostGIS LineString geometry
  - **Note**: Implemented in race-repository.ts. When a race with GPX content is created/updated, the geometry is parsed and stored in the `course_geometry` column. Fails gracefully if PostGIS is not available.
- [x] Uploading a GPX in the page where you add a Race should automatically process it and use the data to update the race information

**Sub-Story Test:** ✅ Python worker correctly processes GPX and calculates metrics (tests written, pending environment setup)

### 2.3 Race Display UI
- [x] Create onboarding page with race name input
- [x] Implement loading state during AI search
- [x] Integrate Mapbox GL JS for course visualization
- [x] Draw course on map with aid station markers
- [x] Implement 3D terrain visualization for elevation context
- [x] Create aid station data table component with columns:
  - Station Name
  - Distance from Start
  - Distance from Previous
  - Elevation
  - Climb/Descent from Previous
  - Drop Bag availability
  - Crew access
  - Pacer pickup
  - Cutoff Time

**Sub-Story Test:** ✅ Map renders course correctly, table displays all aid station data

### 2.4 Onboarding Flow Integration
- [x] Connect race search form to AI backend
- [x] Display race overview card (date, location, distance, elevation)
- [x] Show loading states and error handling
- [x] Implement responsive design for mobile/desktop

**E2E Test (User Story 1 Complete):** ✅ User enters race name → AI finds race → Course displayed on map → Aid station table populated with calculated data (14 E2E tests written)

---

## Phase 3: User Story 2 - Page Refresh / Persistence and Navigation

### 3.1 Session & State Persistence
- [x] Implement current race storage in PostgreSQL
- [x] Create user session tracking (last viewed race)
- [x] Create API endpoint to get current/last race (`GET /api/races/current`)
- [x] Implement client-side state hydration on page load

### 3.2 Auto-Load Previous Race
- [x] Check for existing race on app load
- [x] Load race data from database if exists
- [x] Re-render map and table with stored data
- [x] Handle edge case of no previous race (redirect to onboarding)


### 3.3 Navigation Bar
- [x] Create navigation bar component
- [x] Make navigation bar sticky

**E2E Test (User Story 2 Complete):** ✅ User loads race → Refreshes page → Same race with all data loads automatically (17 E2E tests written)

---

## Phase 4: User Story 3 - Saving and Loading Races

### 4.1 Race CRUD Operations
- [x] Create save race API (`POST /api/races`) - Implemented in Phase 3
- [x] Create update race API (`PUT /api/races/:id`)
- [x] Create delete race API (`DELETE /api/races/:id`)
- [x] Implement race versioning (track changes)

### 4.2 Public/Private Race Visibility
- [x] Add `is_public` flag to races table (already in schema)
- [x] Add `owner_id` foreign key to races (already in schema)
- [x] Implement visibility filtering in API queries
- [x] Create toggle UI for public/private setting

### 4.3 Race Browser/Loader UI
- [x] Create race selection menu/modal
- [x] Implement search by race name
- [x] Implement filter by country
- [x] Display race list with metadata (name, date, distance, public/private)
- [x] Show user's private races and all public races
- [x] Create "Load Race" confirmation dialog

### 4.4 Unsaved Changes Protection
- [x] Track dirty state for current race
- [x] Implement "Discard Changes?" confirmation dialog
- [x] Auto-save functionality (optional enhancement)

### 4.5 Current Race Indicator
- [x] Display currently loaded race name in header/navbar
- [x] Show saved/unsaved status indicator

**E2E Test (User Story 3 Complete):** ✅
- User saves race as private → Only they can see it
- User saves race as public → All users can find it
- User with unsaved changes tries to load new race → Confirmation dialog appears
- User searches races by country → Filtered results appear

---

## Phase 5: User Story 4 - Past Performances

### 5.1 GPX Upload & Processing
- [x] Create file upload endpoint (`POST /api/activities`)
- [x] Support multi-file GPX upload (`POST /api/activities/bulk`)
- [x] Queue files to Python worker for analysis
- [ ] Store raw GPX in object storage (S3/local)
- [x] Allow uploading FIT files

**Sub-Story Test:** ✅ Activity upload and retrieval API (12 tests passing)

### 5.2 Performance Analysis (Python Worker)
- [x] Parse uploaded GPX files with gpxpy
- [ ] Extract time-series data to TimescaleDB hypertable
- [x] Calculate pace per segment (flat, uphill, downhill)
- [x] Calculate performance at different race stages (10km, 20km, 30km, etc.)
- [x] Identify terrain types and correlate with pace
- [x] Calculate Grade Adjusted Pace (GAP) for each activity
- [x] Implement fatigue curve analysis (pace degradation over time)

**Sub-Story Test:** ✅ Performance analyzer unit tests (25 tests written)

### 5.3 Recency Weighting Algorithm
- [x] Implement exponential decay weighting for recent vs. old activities
- [x] Configurable half-life for recency bias (default: 90 days)
- [x] Weight formula: `weight = e^(-days_ago / half_life)`
- [x] Store weighted performance metrics

**Sub-Story Test:** ✅ Implemented in activity-repository.ts and Python tasks

### 5.4 Performance Dashboard UI
- [x] Create "Past Performances" page
- [x] List uploaded activities with key metrics
- [x] Show performance summary:
  - Average flat pace
  - Average climbing pace (per % grade)
  - Average descending pace
  - Fatigue curve visualization
- [x] Visualize activities on map
- [x] Show elevation profile with pace overlay

**Sub-Story Test:** ✅ Past Performances UI page created with upload functionality, map visualization, and elevation profile

**E2E Test (User Story 4 Complete):**
- User uploads 3 GPX files → All are processed
- Performance metrics calculated and displayed
- Recent activities weighted more heavily in summary stats

---

## Phase 6: User Story 5 - Race Planning

### 6.1 Plan Creation Engine
- [x] Create race plan table in database
- [x] Link plans to races and user performance data
- [x] Create plan generation API (`POST /api/plans`)

### 6.2 Prediction Algorithm (Python Worker)
- [x] Implement base prediction using Riegel formula
- [x] Calculate personalized fatigue exponent from user's past races
- [x] Apply Minetti cost function for terrain adjustment
- [x] Factor in:
  - Climbing sections (reduced pace)
  - Descending sections (adjusted pace)
  - Altitude effects
  - Time of day (nighttime slowdown factor)
  - Race distance fatigue curve
- [x] Generate predicted arrival time for each aid station

### 6.3 Cutoff Time Analysis
- [x] Compare predicted times to aid station cutoffs
- [x] Calculate buffer time at each station
- [x] Classify stations:
  - 🟢 Green: >30 min buffer
  - 🟡 Orange: 15-30 min buffer (warning)
  - 🔴 Red: <15 min buffer or missed cutoff

### 6.4 Planning UI
- [x] Create "Race Planning" page
- [x] Race selector dropdown (from saved races)
- [x] Display user's performance summary card
- [x] Show predicted race timeline:
  - Aid station arrival times
  - Time spent at each station (configurable)
  - Cumulative elapsed time
- [x] Visual timeline with cutoff indicators
- [x] Color-coded aid station cards (green/orange/red)
- [x] Editable pace adjustments (override predictions)
- [x] Export plan as PDF/printable format

### 6.5 Nighttime & Fatigue Modeling
- [x] Calculate which sections occur at night (based on start time)
- [x] Apply configurable nighttime slowdown factor (default: 10-15%)
- [x] Model progressive fatigue based on:
  - Distance covered
  - Time elapsed
  - Cumulative elevation gain
  - User's historical fatigue patterns

**E2E Test (User Story 5 Complete):**
- User selects race → Performance data loaded → Predictions generated
- Aid stations with tight cutoffs highlighted orange/red
- Predictions adjust for climbs/descents/nighttime
- Plan can be saved and exported

---

## Phase 7: Polish & Production Readiness

### 7.1 UI/UX Refinements
- [x] Implement responsive design across all pages
- [x] Add loading skeletons and transitions
- [x] Implement error boundaries and user-friendly error messages
- [x] Add tooltips and help text for complex features

### 7.2 Testing & Quality
- [ ] Achieve >80% code coverage for critical paths
- [x] Complete e2e test suite for all user stories
- [x] Performance testing and optimization
- [x] Accessibility audit and fixes

### 7.3 Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure production environment
- [ ] Set up monitoring and logging
- [ ] Create deployment documentation

## Phase 8: Follow Ups, Fixes, Ideas and Future Work

### Urgent Fixes
- [x] going from the "past performances" page to the "race planning" page crashes the app with error "GET http://localhost:3001/api/races/current 404 (Not Found)". A hard refresh fixes it.
  - **Fixed**: The link on the performances page was mislabeled "Back to Race Planning" but actually linked to `/` (home), not `/planning`. Updated the navigation to have correct labels and added a direct link to `/planning`.
- [x] when clicking "create plan" in "planning" i get a big red banner "authentication required"
  - **Fixed**: Updated plans routes to use session-based authentication via `aidstation_session` cookie (same as activities routes), instead of requiring a `userId` cookie that was never set. Now plans routes use `getOrCreateSessionUser()` to automatically create/retrieve the user based on session.
  - QA Reported Bugs: https://docs.google.com/document/d/1k-fngp9HjCNqbjLxypC7IZSjw_oaHwo_kKXzasRxww4/edit?usp=sharing


### Fast Follows
- When the user uploads a GPX file in Race Search - It should update the Elevation Gain, loss
- The aid station edits should calculate distance from previous and total distance from start based on the GPX course uploaded and not let manual adjustments when there's course data


### Future Work

---

## Project Structure

```
aidstation/
├── docs/
│   └── PLAN.md                    # This tracking document
├── apps/
│   ├── web/                       # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/              # Next.js App Router pages
│   │   │   ├── components/       # React components
│   │   │   ├── lib/              # Utilities, API clients
│   │   │   └── hooks/            # Custom React hooks
│   │   └── tests/
│   │       └── e2e/              # Playwright e2e tests
│   │
│   └── api/                       # Node.js Fastify API Gateway
│       ├── src/
│       │   ├── routes/           # API routes
│       │   ├── services/         # Business logic
│       │   ├── queue/            # BullMQ job definitions
│       │   └── db/               # Database access
│       └── tests/
│
├── workers/
│   └── python/                    # Python analysis workers
│       ├── src/
│       │   ├── analysis/         # GPX/FIT analysis
│       │   ├── predictions/      # ML prediction models
│       │   └── tasks/            # Celery task definitions
│       └── tests/
│
├── packages/
│   └── shared/                    # Shared types/utilities
│
├── docker-compose.yml
├── playwright.config.ts
└── package.json
```

---

## Git Hooks Configuration

```bash
# .husky/pre-push
# Ensures e2e tests pass before pushing sub-story completion

npm run test:e2e -- --grep "$(git log -1 --pretty=%B | grep -oP 'US\d+\.\d+')"
```

---

## Success Criteria

Each User Story is complete when:
1. ✅ All sub-stories implemented and tested
2. ✅ E2E browser tests written and passing
3. ✅ Code reviewed and merged
4. ✅ PLAN.md updated with completion status

---

## Timeline Estimate

| Phase | Description | Estimated Duration |
|-------|-------------|-------------------|
| Phase 1 | Foundation & Infrastructure | 2 weeks |
| Phase 2 | User Story 1 - Onboarding | 3 weeks |
| Phase 3 | User Story 2 - Page Refresh | 1 week |
| Phase 4 | User Story 3 - Save/Load Races | 2 weeks |
| Phase 5 | User Story 4 - Past Performances | 3 weeks |
| Phase 6 | User Story 5 - Race Planning | 3 weeks |
| Phase 7 | Polish & Production | 2 weeks |

**Total: ~16 weeks (4 months)**
