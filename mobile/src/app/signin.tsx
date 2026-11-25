import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChevron } from '@/components/icons';
import { Button, ErrorNote, Input, Segmented, useT } from '@/components/ui';
import { Fonts, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/config';
import { OAUTH_PROVIDERS, signInWithProvider } from '@/lib/oauth';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp, verifyOtp, enterDemo } = useAuth();

  const [tab, setTab] = useState(mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = tab === 'signup';

  const startSocial = async (provider: (typeof OAUTH_PROVIDERS)[number]) => {
    setError(null);
    setNotice(null);
    setSocial(provider.id);
    try {
      // A false result just means the surveyor backed out of the browser sheet.
      await signInWithProvider(provider.id);
    } catch (e) {
      setError(errorMessage(e, `Could not sign in with ${provider.label}.`));
    } finally {
      setSocial(null);
    }
  };

  const submit = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isSignup) {
        const confirmationRequired = await signUp(email, password, { name, org });
        if (confirmationRequired) {
          setNotice('Check your email for the confirmation link, or enter the 6-digit verification code below:');
          setAwaitingOtp(true);
        }
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(errorMessage(e, isSignup ? 'Could not create the account.' : 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!otp.trim()) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await verifyOtp(email, otp);
    } catch (e) {
      setError(errorMessage(e, 'Could not verify code. Please check and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={6}>
          <BackChevron />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'signin', label: 'Sign in' },
            { key: 'signup', label: 'Create account' },
          ]}
        />

        <View style={{ height: 26 }} />

        {error ? <ErrorNote message={error} /> : null}
        {DEMO_MODE ? null : (
          <>
            {OAUTH_PROVIDERS.map((provider) => (
              <Button
                key={provider.id}
                title={social === provider.id ? 'Opening…' : `Continue with ${provider.label}`}
                variant="outline"
                onPress={() => startSocial(provider)}
                disabled={busy || social !== null}
                style={styles.gap}
              />
            ))}
            <View style={styles.dividerRow}>
              <View style={styles.rule} />
              <Text style={T.caption}>or</Text>
              <View style={styles.rule} />
            </View>
          </>
        )}
        {notice ? (
          <View style={styles.notice}>
            <Text style={[T.body, { color: C.ok }]}>{notice}</Text>
          </View>
        ) : null}

        {awaitingOtp ? (
          <>
            <Input
              placeholder="Enter 6-digit verification code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              autoCapitalize="none"
              onSubmitEditing={submitOtp}
              returnKeyType="go"
              style={styles.gap}
            />
            <Button
              title={busy ? 'Verifying…' : 'Verify Code'}
              onPress={submitOtp}
              busy={busy}
              disabled={!otp.trim()}
            />
            <View style={{ height: 12 }} />
            <Button
              title="Resend or back to form"
              variant="outline"
              onPress={() => setAwaitingOtp(false)}
            />
          </>
        ) : (
          <>
            {isSignup ? (
              <>
                <Input
                  placeholder="Full name"
                  value={name}
                  onChangeText={setName}
                  style={styles.gap}
                />
                <Input
                  placeholder="Organization"
                  value={org}
                  onChangeText={setOrg}
                  style={styles.gap}
                />
              </>
            ) : null}

            <Input
              placeholder="Work email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={styles.gap}
            />
            <Input
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={submit}
              returnKeyType="go"
              style={{ marginBottom: 10 }}
            />

            <View style={{ height: 18 }} />

            <Button
              title={busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
              onPress={submit}
              busy={busy}
              disabled={!email || !password}
            />
          </>
        )}

        {DEMO_MODE ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.rule} />
              <Text style={T.caption}>or</Text>
              <View style={styles.rule} />
            </View>
            <Button title="Continue with sample data" variant="outline" onPress={enterDemo} />
            <Text style={[T.caption, { textAlign: 'center', marginTop: 16 }]}>
              No Supabase project is configured, so GeoFold is running on sample data.
            </Text>
          </>
        ) : null}

        <View style={{ flex: 1 }} />

        <Text style={styles.footer}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <Text
            style={styles.link}
            onPress={() => setTab(isSignup ? 'signin' : 'signup')}>
            {isSignup ? 'Sign in' : 'Create one'}
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((C) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingTop: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 28, paddingTop: 12, flexGrow: 1 },
  gap: { marginBottom: 12 },
  notice: { backgroundColor: C.okBg, borderRadius: 10, padding: 14, marginBottom: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  rule: { flex: 1, height: 1, backgroundColor: C.line90 },
  footer: { textAlign: 'center', fontSize: 14, color: C.ink46, marginTop: 24, fontFamily: Fonts.sans },
  link: { color: C.accent, fontWeight: '500' },
}));
