# DJ Light Templates - PRD

## Overview
Native-feel mobile marketplace for downloading DJ Light and Avee visual templates. Dark, neon-lime nightclub aesthetic. Read-only for end users (no accounts); a single admin uploads/publishes templates.

## Stack
- Frontend: Expo (expo-router) + React Native, Reanimated, expo-image, expo-blur, expo-linear-gradient
- Backend: FastAPI + Motor (async MongoDB), JWT admin auth (python-jose, passlib[bcrypt])
- Storage: Templates stored in MongoDB with thumbnail + file as base64

## Core Features
1. **Home** - 2-column grid of templates, Free/Premium filter chips, sticky neon header.
2. **Template Detail** - hero image, title, badge, price (if premium), description, file size, sticky Download CTA with progress.
3. **Downloads** - Base64 file fetched from API, decoded with expo-file-system, shared/saved via expo-sharing (Save to Downloads via system sheet).
4. **Settings** - Privacy Policy, Contact, About, Admin entry.
5. **Admin Login** - Email/password JWT login (seeded admin at startup).
6. **Admin Dashboard** - list of templates with delete.
7. **Admin Upload** - title, type (free/premium), price, description, thumbnail picker, template file picker, Publish.
8. **Notifications** - in-app banner; on Home open, new published templates trigger an inbox banner (polled via `/api/notifications`).

## Admin
- Email: `admin@djlights.com` / Password: `Admin@123` (configurable via backend `.env`).

## API
- Public: `/api/templates`, `/api/templates/{id}`, `/api/templates/{id}/file`, `/api/notifications`
- Admin: `/api/admin/login`, `/api/admin/me`, `/api/admin/templates` (GET/POST), `/api/admin/templates/{id}` (DELETE)

## Design
See `/app/design_guidelines.json` - "6 Glass / Luxe" personality, neon lime `#c4fb6d` on obsidian `#0a0a0a`.
