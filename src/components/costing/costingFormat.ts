/** "6.0 h" */
export const hoursText = (h: number | null | undefined) => `${(Number(h) || 0).toFixed(1)} h`;

/** "+20%", "−5%", "0%" */
export const signedPct = (p: number) => {
  const r = Math.round(p);
  return r > 0 ? `+${r}%` : r < 0 ? `−${Math.abs(r)}%` : '0%';
};
