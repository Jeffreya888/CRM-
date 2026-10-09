import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_NAME, APP_TAGLINE, isConfigured } from '../lib/config';
import { colors, space } from '../lib/theme';
import { Card, ErrorBanner, Ionicons, T } from './ui';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: space.xl }}>
            <Ionicons name="airplane" size={48} color={colors.accent} />
            <T variant="h1" style={{ color: colors.white, marginTop: space.sm }}>{APP_NAME}</T>
            <T style={{ color: '#C7D2FE' }}>{APP_TAGLINE}</T>
          </View>
          <Card style={{ maxWidth: 440, width: '100%', alignSelf: 'center' }}>
            {!isConfigured ? (
              <ErrorBanner message="Backend not configured. Copy .env.example to .env and add your Supabase URL and anon key." />
            ) : null}
            <T variant="h2" style={{ marginBottom: space.lg }}>{title}</T>
            {children}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
