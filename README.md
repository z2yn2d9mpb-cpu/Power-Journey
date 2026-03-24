# TouchPath — B2B Touchpoint Intelligence

A customer journey visualization tool that maps when companies had ad exposure (sightings) versus actual engagement (clicks) across LinkedIn Ads, Google Ads, and LeadInfo on a timeline.

![TouchPath](https://img.shields.io/badge/TouchPath-B2B_Intelligence-007AFF?style=flat-square)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=flat-square&logo=vercel)
![Firebase](https://img.shields.io/badge/Powered_by-Firebase-FFCA28?style=flat-square&logo=firebase)

## Features

- **Dashboard** — KPIs, hot accounts, channel mix, activity feed
- **Timeline** — Chronological touchpoint view per account with date/channel filters
- **Customer Journey** — Visual flow of sightings → clicks → conversions
- **Intent Scoring** — 0–100 score based on recency, page intent, channel depth, velocity, and conversion signals
- **CRM** — Status tracking, notes, contacts, and tasks per account
- **Bulk Import** — CSV/XLSX file upload, paste from clipboard, LinkedIn Demographics Report parser
- **Merge Engine** — Fuzzy matching to deduplicate accounts (Jaccard, Levenshtein, domain matching)
- **Firebase Sync** — All data persists across sessions via Firestore, with Google sign-in

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single-page app) |
| Auth | Firebase Authentication (Google sign-in) |
| Database | Cloud Firestore |
| Hosting | Vercel (static) |
| Fonts | SF Pro (system), JetBrains Mono |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/touchpath.git
cd touchpath
```

### 2. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Enable **Authentication** → Sign-in method → **Google** → Enable
3. Enable **Cloud Firestore** → Create database → Start in **test mode** (you'll add security rules later)
4. Go to **Project Settings** → General → Your apps → **Add web app** (</> icon)
5. Copy the Firebase config object

### 3. Configure your credentials

Open `public/js/firebase-config.js` and replace the placeholder values with your Firebase config:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Deploy to Vercel

**Option A — Via Vercel Dashboard:**
1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com), import your GitHub repo
3. Set the **Output Directory** to `public`
4. Click **Deploy**

**Option B — Via CLI:**
```bash
npm i -g vercel
vercel --prod
```

### 5. Set Firestore Security Rules

In Firebase Console → Firestore → Rules, replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Click **Publish**.

### 6. Add your Vercel domain to Firebase

In Firebase Console → Authentication → Settings → **Authorized domains**, add:
- `your-project.vercel.app`
- Any custom domain you use

---

## Project Structure

```
touchpath/
├── public/
│   ├── index.html              # Main application
│   └── js/
│       ├── firebase-config.js  # Your Firebase credentials (gitignored)
│       └── firebase-sync.js    # Auth + Firestore sync logic
├── firebase-config.example.js  # Template for credentials
├── firestore.rules             # Firestore security rules
├── vercel.json                 # Vercel deployment config
├── package.json                # Project metadata
├── .gitignore                  # Git ignore patterns
└── README.md                   # This file
```

## Local Development

Just open `public/index.html` in a browser, or use any static server:

```bash
npx serve public
```

Firebase auth requires HTTPS or localhost, so `localhost` works for development.

## Data Model (Firestore)

```
users/{uid}/
├── state/
│   └── main          # { touchpoints: [...], accounts: {...}, crmData: {...} }
└── meta/
    └── profile       # { displayName, email, photoURL, lastSeen }
```

All data is stored under the authenticated user's UID, ensuring complete isolation between users.

## Environment

No build step required. No `node_modules`. No bundler. Just static files served by Vercel.

## License

MIT
