# Firebase web push

Push delivery uses Firebase Cloud Messaging HTTP v1. A signal is queued transactionally only for
users whose stored thresholds, market/league preferences, signal type, and enabled subscription
match. The delivery worker also enforces timezone-aware quiet hours.

## Firebase setup

Create a Firebase web app and a Web Push certificate. Put its public values in `.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

Create a Firebase service account and put these server-only values in `backend/.env` and Railway:

```dotenv
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
```

Never expose the private key with a `NEXT_PUBLIC_` prefix. The app can still build without Firebase
credentials: subscription controls explain that setup is pending, the service worker remains a
valid PWA worker, and a one-shot notification worker records a safe skipped run.

## Run and lifecycle

```bash
pnpm worker:notifications --once
```

The settings screen requests browser permission, registers or refreshes the FCM token, supports
backend and Firebase unsubscribe, and updates per-user preferences. Delivery errors contain safe
codes only; authorization headers, service-account material, and FCM tokens are not logged.
