import Svg, { Path, Rect } from 'react-native-svg';

// Tarmo brand mark and wordmark (from the Tarmo logo kit). Colors are the kit's.
export const BRAND_NAVY = '#0B1B33';
const WORDMARK = 'M23.4 73V10.5H37.6V73ZM2.3 12.5V0H58.7V12.5Z M82.8 73 107.7 0H130.9L156.5 73H141.9L120.2 9.7L125.3 11.9H112.8L118 9.7L97 73ZM100.2 53.6 104.7 41.6H134.3L138.7 53.6Z M187.3 73V-0.5H201.5V73ZM231.9 73 209.5 41.2H225.4L248.5 73ZM197.3 48.6V37.1H215.9Q219.8 37.1 222.7 35.5Q225.5 33.9 227.1 31Q228.7 28.1 228.7 24.4Q228.7 20.6 227.1 17.7Q225.5 14.8 222.7 13.2Q219.8 11.6 215.9 11.6H197.3V-0.5H214.4Q223.2 -0.5 229.7 2.1Q236.1 4.7 239.6 10Q243.1 15.3 243.1 23.3V24.9Q243.1 33 239.6 38.2Q236 43.4 229.6 46Q223.2 48.6 214.4 48.6Z M279.3 73V0H298.7L317 43.6H318.8L337 0H356.7V73H342.6V10.7L344.4 10.9L324.7 58.1H310.2L290.4 10.9L292.3 10.7V73Z M429 74.9Q419.1 74.9 411.9 71.4Q404.6 67.9 399.9 62.2Q395.1 56.6 392.8 50Q390.4 43.5 390.4 37.4V35.2Q390.4 28.5 392.8 21.8Q395.2 15.2 400.1 9.8Q404.9 4.4 412.1 1.1Q419.3 -2.1 429 -2.1Q438.6 -2.1 445.8 1.1Q453 4.4 457.9 9.8Q462.7 15.2 465.1 21.8Q467.5 28.5 467.5 35.2V37.4Q467.5 43.5 465.2 50Q462.8 56.6 458.1 62.2Q453.3 67.9 446.1 71.4Q438.8 74.9 429 74.9ZM429 61.7Q434.6 61.7 439.1 59.7Q443.5 57.7 446.7 54.1Q449.8 50.6 451.5 46Q453.1 41.5 453.1 36.4Q453.1 30.9 451.5 26.3Q449.8 21.7 446.7 18.3Q443.5 14.9 439 13Q434.5 11.1 429 11.1Q423.4 11.1 418.9 13Q414.4 14.9 411.2 18.3Q408.1 21.7 406.5 26.3Q404.8 30.9 404.8 36.4Q404.8 41.5 406.5 46Q408.1 50.6 411.2 54.1Q414.4 57.7 418.9 59.7Q423.4 61.7 429 61.7Z';

function Shapes({ mono }: { mono?: string }) {
  return (
    <>
      <Path d="M31.2 6 L31.2 30.5 L18.6 50 L5 50 Z" fill={mono ?? '#E6EBF1'} />
      <Path d="M32.8 6 L59 50 L45.4 50 L32.8 30.5 Z" fill={mono ?? '#94A1B2'} />
      {[[5, 10], [19, 11], [34, 11], [49, 10]].map(([x, w]) => <Rect key={x} x={x} y={55} width={w} height={3.5} rx={1.75} fill={mono ?? '#5B6B80'} />)}
    </>
  );
}

/** The runway mark (swept wings over a runway centerline). `mono` draws it in one color. */
export function TarmoMark({ size = 32, mono }: { size?: number; mono?: string }) {
  return (
    <Svg width={size * 54 / 52.5} height={size} viewBox="5 6 54 52.5" accessibilityLabel="Tarmo">
      <Shapes mono={mono} />
    </Svg>
  );
}

/** The app-icon tile: the mark on navy with rounded corners. */
export function TarmoAppIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Tarmo">
      <Rect width={64} height={64} rx={14} fill={BRAND_NAVY} />
      <Svg x={14.4} y={14.9} width={35.2} height={34.2} viewBox="5 6 54 52.5">
        <Shapes />
      </Svg>
    </Svg>
  );
}

/** Mark + "TARMO" wordmark, for dark backgrounds. `height` is the mark's height. */
export function TarmoLogo({ height = 30, color = '#F2F5F9' }: { height?: number; color?: string }) {
  return (
    <Svg width={height * 643 / 114} height={height} viewBox="60 63 643 114" accessibilityLabel="Tarmo">
      <Svg x={60.8} y={63} width={117.1} height={113.8} viewBox="5 6 54 52.5">
        <Shapes />
      </Svg>
      <Path d={WORDMARK} fill={color} transform="translate(234.7 77.3)" />
    </Svg>
  );
}
