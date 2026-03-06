"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_FIELD_RULES = void 0;
exports.TEMPLATE_FIELD_RULES = [
    { id: "property_unit", anchor: "Property Unit", targetType: "cell", resolverKey: "property_unit", fallback: "Not available", required: true },
    { id: "parking_unit", anchor: "Parking Unit", targetType: "cell", resolverKey: "parking_unit", fallback: "Not found" },
    { id: "locker_unit", anchor: "Locker Unit", targetType: "cell", resolverKey: "locker_unit", fallback: "Not found" },
    { id: "bike_unit", anchor: "Bike Unit", targetType: "cell", resolverKey: "bike_unit", fallback: "Not found" },
    { id: "corporation", anchor: "Corporation", targetType: "cell", resolverKey: "corporation", fallback: "Not available", required: true },
    { id: "default_fees", anchor: "Default for common element fees", targetType: "cell", resolverKey: "default_fees", fallback: "Not available", required: true },
    { id: "common_assessment", anchor: "Common Assessment", targetType: "cell", resolverKey: "common_assessment", fallback: "Not available", required: true },
    { id: "prepaid_common_expenses", anchor: "Prepaid common expenses", targetType: "cell", resolverKey: "prepaid", fallback: "Not available" },
    { id: "increase_common_expenses_yes_no", anchor: "Increases of Common Expenses", targetType: "cell", resolverKey: "fee_increase_yes_no", fallback: "Not available" },
    { id: "corp_knows_increase_yes_no", anchor: "Corporation’s Knowledge of Increase in Common Expenses", targetType: "cell", resolverKey: "fee_knowledge_yes_no", fallback: "Not available" },
    { id: "special_assessment_yes_no", anchor: "Levied Special Assessments", targetType: "cell", resolverKey: "special_assessment_yes_no", fallback: "Not available" },
    { id: "reserve_fund", anchor: "Reserve Fund", targetType: "cell", resolverKey: "reserve_fund", fallback: "Not available", required: true },
    { id: "modification_agreements", anchor: "Modification Agreements", targetType: "cell", resolverKey: "modification", fallback: "Not available" },
    { id: "substantial_changes", anchor: "Substantial Changes to Common Elements", targetType: "cell", resolverKey: "substantial_changes", fallback: "Not available" },
    { id: "legal_proceedings", anchor: "Legal Proceedings/Claims involving the Condo Corporation.", targetType: "cell", resolverKey: "legal_proceedings", fallback: "NONE", required: true },
    {
        id: "insurance_expiry",
        anchor: "Certificate of Insurance",
        targetType: "paragraph",
        resolverKey: "insurance_expiry",
        fallback: "Not available",
        placeholder: "[ENTER FROM CERTIFICATE OF INSURANCE]"
    },
    {
        id: "reserve_study_completed",
        anchor: "The most recent Reserve Fund Stud was completed on",
        targetType: "paragraph",
        resolverKey: "reserve_study_date",
        fallback: "Not available",
        placeholder: "[DATE]"
    },
    {
        id: "reserve_study_next_due",
        anchor: "The next Reserve Fund Study is expected to be completed by",
        targetType: "paragraph",
        resolverKey: "reserve_study_next_due",
        fallback: "Not available",
        placeholder: "[DATE]"
    },
    {
        id: "pet_summary",
        anchor: "3.1",
        targetType: "paragraph",
        resolverKey: "pet_summary",
        fallback: "Not available",
        placeholder: "[SUMMARIZE PET PROVISIONS INCLUDED IN THE DECLARATION, AND RULES AND REGULATIONS]"
    },
    {
        id: "leasing_summary",
        anchor: "3.2",
        targetType: "paragraph",
        resolverKey: "leasing_summary",
        fallback: "Not available",
        placeholder: "[SUMMARIZE PROVISIONS RELATED TO TENANCY AND LEASING INCLUDED IN THE DECLARATION, AND RULES &amp; REGULATIONS]"
    },
    {
        id: "permitted_use_summary",
        anchor: "3.3",
        targetType: "paragraph",
        resolverKey: "permitted_use",
        fallback: "Not available",
        placeholder: "[SUMMARIZE USE SUCH AS SINGLE-FAMILY DWELLING, ETC. AS PER DECLARATION, AND RULES &amp; REGULATIONS]"
    },
    {
        id: "additional_items",
        anchor: "Additional Items to Note:",
        targetType: "paragraph",
        resolverKey: "additional_items",
        fallback: "NONE",
        placeholder: "[ENTER ANY ADDITIONAL FLAGS OR ITEMS TO NOTE. USE SAME NUMBERING SEQUENCE SUCH AS 7.1, 7.2, ETC. KEEP IT CONCISE.]"
    }
];
