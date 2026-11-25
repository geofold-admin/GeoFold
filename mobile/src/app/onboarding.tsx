import * as Linking from 'expo-linking';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorNote, Field, Segmented, useT } from '@/components/ui';
import { Fonts, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';
import { useProfile } from '@/lib/profile';

/**
 * Mandatory first-run profile, mirroring the web app's /onboarding screen.
 *
 * The consent checkbox is the point of the screen: `AgreedTermsAtUtc` is the record that this
 * person accepted the Terms and the Privacy Policy, and until this existed it was only ever
 * captured from the web client. The same `PUT /api/profile` validates both.
 */

/** The profile fields this screen edits — all of them are plain strings on the server. */
type Editable = 'fullName' | 'whatsappNumber' | 'domicile' | 'gender' | 'occupation';

// Must match GENDERS in the server route, which rejects anything else.
const GENDERS = [
  { key: 'Laki-laki', label: 'Laki-laki' },
  { key: 'Perempuan', label: 'Perempuan' },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const { signOut } = useAuth();
  const { profile, error: loadError, reload, save } = useProfile();

  // Each field is "what the surveyor typed, else what the server already holds". Deriving it this
  // way rather than copying the profile into state in an effect means a half-finished profile that
  // arrives after first paint still prefills, and nothing the surveyor has typed is overwritten
  // when it does.
  const [edits, setEdits] = useState<Partial<Record<Editable, string>>>({});
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = (field: Editable) => edits[field] ?? profile?.[field] ?? '';
  const set = (field: Editable) => (v: string) => setEdits((e) => ({ ...e, [field]: v }));

  const fullName = value('fullName');
  const whatsapp = value('whatsappNumber');
  const domicile = value('domicile');
  const gender = value('gender');
  const occupation = value('occupation');

  const open = (path: string) => Linking.openURL(`${API_BASE_URL}${path}`).catch(() => {});

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await save({
        fullName: fullName.trim(),
        whatsappNumber: whatsapp.trim(),
        domicile: domicile.trim(),
        gender,
        occupation: occupation.trim(),
        agreedTerms: agree,
      });
      // No navigation here: completing the profile flips the navigator's guard and the app
      // screens replace this one.
    } catch (e) {
      setError(errorMessage(e, 'Tidak dapat menyimpan profil. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!fullName.trim() && !!whatsapp.trim() && !!domicile.trim() && !!gender && agree;

  return (
    // The status bar inset sits on the container, not inside the scroll, so the form never slides
    // under the clock.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: 20, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={T.h1}>Lengkapi profil</Text>
        <Text style={[T.body, { marginTop: 8, marginBottom: 22 }]}>
          Sekali saja. Data ini menempel pada setiap survei yang kamu kirim, sehingga catatan
          lapangan punya penanggung jawab yang jelas.
        </Text>

        <ErrorNote message={error ?? loadError} />
        {loadError ? (
          <Button title="Coba lagi" variant="outline" onPress={() => void reload()} style={{ marginBottom: 18 }} />
        ) : null}

        <Field
          label="Nama lengkap"
          required
          value={fullName}
          onChangeText={set('fullName')}
          autoCapitalize="words"
          maxLength={120}
          placeholder="Nama sesuai identitas"
        />

        <Field
          label="Nomor WhatsApp"
          required
          value={whatsapp}
          onChangeText={set('whatsappNumber')}
          keyboardType="phone-pad"
          maxLength={20}
          placeholder="0812xxxxxxxx"
        />

        <Field
          label="Domisili (tempat tinggal)"
          required
          value={domicile}
          onChangeText={set('domicile')}
          maxLength={120}
          placeholder="Kota / Kabupaten"
        />

        <View style={{ marginBottom: 12 }}>
          <Text style={styles.label}>
            Jenis kelamin<Text style={{ color: C.danger }}> *</Text>
          </Text>
          <Segmented options={GENDERS} value={gender} onChange={set('gender')} />
        </View>

        <Field
          label="Bidang pekerjaan (opsional)"
          value={occupation}
          onChangeText={set('occupation')}
          maxLength={120}
          placeholder="mis. Surveyor, Mahasiswa"
        />

        <Pressable
          onPress={() => setAgree((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agree }}
          style={styles.consent}>
          <View style={[styles.box, agree ? styles.boxOn : null]}>
            {agree ? <Text style={styles.tick}>✓</Text> : null}
          </View>
          <Text style={styles.consentText}>
            Saya menyetujui{' '}
            <Text style={styles.link} onPress={() => open('/privacy')}>
              Kebijakan Privasi
            </Text>{' '}
            dan{' '}
            <Text style={styles.link} onPress={() => open('/terms')}>
              Syarat &amp; Ketentuan
            </Text>
            , serta memahami bahwa saya menggunakan layanan ini atas tanggung jawab sendiri.
          </Text>
        </Pressable>

        <Button
          title={busy ? 'Menyimpan…' : 'Simpan & lanjut'}
          onPress={submit}
          busy={busy}
          disabled={!ready}
          size="lg"
        />

        <Text style={styles.footer}>
          Salah akun?{' '}
          <Text style={styles.link} onPress={() => void signOut()}>
            Keluar
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((C) => ({
  body: { paddingHorizontal: 28, flexGrow: 1 },
  label: { fontSize: 13, color: C.ink55, marginBottom: 6, fontFamily: Fonts.sans },

  consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 10, marginBottom: 22 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.line88,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.ink30, fontFamily: Fonts.sans },

  link: { color: C.accent, fontWeight: '500' },
  footer: { textAlign: 'center', fontSize: 13, color: C.ink55, marginTop: 24, fontFamily: Fonts.sans },
}));
