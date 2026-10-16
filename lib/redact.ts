// Pure: strip secrets and personal data from text before it is logged or shown in job summaries.
export function redact(input: string, max = 300): string {
  return input
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[redacted-private-key]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi, "[redacted-credentials]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[redacted-jwt]")
    .replace(/\b(?:re|sk|pk|rk)_[A-Za-z0-9]{10,}/g, "[redacted-key]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .slice(0, max);
}
