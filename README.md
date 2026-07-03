# 9Router v2

This is the next-generation split architecture for 9Router, separating the monolith into a dedicated Express backend and a Vite React frontend.

## Architecture

- **Backend**: Express server running on port `3001` (by default). Features an auto-router that maps the `src/routes/` directory to Express endpoints.
- **Frontend**: Vite + React SPA running on port `5177` (by default). Uses React Router for client-side navigation.

## Development

The repository is configured as a monorepo using npm workspaces.

### Install Dependencies
```bash
npm install
```

### Start Development Servers
Run both backend and frontend concurrently:
```bash
npm run dev
```

### Environment Variables
Check `backend/.env.template` for backend configuration options.

## Production Deployment

1. **Build Frontend**:
   ```bash
   cd frontend
   npm run build
   ```
2. **Start Backend**:
   ```bash
   cd backend
   npm run start
   ```
3. **Reverse Proxy (Nginx)**:
   Use the provided `nginx.conf` template to proxy requests to the backend (`/api`, `/v1`) and serve the built frontend statically.
