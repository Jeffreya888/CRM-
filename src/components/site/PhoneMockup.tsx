// A rendered phone showing the Tarmo app (built from views, no screenshots).
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../lib/theme';
import { Ionicons, fontFamily, site, webStyle, type IconName } from './primitives';

const W = 300;
const t = (size: number, color: string = colors.text, weight: '500' | '600' | '700' | '800' = '600') => ({ fontFamily, fontSize: size, color, fontWeight: weight });

function Stat({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: colors.border, gap: 5 }}>
      <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tone}26` }}>
        <Ionicons name={icon} size={12} color={tone} />
      </View>
      <Text style={t(14.5, colors.text, '800')}>{value}</Text>
      <Text style={t(9, colors.textMuted, '600')}>{label}</Text>
    </View>
  );
}

function Shot({ after }: { after?: boolean }) {
  const id = after ? 'after' : 'before';
  return (
    <View style={{ flex: 1, height: 74, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: after ? 'rgba(138,201,247,0.35)' : colors.border }}>
      <Svg width="100%" height="100%" viewBox="0 0 120 74" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={after ? '#3E7FC0' : '#5B5650'} />
            <Stop offset="1" stopColor={after ? '#0F2340' : '#2C2A27'} />
          </LinearGradient>
          <RadialGradient id={`${id}-shine`} cx="0.35" cy="0.35" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={after ? 0.45 : 0.05} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="120" height="74" fill={`url(#${id}-sky)`} />
        {/* Business jet silhouette */}
        <Path
          d="M14 44 C 30 40, 70 38, 96 38 C 104 38, 110 41, 112 44 C 110 47, 104 49, 96 49 L 30 49 C 22 49, 16 47, 14 44 Z M52 39 L 64 26 L 72 26 L 66 39 Z M52 49 L 62 60 L 70 60 L 66 49 Z M16 44 L 10 32 L 18 32 L 26 41 Z"
          fill={after ? '#F4F8FC' : '#9A948A'}
          opacity={after ? 0.96 : 0.85}
        />
        {!after ? (
          <>
            <Circle cx="40" cy="45" r="2.2" fill="#5C5348" opacity="0.8" />
            <Circle cx="58" cy="43" r="1.6" fill="#5C5348" opacity="0.8" />
            <Circle cx="82" cy="46" r="2.6" fill="#5C5348" opacity="0.7" />
            <Path d="M30 47 L 92 47" stroke="#5C5348" strokeWidth="1.4" opacity="0.6" />
          </>
        ) : (
          <Path d="M24 41 C 50 39, 80 39, 100 40" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.8" fill="none" />
        )}
        <Rect x="0" y="0" width="120" height="74" fill={`url(#${id}-shine)`} />
      </Svg>
      <View style={{ position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Text style={t(7.5, after ? site.blueText : '#D8CBB8', '800')}>{after ? 'AFTER' : 'BEFORE'}</Text>
      </View>
      {after ? <Ionicons name="sparkles" size={13} color="#FFFFFF" style={{ position: 'absolute', right: 7, top: 6 }} /> : null}
    </View>
  );
}

function Tier({ name, price, picked }: { name: string; price: string; picked?: boolean }) {
  return (
    <View style={{ flex: 1, borderRadius: 10, padding: 8, gap: 3, borderWidth: picked ? 1.5 : 1, borderColor: picked ? colors.accent : colors.border, backgroundColor: picked ? 'rgba(211,153,67,0.12)' : colors.cardRaised }}>
      <Text style={t(8.5, picked ? site.goldText : colors.textMuted, '800')}>{name.toUpperCase()}</Text>
      <Text style={t(12.5, colors.text, '800')}>{price}</Text>
      {picked ? <Text style={t(7.5, site.goldText, '700')}>Selected ✓</Text> : <Text style={t(7.5, colors.textFaint, '600')}>{name === 'Good' ? 'Wash' : 'Full detail'}</Text>}
    </View>
  );
}

export function PhoneMockup({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="The Tarmo app showing today's jobs, a job with before and after photos, and a Good, Better, Best quote"
      style={[
        { width: W, borderRadius: 46, padding: 10, backgroundColor: '#05070C', borderWidth: 1.5, borderColor: '#2B3446' },
        webStyle({ boxShadow: '0 60px 120px -40px rgba(70,152,225,0.55), 0 30px 60px -30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.06)' }),
        style,
      ]}
    >
      <View style={{ borderRadius: 37, overflow: 'hidden', backgroundColor: colors.bg }}>
        {/* Status bar + dynamic island */}
        <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}>
          <Text style={t(11.5, colors.text, '700')}>9:41</Text>
          <View style={{ position: 'absolute', left: W / 2 - 10 - 44, top: 9, width: 88, height: 24, borderRadius: 14, backgroundColor: '#000' }} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Ionicons name="cellular" size={11} color={colors.text} />
            <Ionicons name="wifi" size={11} color={colors.text} />
            <Ionicons name="battery-full" size={13} color={colors.text} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <View>
              <Text style={t(9.5, colors.textMuted, '600')}>Tuesday, October 14</Text>
              <Text style={t(17, colors.text, '800')}>Good morning, Alex</Text>
            </View>
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}>
              <Text style={t(11, colors.primaryText, '800')}>AR</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 7 }}>
            <Stat icon="calendar" label="Jobs today" value="4" tone={colors.primary} />
            <Stat icon="cash" label="Paid this month" value="$18.2k" tone={colors.success} />
            <Stat icon="trending-up" label="Net profit" value="41%" tone={colors.accent} />
          </View>

          {/* Job card */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={t(11.5, colors.text, '800')}>N512FR · Gulfstream G280</Text>
                <Text style={t(9, colors.textMuted, '600')}>Exterior Wet Wash + Brightwork</Text>
              </View>
              <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.successSoft }}>
                <Text style={t(8, colors.success, '800')}>Complete</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Shot />
              <Shot after />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location" size={10} color={colors.textMuted} />
                <Text style={t(8.5, colors.textMuted, '600')}>Hangar 3 · KSDL · 7:30 AM</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="create" size={10} color={colors.primaryText} />
                <Text style={t(8.5, colors.primaryText, '700')}>Condition signed</Text>
              </View>
            </View>
          </View>

          {/* Quote card */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={t(11, colors.text, '800')}>Quote · Citation CJ3+</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="eye" size={10} color={colors.textMuted} />
                <Text style={t(8.5, colors.textMuted, '600')}>Viewed 3×</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Tier name="Good" price="$1,180" />
              <Tier name="Better" price="$1,640" picked />
              <Tier name="Best" price="$2,350" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.successSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={t(9, colors.success, '700')}>Deposit paid · 25%</Text>
              <Text style={t(9.5, colors.success, '800')}>$410.00</Text>
            </View>
          </View>
        </View>

        {/* Tab bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, backgroundColor: colors.bgDeep }}>
          {(['home', 'briefcase-outline', 'people-outline', 'sparkles-outline', 'grid-outline'] as IconName[]).map((n, i) => (
            <Ionicons key={n} name={n} size={18} color={i === 0 ? colors.primary : colors.textFaint} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Small glass notification card floating next to the phone (desktop hero). */
export function FloatCard({ icon, title, body, tone = 'green', style }: { icon: IconName; title: string; body: string; tone?: 'green' | 'gold' | 'blue'; style?: StyleProp<ViewStyle> }) {
  const c = tone === 'gold' ? site.goldText : tone === 'blue' ? site.blueText : colors.success;
  return (
    <View
      style={[
        { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(22,28,42,0.85)', borderWidth: 1, borderColor: site.lineStrong, width: 220, zIndex: 2 },
        webStyle({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 20px 50px -20px rgba(0,0,0,0.8)' }),
        style,
      ]}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}22` }}>
        <Ionicons name={icon} size={17} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={t(13, colors.text, '700')}>{title}</Text>
        <Text style={t(11.5, colors.textMuted, '500')}>{body}</Text>
      </View>
    </View>
  );
}
