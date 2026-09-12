/**
 * VAPID Configuration for Web Push Notifications.
 * Environment variables take precedence if defined in production (.env.local / Vercel Env).
 */

export const VAPID_CONFIG = {
  publicKey:
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    "BIZA5cV6Ku7CAyISkRIe4Y0PjAgaE0JRXZy-GIh9j5wufI1vkX9_572JccwjBCNbg2CGavqW9Bk3jWMG-P8ewDo",
  privateKey:
    process.env.VAPID_PRIVATE_KEY ||
    "8Y3Q0s9X3tH1I8cFRNNr3BYc9ffMrKyjK96HSUYH87E",
  subject:
    process.env.VAPID_SUBJECT ||
    "mailto:soporte@smartbetbot.com",
};
