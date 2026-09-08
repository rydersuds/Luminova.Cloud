export const TERMS_PATH = "/terms"
export const PRIVACY_PATH = "/privacy"

export const LEGAL_CONSENT_LABEL =
  "I agree to the Terms & Conditions and acknowledge the Privacy Policy."

export function canSubmitSignIn(consentAccepted: boolean, isFetching: boolean) {
  return consentAccepted && !isFetching
}