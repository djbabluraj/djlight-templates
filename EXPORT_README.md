# DJ Light Templates — Source Export

Generated: $(date -u)
Exported from: Emergent sandbox

## Contents
- backend/  — FastAPI server (server.py, requirements.txt, tests/)
- frontend/ — Expo Router app (app/, src/, app.json, eas.json, package.json)
- design_guidelines.json
- README.md

## What is intentionally NOT included (for security)
- backend/.env       (real secrets — see backend/.env.example instead)
- frontend/.env      (real backend URL — see frontend/.env.example instead)
- node_modules/      (run `yarn install` inside frontend/)
- .git/              (history; you can re-init or import to your own repo)
- .expo/, build/, dist/  (regenerable build artifacts)

## How to run locally
### Backend
    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # fill in real values
    uvicorn server:app --host 0.0.0.0 --port 8001 --reload

### Frontend (Expo)
    cd frontend
    yarn install
    cp .env.example .env   # set EXPO_PUBLIC_BACKEND_URL
    yarn start             # then scan QR with Expo Go or build via EAS

## Database restore
The companion file `djlight_db-backup-*.tar.gz` is a `mongodump` archive.
    tar -xzf djlight_db-backup-*.tar.gz
    mongorestore --uri='<your-mongo-uri>' mongo_export/

