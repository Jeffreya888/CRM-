import { useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '../lib/theme';
import { Button, Row, T } from './ui';

const W = 320;
const H = 160;

/** Finger signature capture. Produces an SVG string for embedding in reports. */
export function SignaturePad({ onSave, onCancel }: { onSave: (svg: string) => void; onCancel: () => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string>('');
  const [, force] = useState(0);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderRelease: () => {
        const p = current.current;
        current.current = '';
        if (p) setPaths((ps) => [...ps, p]);
      },
    }),
  ).current;

  const all = current.current ? [...paths, current.current] : paths;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${paths
    .map((d) => `<path d="${d}" stroke="#0F172A" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('')}</svg>`;

  return (
    <View>
      <T variant="small" style={{ marginBottom: 6 }}>Sign below</T>
      <View
        {...responder.panHandlers}
        style={{ width: W, height: H, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignSelf: 'center' }}
      >
        <Svg width={W} height={H}>
          {all.map((d, i) => (
            <Path key={i} d={d} stroke={colors.text} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Row style={{ marginTop: 12 }}>
        <Button style={{ flex: 1 }} kind="ghost" title="Clear" onPress={() => setPaths([])} />
        <Button style={{ flex: 1 }} kind="ghost" title="Cancel" onPress={onCancel} />
        <Button style={{ flex: 1 }} title="Save" disabled={!paths.length} onPress={() => onSave(svg)} />
      </Row>
    </View>
  );
}
