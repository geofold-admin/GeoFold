import { Tabs } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FolderIcon, MapIcon, UserIcon } from '@/components/icons';
import { Fonts, useColors } from '@/constants/theme';

/** The active tab's icon sits on a tinted pill, Material 3 style; the others sit bare. */
function TabGlyph({ focused, children }: { focused: boolean; children: ReactNode }) {
  const C = useColors();
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? C.accentTint : 'transparent',
      }}>
      {children}
    </View>
  );
}

/**
 * Three destinations: Map, Projects, Profile. Capture is deliberately not one of them — it is the
 * floating action button on Map and Projects, which is how the prototype gets to it.
 *
 * There is no Gallery tab. Photos are survey evidence, and a survey only means something inside
 * its project, so they live in the project's own detail screen (`project/[id]`) rather than in a
 * flat stream across every project — one place to look, not two.
 */
export default function TabsLayout() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  // The navigator hands icons a ColorValue; both tints here are plain hex strings, which is what
  // the icon components draw with.
  const hex = (c: unknown) => c as string;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accentText,
        tabBarInactiveTintColor: C.ink60,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', fontFamily: Fonts.sans },
        // The navigator's icon slot is a fixed 31x28; widened to hold the active pill.
        tabBarIconStyle: { width: 56, height: 30 },
        // An explicit height replaces the navigator's own inset handling, so the system navigation
        // area has to be added back by hand — without it the gesture handle (or the 3-button bar)
        // sits on top of the tab labels on edge-to-edge Android.
        tabBarStyle: {
          height: 66 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 10 + insets.bottom,
          borderTopColor: C.line90,
          backgroundColor: C.surface,
        },
        sceneStyle: { backgroundColor: C.surface },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <MapIcon color={hex(color)} size={22} />
            </TabGlyph>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <FolderIcon color={hex(color)} size={22} />
            </TabGlyph>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <UserIcon color={hex(color)} size={22} />
            </TabGlyph>
          ),
        }}
      />
    </Tabs>
  );
}
