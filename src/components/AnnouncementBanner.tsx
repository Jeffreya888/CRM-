// Tarmo announcements (posted in Platform admin) shown at the top of the app until dismissed or ended.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons, T } from './ui';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

type Announcement = { id: string; title: string; body: string; level: 'info' | 'warning'; url: string | null };
const KEY = 'announcements-dismissed:v1';

export function AnnouncementBanner() {
  const { session } = useSession();
  const uid = session?.user.id;
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setDismissed(v ? (JSON.parse(v) as string[]) : []), () => setDismissed([]));
  }, []);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc('current_announcements');
      if (alive && Array.isArray(data)) setItems(data as Announcement[]);
    };
    void load();
    const t = setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [uid]);

  if (!dismissed) return null;
  const a = items.find((x) => !dismissed.includes(x.id));
  if (!a) return null;
  const dismiss = () => {
    // Keep only ids that are still showing so storage stays small.
    const next = [...dismissed.filter((id) => items.some((x) => x.id === id)), a.id];
    setDismissed(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };
  const open = a.url ? () => (a.url!.startsWith('/') ? router.push(a.url as never) : Linking.openURL(a.url!)) : undefined;
  const warn = a.level === 'warning';
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: warn ? colors.warningSoft : colors.infoSoft, paddingHorizontal: space.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name={warn ? 'warning-outline' : 'megaphone-outline'} size={18} color={warn ? colors.warning : colors.primaryText} style={{ marginTop: 1 }} />
      <Pressable style={{ flex: 1 }} onPress={open} disabled={!open} accessibilityRole={open ? 'link' : undefined}>
        <T style={{ fontWeight: '700' }}>{a.title}</T>
        {a.body ? <T variant="small" style={{ color: colors.text }}>{a.body}</T> : null}
        {open ? <T variant="small" style={{ color: colors.primaryText, fontWeight: '700', marginTop: 2 }}>Learn more</T> : null}
      </Pressable>
      <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss announcement" hitSlop={10}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
