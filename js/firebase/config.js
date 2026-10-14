// Firebase web configuration.
//
// Paste the config object from Firebase Console → Project settings → Your apps → Web app.
// This object is NOT a secret (it identifies your project; security comes from
// Firestore Security Rules + authorized domains). Never put service-account keys
// or AI-provider API keys in this file or anywhere in the frontend.
//
// Leave `firebaseConfig` as null to run the app fully offline/guest-only.

export const firebaseConfig = {
  apiKey: "AIzaSyAoBksRETNIRIWo4falzzqNVm6w6NexvIA",
  authDomain: "data-comm-4e724.firebaseapp.com",
  projectId: "data-comm-4e724",
  storageBucket: "data-comm-4e724.firebasestorage.app",
  messagingSenderId: "329037401824",
  appId: "1:329037401824:web:ad5cf204c2a080d7d7ca85",
};

// Optional: Firebase App Check with reCAPTCHA v3 / Enterprise site key (public).
export const appCheckSiteKey = '';

// Pinned Firebase JS SDK version loaded from Google's CDN (no build step needed).
export const FIREBASE_SDK_VERSION = '10.12.2';
