// Rule-based eligibility assessment. Deterministic — the model does not decide outcomes.

import { Slots } from "../types";

export interface AssessmentOutcome {
  eligible: boolean;
  reason: string;
}

/**
 * Placeholder rule engine. Replace with the company's real eligibility rules.
 * The shape is intentionally simple so the verified rule set can drop in later.
 */
export function assessEligibility(slots: Slots): AssessmentOutcome {
  const { destination, purpose, nationality } = slots;

  if (!destination || !purpose || !nationality) {
    return { eligible: false, reason: "missing_required_fields" };
  }

  // Example rule: study and business purposes always route to review.
  const needsReview = purpose === "study" || purpose === "business";

  if (needsReview) {
    return { eligible: true, reason: "requires_review" };
  }

  return { eligible: true, reason: "standard" };
}
