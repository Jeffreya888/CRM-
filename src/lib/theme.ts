// Dark navy theme sampled from the original Flight Ready design.
export const colors = {
  primary: '#4698E1',
  primaryDark: '#2F7BC4',
  primarySoft: '#1F3B58',
  primaryText: '#8AC9F7',
  accent: '#D39943',
  bg: '#131926',
  bgDeep: '#0E131D',
  card: '#1B2130',
  cardRaised: '#242C3D',
  input: '#1C2333',
  border: '#262D3D',
  borderStrong: '#3A4255',
  text: '#F1F5F9',
  textMuted: '#8A94A6',
  textFaint: '#5D6779',
  danger: '#EF5A5A',
  dangerSoft: '#3B1F27',
  success: '#4CC38A',
  successSoft: '#1F3A33',
  warning: '#D39943',
  warningSoft: '#3A3429',
  info: '#4698E1',
  infoSoft: '#1F3B58',
  purple: '#A78BFA',
  purpleSoft: '#2D2747',
  white: '#FFFFFF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 12, lg: 16, pill: 999 };

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: '#252C3B' },
  primary: { fg: colors.primaryText, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.primaryText, bg: colors.infoSoft },
  purple: { fg: colors.purple, bg: colors.purpleSoft },
};
