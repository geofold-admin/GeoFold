import { Platform } from 'react-native';
import RNIap, {
  Product,
  Purchase,
  SubscriptionPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getProducts,
  getSubscriptions,
  requestPurchase,
  getAvailablePurchases,
  acknowledgePurchase,
} from 'react-native-iap';
import { api } from './api';
import type { SubscriptionMe } from './types';

/** Product IDs must match exactly what's configured in Google Play Console */
export const IAP_PRODUCTS = {
  premium: 'geofold_premium_1month',
} as const;

type ProductId = (typeof IAP_PRODUCTS)[keyof typeof IAP_PRODUCTS];

interface IapProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  currency: string;
}

interface PurchaseResult {
  success: boolean;
  purchase?: Purchase;
  error?: string;
}

let purchaseUpdateSubscription: ReturnType<typeof purchaseUpdatedListener> | null = null;
let purchaseErrorSubscription: ReturnType<typeof purchaseErrorListener> | null = null;

export async function initIap(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    await RNIap.initConnection();
    return true;
  } catch (err) {
    console.error('[IAP] initConnection failed:', err);
    return false;
  }
}

export async function endIap(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await RNIap.endConnection();
  } catch (err) {
    console.error('[IAP] endConnection failed:', err);
  }
}

export async function fetchProducts(productIds: ProductId[]): Promise<IapProduct[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const products = await getProducts({ skus: productIds as string[] });
    return products.map((p: Product) => ({
      productId: p.productId,
      title: p.title,
      description: p.description,
      price: p.price,
      priceAmountMicros: p.priceAmountMicros,
      currency: p.priceCurrencyCode,
    }));
  } catch (err) {
    console.error('[IAP] fetchProducts failed:', err);
    return [];
  }
}

export async function fetchSubscriptions(productIds: ProductId[]): Promise<IapProduct[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const subs = await getSubscriptions({ skus: productIds as string[] });
    return subs.map((p: Product) => ({
      productId: p.productId,
      title: p.title,
      description: p.description,
      price: p.price,
      priceAmountMicros: p.priceAmountMicros,
      currency: p.priceCurrencyCode,
    }));
  } catch (err) {
    console.error('[IAP] fetchSubscriptions failed:', err);
    return [];
  }
}

export function onPurchaseUpdate(
  onSuccess: (purchase: Purchase) => void,
  onError: (error: string) => void
): () => void {
  if (Platform.OS !== 'android') return () => {};

  if (!purchaseUpdateSubscription) {
    purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
      console.log('[IAP] purchaseUpdated:', purchase);
      await finishTransaction(purchase, true);
      onSuccess(purchase);
    });
  }

  if (!purchaseErrorSubscription) {
    purchaseErrorSubscription = purchaseErrorListener((err: { code: string; message: string }) => {
      console.error('[IAP] purchaseError:', err);
      onError(err.message);
    });
  }

  return () => {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
  };
}

export async function buyProduct(productId: ProductId): Promise<PurchaseResult> {
  if (Platform.OS !== 'android') {
    return { success: false, error: 'IAP only available on Android' };
  }

  try {
    // Ensure connection is active
    await initIap();

    const purchase = await requestPurchase({ skus: [productId as string] });
    if (!purchase || purchase.length === 0) {
      return { success: false, error: 'Purchase cancelled or failed' };
    }

    const p = purchase[0];
    console.log('[IAP] purchase result:', p);

    // Acknowledge/finish the transaction
    await finishTransaction(p, true);

    return { success: true, purchase: p };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown purchase error';
    console.error('[IAP] buyProduct failed:', err);
    return { success: false, error: errorMessage };
  }
}

export async function restorePurchases(): Promise<Purchase[]> {
  if (Platform.OS !== 'android') return [];
  try {
    await initIap();
    const purchases = await getAvailablePurchases();
    return purchases.filter(
      (p: Purchase) => p.productId === IAP_PRODUCTS.premium
    );
  } catch (err) {
    console.error('[IAP] restorePurchases failed:', err);
    return [];
  }
}

/** Verify purchase with our backend and grant premium */
export async function verifyAndGrantPremium(purchase: Purchase): Promise<{ ok: boolean; granted: boolean; error?: string }> {
  try {
    const res = await api<{ granted: boolean }>('/api/subscriptions/verify-android', {
      method: 'POST',
      body: JSON.stringify({
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        orderId: purchase.orderId,
        packageName: 'app.geofold.mobile',
      }),
    });
    return { ok: true, granted: res.granted };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Verification failed';
    console.error('[IAP] verifyAndGrantPremium failed:', err);
    return { ok: false, granted: false, error: errorMessage };
  }
}

/** Check current subscription status from our backend */
export async function checkSubscriptionStatus(): Promise<SubscriptionMe | null> {
  try {
    const me = await api<SubscriptionMe>('/api/subscriptions/me');
    return me;
  } catch {
    return null;
  }
}

/** Listen for subscription changes (Android real-time developer notifications) */
export async function listenForSubscriptionUpdates(
  onUpdate: (premiumActive: boolean) => void
): Promise<() => void> {
  const cleanup = onPurchaseUpdate(
    async (purchase) => {
      if (purchase.productId === IAP_PRODUCTS.premium) {
        const result = await verifyAndGrantPremium(purchase);
        onUpdate(result.granted);
      }
    },
    (err) => console.error('[IAP] listener error:', err)
  );

  return cleanup;
}