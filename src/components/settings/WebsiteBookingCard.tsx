// Settings → Website booking: a public booking page for the company's own website.
// Bookings land in Requests and Leads, with the customer and the aircraft / boat / vehicle added.
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, Loading, Row, Segmented, T, ToggleRow } from '../ui';
import { PORTAL_URL } from '../../lib/config';
import { relative } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Status = { slug: string | null; enabled: boolean; message: string | null; suggested_slug: string; bookings_30d: number; last_booking_at: string | null };

type Style = 'dark' | 'light';
export const bookingLink = (slug: string, style: Style = 'dark') => `${PORTAL_URL}/book/${slug}${style === 'light' ? '?theme=light' : ''}`;
export const buttonSnippet = (slug: string, style: Style = 'dark') =>
  `<a href="${bookingLink(slug, style)}" target="_blank" rel="noopener" style="display:inline-block;background:${style === 'light' ? '#0B5CAD' : '#0B1B33'};color:#ffffff;padding:14px 26px;border-radius:10px;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none">Book a detail</a>`;
export const embedSnippet = (slug: string, style: Style = 'dark') =>
  `<iframe src="${PORTAL_URL}/book/${slug}?embed=1${style === 'light' ? '&theme=light' : ''}" title="Book a detail" style="width:100%;max-width:760px;height:1250px;border:0;border-radius:16px" loading="lazy"></iframe>`;

export function WebsiteBookingCard({ orgId, isDemo }: { orgId: string; isDemo: boolean }) {
  const q = useQuery(async () => (await must(supabase.rpc('booking_page_status', { p_org: orgId }))) as Status, [orgId]);
  const [slug, setSlug] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<Style>('dark');
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  const curSlug = slug ?? s?.slug ?? s?.suggested_slug ?? '';
  const curMessage = message ?? s?.message ?? '';

  const save = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const saved = (await must(supabase.rpc('set_booking_page', { p_org: orgId, p_enabled: enabled, p_slug: curSlug, p_message: curMessage }))) as string;
      setSlug(saved);
      setMessage(null);
      await q.reload();
      notify(enabled ? 'Booking page is live' : 'Saved', enabled ? `Customers can book at ${bookingLink(saved)}` : 'Your booking page is turned off.');
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    notify('Copied', `${what} copied. Paste it into your website.`);
  };

  if (isDemo) return <Card><T variant="muted">The website booking page is available once you create your own company.</T></Card>;
  if (q.loading) return <Card><Loading /></Card>;
  const live = !!s?.enabled && !!s.slug;
  return (
    <Card>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Let customers book from your website. Each booking lands in Requests and Leads with the customer and their aircraft, boat or vehicle
        already added, and you get a notification and an email. Customers can add photos, and Tarmo&apos;s AI checks them so you can send a price.
      </T>
      <ErrorBanner message={error ?? q.error} onRetry={q.reload} />
      <Field label="Page address" value={curSlug} onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} autoCapitalize="none"
        hint={`${PORTAL_URL.replace(/^https?:\/\//, '')}/book/${curSlug || 'your-company'}`} />
      <Field label="Welcome message (optional)" value={curMessage} onChangeText={setMessage} maxLength={500} multiline
        placeholder="e.g. Tell us about your aircraft and when it's on the ground. We'll confirm within 2 hours." />
      <ToggleRow label="Booking page is on" value={live} onChange={(v) => save(v)} hint={live ? 'Customers can book now.' : 'Turn on to start taking bookings.'} />
      {live ? <Button small kind="secondary" icon="save-outline" title="Save changes" loading={busy} onPress={() => save(true)} style={{ alignSelf: 'flex-start' }} /> : null}

      {live && s?.slug ? (
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <T style={{ fontWeight: '700' }}>Add it to your website</T>
          <View style={{ gap: space.xs }}>
            <T variant="small">Style: pick the one that matches your website.</T>
            <Segmented value={style} onChange={setStyle} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          </View>
          <View style={{ backgroundColor: colors.cardRaised, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
            <T style={{ fontWeight: '600' }}>1. Link</T>
            <T variant="small">Use it on a “Book now” button, in your email signature, on social media or in texts.</T>
            <T variant="small" style={{ color: colors.primaryText }}>{bookingLink(s.slug, style)}</T>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              <Button small icon="copy-outline" title="Copy link" onPress={() => copy(bookingLink(s.slug!, style), 'Link')} />
              <Button small kind="ghost" icon="open-outline" title="Preview" onPress={() => Linking.openURL(bookingLink(s.slug!, style))} />
            </Row>
          </View>
          <View style={{ backgroundColor: colors.cardRaised, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
            <T style={{ fontWeight: '600' }}>2. “Book a detail” button</T>
            <T variant="small">Paste into an HTML or embed block on Wix, Squarespace, WordPress, GoDaddy or Shopify.</T>
            <Button small icon="copy-outline" title="Copy button code" onPress={() => copy(buttonSnippet(s.slug!, style), 'Button code')} style={{ alignSelf: 'flex-start' }} />
          </View>
          <View style={{ backgroundColor: colors.cardRaised, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
            <T style={{ fontWeight: '600' }}>3. Form on your page</T>
            <T variant="small">Shows the booking form right on your website. Paste into an HTML or embed block.</T>
            <Button small icon="copy-outline" title="Copy form code" onPress={() => copy(embedSnippet(s.slug!, style), 'Form code')} style={{ alignSelf: 'flex-start' }} />
          </View>
          <T variant="small" style={{ color: colors.textFaint }}>
            {s.bookings_30d} booking{s.bookings_30d === 1 ? '' : 's'} in the last 30 days{s.last_booking_at ? ` · last ${relative(s.last_booking_at)}` : ''}
          </T>
        </View>
      ) : null}
    </Card>
  );
}
