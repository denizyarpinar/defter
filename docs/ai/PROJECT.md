# Defter

PWA: a virtual bookshelf in a realistic 3D study room. PDFs and notebook notes appear as books on shelves.

## Product
- Hosted on Vercel. Files live in the user's Google Drive; the app is a catalog/reader on top of Drive. Login with Google.
- Works on iPad (main), phone and Windows laptop. Must not depend on the laptop.
- Two languages: English (default) and Turkish (switch button).
- Goal: public use. Friends and GitHub visitors sign in with Google; folders are set up automatically on first login. Also a portfolio project.
- Goal/current distinction: the current code offers a setup button after login; only pressing it creates the folders (`src/main.ts`: `loadFromDrive`, `kitaplikKurDugmesi`; `src/drive/kurulum.ts`: `kitaplikKur`). Automatic creation on login is a product goal, not current behavior or permission to change it.

## Content structure
Book > Units > Topic. Each topic: original PDF, summary PDF (questions inside), Übungen + solutions, Ödevler + solutions. Reader shows tabs per topic.
The data model is `kitap.json` with units and topics; materials are discovered in the topic's Drive folder rather than listed in the version 2 JSON (`src/model/types.ts`, `src/okuma/konuKesfi.ts`).

## Look
Realistic 3D room (baked Blender lighting), dark walnut 5-shelf bookcase, selected book animates to the desk. Automatic evening mode after 18:00.
The outer bookcase size stays at five shelves; the actual shelf count is configurable from two to six. Automatic evening mode runs 18:00–06:00 in device local time (`src/scene/bookcase.ts`, `src/model/types.ts`, `src/main.ts`).

## Stack
- Vite + TypeScript, native DOM, no UI framework (`package.json`, `index.html`, `src/main.ts`, `tsconfig.json`).
- Three.js / WebGL, Blender-generated room models and day/evening lightmaps (`package.json`, `src/scene/renderer.ts`, `src/scene/bakedRoom.ts`, `blender/bake.py`).
- PDF.js for reading; pdf-lib for PDF edits; perfect-freehand for pen strokes (`package.json`, `src/okuma/pdf.ts`, `src/kalem/pdfNotlari.ts`, `src/kalem/cizgiSekli.ts`).
- Google Identity Services token client; Drive REST API v3; normally drive.file, owner mode can request full drive scope; tokens stay in memory and this tab's sessionStorage until expiry, never localStorage (6.6-5b; `src/drive/auth.ts`, `src/drive/kapsam.ts`, `src/drive/drive.ts`).
- Vercel serves the Vite build; the OCR function `/api/oku` verifies the owner and calls Anthropic. The app is not entirely static (`vercel.json`, `api/oku.ts`, `src/ocr/claudeMotor.ts`).
- Installable manifest; local PDF cache in IndexedDB (`public/manifest.webmanifest`, `src/okuma/pdfOnbellek.ts`). Full offline operation is not verified.
