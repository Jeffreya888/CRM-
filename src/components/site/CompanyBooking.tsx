// A company's own public booking page: gettarmo.com/book/<slug>.
// ?embed=1 shows just the form (for an iframe on the company's website); ?theme=light matches a light website.
// The booking lands in the company's Tarmo as a customer, an aircraft / boat / vehicle, a lead and a request.
// With photos it is a "Quote from photos": an AI condition check runs on them for the team.
import { createElement, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { CTAButton, Container, Glow, Ionicons, fontFamily, site, useBreakpoint } from './primitives';
import { APP_NAME } from '../../lib/config';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';

type AssetType = 'aircraft' | 'watercraft' | 'vehicle';
export type CompanyInfo = {
  name: string; logo_url: string | null; phone: string | null; website: string | null; message: string | null; photo_quotes?: boolean;
  business_types: AssetType[]; services: { id: string; name: string; description: string | null; asset_type: AssetType }[];
};
export type BookingTheme = 'dark' | 'light';

const PALETTE = {
  dark: {
    bg: site.bg, panel: 'rgba(27, 33, 48, 0.72)', line: 'rgba(255,255,255,0.10)', lineStrong: 'rgba(255,255,255,0.18)', input: 'rgba(255,255,255,0.04)',
    text: '#F4F6FA', muted: '#A7B0C0', faint: '#6B7385', accent: '#4F8CFF', accentSoft: 'rgba(79,140,255,0.16)', gold: '#E0B25A', danger: '#F87171', success: '#34D399',
  },
  light: {
    bg: '#FFFFFF', panel: '#FFFFFF', line: '#E3E7EE', lineStrong: '#CBD3DF', input: '#FFFFFF',
    text: '#0F172A', muted: '#475569', faint: '#94A3B8', accent: '#0B5CAD', accentSoft: '#E6F0FB', gold: '#9A6B1F', danger: '#B91C1C', success: '#15803D',
  },
};
type Pal = typeof PALETTE.dark;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PHOTOS = 6;
const ASSET: Record<AssetType, { label: string; id: string; idHint: string; desc: string; descHint: string; where: string; whereHint: string }> = {
  aircraft: { label: 'Aircraft', id: 'Tail number', idHint: 'e.g. N550GV', desc: 'Make and model', descHint: 'e.g. Gulfstream G550', where: 'Airport or FBO', whereHint: 'e.g. KHOU, Signature' },
  watercraft: { label: 'Boat', id: 'Boat name', idHint: 'e.g. Sea Breeze', desc: 'Make, model and length', descHint: 'e.g. Sea Ray 45 ft', where: 'Marina or address', whereHint: 'e.g. Lakewood Yacht Club, slip 12' },
  vehicle: { label: 'Vehicle', id: 'Plate or VIN', idHint: 'Optional', desc: 'Year, make and model', descHint: 'e.g. 2024 Porsche 911', where: 'Address', whereHint: 'Where should we come, or will you drop it off?' },
};

function Label({ p, text, optional }: { p: Pal; text: string; optional?: boolean }) {
  return (
    <Text style={{ fontFamily, color: p.text, fontSize: 14, fontWeight: '700' }}>
      {text}{optional ? <Text style={{ color: p.faint, fontWeight: '500' }}> (optional)</Text> : null}
    </Text>
  );
}

function Field({ p, label, optional, error, grow, ...props }: TextInputProps & { p: Pal; label: string; optional?: boolean; error?: string | null; grow?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={grow ? { gap: 7, flex: 1 } : { gap: 7 }}>
      <Label p={p} text={label} optional={optional} />
      <TextInput accessibilityLabel={label} placeholderTextColor={p.faint} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...props}
        style={{
          fontFamily, color: p.text, fontSize: 16, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: p.input,
          borderColor: error ? p.danger : focus ? p.accent : p.lineStrong, minHeight: props.multiline ? 110 : undefined, textAlignVertical: props.multiline ? 'top' : 'center',
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
        }} />
    </View>
  );
}

/** A date picker on the web, a text field elsewhere. Value is YYYY-MM-DD. */
function DateInput({ p, label, value, onChange, dark }: { p: Pal; label: string; value: string; onChange: (v: string) => void; dark: boolean }) {
  if (Platform.OS === 'web') {
    const min = new Date().toISOString().slice(0, 10);
    return createElement('input', {
      type: 'date', value, min, onChange: (e: any) => onChange(e.target.value), 'aria-label': label,
      style: { fontFamily, color: p.text, fontSize: 16, borderRadius: 12, border: `1px solid ${p.lineStrong}`, padding: '11px 14px', background: p.input, colorScheme: dark ? 'dark' : 'light', width: '100%', boxSizing: 'border-box' },
    });
  }
  return <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={p.faint} accessibilityLabel={label}
    style={{ fontFamily, color: p.text, fontSize: 16, borderRadius: 12, borderWidth: 1, borderColor: p.lineStrong, paddingHorizontal: 14, paddingVertical: 12 }} />;
}

type Picked = { file: File; url: string };
const extOf = (f: File) => (/png/i.test(f.type) ? 'png' : /webp/i.test(f.type) ? 'webp' : 'jpg');

export function CompanyBooking({ slug, info, embed, theme }: { slug: string; info: CompanyInfo; embed: boolean; theme: BookingTheme }) {
  const p = PALETTE[theme];
  const dark = theme === 'dark';
  const { isMobile } = useBreakpoint();
  const types = (['aircraft', 'watercraft', 'vehicle'] as AssetType[]).filter((t) => info.business_types.includes(t));
  const [type, setType] = useState<AssetType>(types[0] ?? 'aircraft');
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', assetId: '', assetDesc: '', serviceId: '', where: '', date1: '', date2: '', notes: '', website: '' });
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email', string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const a = ASSET[type];
  const services = info.services.filter((s) => s.asset_type === type);
  const canPhoto = !!info.photo_quotes && Platform.OS === 'web';

  useEffect(() => () => { photos.forEach((x) => URL.revokeObjectURL(x.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((x) => /^image\/(jpeg|png|webp)$/i.test(x.type));
    if (ok.length < list.length) setFailure('Some photos were skipped: please use JPG or PNG photos.');
    else setFailure(null);
    setPhotos((cur) => [...cur, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (i: number) => setPhotos((cur) => { URL.revokeObjectURL(cur[i]!.url); return cur.filter((_, j) => j !== i); });

  /** Uploads the photos through signed upload URLs; returns their storage paths. */
  const uploadPhotos = async (): Promise<string[]> => {
    const groups = new Map<string, File[]>();
    for (const x of photos) groups.set(extOf(x.file), [...(groups.get(extOf(x.file)) ?? []), x.file]);
    const paths: string[] = [];
    for (const [ext, files] of groups) {
      const { uploads } = await callFunction<{ uploads: { path: string; token: string }[] }>('website-booking', { action: 'upload_urls', slug, count: files.length, ext });
      for (let i = 0; i < files.length; i++) {
        const u = uploads[i];
        if (!u) throw new Error('Could not upload the photos. Please try again.');
        const { error } = await supabase.storage.from('org-files').uploadToSignedUrl(u.path, u.token, files[i]!, { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });
        if (error) throw new Error('A photo did not upload. Please try again.');
        paths.push(u.path);
        setBusy(`Uploading photos… ${paths.length}/${photos.length}`);
      }
    }
    return paths;
  };

  const submit = async () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address.';
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(photos.length ? 'Uploading photos…' : 'Sending…');
    try {
      const photoPaths = photos.length ? await uploadPhotos() : [];
      setBusy('Sending…');
      await callFunction('website-booking', {
        action: 'submit', slug, name: f.name, email: f.email, phone: f.phone, company: f.company,
        asset_type: type, asset_id: f.assetId, asset_desc: f.assetDesc, service_id: f.serviceId || undefined, location: f.where,
        preferred: [f.date1, f.date2].filter(Boolean).map((d) => `${d}T12:00:00`), notes: f.notes, photo_paths: photoPaths, website: f.website,
      });
      setDone(true);
    } catch (err: any) {
      setFailure(/fetch|network/i.test(err.message ?? '') ? 'We couldn’t reach the server. Check your connection and try again.' : friendlyError(err.message));
    } finally {
      setBusy(null);
    }
  };

  const chip = (selected: boolean) => ({
    paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1,
    borderColor: selected ? p.accent : p.lineStrong, backgroundColor: selected ? p.accentSoft : 'transparent',
  });
  const row = { flexDirection: (isMobile ? 'column' : 'row') as 'column' | 'row', gap: 16 };
  const card = { backgroundColor: p.panel, borderWidth: 1, borderColor: p.line, borderRadius: 18, padding: isMobile ? 18 : 26, gap: 16 };

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, minHeight: '100%' as any }}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        {embed || !dark ? null : <Glow variant="hero" />}
        <Container style={{ paddingTop: embed ? 12 : isMobile ? 32 : 60, paddingBottom: embed ? 16 : 64, maxWidth: 720 }}>
          {done ? (
            <View style={card}>
              <Ionicons name="checkmark-circle" size={40} color={p.success} />
              <Text style={{ fontFamily, color: p.text, fontSize: 24, fontWeight: '800' }}>Request sent</Text>
              <Text style={{ fontFamily, color: p.muted, fontSize: 16, lineHeight: 24 }}>
                {info.name} has your request{photos.length ? ' and your photos' : ''} and will contact you to confirm the details{photos.length ? ', a price' : ''} and a time. We emailed you a copy.
                {info.phone ? ` Questions? Call ${info.phone}.` : ''}
              </Text>
            </View>
          ) : (
            <>
              {embed ? null : (
                <View style={{ marginBottom: 24, gap: 8 }}>
                  {info.logo_url ? <Image source={{ uri: info.logo_url }} style={{ width: 160, height: 56, marginBottom: 6 }} resizeMode="contain" accessibilityLabel={info.name} /> : null}
                  <Text style={{ fontFamily, color: p.gold, fontSize: 13, fontWeight: '800', letterSpacing: 1.4 }}>BOOK A DETAIL</Text>
                  <Text accessibilityRole="header" style={{ fontFamily, color: p.text, fontSize: isMobile ? 32 : 44, fontWeight: '800', letterSpacing: -0.5 }}>{info.name}</Text>
                  <Text style={{ fontFamily, color: p.muted, fontSize: 17, lineHeight: 26 }}>
                    {info.message || (canPhoto ? 'Tell us what needs detailing and add a few photos. We’ll send you a price and confirm a time.' : 'Tell us what needs detailing and when. We’ll confirm the details and a time with you.')}
                  </Text>
                </View>
              )}
              <View style={card}>
                {types.length > 1 ? (
                  <View style={{ gap: 8 }}>
                    <Label p={p} text="What needs detailing?" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {types.map((t) => (
                        <Pressable key={t} onPress={() => { setType(t); set('serviceId')(''); }} style={chip(type === t)} accessibilityRole="button" accessibilityState={{ selected: type === t }}>
                          <Text style={{ fontFamily, color: p.text, fontSize: 14, fontWeight: '600' }}>{ASSET[t].label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <View style={row}>
                  <Field p={p} label={a.id} optional={type === 'vehicle'} value={f.assetId} grow autoCapitalize={type === 'aircraft' ? 'characters' : 'words'}
                    onChangeText={(v) => set('assetId')(type === 'aircraft' ? v.toUpperCase() : v)} placeholder={a.idHint} />
                  <Field p={p} label={a.desc} optional value={f.assetDesc} onChangeText={set('assetDesc')} grow placeholder={a.descHint} />
                </View>
                {services.length ? (
                  <View style={{ gap: 8 }}>
                    <Label p={p} text="Service" optional />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {services.slice(0, 16).map((s) => (
                        <Pressable key={s.id} onPress={() => set('serviceId')(f.serviceId === s.id ? '' : s.id)} style={chip(f.serviceId === s.id)} accessibilityRole="button" accessibilityState={{ selected: f.serviceId === s.id }}>
                          <Text style={{ fontFamily, color: p.text, fontSize: 14 }}>{s.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {canPhoto ? (
                  <View style={{ gap: 8 }}>
                    <Label p={p} text="Photos for a price" optional />
                    <Text style={{ fontFamily, color: p.muted, fontSize: 13, lineHeight: 19 }}>
                      Add up to {MAX_PHOTOS} photos: the whole {a.label.toLowerCase()} and any problem areas (oxidation, stains, scratches). We’ll use them to send you a price.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {photos.map((x, i) => (
                        <View key={x.url} style={{ width: 84, height: 84, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: p.line }}>
                          <Image source={{ uri: x.url }} style={{ width: 84, height: 84 }} accessibilityLabel={`Photo ${i + 1}`} />
                          <Pressable onPress={() => removePhoto(i)} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}
                            style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 3 }}>
                            <Ionicons name="close" size={14} color="#fff" />
                          </Pressable>
                        </View>
                      ))}
                      {photos.length < MAX_PHOTOS ? (
                        <Pressable onPress={() => fileRef.current?.click()} accessibilityRole="button" accessibilityLabel="Add photos"
                          style={{ width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          <Ionicons name="camera-outline" size={22} color={p.accent} />
                          <Text style={{ fontFamily, color: p.accent, fontSize: 12, fontWeight: '700' }}>Add</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {createElement('input', {
                      ref: fileRef, type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, style: { display: 'none' }, 'aria-hidden': true,
                      onChange: (ev: any) => { addFiles(ev.target.files); ev.target.value = ''; },
                    })}
                  </View>
                ) : null}

                <Field p={p} label={a.where} optional value={f.where} onChangeText={set('where')} placeholder={a.whereHint} />
                <View style={row}>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Label p={p} text="Preferred date" optional />
                    <DateInput p={p} label="Preferred date" value={f.date1} onChange={set('date1')} dark={dark} />
                  </View>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Label p={p} text="Backup date" optional />
                    <DateInput p={p} label="Backup date" value={f.date2} onChange={set('date2')} dark={dark} />
                  </View>
                </View>
                <View style={row}>
                  <Field p={p} label="Your name" value={f.name} onChangeText={set('name')} error={errors.name} grow autoComplete="name" />
                  <Field p={p} label="Company" optional value={f.company} onChangeText={set('company')} grow autoComplete="organization" />
                </View>
                <View style={row}>
                  <Field p={p} label="Email" value={f.email} onChangeText={set('email')} error={errors.email} grow keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                  <Field p={p} label="Phone" optional value={f.phone} onChangeText={set('phone')} grow keyboardType="phone-pad" autoComplete="tel" />
                </View>
                {errors.name || errors.email ? <Text style={{ fontFamily, color: p.danger, fontSize: 13 }}>{errors.name ?? errors.email}</Text> : null}
                <Field p={p} label="Anything else?" optional value={f.notes} onChangeText={set('notes')} multiline placeholder="Condition, access notes, deadlines…" />
                {/* Honeypot: hidden from people, filled in by bots. */}
                <View style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <TextInput value={f.website} onChangeText={set('website')} tabIndex={-1} accessibilityLabel="Website" />
                </View>
                {failure ? <Text style={{ fontFamily, color: p.danger, fontSize: 14 }}>{failure}</Text> : null}
                <CTAButton label={busy ?? (photos.length ? 'Send photos and request a price' : 'Request a detail')} icon="paper-plane-outline" onPress={submit} disabled={!!busy} full />
              </View>
              <Text style={{ fontFamily, color: p.faint, fontSize: 13, textAlign: 'center', marginTop: 12 }}>Booking by {APP_NAME}</Text>
            </>
          )}
        </Container>
      </View>
    </View>
  );
}
