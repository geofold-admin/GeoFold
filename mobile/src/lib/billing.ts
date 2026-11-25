import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  ErrorCode,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getUserFriendlyErrorMessage,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
  type PurchaseAndroid,
} from 'react-native-iap';

import { api, errorMessage } from './api';
import { supabase } from './supabase';

/**
 * Google Play billing for the Premium pass, written against react-native-iap v16.
 *
 * Premium is a one-time product that buys 30 days, so every purchase is *consumed* once the server
 * has granted it — consuming is what lets the same product be bought again next month.
 *
 * The order is the whole point:
 *   1. Play reports the purchase. In v16 that is an event on `purchaseUpdatedListener`;
 *      `requestPurchase` only opens the Play sheet, and its return value is not the result.
 *   2. Our server records it and extends Premium.
 *   3. Only then is it finished (consumed) on the device.
 * A purchase that is never finished is refunded by Google after three days, so when step 2 fails
 * the purchase is left unfinished on purpose: `recoverPurchases()` retries it the next time Profile
 * opens, and if it never clears the buyer gets their money back rather than losing it.
 */

/** Product IDs must match exactly what's configured in Google Play Console */
export const IAP_PRODUCTS = {
  premium: 'geofold_premium_1month',
} as const;

export type PurchaseOutcome =
  | { status: 'granted' }
  /** Paid with a deferred method (cash at a store, carrier billing) — granted once it clears. */
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const isAndroid = Platform.OS === 'android';

let connection: Promise<boolean> | null = null;

/** Opens the Play Billing connection once and shares it. Resolves false where billing is unavailable. */
export function initIap(): Promise<boolean> {
  if (!isAndroid) return Promise.resolve(false);
  connection ??= initConnection().then(
    (ok) => {
      if (!ok) connection = null;
      return ok;
    },
    (err: unknown) => {
      connection = null;
      // Expected on a phone without Play services or without a Google account — a warning, not
      // a red screen.
      console.warn('[IAP] initConnection failed:', err);
      return false;
    },
  );
  return connection;
}

export async function endIap(): Promise<void> {
  if (!isAndroid || !connection) return;
  connection = null;
  try {
    await endConnection();
  } catch (err) {
    console.warn('[IAP] endConnection failed:', err);
  }
}

/** The Premium product as Play lists it, localised price included — or null if it isn't on sale. */
export async function fetchPremiumProduct(): Promise<Product | null> {
  if (!(await initIap())) return null;
  try {
    const products = (await fetchProducts({ skus: [IAP_PRODUCTS.premium], type: 'in-app' })) as Product[] | null;
    const product = products?.find((p) => p.id === IAP_PRODUCTS.premium) ?? null;
    // Billing Library 8 returns products it could not load, flagged, instead of leaving them out.
    if (product?.platform === 'android' && product.productStatusAndroid && product.productStatusAndroid !== 'ok') {
      return null;
    }
    return product;
  } catch (err) {
    console.warn('[IAP] fetchProducts failed:', err);
    return null;
  }
}

/**
 * Buys Premium and returns once the outcome is known: Play's sheet has closed and, for a completed
 * payment, the server has granted it and the purchase has been consumed.
 */
export async function purchasePremium(): Promise<PurchaseOutcome> {
  if (!isAndroid) return { status: 'error', message: 'Purchases are made in the Android app.' };
  if (!(await initIap())) {
    return { status: 'error', message: 'Google Play billing is not available on this device.' };
  }
  if (!(await fetchPremiumProduct())) {
    return { status: 'error', message: 'Premium is not offered on Google Play for this version of the app.' };
  }

  const userId = await currentUserId();
  const result = await new Promise<{ purchase: Purchase } | { error: unknown }>((resolve) => {
    let settled = false;
    const subscriptions: { remove: () => void }[] = [];
    const settle = (value: { purchase: Purchase } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      subscriptions.forEach((s) => s.remove());
      resolve(value);
    };
    subscriptions.push(
      purchaseUpdatedListener((purchase) => {
        if (purchase.productId === IAP_PRODUCTS.premium) settle({ purchase });
      }),
      purchaseErrorListener((error) => settle({ error })),
    );
    // A queued event can be delivered while the listeners attach; that already decides it.
    if (settled) {
      subscriptions.forEach((s) => s.remove());
      return;
    }
    requestPurchase({
      request: {
        google: {
          skus: [IAP_PRODUCTS.premium],
          // Ties the purchase to the GeoFold account that made it, so a phone shared by two
          // surveyors never recovers one person's payment onto the other's account.
          ...(userId ? { obfuscatedAccountId: userId } : {}),
        },
      },
      type: 'in-app',
    }).catch((error: unknown) => settle({ error }));
  });

  if ('error' in result) {
    if (isUserCancelledError(result.error)) return { status: 'cancelled' };
    if ((result.error as { code?: string } | null)?.code === ErrorCode.AlreadyOwned) {
      // An earlier purchase was paid for but never finished — usually the app closed between
      // paying and the server confirming. Settle that one instead of charging twice.
      return (await recoverPurchases())
        ? { status: 'granted' }
        : { status: 'error', message: 'An earlier purchase is still being confirmed. Try again in a few minutes.' };
    }
    console.warn('[IAP] purchase failed:', result.error);
    return { status: 'error', message: getUserFriendlyErrorMessage(result.error as Error) };
  }

  return settlePurchase(result.purchase);
}

/**
 * Settles Premium purchases Play still holds unfinished: paid, but never confirmed by our server or
 * never consumed — the app closed half-way, the network dropped, or a pending payment has cleared
 * since. Returns true when one was granted, so the caller can refresh the plan.
 */
export async function recoverPurchases(): Promise<boolean> {
  if (!(await initIap())) return false;

  let purchases: Purchase[];
  try {
    purchases = await getAvailablePurchases();
  } catch (err) {
    console.warn('[IAP] getAvailablePurchases failed:', err);
    return false;
  }

  const userId = await currentUserId();
  let granted = false;
  for (const purchase of purchases) {
    if (purchase.productId !== IAP_PRODUCTS.premium || purchase.purchaseState !== 'purchased') continue;
    const owner = (purchase as PurchaseAndroid).obfuscatedAccountIdAndroid;
    if (owner && owner !== userId) continue; // someone else's purchase on a shared phone
    if ((await settlePurchase(purchase)).status === 'granted') granted = true;
  }
  return granted;
}

/** Steps 2 and 3 of the flow above, for one purchase Play has reported. */
async function settlePurchase(purchase: Purchase): Promise<PurchaseOutcome> {
  if (purchase.purchaseState === 'pending') return { status: 'pending' };
  if (purchase.purchaseState !== 'purchased') {
    return { status: 'error', message: 'Google Play did not confirm the payment.' };
  }

  const verdict = await verifyAndGrantPremium(purchase);
  if (!verdict.ok || !verdict.granted) {
    // Left unfinished on purpose — see the note at the top of the file.
    return {
      status: 'error',
      message: `${verdict.error ?? 'The purchase could not be confirmed.'} It will be retried the next time you open Profile; if it never goes through, Google refunds it within 3 days.`,
    };
  }

  try {
    await finishTransaction({ purchase, isConsumable: true });
  } catch (err) {
    // Premium is granted already. An unconsumed purchase only blocks the next one until
    // recoverPurchases() finishes it, and the server treats the repeat as already processed.
    console.warn('[IAP] finishTransaction failed:', err);
  }
  return { status: 'granted' };
}

/** Asks our server to record the purchase and extend Premium. */
export async function verifyAndGrantPremium(
  purchase: Purchase,
): Promise<{ ok: boolean; granted: boolean; error?: string }> {
  const android = purchase as PurchaseAndroid;
  try {
    const res = await api<{ granted: boolean }>('/api/subscriptions/verify-android', {
      method: 'POST',
      // A plain object — api() serialises the body itself. The previous JSON.stringify(...) here
      // sent a JSON *string*, which the server read as a request with no purchase token at all.
      body: {
        productId: android.productId,
        purchaseToken: android.purchaseToken,
        // Play's order id. License-tester purchases have none, and there `id` falls back to the
        // purchase token — unique either way, which is what the server de-duplicates on.
        orderId: android.transactionId ?? android.id,
        // The package Google recorded the purchase against, not a hard-coded one: verifying the
        // token with Play requires the real package name.
        packageName: android.packageNameAndroid ?? Constants.expoConfig?.android?.package ?? null,
      },
    });
    return { ok: true, granted: res.granted };
  } catch (err) {
    console.warn('[IAP] verify-android failed:', err);
    return { ok: false, granted: false, error: errorMessage(err, 'Could not reach the server to confirm the purchase.') };
  }
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}
