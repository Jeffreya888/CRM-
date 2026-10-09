// Row types mirroring supabase/migrations. Keep in sync when the schema changes
// (or generate with `supabase gen types typescript`).
export type Role = 'owner' | 'admin' | 'manager' | 'technician' | 'viewer';
export type Plan = 'trial' | 'solo' | 'team' | 'fleet' | 'expired';
export type AircraftCategory =
  | 'piston_single' | 'piston_twin' | 'turboprop' | 'very_light_jet' | 'light_jet'
  | 'midsize_jet' | 'super_midsize_jet' | 'large_jet' | 'airliner' | 'helicopter' | 'other';
export type PricingMethod = 'flat' | 'per_foot' | 'per_category' | 'hourly';
export type JobStatus = 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'invoiced' | 'cancelled';
export type JobPriority = 'low' | 'normal' | 'high' | 'aog';
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'card' | 'ach' | 'check' | 'cash' | 'wire' | 'other';
export type Stage = 'new' | 'contacted' | 'quoted' | 'negotiating' | 'won' | 'lost';
export type PhotoKind = 'before' | 'after' | 'damage' | 'other';

export interface Organization {
  id: string; name: string; email: string | null; phone: string | null; website: string | null;
  address: string | null; logo_url: string | null; timezone: string; currency: string;
  tax_rate: number; payment_terms_days: number; invoice_prefix: string; quote_prefix: string; job_prefix: string;
  default_quote_terms: string | null; default_invoice_notes: string | null;
  plan: Plan; trial_ends_at: string; plan_expires_at: string | null;
  stripe_account_id: string | null; stripe_charges_enabled: boolean;
}

export interface Membership {
  id: string; org_id: string; user_id: string; role: Role; display_name: string | null;
  hourly_rate: number | null; color: string | null; active: boolean;
  organization?: Organization;
}

export interface Profile { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; current_org_id: string | null }

export interface Location {
  id: string; org_id: string; name: string; airport_code: string | null; fbo_name: string | null; address: string | null;
  contact_phone: string | null; access_notes: string | null; has_water: boolean; has_power: boolean; hangar_available: boolean;
}

export interface Customer {
  id: string; org_id: string; kind: string; name: string; company: string | null; email: string | null; phone: string | null;
  billing_address: string | null; status: 'lead' | 'active' | 'inactive'; source: string | null; tags: string[];
  notes: string | null; preferred_location_id: string | null; payment_terms_days: number | null; tax_exempt: boolean;
  discount_pct: number; created_at: string;
}

export interface Contact { id: string; customer_id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean }

export interface Aircraft {
  id: string; org_id: string; customer_id: string | null; tail_number: string; manufacturer: string | null; model: string | null;
  year: number | null; serial_number: string | null; category: AircraftCategory; length_ft: number | null; wingspan_ft: number | null;
  exterior_colors: string | null; paint_condition: string | null; interior_notes: string | null; coating_type: string | null;
  coating_applied_on: string | null; home_location_id: string | null; photo_path: string | null; notes: string | null; active: boolean;
  customer?: Pick<Customer, 'id' | 'name'> | null;
}

export interface Service {
  id: string; org_id: string; name: string; description: string | null; category: string; pricing_method: PricingMethod;
  base_price: number; price_per_foot: number; hourly_rate: number; category_prices: Partial<Record<AircraftCategory, number>>;
  est_hours: number | null; recurring_interval_days: number | null; taxable: boolean; checklist: string[]; active: boolean; sort_order: number;
}

export interface LineItem {
  id?: string; service_id: string | null; description: string; quantity: number; unit_price: number; taxable: boolean; sort_order?: number;
}

export interface Quote {
  id: string; org_id: string; number: string; customer_id: string; aircraft_id: string | null; location_id: string | null;
  status: QuoteStatus; issue_date: string; valid_until: string; discount: number; tax_rate: number; subtotal: number; tax: number;
  total: number; notes: string | null; terms: string | null; public_token: string; accepted_at: string | null; accepted_name: string | null;
  customer?: Pick<Customer, 'id' | 'name' | 'email'> | null; aircraft?: Pick<Aircraft, 'id' | 'tail_number'> | null;
}

export interface Job {
  id: string; org_id: string; number: string; title: string | null; customer_id: string; aircraft_id: string | null;
  location_id: string | null; quote_id: string | null; status: JobStatus; priority: JobPriority;
  scheduled_start: string | null; scheduled_end: string | null; actual_start: string | null; actual_end: string | null;
  parking_spot: string | null; notes: string | null; internal_notes: string | null; weather_sensitive: boolean;
  signed_by: string | null; signature_svg: string | null; signed_at: string | null; rating: number | null; feedback: string | null;
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'email'> | null;
  aircraft?: Pick<Aircraft, 'id' | 'tail_number' | 'model' | 'manufacturer' | 'category' | 'length_ft'> | null;
  location?: Pick<Location, 'id' | 'name' | 'airport_code' | 'fbo_name' | 'access_notes'> | null;
  job_assignments?: { user_id: string }[];
}

export interface Invoice {
  id: string; org_id: string; number: string; customer_id: string; job_id: string | null; aircraft_id: string | null;
  status: InvoiceStatus; issue_date: string; due_date: string; discount: number; tax_rate: number; subtotal: number; tax: number;
  total: number; amount_paid: number; balance: number; notes: string | null; public_token: string; sent_at: string | null;
  customer?: Pick<Customer, 'id' | 'name' | 'email'> | null; aircraft?: Pick<Aircraft, 'id' | 'tail_number'> | null;
}

export interface Payment { id: string; invoice_id: string; amount: number; method: PaymentMethod; reference: string | null; received_at: string; platform_fee: number }
