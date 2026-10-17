// Public website: open to everyone, signed in or not.
import { Stack } from 'expo-router';
import { site } from '../../components/site/primitives';

export default function SiteLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: site.bg } }} />;
}
