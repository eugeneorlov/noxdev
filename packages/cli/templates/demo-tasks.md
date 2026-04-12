# noxdev demo — fullstack React + FastAPI scaffold

# This is a demo task spec for a fullstack React + FastAPI application.
# It transforms a basic fullstack scaffold into a working todo app with
# frontend-backend communication, built entirely by an autonomous agent.
#
# Estimated runtime: 4-5 minutes total
# Gate: cd frontend && pnpm build && cd ../backend && python -m pytest must pass

## T1: Create FastAPI backend with todos endpoint
- STATUS: pending
- FILES: backend/main.py, backend/pyproject.toml, backend/test_main.py
- VERIFY: cd backend && uv sync && uv run python -c "import main" && grep -q "todos" main.py
- CRITIC: skip
- PUSH: auto
- SPEC: Create a FastAPI backend that serves a todos API.

  REQUIREMENTS for backend/main.py:
  - Import FastAPI, create app instance
  - Add CORS middleware to allow frontend on localhost:5173
  - Create an in-memory todos list with sample data:
    [{"id": 1, "text": "Learn noxdev", "completed": False}]
  - Implement GET /api/todos endpoint that returns the todos list
  - Implement POST /api/todos endpoint that accepts {"text": string}
    and adds a new todo with incremented ID
  - Implement PATCH /api/todos/{todo_id} endpoint that toggles completed status
  - Add proper type hints using Pydantic BaseModel for request/response
  - Include proper error handling for 404s

  REQUIREMENTS for backend/pyproject.toml:
  - Use uv's pyproject.toml format
  - [project] section with name="backend", version="0.1.0", requires-python=">=3.12"
  - dependencies list:
    - "fastapi>=0.104.0"
    - "uvicorn[standard]>=0.24.0"
    - "httpx>=0.25.0"
  - [dependency-groups] section with dev = ["pytest>=7.4.0"]
  - A pyproject.toml may already exist from the demo scaffold with fastapi and uvicorn deps — extend it, do not overwrite blindly
  - Run `uv sync` after editing to regenerate the lockfile

  REQUIREMENTS for backend/test_main.py:
  - Import pytest, httpx, and main.py app
  - Create TestClient instance
  - Test GET /api/todos returns initial todo
  - Test POST /api/todos creates new todo
  - Test PATCH /api/todos/{id} toggles completion

## T2: Build React frontend with todo interface
- STATUS: pending
- FILES: frontend/src/App.tsx, frontend/src/App.css, frontend/package.json
- VERIFY: cd frontend && pnpm build && grep -q "localhost:8000" src/App.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: Create a React frontend that communicates with the FastAPI backend.

  REQUIREMENTS for frontend/src/App.tsx:
  - Replace default Vite content completely
  - Use useState and useEffect hooks for state management
  - Create interface for Todo: {id: number, text: string, completed: boolean}
  - Fetch todos from http://localhost:8000/api/todos on component mount
  - Render todos list with checkboxes to toggle completion
  - Add input form to create new todos via POST to backend
  - Include error handling for network requests
  - Use proper TypeScript types throughout
  - Style with CSS classes: app-container, todo-list, todo-item, add-form

  REQUIREMENTS for frontend/src/App.css:
  - Dark theme with CSS variables:
    --bg: #0a0a12, --surface: #1a1a2e, --text: #e4e4ef
    --primary: #4a9eff, --success: #4caf50, --border: #2a2a3e
  - .app-container: max-width 600px, margin 0 auto, padding 24px
  - .todo-item: flex layout, padding 12px, border-radius 8px, margin 8px 0
  - .add-form: flex input and button, margin 24px 0
  - Responsive design, clean typography

  REQUIREMENTS for frontend/package.json:
  - Add proxy field: "proxy": "http://localhost:8000"
  - Ensure dev script starts on port 5173

## T3: Add development scripts and documentation
- STATUS: pending
- FILES: package.json, README.md, backend/.env.example
- VERIFY: grep -q "dev:frontend" package.json && grep -q "fullstack" README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Add workspace scripts and comprehensive documentation.

  REQUIREMENTS for package.json (root):
  - Create workspace with "workspaces": ["frontend", "backend"]
  - Add scripts:
    - "dev:frontend": "cd frontend && pnpm dev"
    - "dev:backend": "cd backend && uv run uvicorn main:app --reload --port 8000"
    - "dev": "concurrently \"pnpm dev:backend\" \"pnpm dev:frontend\""
    - "build:frontend": "cd frontend && pnpm build"
    - "test:backend": "cd backend && uv run pytest"
    - "test": "pnpm test:backend && pnpm build:frontend"
  - Add concurrently to devDependencies

  REQUIREMENTS for README.md:
  - Replace entire content with fullstack project documentation
  - Include "noxdev demo - fullstack" title
  - Explain what noxdev built: React frontend + FastAPI backend todo app
  - Include setup instructions for both frontend and backend
  - Document the API endpoints
  - Include development workflow with pnpm commands
  - Mention this was built autonomously by noxdev

  REQUIREMENTS for backend/.env.example:
  - Add example environment variables
  - DATABASE_URL=sqlite:///./todos.db
  - API_PORT=8000
  - CORS_ORIGINS=http://localhost:5173
