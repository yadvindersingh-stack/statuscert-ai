export type ReviewStatus =
  | "DRAFT"
  | "UPLOADED"
  | "EXTRACTED"
  | "REVIEW_GENERATED"
  | "FINALIZED"
  | "EXPORTED";

export type ReviewSection = {
  key: string;
  title: string;
  instructions: string;
  style: "narrative" | "structured";
  content?: string;
  locked?: boolean;
};

export type TemplateJson = {
  title: string;
  disclaimers: string[];
  sections: ReviewSection[];
  mode?: "standard" | "precedent_locked";
};

export type FlagItem = {
  key: string;
  title: string;
  severity: "LOW" | "MED" | "HIGH";
  evidence: { quote: string; page: number; paragraph?: string }[];
  why_it_matters: string;
  recommended_follow_up: string;
};

export type ApsExtracted = {
  aps_present?: boolean;
  property_address?: string | null;
  unit?: string | null;
  parking?: string | null;
  locker?: string | null;
  bike?: string | null;
  common_expenses?: string | null;
  evidence?: { field: string; quote: string; page: number; paragraph?: string }[];
};

export type CrossCheckItem = {
  key: "unit" | "parking" | "locker" | "bike" | "common_expenses";
  label: string;
  aps_value: string | null;
  status_cert_value: string | null;
  status: "MATCH" | "MISMATCH" | "NOT_FOUND";
  severity?: "MED" | "HIGH";
  note?: string;
};

export type ExtractedJson = {
  corporation_name?: string;
  corporation_number?: string;
  property_address?: string;
  unit?: string;
  parking?: string;
  locker?: string;
  bike?: string;
  common_expenses?: string;
  common_expenses_due_date?: string;
  arrears?: string;
  prepaid?: string;
  fee_increases?: string;
  special_assessments?: string;
  reserve_fund_balance?: string;
  reserve_fund_balance_date?: string;
  reserve_fund_study_date?: string;
  reserve_fund_next_due?: string;
  legal_proceedings?: string;
  insurance_term?: string;
  insurance_deductibles?: string;
  insurance_required_policies_status?: "HAS_REQUIRED_POLICIES" | "NOT_CONFIRMED" | "NOT_SECURED" | null;
  insurance_required_policies_basis?: string;
  leased_unit_count?: string;
  restrictions_summary?: string;
  unusual_clauses?: string[];
  evidence?: { field: string; quote: string; page: number; paragraph?: string }[];
  missing_fields?: string[];
  aps_extracted?: ApsExtracted;
  cross_checks?: CrossCheckItem[];
};
