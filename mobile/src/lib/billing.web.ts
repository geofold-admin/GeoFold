/**
 * Web stand-in for `billing.ts`, picked by Metro on web only.
 *
 * Google Play billing exists only on Android, and `react-native-iap` pulls in Nitro modules that
 * import React Native internals directly — on web that throws while the route tree loads and
 * takes the whole app down, Profile screen or not. This keeps the same surface with nothing behind
 * it, so `npx expo start --web` works for reviewing the UI. Keep its exports in step with billing.ts.
 */

export const IAP_PRODUCTS = {
  premium: 'geofold_premium_1month',
} as const;

export type PurchaseOutcome =
  | { status: 'granted' }
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function initIap(): Promise<boolean> {
  return false;
}

export async function endIap(): Promise<void> {}

export async function fetchPremiumProduct(): Promise<null> {
  return null;
}

export async function purchasePremium(): Promise<PurchaseOutcome> {
  return { status: 'error', message: 'Purchases are made in the Android app.' };
}

export async function recoverPurchases(): Promise<boolean> {
  return false;
}
