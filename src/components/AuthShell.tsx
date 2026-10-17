import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_NAME, isConfigured } from '../lib/config';
import { colors, space } from '../lib/theme';
import { Card, ErrorBanner, Ionicons, T } from './ui';

/** Centered card used by sign-in, sign-up, onboarding, invitations and security gates. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: space.xl }}>
            <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="airplane" size={38} color={colors.primary} />
            </View>
            <T variant="h1" style={{ color: colors.white, marginTop: space.md, textAlign: 'center' }}>{APP_NAME} CRM</T>
            <T variant="muted" style={{ textAlign: 'center' }}>Aircraft care. Business ready.</T>
          </View>
          <Card style={{ maxWidth: 440, width: '100%', alignSelf: 'center' }}>
            {!isConfigured ? (
              <ErrorBanner message="Backend not configured. Copy .env.example to .env and add your Supabase URL and anon key." />
            ) : null}
            <T variant="h2" style={{ marginBottom: subtitle ? space.xs : space.lg }}>{title}</T>
            {subtitle ? <T variant="muted" style={{ marginBottom: space.lg }}>{subtitle}</T> : null}
            {children}
          </Card>
          {footer ? <View style={{ maxWidth: 440, width: '100%', alignSelf: 'center', marginTop: space.lg }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
