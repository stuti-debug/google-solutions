# CrisisGrid: AI-Powered Resilience for Disaster Relief

**Revolutionizing Humanitarian Data Management with Google Cloud Vertex AI**

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google-Solution%20Challenge%202026-blue)](https://developers.google.com/community/solutions-challenge)
[![Powered by Vertex AI](https://img.shields.io/badge/Powered_by-Vertex_AI-orange)](https://cloud.google.com/vertex-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Problem Statement: The "Data Chaos" of Disaster Relief
In the wake of a disaster, every second counts. However, relief organizations are often paralyzed by **Data Chaos**. NGOs receive crucial information (beneficiary lists, supply inventories, donor logs) from dozens of field teams, each using different spreadsheet formats, inconsistent naming conventions, and messy, duplicate entries.

Manually cleaning and unifying this data can take days—days that the most vulnerable populations don't have. 

**CrisisGrid** solves this by leveraging **Google Cloud Vertex AI** and **Gemini 3.5 Flash** to automatically clean, standardize, and unify disparate disaster relief datasets in seconds.

---

## 🌍 UN Sustainable Development Goals (SDGs)
CrisisGrid is built to address the core objectives of the Google Solution Challenge:

*   **SDG 1: No Poverty** – By ensuring that aid reaches the right people without administrative delay, we help prevent vulnerable populations from falling deeper into poverty during crises.
*   **SDG 11: Sustainable Cities and Communities** – We enhance urban resilience by providing city planners and disaster response teams with accurate, clean, and real-time data to manage resources during emergencies.
*   **SDG 17: Partnerships for the Goals** – CrisisGrid acts as the unified data clearinghouse that allows multiple NGOs and government agencies to seamlessly share data without format conflicts.

---

## 🔥 Real-World Impact
Imagine an NGO responding to a major flood. They receive:
1.  A `Field_List.csv` from Team A with columns like `name_of_person` and `loc`.
2.  An `Inventory.xlsx` from Team B with `item_qty` and `wh_location`.
3.  A `Donors.csv` from a global partner with `Amount_USD` and `Provider`.

*   **Without CrisisGrid:** A data officer manually copies, cleans, and deduplicates for 6+ hours.
*   **With CrisisGrid:** The officer drops all three files into the dashboard. CrisisGrid's AI maps the messy columns to a canonical schema, fixes typos in district names, handles massive files (up to 50MB), and writes clean records to Firestore **in under 60 seconds.**

---

## ✨ Key Features & Architecture

*   **AI-Powered Schema Mapping**: Automatically maps inconsistent column names to standardized humanitarian schemas.
*   **Deep Semantic Cleaning (Vertex AI)**: Fixes spelling errors in geographical regions, normalizes date formats, and strictly enforces numeric precision.
*   **Enterprise-Grade Scalability**: Processes files up to **50MB** effortlessly. Uses robust data casting to eliminate JSON serialization crashes (e.g., NaN handling).
*   **Google Cloud Integration**: 
    *   **Vertex AI (Gemini 3.5 Flash)** for rapid, secure, and highly deterministic data cleaning.
    *   **Cloud Firestore** for real-time storage and fallback persistence.
*   **Natural Language Querying**: Ask questions like *"Which district needs the most food kits?"* directly in the dashboard and get AI-generated insights from your Firestore database.

---

## 🛠️ Technical Setup & Installation

### Prerequisites
*   Python 3.8+
*   Node.js (for the frontend)
*   **Google Cloud Project** with the Vertex AI API enabled.
*   **Firebase Service Account** (for Cloud Firestore).

### 1. Clone the Repository
```bash
git clone https://github.com/stuti-debug/google-solutions.git
cd google-solutions
```

### 2. Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

**Configure your `.env` file:**
```env
# Google Cloud Vertex AI Configuration
GCP_PROJECT_ID=your_gcp_project_id
GCP_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash

# Firebase Configuration
FIREBASE_PROJECT_ID=your_firebase_project_id
# Place your firebase-credentials.json in the project root
```

### 3. Authenticate with Google Cloud (ADC)
CrisisGrid uses Application Default Credentials for enterprise-grade security. Run:
```bash
gcloud auth application-default login
gcloud config set project your_gcp_project_id
```

### 4. Start the Application
```bash
# Start the Flask Backend
python app.py

# In a new terminal, start the React Frontend
cd src
npm install
npm run dev
```
Navigate to `http://localhost:5173` to access the CrisisGrid dashboard!

---

## 📂 Project Structure
```text
crisisgrid/
├── core/                  # Security, Firestore DB, and Global Config
├── routes/                # Flask Blueprints (Clean, Query, Upload)
├── services/              # Vertex AI Mapper and Data Cleaning Logic
├── src/                   # React Frontend (Vite)
├── app.py                 # Application Factory
├── requirements.txt       # Dependencies (google-cloud-aiplatform, pandas, etc.)
└── .env.example           # Config Template
```

---

## 🔒 Privacy & Security
*   **Enterprise AI**: By utilizing Google Cloud Vertex AI, NGO data remains strictly private and is **not** used to train public foundation models.
*   **In-Memory Processing**: Raw dataset cleaning occurs predominantly in-memory to minimize persistent footprints.
*   **Secure Credentials**: All API keys and Firebase secrets are managed via strict environment variables and Application Default Credentials.

---
**CrisisGrid** | *Developed for the Google Solution Challenge 2026*
