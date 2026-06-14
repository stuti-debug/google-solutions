<div align="center">

# ⚡ CrisisGrid
### AI-Powered Disaster Relief Logistics — From Data Chaos to Command in Under 60 Seconds

<br/>

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google%20Solution%20Challenge-2026-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/community/solutions-challenge)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20by-Google%20Gemini%20AI-8E24AA?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![OR-Tools](https://img.shields.io/badge/Solver-Google%20OR--Tools%20GLOP-0F9D58?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![Firebase](https://img.shields.io/badge/Backend-Firebase%20%2B%20Firestore-FF6D00?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![Google Maps](https://img.shields.io/badge/Maps-Google%20Maps%20Platform-34A853?style=for-the-badge&logo=googlemaps&logoColor=white)](https://developers.google.com/maps)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)

<br/>

> **"Every 60 seconds of data chaos in a disaster zone costs lives."**
> CrisisGrid eliminates that chaos — permanently.

</div>

---

## 🔴 The Problem: Data Chaos Kills

When a disaster strikes — a flood, earthquake, or cyclone — the first casualty is often **data integrity**.

Hundreds of NGO field teams simultaneously transmit critical information: beneficiary lists, supply inventories, and donor logs. Each team uses a different spreadsheet format, inconsistent column names, district name typos, and duplicate entries. The result is a **paralysis of coordination** at the exact moment when speed is everything.

| The Reality of a Disaster Response Data Pipeline |
|---|
| 🗂️ Team A sends `Field_List.csv` with columns `name_of_person`, `loc`, `needs` |
| 📦 Team B sends `Inventory.xlsx` with `item_qty`, `wh_location`, `SKU_code` |
| 💰 Team C sends `Donors.csv` with `Amount_USD`, `Provider`, `Remittance_Date` |
| ❌ A data officer spends **6–8 hours** manually merging and cleaning these files |
| ⚠️ By the time the dashboard is ready, the data is already **out of date** |

**The cost of this delay is not measured in hours. It is measured in lives.**

---

## 💡 The Solution: CrisisGrid

CrisisGrid is an **AI-powered disaster relief logistics command center** that transforms messy, incompatible field data into a unified operations dashboard — in under 60 seconds.

A field coordinator drops their CSV files into the platform. Within one minute, they have:

- ✅ **Clean, deduplicated, schema-normalized data** — courtesy of Google Gemini AI
- ✅ **An optimal supply dispatch plan** — solved as a min-cost Linear Program using Google OR-Tools GLOP
- ✅ **A live map** of crisis zones, warehouse routes, and priority hotspots — on Google Maps
- ✅ **A real-time multi-team command dashboard** — synced via Cloud Firestore
- ✅ **Full offline capability** — so none of this stops when the internet cuts out

---

## 🌍 UN Sustainable Development Goals

<div align="center">

| SDG | Goal | CrisisGrid's Impact |
|:---:|---|---|
| **SDG 1** | No Poverty | Accelerates aid delivery to the most vulnerable, preventing post-disaster economic collapse |
| **SDG 11** | Sustainable Cities & Communities | Gives city planners and relief coordinators a real-time, data-driven command center for disaster resilience |

</div>

### 📊 Measured Impact Targets

- **⏱️ 95% reduction** in data preparation time (from ~8 hours to under 60 seconds per dataset batch)
- **🎯 Zero manual schema mapping** — Gemini AI auto-detects and maps all incoming column structures
- **📍 Provably optimal routing** — OR-Tools GLOP LP minimizes total supply transit distance across the entire network simultaneously
- **🌐 Zero connectivity requirement** — full PWA + IndexedDB offline stack ensures operations continue in disaster zones with no internet

---

## 🏗️ How It Works: The Google Technology Stack

CrisisGrid is built on an end-to-end Google technology foundation. Here is exactly how each component contributes:

---

### 1. 🤖 Google Gemini AI — The Data Intelligence Layer

> *"No two field teams send the same spreadsheet format. Gemini handles all of them."*

When CSV files are uploaded, the **`GeminiAIMapper`** service:

1. **Classifies** the file type (`beneficiary` / `inventory` / `donor`) using zero-shot Gemini inference
2. **Maps** every messy incoming column (`loc`, `wh_location`, `name_of_person`) to a canonical schema (`location`, `warehouse`, `full_name`) using an LLM-powered field extraction prompt
3. **Canonicalizes** district name typos via a dedicated `canonicalize_districts` call with fuzzy normalization
4. **Infers** missing values and standardizes units, currencies, and date formats

**Model:** `gemini-3.5-flash` via Vertex AI SDK | **Retry logic:** 2 JSON-strict retries with schema enforcement

---

### 2. 📐 Google OR-Tools GLOP LP Solver — The Optimization Engine

> *"A greedy algorithm finds A solution. OR-Tools finds THE solution."*

The logistics matching engine solves a formal **min-cost transportation network flow problem** using the GLOP (Generalized Linear Optimization Program) simplex solver from `ortools.linear_solver.pywraplp`.

**Mathematical Formulation:**

```
minimize   Σ_{i∈W} Σ_{j∈C}  dist(i,j) · x[i][j]

subject to:
  Σ_{j∈C}  x[i][j]  ≤  supply[i]    ∀ i ∈ W   (warehouse capacity)
  Σ_{i∈W}  x[i][j]  ≥  demand[j]    ∀ j ∈ C   (camp demand satisfaction)
            x[i][j]  ≥  0            ∀ i,j      (non-negativity)
```

Where:
- `x[i][j]` = units shipped from warehouse `i` to crisis camp `j`
- `dist(i,j)` = Haversine great-circle distance (km) between warehouse `i` and camp `j`
- `W` = verified supply depots (crisis zones excluded as sources to prevent circular routing)
- `C` = beneficiary camps, with demand aggregated by household size and need category

**Result:** A provably optimal dispatch plan that satisfies every camp's demand at minimum total travel cost — computed in milliseconds. Falls back to a greedy distance-heuristic if OR-Tools is unavailable.

---

### 3. 🗺️ Google Maps Platform — Situational Awareness

- **Geocoding API** with a local SQLite cache — resolves location names to coordinates, with manual pin-drop override for unrecognized field locations
- **Dynamic Polylines** — renders geodesic supply routes connecting warehouses to crisis zones
- **Custom Priority Markers** — color-coded pins (🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low) based on OR-Tools demand weights and real-time priority scores

---

### 4. 🔥 Firebase + Cloud Firestore — Real-Time Multi-Team Collaboration

- **`onSnapshot` document listeners** synchronize session metadata across all active tabs and team members in real time
- **Cell-level edit sync** — when a coordinator corrects a data entry in the table, a `dataVersion` counter in React Context triggers an automatic re-fetch cascade across every dashboard component (charts, map, priority scores, logistics matches)
- **Firebase Authentication** — Google Sign-In ensures secure, role-based session access

---

### 5. 📶 PWA + IndexedDB — Offline-First for Disaster Zones

> *"The internet is the first thing to fail in a disaster. CrisisGrid keeps working anyway."*

- **Service Workers** (via `vite-plugin-pwa`) cache the entire app shell, Google Fonts, and all prior API responses
- **IndexedDB Transaction Queue** buffers all cell edits and manual map pin-drops locally while offline, then replays them in order when connectivity is restored — no data is ever lost
- **Background sync** resolves the queue automatically without user intervention

---

### 6. 🎙️ Web Speech API — Bilingual NLQ for Field Workers

- Voice and text natural language queries in **English, Hindi, and Hinglish** — critical for field workers who operate in their native language under pressure
- Queries are parsed into structured data filters via a Gemini-powered NLQ pipeline, returning real-time results from the live session data

---

## ✨ Full Feature Set

### 🧠 AI & Intelligence
- 🤖 **Gemini AI Schema Mapper** — zero-shot file classification and column mapping
- 🔍 **AI Priority Scoring** — dynamic hotspot ranking by need type, household size, and pending case count
- 💬 **AI Natural Language Query** — ask *"Which villages have critical water needs?"* in Hindi or English
- 📄 **AI Situation Report Generator** — auto-drafts field-ready SITREPs with executive summaries
- 📉 **Burndown Forecast** — inventory depletion projections with day-level granularity per crisis zone

### 📊 Data & Dashboard
- ⚡ **Real-time Data Table with Inline Edit** — double-click (desktop) or double-tap (mobile) to edit any cell; all components auto-refresh via dataVersion sync
- 📈 **Dynamic Charts** — Affected Population bar chart, Inventory breakdown pie chart, Burndown forecast timeline
- 🔢 **Metric Cards** — live record counts, AI fixes applied, duplicates removed, invalid rows dropped
- 🔄 **Session History** — reload any of the last 20 data sessions instantly with full dashboard restoration

### 🗺️ Logistics & Maps
- 📐 **OR-Tools GLOP LP Optimal Dispatch** — provably minimum-distance supply routing with full solver transparency
- 🗺️ **Interactive Crisis Map** — custom priority markers, polyline routes, manual pin-drop geocoding
- 🏭 **Warehouse Stock Indicators** — Critical / Low / Healthy stock badges on every inventory line
- 📋 **Exportable Logistics Plan** — one-click PDF and CSV export of the full dispatch schedule

### 🌐 Infrastructure
- 📶 **Offline-First PWA** — full functionality with zero internet
- 🔄 **IndexedDB Queue** — zero data loss during connectivity drops
- 👥 **Multi-user Real-time Sync** — Firestore-powered live collaboration across teams
- 🔒 **Firebase Auth** — Google Sign-In with session ownership verification middleware

### 📱 UX & Accessibility
- 🌙 **Dark / Light / System Theme** — glassmorphic design with auto-switching
- 📱 **Fully Responsive** — mobile-optimized with hamburger nav and touch-friendly inline editing
- ♿ **WCAG AA Compliant** — ARIA labels, keyboard navigation, contrast-verified color palette
- 🎙️ **Bilingual Voice Input** — Hindi + English + Hinglish

---

## 🛠️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND  (React + Vite PWA)                   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Dashboard│  │  MapView │  │Logistics │  │   NLQ Chat    │  │
│  │  + Charts│  │(G. Maps) │  │(OR-Tools)│  │ (Gemini NLQ)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
│        │              │            │                │           │
│        └──────────────┴────────────┴────────────────┘           │
│                             │                                   │
│                   React Context (dataVersion)                   │
│                   IndexedDB Offline Queue                       │
└─────────────────────────────┼───────────────────────────────────┘
                              │  REST API  (Flask + Firebase Auth)
┌─────────────────────────────┼───────────────────────────────────┐
│                  BACKEND  (Python / Flask)                      │
│                             │                                   │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ Gemini AI   │  │ OR-Tools GLOP   │  │ Priority Scorer  │   │
│  │ Schema Mapper│  │ LP Solver       │  │ (dynamic scores) │   │
│  └─────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                 │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  SQLite     │  │  Firebase Admin │  │  Maps Geocoding  │   │
│  │  (Session & │  │  SDK (Firestore)│  │  API + SQLite    │   │
│  │   Cache)    │  │                 │  │  Cache           │   │
│  └─────────────┘  └─────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version / Notes |
|---|---|
| Python | 3.9+ |
| Node.js | 18+ |
| Firebase Project | Blaze Plan (Firestore requires it) |
| Google Cloud Project | Vertex AI API enabled |
| Google Maps API Key | Maps JavaScript + Geocoding APIs enabled |

### 1. Clone the Repository

```bash
git clone https://github.com/stuti-debug/google-solutions.git
cd google-solutions
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install all dependencies (includes Google OR-Tools, Gemini SDK)
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env — add the following:
#   GCP_PROJECT_ID=your-gcp-project-id
#   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./firebase-credentials.json
#   GOOGLE_APPLICATION_CREDENTIALS=./firebase-credentials.json

# Place your Firebase service account key
# Download from: Firebase Console → Project Settings → Service Accounts
cp /path/to/your-service-account.json ./firebase-credentials.json

# Start the Flask backend
python app.py
# → Running on http://127.0.0.1:8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.local.example .env.local
# Edit .env.local — add your Firebase Web App config + Maps key:
#   VITE_FIREBASE_API_KEY=...
#   VITE_FIREBASE_AUTH_DOMAIN=...
#   VITE_FIREBASE_PROJECT_ID=...
#   VITE_FIREBASE_STORAGE_BUCKET=...
#   VITE_FIREBASE_MESSAGING_SENDER_ID=...
#   VITE_FIREBASE_APP_ID=...
#   VITE_GOOGLE_MAPS_API_KEY=...

# Start the Vite dev server
npm run dev
# → Running on http://localhost:5173
```

### 4. Open the App

Navigate to **[http://localhost:5173](http://localhost:5173)**, sign in with Google, and upload any of the demo datasets from `demo_data/`.

---

## 📂 Project Structure

```
CrisisGrid/
├── backend/
│   ├── app.py                     # Flask entry point + blueprint registration
│   ├── config.py                  # Environment configuration
│   ├── firebase-credentials.json  # GCP Service Account (gitignored)
│   ├── core/
│   │   ├── firebase.py            # Firebase Admin SDK initialization
│   │   ├── matching_engine.py     # OR-Tools GLOP LP solver + greedy fallback
│   │   ├── security.py            # Firebase ID token verification middleware
│   │   └── app_globals.py         # Shared in-memory session store singleton
│   ├── routes/
│   │   ├── clean.py               # /clean  — Gemini AI data cleaning pipeline
│   │   ├── data.py                # /data   — session CRUD + inline row update
│   │   ├── match.py               # /match  — OR-Tools logistics dispatch
│   │   ├── priority.py            # /priority — AI priority hotspot scoring
│   │   ├── query.py               # /query  — Gemini NLQ engine
│   │   ├── sitrep.py              # /sitrep — AI situation report generator
│   │   ├── forecast.py            # /forecast — inventory burndown projection
│   │   └── alerts.py              # /alerts — real-time stock threshold alerts
│   └── services/
│       ├── ai_mapper.py           # Gemini schema mapper + district canonicalizer
│       ├── session_store.py       # SQLite session persistence + Firestore sync
│       └── cleaner.py             # Deduplication, normalization, validation
│
├── frontend/
│   ├── src/
│   │   ├── AppContext.jsx          # Global React context (auth, session, dataVersion)
│   │   ├── firebase.js             # Firebase Web SDK initialization
│   │   ├── components/
│   │   │   ├── Dashboard.jsx       # Main dashboard layout + metric cards
│   │   │   ├── DashboardTabs.jsx   # Editable table (double-tap mobile support)
│   │   │   ├── MapView.jsx         # Google Maps + priority pins + route polylines
│   │   │   ├── Logistics.jsx       # OR-Tools dispatch plan viewer
│   │   │   ├── QueryChat.jsx       # Bilingual NLQ chat + voice input
│   │   │   ├── Reports.jsx         # AI SITREP generator
│   │   │   ├── PriorityScores.jsx  # Crisis hotspot priority cards
│   │   │   └── BurnDownChart.jsx   # Inventory forecast timeline (Recharts)
│   │   ├── hooks/
│   │   │   └── useDashboardMetrics.js
│   │   └── utils/
│   │       ├── api.js              # Authenticated apiFetch wrapper
│   │       └── indexed_db_sync.js  # Offline transaction queue (IndexedDB)
│   ├── public/
│   │   ├── pwa-192x192.png
│   │   └── pwa-512x512.png
│   ├── style.css                   # Glassmorphic design system (4600+ lines)
│   ├── index.html                  # SEO-optimized entry point
│   └── vite.config.js              # Vite + PWA service worker configuration
│
├── demo_data/
│   ├── beneficiaries_premium.csv   # Sample beneficiary dataset
│   ├── inventory_premium.csv       # Sample inventory dataset
│   └── donors_premium.csv          # Sample donor dataset
│
└── README.md
```

---

## 🧪 User Research & Iteration

CrisisGrid was shaped through three rounds of testing with real NGO personnel and field coordinators.

### Round 1 — NGO Data Officer (Pre-alpha)
> *"Our field teams send completely inconsistent spreadsheets — different column names, district typos, duplicates everywhere."*

**Resolution:** Integrated Google Gemini AI as a zero-shot schema mapper. The `GeminiAIMapper` now classifies each uploaded file, maps all messy column names to a canonical schema via LLM inference, and runs a dedicated `canonicalize_districts` call to auto-correct all location typos before data reaches the dashboard.

### Round 2 — Field Coordinator (Connectivity Testing)
> *"We work in disaster zones where mobile internet drops constantly. Every time the connection cut, the app went blank and I lost all my work."*

**Resolution:** Implemented a full **Offline-First PWA** using `vite-plugin-pwa` service workers for shell caching, plus an **IndexedDB Transaction Queue** that buffers all cell edits and map pin-drops locally while offline, then replays them in order when connectivity is restored.

### Round 3 — Bilingual Relief Worker (Usability Testing)
> *"Many team members are more comfortable in Hindi. The English-only query box is a barrier during a crisis."*

**Resolution:** Updated the NLQ chatbot to accept **English, Hindi, and Hinglish** queries via Web Speech API integration, with a Gemini-powered translation layer routing all language variants through the same structured filter pipeline.

---

## 🔒 Security & Privacy

- **Firebase Auth middleware** verifies every API request with a Firebase ID token — no unauthenticated access to any endpoint
- **Session ownership checks** prevent users from reading or modifying another user's session data
- **In-memory processing** — CSV files are processed entirely in RAM and never written to disk in plaintext
- **Service account credentials** are gitignored and loaded exclusively via environment variables

---

## 📄 License

Licensed under the **MIT License**. See [`LICENSE`](LICENSE) for full details.

---

<div align="center">

**Built with ❤️ for the Google Solution Challenge 2026**

*Google Gemini · Google OR-Tools · Google Maps Platform · Firebase · Cloud Firestore*

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google%20Solution%20Challenge-2026-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/community/solutions-challenge)

</div>
