import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorNote } from '@/components/ui';
import { Fonts, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { completeAuthFromUrl } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const searchParams = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const processAuth = async () => {
      if (searchParams.error || searchParams.error_description) {
        setError(searchParams.error_description || searchParams.error || 'Authentication error.');
        return;
      }

      if (searchParams.code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(searchParams.code);
          if (exchangeError) throw new Error(exchangeError.message);
          WebBrowser.dismissBrowser().catch(() => {});
          router.replace('/(tabs)');
          return;
        } catch (e) {
          if (!cancelled) setError(errorMessage(e, 'Could not complete sign in.'));
          return;
        }
      }

      if (searchParams.access_token && searchParams.refresh_token) {
        try {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: searchParams.access_token,
            refresh_token: searchParams.refresh_token,
          });
          if (sessionError) throw new Error(sessionError.message);
          WebBrowser.dismissBrowser().catch(() => {});
          router.replace('/(tabs)');
          return;
        } catch (e) {
          if (!cancelled) setError(errorMessage(e, 'Could not complete sign in.'));
          return;
        }
      }

      try {
        const initial = await Linking.getInitialURL();
        if (initial && initial.includes('auth/callback')) {
          const ok = await completeAuthFromUrl(initial);
          WebBrowser.dismissBrowser().catch(() => {});
          if (ok) {
            router.replace('/(tabs)');
            return;
          }
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, 'Authentication failed. Please try again.'));
        return;
      }

      // No credentials in URL and no initial deep link to process — return to welcome
      if (!cancelled) {
        router.replace('/welcome');
      }
    };

    void processAuth();

    const sub = Linking.addEventListener('url', async ({ url }) => {
      if (!url || !url.includes('auth/callback')) return;
      try {
        const ok = await completeAuthFromUrl(url);
        WebBrowser.dismissBrowser().catch(() => {});
        if (ok) router.replace('/(tabs)');
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, 'Authentication failed. Please try again.'));
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [searchParams, router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
      {error ? (
        <View style={styles.content}>
          <ErrorNote message={error} />
          <View style={{ height: 16 }} />
          <Button title="Back to Sign In" onPress={() => router.replace('/signin')} />
        </View>
      ) : (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.text}>Signing in…</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.surface, justifyContent: 'center', paddingHorizontal: 28 },
  content: { alignItems: 'center', gap: 12 },
  text: { fontSize: 16, color: C.ink75, fontFamily: Fonts.sans },
}));
