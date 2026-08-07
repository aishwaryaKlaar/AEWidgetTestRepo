# Klaar AE Widget

An internal tool for Klaar's Sales Engineers (AEs) that seeds a newly created, empty Klaar workspace with realistic demo data. The widget provides one-click actions for creating users, groups, goals, reviews, feedback, 1-on-1s, calibrations, IDPs, surveys, and other HR data, allowing live product demonstrations to start with a fully populated workspace instead of an empty application.

The widget is built with **Vite + React** and compiles into a single self-contained script (`loader.js`). It can either:

- Be injected into any logged-in Klaar page using a `<script>` tag.
- Be embedded directly inside `klaar-webapp-frontend` as a drawer.

---

## Features

- One-click demo data seeding
- Uses the currently logged-in Klaar admin session (no additional login)
- Multi-region API support
- Automatic decryption of encrypted API responses
- Modular architecture (Users, Goals, Reviews, Feedback, etc.)
- Single-file deployment (`loader.js`)
- Vercel serverless backend for Cloudflare and Migadu integrations

---

## Project Structure

```text
widget/
├── src/
│   ├── modules/
│   │   ├── users/
│   │   ├── goals/
│   │   ├── reviews/
│   │   ├── feedback/
│   │   ├── oneOnOne/
│   │   ├── calibration/
│   │   ├── idps/
│   │   └── surveys/
│   │
│   ├── core/
│   │   ├── api.js
│   │   ├── crypto.js
│   │   ├── state.js
│   │   ├── helpers.js
│   │   ├── migadu.js
│   │   ├── cloudflare.js
│   │   └── navigate.js
│   │
│   ├── components/
│   ├── App.jsx
│   └── index.jsx
│
├── api/
│   ├── migadu.js
│   ├── cloudflare.js
│   └── klaar_proxy.js
│
├── scripts/
│   └── copy-api.js
│
└── vite.config.js
```

---

## Installation

Install project dependencies.

```bash
npm install
```

---

## Running Locally

Start the Vite development server.

```bash
npm run dev
```

The widget will be served at:

```
http://localhost:5173
```

Although it can be opened directly, it is intended to be loaded into a logged-in Klaar page.

---

## Building

Generate the production bundle.

```bash
npm run build
```

Build output:

```
dist/
├── loader.js
└── api/
```

- `loader.js` is a self-contained IIFE bundle.
- CSS is automatically injected using `vite-plugin-css-injected-by-js`.
- `api/` is copied during the post-build step.

---

## Deployment

Deploy the widget to Vercel.

```bash
npx vercel --prod
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `MIGADU_EMAIL` | Migadu account email |
| `MIGADU_API_KEY` | Migadu API key |
| `MIGADU_DEFAULT_PASSWORD` | Default mailbox password |
| `CF_API_TOKEN` | Cloudflare API token |
| `CF_KLAAR_TEAM_ZONE_ID` | Cloudflare Zone ID |
| `VITE_PROXY_BASE` | Proxy URL for CORS error handling |

---

## Testing

### Option 1 — Script Injection

Open any logged-in Klaar page and execute the following in the browser console.

```javascript
const s = document.createElement("script");
s.src = "https://<deployment>.vercel.app/loader.js";
document.head.appendChild(s);
```

The script exposes:

```javascript
window.KlaarAEWidget.mount()
window.KlaarAEWidget.unmount()
```

Create a container and mount the widget.

```javascript
const container = document.createElement("div");

document.body.appendChild(container);

window.KlaarAEWidget.mount(container);
```

> **Note:** Never mount directly into `document.body`, as React will take ownership of the entire element.

---

### Option 2 — Embedded Mode

The widget is integrated into `klaar-webapp-frontend` as a drawer that can be opened from the application's top navigation (similar to the "Ask AI" feature).

This is the intended production usage.

---

# Architecture

## Authentication

The widget reuses the authenticated Klaar session.

It reads the following values from `localStorage`.

- `X-AUTH-TOKEN`
- `workspace-id`

No separate authentication flow is required.

---

## Multi-Region Support

The API endpoint is selected automatically.

| Frontend Host | API Host |
|--------------|----------|
| `app.klaarhq.com` | `api.klaarhq.com` |
| `us.klaarhq.com` | `api-usprod.klaarhq.com` |
| `localhost:4200` | `dev-api.klaarhq.com` |

---

## API Wrapper

All API requests go through:

```text
src/core/api.js
```

The wrapper automatically handles:

- Authentication headers
- Workspace headers
- Host resolution
- Response parsing
- AES response decryption

Modules never call `fetch()` directly.

---

## Encrypted Responses

Some backend APIs return encrypted payloads.

Example:

```json
{
  "data": "<ciphertext>"
}
```

The API wrapper automatically decrypts the payload before returning it to the caller.

Multiple AES key/IV combinations are supported to maintain compatibility across different backend environments.

---

## Shared State

Data shared between steps is stored in:

```text
src/core/state.js
```

Examples include:

- Created groups
- User IDs
- Organization IDs
- Previously created resources

This avoids unnecessary API requests between dependent steps.

---

## Mount API

The widget exposes the following global methods.

```javascript
window.KlaarAEWidget.mount(container);

window.KlaarAEWidget.unmount();
```

The widget never mounts automatically, allowing the host application full control over its lifecycle.

---

## CORS

Since the widget runs within a logged-in Klaar application, API requests are made from the same origin and work without additional CORS configuration.

For cases where browsers hide error bodies due to CORS restrictions, requests can be proxied through the provided Vercel serverless function.

---

# Adding a New Action

1. Create or reuse a module inside:

```
src/modules/
```

2. Add an async function inside `actions.js`.

Example:

```javascript
import api from "../../core/api";

export async function createSomething() {
  const response = await api(...);

  return {
    ok: true,
    message: "Created successfully",
  };
}
```

3. Add a corresponding `<StepButton />` in the module's `index.jsx`.

4. Store any shared data in `core/state.js` if it is required by later steps instead of fetching it again.

---

# Technologies Used

- React
- Vite
- JavaScript
- Vercel Serverless Functions
- Cloudflare API
- Migadu API
- AES Encryption
- Browser Local Storage
- Fetch API

---

# License

Internal project for Klaar. Not intended for public distribution.
