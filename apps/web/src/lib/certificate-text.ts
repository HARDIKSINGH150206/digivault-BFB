/**
 * What the certificate QR proves, worded once for the PDF, the version page
 * and /verify (docs/07 Phase 5, ADR-022). No imports: client components use it.
 */
export const CERTIFICATE_QR_STATEMENT =
  "Scanning the QR code proves this certificate's commitment is anchored on the public blockchain. " +
  "Verifying a file additionally requires dropping the document pages, with their proof file, into the verification portal.";
