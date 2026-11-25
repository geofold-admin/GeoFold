import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Fonts, ThemeProvider, useTheme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { GisProvider } from '@/lib/gis';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { ReminderScheduler } from '@/lib/reminders';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { SyncProvider } from '@/lib/sync-context';
// Also registers the GPS logger's background task, which must happen at startup — see the file.
import { TrackerProvider } from '@/lib/tracker';

// Rejects if the splash has already gone; that is not a reason to take the app down.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { C } = useTheme();
  const { session, loading } = useAuth();
  const { complete: profileComplete, loading: profileLoading } = useProfile();

  // Nothing may render until both the session and the profile check have settled, or the app
  // flashes the wrong screen — signed-in-but-unonboarded users would see the tabs for a frame.
  const settling = loading || (!!session && profileLoading);

  useEffect(() => {
    if (!settling) SplashScreen.hideAsync().catch(() => {});
  }, [settling]);

  // Navigate reactively when auth/profile state settles or changes while user is on a screen
  useEffect(() => {
    if (settling) return;

    const rootSegment = segments[0] as string | undefined;
    const isAuthRoute = rootSegment === 'welcome' || rootSegment === 'signin' || rootSegment === 'auth';

    if (session) {
      if (!profileComplete) {
        if (rootSegment !== 'onboarding') {
          router.replace('/onboarding');
        }
      } else if (isAuthRoute || !rootSegment) {
        router.replace('/(tabs)');
      }
    } else if (!isAuthRoute) {
      router.replace('/welcome');
    }
  }, [settling, session, profileComplete, segments, router]);

  // `loading` is guaranteed to clear (see lib/auth), but this renders the app background rather
  // than nothing so a stall shows a screen, not a void.
  if (settling) return <View style={{ flex: 1, backgroundColor: C.surface }} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.surface },
        // Detail screens carry the design's own header, so the native one stays off throughout.
        headerTitleStyle: { fontFamily: Fonts.sans },
      }}>
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="signin" />
      {/* Signed in, but the profile and terms consent are not on record yet. The web gates its
          whole shell the same way; this is the mobile half of that record. */}
      <Stack.Protected guard={!!session && !profileComplete}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!!session && profileComplete}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="capture" options={{ animation: 'fade' }} />
        <Stack.Screen name="sync" />
        <Stack.Screen name="drone" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="project/new" />
        <Stack.Screen name="project/data" />
        <Stack.Screen name="survey/[id]" />
        <Stack.Screen name="feature/[id]" />
        <Stack.Screen name="layer/[id]" />
        <Stack.Screen name="map-settings" />
        <Stack.Screen name="tracks" />
        <Stack.Screen name="track/[id]" />
        <Stack.Screen name="overlays" />
        <Stack.Screen name="offline" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
      </Stack.Protected>
    </Stack>
  );
}

/** The theme follows the stored preference, which lives in settings — so it sits just inside them. */
function Themed({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <ThemeProvider preference={settings.theme}>{children}</ThemeProvider>;
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Themed>
          <AuthProvider>
            {/* Inside AuthProvider (it reads the session) and outside the navigator (it gates it). */}
            <ProfileProvider>
              <SyncProvider>
                <GisProvider>
                  <TrackerProvider>
                    <ReminderScheduler />
                    <ThemedStatusBar />
                    <RootNavigator />
                  </TrackerProvider>
                </GisProvider>
              </SyncProvider>
            </ProfileProvider>
          </AuthProvider>
        </Themed>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
