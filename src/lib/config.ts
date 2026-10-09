/** Branding + runtime configuration. Rename the product here and in app.json. */
export const APP_NAME = 'SkyShine';
export const APP_TAGLINE = 'The CRM built for aircraft detailers';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
/** Public web URL where the customer portal (/portal/...) is hosted. */
export const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? '';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://example.com/privacy';
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@example.com';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
