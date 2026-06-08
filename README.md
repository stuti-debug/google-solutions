# CrisisGrid: AI-Powered Resilience for Disaster Relief

**Revolutionizing Humanitarian Data Management with Google Gemini AI**

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google-Solution%20Challenge%202026-blue)](https://developers.google.com/community/solutions-challenge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📌 Problem Statement
In the wake of a disaster, every second counts. However, relief organizations are often paralyzed by **Data Chaos**. NGOs receive crucial information (beneficiary lists, supply inventories, donor logs) from dozens of field teams, each using different spreadsheet formats, inconsistent naming conventions, and messy, duplicate entries.

Manually cleaning and unifying this data can take days—days that the most vulnerable populations don't have. **CrisisGrid** solves this by leveraging Google's Gemini AI to automatically clean, standardize, and unify disparate disaster relief datasets in seconds.

## 🌍 UN Sustainable Development Goals (SDGs)
CrisisGrid is built to address the core objectives of the Google Solution Challenge by focusing on:

*   **SDG 1: No Poverty** – By ensuring that aid reaches the right people without administrative delay, we help prevent vulnerable populations from falling deeper into poverty during crises.
*   **SDG 11: Sustainable Cities and Communities** – We enhance urban resilience by providing city planners and disaster response teams with accurate, real-time data to manage resources and infrastructure during emergencies.

## 🚀 Live Demo
**Check out the live application here:** [Live Demo URL Placeholder](https://crisisgrid-demo.vercel.app)

---

## 📸 Screenshots
*(Add your project screenshots here)*
![Dashboard Preview](https://via.placeholder.com/800x400?text=CrisisGrid+Dashboard+Preview)

---

## 🔥 Impact / Real-World Use Case
Imagine an NGO responding to a major flood. They receive:
1.  A "Field_List.csv" from Team A with columns like `name_of_person` and `loc`.
2.  An "Inventory.xlsx" from Team B with `item_qty` and `wh_location`.
3.  A "Donors.csv" from a global partner with `Amount_USD` and `Provider`.

**Without CrisisGrid:** A data officer manually copies and pastes for 6 hours.
**With CrisisGrid:** The officer drops all three files into the dashboard. CrisisGrid's AI identifies the data types, maps the messy columns to a canonical schema, fixes typos in district names, and provides a unified dashboard for decision-makers **in under 60 seconds.**

---

## ✨ Features

-   **AI-Powered Column Mapping**: Automatically maps messy, inconsistent column names to standardized humanitarian schemas.
-   **Data Type Detection**: Automatically identifies whether a dataset belongs to Beneficiaries, Inventory, or Donors.
-   **Intelligent Cleaning Pipeline**: 
    -   **District Normalization**: Fixes typos and abbreviations in geographical data.
    -   **Schema Standardization**: Enforces date formats and numeric precision.
    -   **Deduplication**: Intelligent record matching to remove redundant entries.
    -   **Null Handling**: Intelligent processing of missing values and placeholder tokens.
-   **Premium Web Interface**: A high-performance dashboard built with React and Flask.
-   **Natural Language Querying**: Ask questions like *"Which district needs the most food kits?"* and get AI-generated insights from your Firestore data.

---

## 🛠️ Technical Content

### Prerequisites
- Python 3.8+
- Google Gemini API Key
- Firebase Service Account

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/stuti-debug/google-solutions.git
    cd google-solutions
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Set up environment variables:**
    ```bash
    cp .env.example .env
    # Edit .env and add your GEMINI_API_KEY and Firebase path
    ```

4.  **Run the backend server:**
    ```bash
    python app.py
    ```

5.  **Access the application:**
    Open your browser and navigate to `http://localhost:8000` (or `http://localhost:5173` if running the React dev server).

### Command Line Usage
You can also use the pipeline directly for batch processing:
```bash
python cleaning_pipeline.py your_messy_file.csv
```

## 📊 API Usage

### Upload and Clean File
```python
import requests

# Upload file
with open('messy_data.csv', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/clean', files=files)

# Get job status
job_id = response.json()['job_id']
status = requests.get(f'http://localhost:8000/status/{job_id}')
```

## 📂 Project Structure
```
crisisgrid/
|-- core/                  # Security, Firebase, and Global Config
|-- routes/                # Flask Blueprints (Clean, Query, Data)
|-- services/              # AI Mapping and Data Logic
|-- src/                   # React Frontend
|-- app.py                 # Application Factory
|-- requirements.txt       # Dependencies
|-- .env.example           # Config Template
```

---

## 🔒 Privacy & Security
- **In-Memory Processing**: Data is cleaned in-memory to minimize persistent footprints.
- **Secure Credentials**: All API keys and Firebase secrets are managed via environment variables.

## 📄 License
Licensed under the MIT License. See `LICENSE` for details.

---
**CrisisGrid** | *Google Solution Challenge 2026*
