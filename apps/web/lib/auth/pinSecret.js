// Moved to the shared package so the website and the mobile app derive the
// identical PIN secret. Kept as a re-export so existing imports keep working.
export { derivePinSecret } from "@parisar/api-client";
