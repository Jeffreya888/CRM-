// Row types mirroring supabase/migrations. Keep in sync when the schema changes
// (or generate with `supabase gen types typescript`).
import type { RolePermissions } from './plans';

export type Role = 'owner' | 'admin' | 'manager' | 'technician' | 'viewer';
export type Plan = 'trial' | 'solo' | 'team' | 'fleet' | 'expired';
export type AssetType = 'aircraft' | 'vehicle' | 'watercraft';
export type AircraftCategory =
  | 'piston_single' | 'piston_twin' | 'turboprop' | 'very_light_jet' | 'light_jet'
  | 'midsize_jet' | 'super_midsize_jet' | 'large_jet' | 'airliner' | 'helicopter' | 'other'
  | 'car' | 'suv' | 'truck' | 'van' | 'rv' | 'motorcycle'
  | 'boat_small' | 'boat_medium' | 'boat_large' | 'yacht';
export type PricingMethod = 'flat' | 'per_foot' | 'per_sqft' | 'per_category' | 'hourly';
export type ConditionLevel = 'light' | 'moderate' | 'heavy' | 'severe';
export type JobStatus = 'tentative' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'invoiced' | 'cancelled';
export type JobPriority = 'low' | 'normal' | 'high' | 'aog';
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'card' | 'ach' | 'check' | 'cash' | 'wire' | 'other';
export type Stage = 'new' | 'contacted' | 'quoted' | 'negotiating' | 'won' | 'lost';
export type PhotoKind = 'before' | 'after' | 'damage' | 'other';
export type RecurUnit = 'week' | 'month';

export interface Organization {
  id: string; name: string; email: string | null; phone: string | null; website: string | null;
  address: string | null; logo_url: string | null; timezone: string; currency: string;
  tax_rate: number; payment_terms_days: number; invoice_prefix: string; quote_prefix: string; job_prefix: string;
  default_quote_terms: string | null; default_invoice_notes: string | null;
  plan: Plan; trial_ends_at: string; plan_expires_at: string | null; billing_period: 'monthly' | 'annual' | null;
  /** Where the subscription is billed: App Store, Google Play or Stripe (website). Server-only. */
  billing_source: 'app_store' | 'play_store' | 'stripe' | null;
  stripe_billing_customer_id: string | null; stripe_subscription_id: string | null;
  stripe_account_id: string | null; stripe_charges_enabled: boolean;
  instagram: string | null; facebook: string | null; youtube: string | null; linkedin: string | null;
  business_types: AssetType[];
  google_review_url: string | null;
  auto_send_invoices: boolean;
  /** Who takes online payments: Stripe, Square, or nobody (arranged directly). */
  payment_mode: 'stripe' | 'square' | 'direct';
  /** Square connection (server-only; set by the square-connect function). */
  square_merchant_id: string | null; square_location_id: string | null; square_location_name: string | null;
  square_charges_enabled: boolean;
  /** Mobile (we come to you), shop (customers bring it in) or both. */
  service_mode: 'mobile' | 'shop' | 'both';
  base_address: string | null; base_lat: number | null; base_lng: number | null;
  shop_bays: number; shop_hours: string | null;
  travel_fee_mode: 'off' | 'per_mile' | 'zones';
  travel_free_miles: number; travel_rate_per_mile: number; travel_min_fee: number;
  travel_zones: { up_to_miles: number; fee: number }[];
  service_radius_miles: number | null;
  role_permissions: RolePermissions;
  is_demo: boolean; demo_expires_at: string | null;
  accountant_email: string | null;
  tax_set_aside_pct: number;
  mileage_rate: number;
  pay_period_cadence: 'weekly' | 'biweekly' | 'semimonthly';
  pay_period_anchor: string;
  sms_enabled: boolean; sms_number: string | null; sms_status: 'not_requested' | 'pending' | 'active' | 'suspended'; sms_extra_credits: number;
  /** Purchased AI photo checks left (never expire; used after the monthly allowance). */
  ai_extra_credits: number;
  quiet_hours_start: number; quiet_hours_end: number;
  require_2fa: boolean;
  price_adjust_pct: number;
  labor_burden_pct: number; overhead_per_hour: number;
  condition_multipliers: Record<ConditionLevel, number>;
  require_qc: boolean; photo_quotes_enabled: boolean;
  public_slug: string;
}

export interface Branch { id: string; org_id: string; name: string; address: string | null; phone: string | null; timezone: string | null; active: boolean }

export interface Membership {
  id: string; org_id: string; user_id: string; role: Role; display_name: string | null;
  color: string | null; active: boolean; skills: string[]; default_branch_id: string | null; deactivated_at: string | null;
  organization?: Organization;
}

export interface MemberPay { org_id: string; user_id: string; hourly_rate: number | null; pay_type: 'hourly' | 'salary' | 'per_job' | 'contractor'; overtime_multiplier: number }

export interface NotificationPrefs {
  job_assignments?: boolean; service_reminders?: boolean; payments?: boolean; quote_accepted?: boolean;
  /** Generic lock-screen text without customer names or amounts. */
  private_lock_screen?: boolean;
}
export interface Profile { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; current_org_id: string | null; notification_prefs: NotificationPrefs }

/** Facilities: airports/FBOs, marinas and service sites. */
export interface Location {
  id: string; org_id: string; name: string; airport_code: string | null; fbo_name: string | null; address: string | null;
  contact_phone: string | null; access_notes: string | null; has_water: boolean; has_power: boolean; hangar_available: boolean;
  kind: 'airport' | 'marina' | 'service_site'; site_type: 'residence' | 'fleet_yard' | 'dealership' | 'shop' | 'other' | null;
  hangar_notes: string | null; hangar_capacity: number; fees: { name: string; amount: number }[]; photos: string[];
  latitude: number | null; longitude: number | null; active: boolean;
}

export interface Customer {
  id: string; org_id: string; kind: string; name: string; company: string | null; email: string | null; phone: string | null;
  billing_address: string | null; status: 'lead' | 'active' | 'inactive'; source: string | null; tags: string[];
  notes: string | null; preferred_location_id: string | null; payment_terms_days: number | null; tax_exempt: boolean;
  discount_pct: number; created_at: string;
  sms_consent: boolean; sms_consent_at: string | null; sms_opted_out: boolean; email_opted_out: boolean;
  automation_exceptions: string[]; portal_enabled: boolean;
}

export interface Contact { id: string; customer_id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean }

/** Any customer asset: aircraft, vehicle or watercraft (table `aircraft`). */
export interface Aircraft {
  id: string; org_id: string; customer_id: string | null; tail_number: string; manufacturer: string | null; model: string | null;
  year: number | null; serial_number: string | null; category: AircraftCategory; length_ft: number | null; wingspan_ft: number | null;
  exterior_colors: string | null; paint_condition: string | null; interior_notes: string | null; coating_type: string | null;
  coating_applied_on: string | null; home_location_id: string | null; photo_path: string | null; notes: string | null; active: boolean;
  asset_type: AssetType; model_id: string | null; vin: string | null; plate: string | null; hull_id: string | null;
  condition_level: ConditionLevel | null; condition_updated_at: string | null;
  faa: FaaLookupFound | null; faa_checked_at: string | null;
  customer?: Pick<Customer, 'id' | 'name'> | null;
}
export type Asset = Aircraft;

export interface AircraftModel { id: string; manufacturer: string; model: string; category: AircraftCategory; length_ft: number | null; wingspan_ft: number | null }

export interface Service {
  id: string; org_id: string; name: string; description: string | null; category: string; pricing_method: PricingMethod;
  base_price: number; price_per_foot: number; hourly_rate: number; category_prices: Partial<Record<AircraftCategory, number>>;
  est_hours: number | null; est_hours_max: number | null; taxable: boolean; checklist: string[]; active: boolean; sort_order: number;
  pricing_tiers: PricingTier[]; equipment: string[];
  asset_type: AssetType; guide_key: string | null; recur_every: number | null; recur_unit: RecurUnit | null;
  price_per_sqft: number; category_hours: Partial<Record<AircraftCategory, number>>; requires_cert: boolean;
}
/** Price-free view of a service for technicians (public.service_menu). */
export type ServiceMenuItem = Pick<Service, 'id' | 'org_id' | 'name' | 'description' | 'category' | 'est_hours' | 'active' | 'sort_order' | 'checklist' | 'equipment'>;

export interface PricingTier { name: string; detail?: string | null; price: number }

export interface GuideStep { title: string; detail: string; caution: string | null; minutes?: number | null; products?: string[] }
export interface ServiceGuide {
  id: string; org_id: string | null; key: string; asset_type: AssetType; title: string; summary: string;
  time_estimate: string | null; crew: string | null; products: string[]; tools: string[]; prep: string[];
  steps: GuideStep[]; donts: string[]; quality_checks: string[]; photos: string[]; based_on: string | null; hidden: boolean;
}

export interface TrainingMedia {
  id: string; org_id: string; service_id: string | null; kind: 'video' | 'document'; title: string; description: string | null;
  url: string | null; storage_path: string | null; thumbnail_path: string | null; duration_min: number | null; sort_order: number;
  guide_key: string | null; step_index: number | null;
  service?: { name: string; category: string } | null;
}

export interface LineItem {
  id?: string; service_id: string | null; description: string; quantity: number; unit_price: number; taxable: boolean; sort_order?: number;
  option_id?: string | null;
  est_hours?: number | null; est_supply_cost?: number | null;
}

export interface QuoteOption { id: string; quote_id: string; name: string; description: string | null; sort_order: number; subtotal: number; tax: number; total: number }

export interface Quote {
  id: string; org_id: string; number: string; customer_id: string; aircraft_id: string | null; location_id: string | null; branch_id: string | null;
  service_mode: 'mobile' | 'shop' | null; travel_miles: number | null;
  status: QuoteStatus; issue_date: string; valid_until: string; valid_until_at: string | null; discount: number; tax_rate: number; subtotal: number; tax: number;
  total: number; notes: string | null; terms: string | null; public_token: string; accepted_at: string | null; accepted_name: string | null;
  version: number; parent_quote_id: string | null; superseded_by: string | null; selected_option_id: string | null;
  deposit_type: 'none' | 'percent' | 'fixed'; deposit_value: number; deposit_amount: number; deposit_paid_at: string | null;
  view_count: number; first_viewed_at: string | null; last_viewed_at: string | null; sent_at: string | null;
  declined_at: string | null; decline_reason: 'price' | 'timing' | 'went_elsewhere' | 'other' | null; decline_note: string | null;
  condition_level: ConditionLevel | null; condition_pct: number;
  customer?: Pick<Customer, 'id' | 'name' | 'email'> | null; aircraft?: Pick<Aircraft, 'id' | 'tail_number'> | null;
}

export interface Job {
  id: string; org_id: string; number: string; title: string | null; customer_id: string; aircraft_id: string | null;
  location_id: string | null; quote_id: string | null; branch_id: string | null; status: JobStatus; priority: JobPriority;
  scheduled_start: string | null; scheduled_end: string | null; actual_start: string | null; actual_end: string | null;
  parking_spot: string | null; notes: string | null; internal_notes: string | null; weather_sensitive: boolean;
  signed_by: string | null; signature_svg: string | null; signed_at: string | null; rating: number | null; feedback: string | null;
  travel_before_min: number; travel_after_min: number; care_opt_in: boolean;
  condition_report: string | null; condition_signature_svg: string | null; condition_signed_by: string | null; condition_signed_at: string | null; condition_version: number;
  flagged: boolean; flag_reason: string | null;
  recurring_schedule_id: string | null; covered_by_plan: boolean; follow_up_of: string | null;
  qc_status: 'not_required' | 'pending' | 'passed' | 'failed'; qc_by: string | null; qc_at: string | null; qc_notes: string | null;
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'email'> | null;
  aircraft?: Pick<Aircraft, 'id' | 'tail_number' | 'model' | 'manufacturer' | 'category' | 'length_ft' | 'asset_type'> | null;
  location?: Pick<Location, 'id' | 'name' | 'airport_code' | 'fbo_name' | 'access_notes'> | null;
  job_assignments?: { user_id: string; is_primary?: boolean; confirmed?: boolean }[];
}

export interface Invoice {
  id: string; org_id: string; number: string; customer_id: string; job_id: string | null; aircraft_id: string | null; branch_id: string | null;
  status: InvoiceStatus; issue_date: string; due_date: string; discount: number; tax_rate: number; subtotal: number; tax: number;
  total: number; amount_paid: number; balance: number; notes: string | null; public_token: string; sent_at: string | null;
  org_snapshot: Record<string, string | null> | null; late_fee_applied_at: string | null; covered_by_plan: boolean;
  customer?: Pick<Customer, 'id' | 'name' | 'email'> | null; aircraft?: Pick<Aircraft, 'id' | 'tail_number'> | null;
}

export interface Payment { id: string; invoice_id: string; amount: number; method: PaymentMethod; reference: string | null; received_at: string; platform_fee: number }

export interface RecurringSchedule {
  id: string; org_id: string; branch_id: string | null; customer_id: string; aircraft_id: string | null; service_id: string | null; location_id: string | null;
  title: string | null; price: number; duration_min: number; first_at: string; timezone: string; every: number; unit: RecurUnit;
  pattern: { nth: number; weekday: number } | null; default_user_id: string | null; notes: string | null;
  end_rule: 'never' | 'on_date' | 'after'; end_on: string | null; max_visits: number | null; lead_days: number;
  create_as: 'tentative' | 'scheduled'; heads_up_days: number | null; billing: 'per_visit' | 'care_plan'; care_plan_amount: number | null;
  care_plan_status: 'pending' | 'active' | 'past_due' | 'canceled' | null; annual_increase_pct: number; paused: boolean; skip_dates: string[];
  next_index: number; visits_created: number; active: boolean; created_at: string;
}

export type AutomationKey = 'job_reminder' | 'on_our_way' | 'ready_for_pickup' | 'job_complete' | 'invoice_reminders' | 'review_request' | 'quote_follow_up' | 'recurring_heads_up' | 'care_plan_charge';
export interface Automation { org_id: string; key: AutomationKey; enabled: boolean; channel: 'email' | 'sms' | 'both'; settings: Record<string, any>; subject: string | null; body: string }

export interface Message {
  id: string; org_id: string; customer_id: string | null; channel: 'email' | 'sms'; direction: 'out' | 'in'; to_address: string | null; from_address: string | null;
  subject: string | null; body: string; status: 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed' | 'received' | 'blocked';
  error: string | null; automation_key: string | null; invoice_id: string | null; quote_id: string | null; job_id: string | null;
  send_after: string; sent_at: string | null; delivered_at: string | null; opened_at: string | null; created_at: string;
}

export interface BookingRequest {
  id: string; org_id: string; customer_id: string; aircraft_id: string | null; service_id: string | null; job_id: string | null; quote_id: string | null;
  kind: 'booking' | 'reschedule' | 'quote_dates' | 'photo_quote'; preferred: string[]; notes: string | null; status: 'pending' | 'approved' | 'declined'; created_at: string;
  photo_paths: string[]; assessment_id: string | null;
}

/** public.faa_lookup result. */
export type FaaLookup = { found: false; reason: 'not_us' | 'not_found' | 'no_data' } | FaaLookupFound;
export interface FaaLookupFound {
  found: true; n_number: string; serial: string | null; year: number | null; faa_manufacturer: string; faa_model: string;
  owner: string | null; city: string | null; state: string | null; country: string | null; status: string | null; expires: string | null;
  cert_issued: string | null; engines: number | null; seats: number | null; type: string | null;
  model_id: string | null; catalog: Pick<AircraftModel, 'manufacturer' | 'model' | 'category' | 'length_ft' | 'wingspan_ft'> | null;
  match: 'learned' | 'alias' | 'name' | null; data_as_of: string | null;
}

export interface ConditionFinding { area: string; issue: string; severity: 'low' | 'medium' | 'high'; note: string | null }
export interface ConditionSuggestion { service_id: string | null; guide_key: string | null; name: string; reason: string }
export interface ConditionAssessment {
  id: string; org_id: string; aircraft_id: string | null; customer_id: string | null; job_id: string | null; quote_id: string | null;
  booking_request_id: string | null; source: 'staff' | 'portal'; photo_paths: string[]; status: 'pending' | 'done' | 'failed';
  overall: ConditionLevel | null; score: number | null; summary: string | null; findings: ConditionFinding[]; suggestions: ConditionSuggestion[];
  error: string | null; created_by: string | null; created_at: string; applied_at: string | null; applied_by: string | null;
}

export interface ServiceSkill {
  org_id: string; user_id: string; guide_key: string; level: 'training' | 'certified' | 'trainer';
  certified_by: string | null; certified_at: string | null; requested_at: string | null; notes: string | null;
}

/** A problem returned by public.schedule_conflicts. */
export interface Conflict { type: string; message: string; user_id?: string; job_id?: string; equipment_id?: string }

// ---------------------------------------------------------------------------
// "Ask" AI assistant (migration 20261028000200_assistant.sql)
// ---------------------------------------------------------------------------
export type AircraftDocumentKind = 'manual' | 'approved_products' | 'instructions' | 'other';
export interface AircraftDocument {
  id: string; org_id: string; aircraft_id: string; title: string; kind: AircraftDocumentKind; storage_path: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'; size_bytes: number | null; notes: string | null;
  created_by: string | null; created_at: string;
}
export interface AssistantThread {
  id: string; org_id: string; user_id: string; job_id: string | null; aircraft_id: string | null; guide_key: string | null;
  title: string; created_at: string; updated_at: string;
}
export interface AssistantSource {
  type: 'sop' | 'aircraft_doc' | 'job' | 'general'; key?: string | null; step?: number | null; document_id?: string | null; title: string;
}
export type AssistantSafety = 'damage' | 'injury' | 'aircraft_systems';
export interface AssistantMessage {
  id: string; org_id: string; thread_id: string; role: 'user' | 'assistant'; content: string; photo_paths: string[];
  sources: AssistantSource[]; safety: AssistantSafety | null; status: 'done' | 'failed' | 'limit'; created_at: string;
}
