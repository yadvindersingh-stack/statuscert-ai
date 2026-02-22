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
};

export type FlagItem = {
  key: string;
  title: string;
  severity: "LOW" | "MED" | "HIGH";
  evidence: { quote: string; page: number }[];
  why_it_matters: string;
  recommended_follow_up: string;
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
  leased_unit_count?: string;
  restrictions_summary?: string;
  evidence?: { field: string; quote: string; page: number }[];
  missing_fields?: string[];
};
