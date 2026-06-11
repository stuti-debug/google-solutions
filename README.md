# CrisisGrid: AI-Powered Resilience for Disaster Relief

**Revolutionizing Humanitarian Data Management with Google Gemini AI**

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google-Solution%20Challenge%202026-blue)](https://developers.google.com/community/solutions-challenge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Problem Statement
In the wake of a disaster, every second counts. However, relief organizations are often paralyzed by **Data Chaos**. NGOs receive crucial information (beneficiary lists, supply inventories, donor logs) from dozens of field teams, each using different spreadsheet formats, inconsistent naming conventions, and messy, duplicate entries.

Manually cleaning and unifying this data can take days—days that the most vulnerable populations don't have. **CrisisGrid** solves this by leveraging Google's Gemini AI to automatically clean, standardize, and unify disparate disaster relief datasets in seconds.

---

## 🌍 UN Sustainable Development Goals (SDGs)
CrisisGrid is built to address the core objectives of the Google Solution Challenge by focusing on:

*   **SDG 1: No Poverty** – By ensuring that aid reaches the right people without administrative delay, we help prevent vulnerable populations from falling deeper into poverty during crises.
*   **SDG 11: Sustainable Cities and Communities** – We enhance urban resilience by providing city planners and disaster response teams with accurate, real-time data to manage resources and infrastructure during emergencies.

---

## 🚀 Live Demo
**Check out the live application here:** [Live Demo URL](https://crisisgrid-demo.vercel.app)

---

## 🔥 Impact / Real-World Use Case
Imagine an NGO responding to a major flood. They receive:
1.  A "Field_List.csv" from Team A with columns like `name_of_person` and `loc`.
2.  An "Inventory.xlsx" from Team B with `item_qty` and `wh_location`.
3.  A "Donors.csv" from a global partner with `Amount_USD` and `Provider`.

**Without CrisisGrid:** A data officer manually copies and parses spreadsheets for hours.
**With CrisisGrid:** The officer drops all three files into the dashboard. CrisisGrid's AI identifies the data types, maps the messy columns to a canonical schema, fixes typos in district names, and provides a unified dashboard for decision-makers **in under 60 seconds.**

---

## ✨ Features

### 🎨 Premium Glassmorphic UI/UX System
- **Responsive Theme Engine**: Adapts to Light, Dark, and System modes seamlessly using tailored HSL color palettes.
- **Micro-Interactions**: Subtle card-lift animations, staggered loading transitions, and Apple Watch-style circular progress gauges for priority hotspots.
- **Notification Drawer**: Houses real-time system alerts and critical stocks thresholds in a scroll-bounded popup.

### 🗺️ Advanced Google Maps Visualizations & Geocoding
- **Marker Clustering & Route Polylines**: Renders custom warehouse/camp pins, aggregates dense clusters with `MarkerClusterer`, and draws geodesic route lines (`Polyline`) connecting supplies to disaster zones.
- **Geocoding Manual Pin Drop Mode**: Click on the map to manually resolve coordinates for unrecognized camp/affected areas, instantly saving them to the persistent cache.
- **Geocoding API with SQLite Cache Fallback**: Resolves locations via Google Maps Geocoding API with a local SQLite caching mechanism to reduce latency and API calls, working offline as a local fallback.

### 📋 Optimized Logistics Matching (Google OR-Tools)
- **GLOP Solver Optimizer**: Uses Google OR-Tools GLOP linear programming solver to solve the min-cost transportation network flow, minimizing transit distances and matching supply warehouses to camp needs based on priority scores.
- **Warehouse Stock Indicators**: Color-coded stock badges (Critical, Low, Healthy) placed side-by-side with match records.
- **Oscillator Sound Chimes**: Plays a pleasant synthesized C5-E5 sound cue using browser HTML5 oscillators when matches are recalculated.

### 🔄 Real-Time Multi-User Collaboration (Cloud Firestore)
- **Active Session Synchronization**: Uses Firestore document listeners (`onSnapshot`) to mirror session metadata across all active web tabs in real-time, refreshing dashboard charts, map routes, and priority cards instantly when another user makes changes.

### 📶 Offline-First PWA & IndexedDB Queue
- **Offline PWA Support**: Configured service workers via `vite-plugin-pwa` to cache HTML, JS, CSS, Google Fonts, and local data queries for fully offline loading.
- **IndexedDB Transaction Queue**: Buffers table edits and manual pin drops locally while offline, automatically executing them in-order to sync with the backend database once connectivity is restored.

### 🎙️ Bilingual Speech-to-Text NLQ
- **Mixed Dialects Support**: Chat assistant that answers queries in English, Hindi, and Hinglish.
- **Voice Pulse Indicators**: Visual pulse animations and audio cues for recording controls.

### 🗃️ Ops Command Profile Center
- **Analytics Trackers**: Counters tracking queries, exports, uploads, and share logs.
- **Past Session Switching**: Instantly reloads up to 20 past CSV sessions (reloads charts, maps, and logistics).
- **System Preferences**: Toggles for theme color, default voice language, and audio master cues.

### 📊 Interactive Data Explorer & Inline CRUD Edits
- **Inline Double-Click Edits**: Edit cell values directly within the spreadsheet table. Integrates optimistic UI rendering, toast feedback, and auto-sync to both local SQLite cache and Firestore room triggers.
- **Interactive Sorting & Search**: Click-to-sort columns (alphabetic/numeric sorting) and instant client-side query filtering across tables.

---

## 🛠️ Technical Stack & Architecture

- **Frontend**: React (Vite), `@react-google-maps/api`, `vite-plugin-pwa` (Service Workers), IndexedDB, Recharts, Phosphor Icons, custom vanilla HSL design tokens.
- **Backend**: Python (Flask), Google OR-Tools (GLOP Linear Solver), Google Maps Geocoding API, Google Generative AI SDK (Gemini 2.5/2.0 API), Firebase Admin SDK (Cloud Firestore), SQLite.

---

## 🚀 Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 18+
- Google Gemini API Key
- Firebase Service Account Key

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/stuti-debug/google-solutions.git
   cd google-solutions
   ```

2. **Backend Setup:**
   ```bash
   # Create and activate virtual environment
   python -m venv venv
   source venv/bin/activate

   # Install dependencies
   pip install -r requirements.txt

   # Configure environment variables
   cp .env.example .env
   # Add your GEMINI_API_KEY and FIREBASE_CREDENTIALS path to .env
   ```

3. **Frontend Setup:**
   ```bash
   npm install
   ```

4. **Running the Applications:**
   ```bash
   # Run the backend server (Flask)
   python app.py

   # In a new terminal tab, run the frontend development server
   npm run dev
   ```

5. **Access the application:**
   - Flask Server: `http://localhost:8000`
   - Vite React Dev Server: `http://localhost:5173` (or `http://localhost:5174`)

---

## 📂 Project Structure
```
google-solutions/
│
├── core/                  # Security, Firebase, and SQLite configs
├── routes/                # Flask blueprints (clean, data, alerts, priority, match, forecast, sitrep)
├── services/              # Gemini AI Mapper and session managers
├── src/                   # React Frontend source
│   ├── components/        # UI views (MapView, QueryChat, Logistics, Profile, DashboardTabs)
│   ├── hooks/             # Custom React hooks (useDashboardMetrics)
│   └── utils/             # Exporters, share handlers, and analytics trackers
├── style.css              # Glassmorphic layout styling rules
├── app.py                 # Main Flask server entry point
├── cleaning_pipeline.py   # CLI version of the AI cleaning pipeline
└── package.json           # Frontend dependencies
```

---

## 🔒 Privacy & Security
- **In-Memory Processing**: Cleaning pipelines process data in-memory to prevent leaks.
- **Secure Sessions**: User context and session history are securely saved under sandboxed local storage keys.

---

## 📄 License
Licensed under the MIT License. See `LICENSE` for details.

---
**CrisisGrid** | *Google Solution Challenge 2026*
