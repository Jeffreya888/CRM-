import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons, P, fontFamily, site, webStyle } from './primitives';

/** Accordion FAQ list. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: site.line, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <View key={it.q} style={{ borderBottomWidth: 1, borderBottomColor: site.line }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen(isOpen ? null : i)}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 22 }, webStyle({ cursor: 'pointer' })]}
            >
              {(s) => (
                <>
                  <Text style={{ flex: 1, fontFamily, color: (s as { hovered?: boolean }).hovered || isOpen ? site.text : '#D5DBE5', fontSize: 17.5, fontWeight: '700', letterSpacing: -0.2 }}>{it.q}</Text>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isOpen ? 'rgba(70,152,225,0.18)' : 'rgba(255,255,255,0.05)' }}>
                    <Ionicons name={isOpen ? 'remove' : 'add'} size={18} color={isOpen ? site.blueText : site.muted} />
                  </View>
                </>
              )}
            </Pressable>
            {isOpen ? <P style={{ paddingBottom: 24, paddingRight: 48 }}>{it.a}</P> : null}
          </View>
        );
      })}
    </View>
  );
}
