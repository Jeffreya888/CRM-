import { Stack } from 'expo-router';
import { Screen, Section } from '../../components/ui';
import { CompaniesSection, DataSection, DemoStatusCard, PushSection } from '../../components/security/AccountSections';
import { AppleSection, PasswordSection, ProfileSection } from '../../components/security/ProfileSections';
import { AppLockSection, DevicesSection, TwoStepSection } from '../../components/security/SecuritySections';
import { isAnonymous } from '../../lib/security';
import { useOrg } from '../../lib/session';

/** Account & security: profile, sign-in safety, devices, notifications, companies, data. */
export default function Account() {
  const { isDemo, session } = useOrg();
  const demo = isDemo || isAnonymous(session);

  if (demo) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Account & security' }} />
        <Section title="Demo account" icon="sparkles-outline">
          <DemoStatusCard />
        </Section>
        <AppLockSection />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Account & security' }} />
      <ProfileSection />
      <PasswordSection />
      <TwoStepSection />
      <AppLockSection />
      <AppleSection />
      <DevicesSection />
      <PushSection />
      <CompaniesSection />
      <DataSection />
    </Screen>
  );
}
