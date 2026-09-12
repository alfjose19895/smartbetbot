/**
 * VAPID Configuration for Web Push Notifications.
 * Environment variables take precedence if defined in production (.env.local / Vercel Env).
 */

export const VAPID_CONFIG = {
  publicKey:
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    "BFZSOmbytre8hO9X7vfwb-LzmOmaXOf-zHHV-MidE2owoIbBAJ31SMykajvW7oVy72La-EQyrCDzDAkOKJIFdH4",
  privateKey:
    process.env.VAPID_PRIVATE_KEY ||
    "DiCRH-OZyOahg5UttwjGVUrWC5qlAcMmgKysyQ3ldi8",
  subject:
    process.env.VAPID_SUBJECT ||
    "mailto:soporte@smartbetbot.com",
};
