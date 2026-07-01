# adv-ride-planner — fullstack build (reverse-engineered from reference app)

# Scope:        Build a fullstack ADV motorcycle ride planner — FastAPI + SQLModel + SQLite
#               backend, React 19 + Vite + React Router + Leaflet + Tailwind v4 frontend.
# Dependencies: Base scaffold present (Vite react-ts frontend, FastAPI backend skeleton) with
#               ALL npm + python deps pre-installed (agents run offline in Docker — see runbook).
# Gate:         `cd backend && uv run pytest` green AND `cd frontend && pnpm build` green.
# Notes:        Domain = adventure rides with ordered waypoints (7 types). No external API keys:
#               maps use OpenStreetMap tiles, persistence is local SQLite.

## T1: Backend data layer — SQLModel models, schemas, and database engine
- STATUS: pending
- FILES: backend/src/__init__.py, backend/src/database.py, backend/src/models/__init__.py, backend/src/models/ride.py
- VERIFY: cd backend && uv run python -c "from src.models.ride import Ride, Waypoint, WaypointType, RideCreateWithWaypoints, RideOut, RideListItem" && uv run python -c "from src.database import engine, get_session, create_db_and_tables"
- PUSH: auto
- SPEC: Build the persistence layer using SQLModel over SQLite.

  REQUIREMENTS for backend/src/models/ride.py:
  - `WaypointType` — a `str, Enum` with members: START, STOP, END, SCENIC, FUEL, FOOD, HOTEL
    (lowercase string values: "start", "stop", ... "hotel").
  - `Waypoint(SQLModel, table=True)` with `__tablename__ = "waypoints"`:
    - id: Optional[int] primary key
    - ride_id: int, foreign_key="rides.id"
    - name: str (max_length 100)
    - description: Optional[str] (max_length 500)
    - latitude: float (required), longitude: float (required)
    - waypoint_type: WaypointType
    - order_index: int (ge=0) — defines sequence within a ride
    - created_at: datetime, default now (UTC)
    - ride: Optional["Ride"] relationship, back_populates="waypoints"
  - `Ride(SQLModel, table=True)` with `__tablename__ = "rides"`:
    - id: Optional[int] primary key
    - name: str (max_length 100)
    - description: Optional[str] (max_length 1000)
    - start_latitude: Optional[float], start_longitude: Optional[float]
    - total_distance_km: Optional[float] (ge=0)
    - is_public: bool (default True)
    - created_at / updated_at: datetime, default now (UTC)
    - waypoints: List[Waypoint] relationship, back_populates="ride"
  - Schemas (plain SQLModel/pydantic, NOT tables):
    - `WaypointCreate`: name, description?, latitude, longitude, waypoint_type, order_index? (order assigned from list position if omitted)
    - `WaypointOut`: id, ride_id, name, description, latitude, longitude, waypoint_type, order_index, created_at
    - `RideCreateWithWaypoints`: name, description?, start_latitude?, start_longitude?, total_distance_km?, is_public=True, waypoints: List[WaypointCreate]
    - `RideOut`: all ride fields + waypoints: List[WaypointOut]
    - `RideListItem`: all ride fields + waypoint_count: int (NO waypoints array)

  REQUIREMENTS for backend/src/database.py:
  - Create a SQLite engine at `sqlite:///./rideplanner.db` (check_same_thread=False).
  - `def get_session()` — yields a SQLModel Session (FastAPI dependency style).
  - `def create_db_and_tables()` — SQLModel.metadata.create_all(engine).

  REQUIREMENTS for the __init__.py files: empty package markers.

## T2: Backend API — service layer, routes, and FastAPI app
- STATUS: pending
- FILES: backend/src/services/__init__.py, backend/src/services/ride_service.py, backend/src/routes/__init__.py, backend/src/routes/rides.py, backend/src/main.py, backend/main.py
- VERIFY: cd backend && uv run python -c "from src.main import app; paths={r.path for r in app.routes}; assert '/api/rides/' in paths and '/api/rides/{ride_id}' in paths, sorted(paths)"
- PUSH: auto
- SPEC: Build the service layer, REST routes, and the FastAPI application.

  REQUIREMENTS for backend/src/services/ride_service.py — functions taking a Session:
  - create_ride(session, data: RideCreateWithWaypoints) -> Ride: insert ride; create waypoints
    with order_index assigned from list position; commit; return ride with waypoints.
  - list_rides(session) -> list: all rides ordered by updated_at DESC, each with waypoint_count.
  - get_ride(session, ride_id) -> Ride | None: ride with waypoints ordered by order_index ASC.
  - update_ride(session, ride_id, data) -> Ride | None: update all ride fields; REPLACE strategy —
    delete all existing waypoints and insert the new list (order_index from position); bump updated_at.
  - delete_ride(session, ride_id) -> bool: cascade-delete waypoints then the ride; False if missing.

  REQUIREMENTS for backend/src/routes/rides.py — APIRouter(prefix="/api/rides", tags=["rides"]):
  - GET  "/health" -> {"status": "ok"}
  - POST "/"            status_code 201, body RideCreateWithWaypoints -> RideOut
  - GET  "/"           -> List[RideListItem]
  - GET  "/{ride_id}"  -> RideOut, 404 if not found
  - PUT  "/{ride_id}"   body RideCreateWithWaypoints -> RideOut, 404 if not found
  - DELETE "/{ride_id}" status_code 204, 404 if not found
  - Use the get_session dependency; convert ORM objects to the *Out schemas in responses.

  REQUIREMENTS for backend/src/main.py:
  - Create FastAPI app; add CORSMiddleware allow_origins=["http://localhost:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"].
  - Call create_db_and_tables() on startup.
  - Include the rides router.
  - GET "/" -> {"message": "ADV Ride Planner API"}.

  REQUIREMENTS for backend/main.py: thin entry that re-exports `app` from src.main
  (so `uvicorn main:app` and `uvicorn src.main:app` both work).

## T3: Backend tests + seed data
- STATUS: pending
- FILES: backend/tests/__init__.py, backend/tests/test_rides.py, backend/scripts/seed.py
- VERIFY: cd backend && uv run pytest -q
- PUSH: auto
- SPEC: Add a comprehensive test suite and a realistic seed script.

  REQUIREMENTS for backend/tests/test_rides.py:
  - Use FastAPI TestClient with an in-memory SQLite engine (StaticPool) overriding get_session,
    so tests are isolated and never touch rideplanner.db.
  - Cover at minimum: create ride (201, 3 waypoints), get ride (fields + waypoint ordering),
    list rides (counts), update ride (waypoint replacement), delete ride (204 then 404),
    get/put/delete nonexistent -> 404. (8 tests total.)

  REQUIREMENTS for backend/scripts/seed.py:
  - Standalone script (`uv run python scripts/seed.py`) that creates tables and inserts 3
    European ADV rides via the service layer, each with 5-6 ordered waypoints and realistic
    lat/lon + waypoint_type values:
      1. "Stelvio Pass Loop" (~280 km, Italian Alps, start ~46.4683,10.3708)
      2. "Swiss Gravel Explorer" (~120 km, Swiss Alps, start ~46.6863,7.8632)
      3. "Black Forest Offroad" (~190 km, Germany, start ~47.9990,7.8421)
  - Idempotent enough to re-run for a demo (safe to clear+reinsert).

## T4: Frontend foundation — app shell, router, API client, types, styles
- STATUS: pending
- FILES: frontend/src/main.tsx, frontend/src/App.tsx, frontend/src/style.css, frontend/src/types.ts, frontend/src/api.ts, frontend/vite.config.ts, frontend/index.html
- VERIFY: cd frontend && pnpm build
- PUSH: auto
- SPEC: Establish the React app shell, routing, typed API client, and Tailwind + Leaflet styling.

  REQUIREMENTS for frontend/src/types.ts:
  - TypeScript interfaces mirroring the backend: `WaypointType` union
    ("start"|"stop"|"end"|"scenic"|"fuel"|"food"|"hotel"), `Waypoint`, `Ride` (with waypoints),
    `RideListItem` (with waypoint_count), `WaypointCreate`, `RideCreateWithWaypoints`.

  REQUIREMENTS for frontend/src/api.ts:
  - `const API_BASE = "http://localhost:8000/api/rides"`.
  - Typed fetch helpers: listRides(), getRide(id), createRide(payload), updateRide(id, payload),
    deleteRide(id). Throw on non-2xx with the backend `detail` message.

  REQUIREMENTS for frontend/src/App.tsx:
  - Top nav bar: logo/title ("ADV Ride Planner") linking to "/", plus a "Plan Ride" CTA -> "/ride/new".
  - React Router (react-router-dom v7) with routes:
      "/" -> RideListPage, "/ride/new" -> RideEditorPage, "/ride/:id" -> RideDetailPage,
      "/ride/:id/edit" -> RideEditorPage.

  REQUIREMENTS for frontend/src/main.tsx:
  - Bootstrap React 19 root, wrap App in <BrowserRouter>, import "./style.css".
  - Apply the standard Leaflet default-marker-icon fix (import marker images, set L.Icon.Default).

  REQUIREMENTS for frontend/src/style.css: `@import "tailwindcss";` and `@import "leaflet/dist/leaflet.css";`.

  REQUIREMENTS for frontend/vite.config.ts:
  - plugins: react() + the Tailwind v4 Vite plugin.
  - server.proxy: "/api" -> http://localhost:8000 (changeOrigin true).

  Dark theme baseline (Tailwind utilities): gray-950 bg, gray-900 cards, amber-600 accents,
  blue-400 links. Keep it responsive.

## T5: Frontend — ride list page + ride card
- STATUS: pending
- FILES: frontend/src/pages/RideListPage.tsx, frontend/src/components/RideCard.tsx
- VERIFY: cd frontend && pnpm build && grep -q "waypoint_count" src/components/RideCard.tsx
- PUSH: auto
- SPEC: Build the landing list view.

  REQUIREMENTS for RideListPage.tsx ("/"):
  - On mount, listRides(); manage [rides, loading, error] state. Spinner while loading,
    error state with a Retry button, empty-state hero prompting "Plan Your First Ride" -> /ride/new.
  - Responsive grid of <RideCard>: 1 col mobile, 2 tablet, 3 desktop.

  REQUIREMENTS for RideCard.tsx (props: ride: RideListItem):
  - Whole card is a <Link> to `/ride/${id}`; hover ring/border shift.
  - Show name, description (2-line clamp), distance (km), waypoint count, relative created time
    ("3 days ago" via a small helper).
  - Derived badges:
      terrain — waypoint_count <=5 "Road", 6-10 "Mixed", >10 "Mountain".
      difficulty — based on distance + waypoints (e.g. >=300 km or >15 wp -> "Hard", mid -> "Medium", else "Easy").
      est. time — total_distance_km / 50 (km/h) rounded to a sensible "Xh Ym".

## T6: Frontend — ride detail page, stats, and Leaflet route map
- STATUS: pending
- FILES: frontend/src/pages/RideDetailPage.tsx, frontend/src/components/RideStats.tsx, frontend/src/components/RouteMap.tsx
- VERIFY: cd frontend && pnpm build && grep -q "react-leaflet" src/components/RouteMap.tsx
- PUSH: auto
- SPEC: Build the read-only ride detail experience with a real map.

  REQUIREMENTS for RouteMap.tsx (props: waypoints, onMapClick?, selectedIndex?):
  - react-leaflet <MapContainer> with OpenStreetMap <TileLayer> (no API key).
  - Center on first waypoint, else Europe (46.8, 8.2); zoom 10 with waypoints else 7.
  - Custom circular DIV markers colored by type: start=green, end=red, fuel=orange,
    food/stop=blue, scenic=purple, hotel=yellow.
  - Dashed blue <Polyline> connecting waypoints in order.
  - If onMapClick provided, add waypoints on map click (used by the editor).
  - A small MapController child that pans to selectedIndex when it changes.

  REQUIREMENTS for RideStats.tsx (props: ride: RideOut):
  - 6-stat grid: terrain, difficulty, distance (km), est. time, waypoint count, created date.

  REQUIREMENTS for RideDetailPage.tsx ("/ride/:id"):
  - getRide(id) with loading/error/404 handling (404 -> friendly "ride not found").
  - Header with back link + name + description; <RideStats>; non-interactive <RouteMap> (~500px);
    a waypoint table (index, name, type badge, coordinates, notes).
  - "Edit Ride" -> /ride/:id/edit and "Delete Ride" with a confirm modal -> deleteRide then navigate "/".

## T7: Frontend — ride editor + editable waypoint list
- STATUS: pending
- FILES: frontend/src/pages/RideEditorPage.tsx, frontend/src/components/WaypointList.tsx
- VERIFY: cd frontend && pnpm build && grep -q "createRide\|updateRide" src/pages/RideEditorPage.tsx
- PUSH: auto
- SPEC: Build create/edit, the interactive part of the app.

  REQUIREMENTS for RideEditorPage.tsx ("/ride/new" and "/ride/:id/edit"):
  - If :id present, getRide(id) to prefill; else blank form.
  - Left panel: ride form — name (required), total_distance_km, description, is_public toggle.
  - Right panel: interactive <RouteMap onMapClick=...> (click adds a waypoint at clicked lat/lon)
    and <WaypointList> for editing the list.
  - On save: derive start_latitude/longitude from the first waypoint, build RideCreateWithWaypoints,
    createRide() (new) or updateRide(id) (edit), then navigate to the detail page. Disable button while saving.

  REQUIREMENTS for WaypointList.tsx (props: waypoints, onUpdate?, onDelete?, onReorder?):
  - Empty state "Click map to add waypoints".
  - Per waypoint: editable name, type dropdown (7 types), description, read-only coordinates (4 dp).
  - Reorder up/down arrows (disabled at boundaries) re-assigning order_index; red delete that re-indexes.
  - Scrollable (max-height ~384px).
