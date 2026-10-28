// Left navigation for the desktop (wide web) layout. Phones and tablets keep
// the bottom tabs and the More screen; this mirrors their items and gating.
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';
import { BranchSwitcher } from '../dashboard/widgets';
import { confirmAction } from '../FormSheet';
import { Logo } from '../site/SitePage';
import { Avatar, Badge, IconButton, Ionicons, Select, T, type IconName } from '../ui';
import { initials, titleCase } from '../../lib/format';
import { SIDEBAR_WIDTH } from '../../lib/layout';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { Branch } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { useMenu, visibleItems, type MenuGroup, type MenuItem } from './menu';

type NavItem = { label: string; icon: IconName; href: string; badge?: string };

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(item.href as never)}
      style={(state) => {
        const hovered = (state as PressableStateCallbackType & { hovered?: boolean }).hovered;
        return [styles.link, active ? styles.linkActive : hovered || state.pressed ? styles.linkHover : null];
      }}
    >
      <Ionicons name={item.icon} size={18} color={active ? colors.primaryText : colors.textMuted} />
      <Text style={[styles.linkText, active && { color: colors.white }]} numberOfLines={1}>{item.label}</Text>
      {item.badge ? <Badge raw label={item.badge} tone="primary" /> : null}
    </Pressable>
  );
}

const toNav = (i: MenuItem): NavItem => ({ label: i.short ?? i.label, icon: i.icon, href: i.href, badge: i.badge });

export function Sidebar() {
  const pathname = usePathname();
  const { org, orgId, role, plan, profile, session, memberships, switchOrg, signOut, can, branchId, setBranchId } = useOrg();
  const { groups } = useMenu();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ help: true });
  const branchesAllowed = can('branches');

  const branchQ = useQuery(async () => {
    if (!branchesAllowed) return [] as Branch[];
    const { data } = await supabase.from('branches').select('*').eq('org_id', orgId).eq('active', true).order('name');
    return (data ?? []) as Branch[];
  }, [orgId, branchesAllowed]);
  const branches = branchQ.data ?? [];

  // Everyday screens first (the phone's tabs plus the busiest tools), then the rest of More by group.
  const all = groups.flatMap((g) => visibleItems(g.items));
  const pick = (href: string) => all.find((i) => i.href === href);
  const primaryHrefs = ['/schedule', '/dispatch', '/quotes', '/invoices'];
  const primary: NavItem[] = [
    { label: 'Dashboard', icon: 'grid-outline', href: '/' },
    ...[pick('/schedule'), pick('/dispatch')].filter(Boolean).map((i) => toNav(i!)),
    { label: 'Jobs', icon: 'briefcase-outline', href: '/jobs' },
    { label: 'Customers', icon: 'people-outline', href: '/customers' },
    ...[pick('/quotes'), pick('/invoices')].filter(Boolean).map((i) => toNav(i!)),
    { label: 'Services & SOPs', icon: 'sparkles-outline', href: '/services' },
  ];
  const order: MenuGroup['key'][] = ['sales', 'operations', 'finance', 'workflow', 'company', 'help'];
  const rest = order
    .map((k) => groups.find((g) => g.key === k)!)
    .map((g) => ({ ...g, items: visibleItems(g.items).filter((i) => !primaryHrefs.includes(i.href)) }))
    .filter((g) => g.items.length);

  const name = profile?.full_name?.trim() || session?.user.email || '';

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Logo size={30} />
        <Pressable onPress={() => router.navigate('/settings')} style={{ marginTop: space.md }}>
          <T style={{ fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{org.name}</T>
          <T variant="small" numberOfLines={1}>{titleCase(plan === 'trial' ? 'Free trial' : plan)} plan</T>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
        {memberships.length > 1 ? (
          <Select label="Company" icon="swap-horizontal-outline" value={org.id}
            options={memberships.map((m) => ({ value: m.org_id, label: m.organization?.name ?? 'Company', hint: titleCase(m.role) }))}
            onChange={(v) => { if (v && v !== org.id) switchOrg(v); }} />
        ) : null}
        {branchesAllowed && branches.length > 0 ? (
          <BranchSwitcher branches={branches} value={branches.some((b) => b.id === branchId) ? branchId : null} onChange={setBranchId} />
        ) : null}

        {primary.map((i) => <NavLink key={i.href} item={i} active={isActive(pathname, i.href)} />)}

        {rest.map((g) => {
          const open = !collapsed[g.key] || g.items.some((i) => isActive(pathname, i.href));
          return (
            <View key={g.key} style={{ marginTop: space.lg }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setCollapsed((c) => ({ ...c, [g.key]: open }))} style={styles.groupHead}>
                <T variant="overline" style={{ flex: 1, fontSize: 11 }}>{g.title}</T>
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textFaint} />
              </Pressable>
              {open ? g.items.map((i) => <NavLink key={i.href} item={toNav(i)} active={isActive(pathname, i.href)} />) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={() => router.navigate('/account')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 }}>
          <Avatar label={initials(name || org.name)} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={{ fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{name}</T>
            <T variant="small" numberOfLines={1}>{titleCase(role)}</T>
          </View>
        </Pressable>
        <IconButton icon="log-out-outline" color={colors.textMuted} label="Sign out"
          onPress={() => confirmAction('Sign out?', 'You can sign back in any time.', () => { signOut(); })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: SIDEBAR_WIDTH, backgroundColor: colors.bgDeep, borderRightWidth: 1, borderRightColor: colors.border },
  header: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: space.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 9, borderRadius: radius.sm + 2, marginBottom: 2 },
  linkActive: { backgroundColor: colors.primarySoft },
  linkHover: { backgroundColor: colors.card },
  linkText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 6, marginBottom: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border },
});
