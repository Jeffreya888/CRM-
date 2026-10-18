import { isFuture } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { invoiceTone, jobTone, quoteTone } from '../status';
import { Badge, Button, Card, EmptyState, Ionicons, ListRow, Row, Section, StatTile, T } from '../ui';
import { categoryLabel } from '../../lib/pricing';
import { date, dateTime, money, titleCase } from '../../lib/format';
import type { PortalData, PortalPastJob, PortalUpcomingJob } from '../../lib/portal';
import { colors, radius, space } from '../../lib/theme';
import type { AircraftCategory } from '../../lib/types';
import { BrandHeader, Notice } from './PortalShell';
import { PhotoQuoteSheet } from './PhotoQuoteSheet';
import { RequestSheet, type RequestTarget } from './RequestSheet';

const assetIcon = (t: string) => (t === 'vehicle' ? 'car-outline' : t === 'watercraft' ? 'boat-outline' : 'airplane-outline') as 'car-outline';
const REQUEST_LABEL: Record<string, string> = { booking: 'Service request', reschedule: 'Reschedule request', quote_dates: 'Preferred dates', photo_quote: 'Quote from photos' };

/** Signed-in customer portal: what's coming up, what needs action, history and photos. */
export function PortalDashboard({ data, token, photoUrls, onSignOut, onChanged }: {
  data: PortalData; token: string; photoUrls: Record<string, string>; onSignOut: () => void; onChanged: () => void;
}) {
  const [request, setRequest] = useState<RequestTarget | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [photoQuote, setPhotoQuote] = useState(false);
  // The portal data may not say whether the company offers photo quotes; show it unless it is explicitly off.
  const photoQuotes = (data.org as { photo_quotes_enabled?: boolean }).photo_quotes_enabled !== false;
  const cur = 'USD';

  const openQuotes = data.quotes.filter((q) => ['sent', 'viewed'].includes(q.status) && (!q.valid_until_at || isFuture(new Date(q.valid_until_at))));
  const unpaid = data.invoices.filter((i) => Number(i.balance) > 0 && !['void', 'paid', 'draft'].includes(i.status));
  const owed = unpaid.reduce((s, i) => s + Number(i.balance), 0);
  const pendingRequests = data.requests.filter((r) => r.status === 'pending');
  const firstName = data.customer.name.split(/\s+/)[0];

  return (
    <View>
      <BrandHeader brand={data.org} right={<Button small kind="ghost" icon="log-out-outline" title="Sign out" onPress={onSignOut} />} />

      <T variant="h2" style={{ marginTop: space.sm }}>Hi {firstName}</T>
      <T variant="muted" style={{ marginBottom: space.lg }}>{data.customer.company ?? data.customer.email ?? ''}</T>

      {flash ? <Notice tone="success" icon="checkmark-circle" title={flash} /> : null}

      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <StatTile icon="calendar-outline" tone="info" label="Upcoming visits" value={data.upcoming_jobs.length} />
        <StatTile icon="document-text-outline" tone={openQuotes.length ? 'warning' : 'neutral'} label="Quotes to review" value={openQuotes.length} />
        <StatTile icon="receipt-outline" tone={owed > 0 ? 'danger' : 'success'} label="Balance due" value={money(owed, cur)} />
      </Row>

      <Button icon="add-circle-outline" title="Request service" onPress={() => setRequest({ kind: 'booking' })} style={{ marginTop: space.lg }} />
      {photoQuotes ? (
        <Button kind="secondary" icon="camera-outline" title="Get a quote from photos" onPress={() => setPhotoQuote(true)} style={{ marginTop: space.sm }} />
      ) : null}

      {openQuotes.length || unpaid.length ? (
        <Section title="Needs your attention" icon="alert-circle-outline" iconColor={colors.warning}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {openQuotes.map((q) => (
              <ListRow key={q.token} icon="document-text-outline" tone="warning" title={`Quote ${q.number} · ${money(q.total, cur)}`}
                subtitle={q.valid_until_at ? `Respond by ${dateTime(q.valid_until_at)}` : 'Review and accept'}
                right={<Badge label="Review" tone="warning" raw />} onPress={() => router.push(`/portal/quote/${q.token}`)} />
            ))}
            {unpaid.map((i) => (
              <ListRow key={i.token} icon="card-outline" tone="danger" title={`Invoice ${i.number} · ${money(i.balance, cur)} due`}
                subtitle={`Due ${date(i.due_date)}`} right={<Badge label="Pay" tone={i.status === 'overdue' ? 'danger' : 'info'} raw />}
                onPress={() => router.push(`/portal/invoice/${i.token}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Upcoming service" icon="calendar-outline">
        {data.upcoming_jobs.length ? data.upcoming_jobs.map((j) => (
          <UpcomingCard key={j.id} job={j} onReschedule={() => setRequest({ kind: 'reschedule', job: j })}
            pending={pendingRequests.some((r) => r.kind === 'reschedule')} />
        )) : (
          <Card><EmptyState icon="calendar-outline" title="Nothing scheduled" body="Need a visit? Tap Request service and pick a few times that work." /></Card>
        )}
      </Section>

      {data.requests.length ? (
        <Section title="Your requests" icon="chatbox-ellipses-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {data.requests.slice(0, 10).map((r) => (
              <ListRow key={r.id} icon="time-outline" tone={r.status === 'approved' ? 'success' : r.status === 'declined' ? 'danger' : 'warning'}
                title={REQUEST_LABEL[r.kind] ?? titleCase(r.kind)} subtitle={`Sent ${date(r.created_at)}${r.preferred?.[0] ? ` · first choice ${dateTime(r.preferred[0])}` : ''}`}
                right={<Badge label={r.status === 'pending' ? 'Waiting' : r.status} tone={r.status === 'approved' ? 'success' : r.status === 'declined' ? 'danger' : 'warning'} />} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={data.assets.length === 1 ? 'Your asset' : 'Your assets'} icon="airplane-outline">
        {data.assets.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {data.assets.map((a) => (
              <ListRow key={a.id} icon={assetIcon(a.asset_type)} title={a.tail_number}
                subtitle={[a.manufacturer, a.model].filter(Boolean).join(' ') || categoryLabel(a.category as AircraftCategory)}
                right={<Button small kind="ghost" title="Book" onPress={() => setRequest({ kind: 'booking', assetId: a.id })} />} />
            ))}
          </Card>
        ) : <Card><T variant="muted">No assets on file yet.</T></Card>}
      </Section>

      <Section title="Service history & photos" icon="images-outline">
        {data.past_jobs.length ? data.past_jobs.map((j) => <PastCard key={j.id} job={j} urls={photoUrls} onOpen={setViewer} />)
          : <Card><T variant="muted">Completed visits, service reports and before/after photos will show here.</T></Card>}
      </Section>

      {data.quotes.length ? (
        <Section title="Quotes" icon="document-text-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {data.quotes.map((q) => (
              <ListRow key={q.token} title={`Quote ${q.number}`} subtitle={money(q.total, cur)}
                right={<Badge label={q.status} tone={quoteTone[q.status] ?? 'neutral'} />} onPress={() => router.push(`/portal/quote/${q.token}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      {data.invoices.length ? (
        <Section title="Invoices" icon="receipt-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {data.invoices.map((i) => (
              <ListRow key={i.token} title={`Invoice ${i.number}`} subtitle={`${money(i.total, cur)}${Number(i.balance) > 0 ? ` · ${money(i.balance, cur)} due` : ''}`}
                meta={`Due ${date(i.due_date)}`} right={<Badge label={i.status} tone={invoiceTone[i.status] ?? 'neutral'} />}
                onPress={() => router.push(`/portal/invoice/${i.token}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      {data.org.google_review_url ? (
        <Card onPress={() => Linking.openURL(data.org.google_review_url!).catch(() => {})} style={{ marginTop: space.lg }}>
          <Row>
            <Ionicons name="star" size={22} color={colors.warning} />
            <T style={{ flex: 1 }}>Enjoyed our work? Leave us a Google review.</T>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </Row>
        </Card>
      ) : null}

      <RequestSheet target={request} token={token} assets={data.assets} services={data.services}
        onClose={() => setRequest(null)} onSent={(m) => { setFlash(m); onChanged(); }} />

      <PhotoQuoteSheet visible={photoQuote} token={token} assets={data.assets}
        onClose={() => setPhotoQuote(false)} onSent={(m) => { setFlash(m); onChanged(); }} />

      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <Row style={{ justifyContent: 'flex-end', padding: space.md }}>
            <Button small kind="secondary" title="Close" onPress={() => setViewer(null)} />
          </Row>
          {viewer ? <Image source={{ uri: viewer }} style={{ flex: 1 }} resizeMode="contain" /> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function UpcomingCard({ job, onReschedule, pending }: { job: PortalUpcomingJob; onReschedule: () => void; pending: boolean }) {
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{job.title ?? `Visit ${job.number}`}</T>
          <T variant="muted">{job.scheduled_start ? dateTime(job.scheduled_start) : 'Date to be confirmed'}</T>
          <T variant="small">{[job.tail_number, job.location_name].filter(Boolean).join(' · ')}</T>
        </View>
        <Badge label={job.status === 'tentative' ? 'Pending confirmation' : job.status} tone={jobTone[job.status] ?? 'info'} raw={job.status === 'tentative'} />
      </Row>
      {job.status !== 'in_progress' ? (
        <Button small kind="secondary" icon="swap-horizontal-outline" title={pending ? 'Request another time' : 'Request a new time'} onPress={onReschedule} style={{ marginTop: space.md, alignSelf: 'flex-start' }} />
      ) : null}
    </Card>
  );
}

function PastCard({ job, urls, onOpen }: { job: PortalPastJob; urls: Record<string, string>; onOpen: (u: string) => void }) {
  const order = ['before', 'after', 'damage', 'other'];
  const photos = [...(job.photos ?? [])].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const counts = order.map((k) => [k, photos.filter((p) => p.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{job.title ?? `Visit ${job.number}`}</T>
          <T variant="muted">Completed {date(job.actual_end)}{job.tail_number ? ` · ${job.tail_number}` : ''}</T>
          <T variant="small">Service report {job.number}{counts.length ? ` · ${counts.map(([k, n]) => `${n} ${k}`).join(', ')} photo${photos.length === 1 ? '' : 's'}` : ''}</T>
        </View>
        {job.rating ? (
          <Row gap={2}>{[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= job.rating! ? 'star' : 'star-outline'} size={14} color={colors.warning} />)}</Row>
        ) : null}
      </Row>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, marginTop: space.md }}>
          {photos.map((p) => {
            const u = urls[p.path];
            return (
              <Pressable key={p.path} disabled={!u} onPress={() => u && onOpen(u)}>
                {u ? (
                  <Image source={{ uri: u }} style={{ width: 120, height: 96, borderRadius: radius.md }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 120, height: 96, borderRadius: radius.md, backgroundColor: colors.cardRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={24} color={colors.textFaint} />
                  </View>
                )}
                <T variant="small" style={{ marginTop: 2, textTransform: 'capitalize' }}>{p.caption ?? p.kind}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </Card>
  );
}
