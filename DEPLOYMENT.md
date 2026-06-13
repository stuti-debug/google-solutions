# CrisisGrid Deployment Guide

This document outlines the step-by-step process to deploy both the **Flask Backend** (to Google Cloud Run) and the **React Frontend** (to Firebase Hosting) for the Google Solution Challenge 2026.

---

## Architecture Overview

```
                        +----------------------------+
                        |      Firebase Hosting      |
                        |      (React Frontend)      |
                        +--------------+-------------+
                                       |
                                       | HTTPS requests (using Bearer Auth Token)
                                       v
                        +--------------+-------------+
                        |      Google Cloud Run      | <---> Cloud Firestore
                        |      (Flask Backend)       |       (Real-time sync)
                        +--------------+-------------+
                                       |
                                       v
                              Vertex AI (Gemini)
                              Google OR-Tools
```

---

## Prerequisites

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
2. Install the [Firebase CLI](https://firebase.google.com/docs/cli#install_the_firebase_cli):
   ```bash
   npm install -g firebase-tools
   ```
3. Authenticate both CLIs:
   ```bash
   gcloud auth login
   gcloud auth configure-docker
   firebase login
   ```

---

## Step 1: Deploy Backend to Google Cloud Run

The Flask backend is containerized using the [Dockerfile](backend/Dockerfile) in the `backend/` directory.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Build and deploy the service using `gcloud run deploy`. This command will package the code, upload it to Artifact Registry, build the container, and deploy it to Cloud Run:
   ```bash
   gcloud run deploy crisisgrid-backend \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```
   *Note: Note down the Service URL provided at the end of the deployment (e.g., `https://crisisgrid-backend-xxxx-uc.a.run.app`).*

3. **Configure Environment Variables in Cloud Run Console:**
   Go to the Google Cloud Console ➔ Cloud Run ➔ **crisisgrid-backend** ➔ **Edit & Deploy New Revision** and add the following Variables under the "Variables & Secrets" tab:
   * `GCP_PROJECT_ID` = `crisisgrid-4a842`
   * `GCP_LOCATION` = `us-central1`
   * `GEMINI_MODEL` = `gemini-3.5-flash`
   * `GOOGLE_APPLICATION_CREDENTIALS` = `/app/firebase-credentials.json` (The service account JSON is copied into the container during the build).

4. **Assign IAM Permissions:**
   Ensure the service account `firebase-adminsdk-fbsvc@crisisgrid-4a842.iam.gserviceaccount.com` has the following roles in IAM:
   * **AI Platform Admin** (or **Vertex AI User**) — to invoke Gemini models.
   * **Cloud Datastore User** (or **Firebase Admin**) — to read/write real-time metadata.

---

## Step 2: Deploy Frontend to Firebase Hosting

The frontend is a React SPA built with Vite. It needs to know the URL of the deployed backend.

1. Navigate back to the project root and then into the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Build the production assets by passing the Cloud Run Service URL as an environment variable:
   ```bash
   VITE_API_URL="https://YOUR-CLOUD-RUN-SERVICE-URL" npm run build
   ```
   *(Replace `https://YOUR-CLOUD-RUN-SERVICE-URL` with the URL from Step 1).*

3. Navigate to the project root:
   ```bash
   cd ..
   ```
4. Deploy the frontend assets and Firestore security rules using the Firebase CLI:
   ```bash
   firebase deploy --only hosting,firestore
   ```

---

## Step 3: Verification

Once both deployments complete:
1. Open your Firebase Hosting URL (e.g., `https://crisisgrid-4a842.web.app`).
2. Log in using Google Sign-In.
3. Upload a sample dataset from `demo_data/`.
4. Open the browser's developer console (F12) to verify that:
   * API requests are hitting the Cloud Run backend correctly.
   * Firestore real-time snapshot listener is working without permission errors.
   * Vertex AI insights and OR-Tools matching calculations are generated dynamically.

---

## Troubleshooting

### 1. `permission-denied` warnings in Firestore console
This warning occurs if `firestore.rules` is not deployed. Running `firebase deploy --only firestore` will push the updated security rules allowing authenticated reads to the `/sessions` collection.

### 2. `Vertex AI / Gemini prediction errors` in backend logs
Make sure that:
* The Vertex AI API is enabled in the GCP project `crisisgrid-4a842`.
* The service account has the **AI Platform Admin** role assigned under Google Cloud IAM.
