/**
 * Firestore Security Rules Verification Specification (Dirty Dozen Adversarial Suite)
 * Documents expected PERMISSION_DENIED outcomes against firestore.rules.
 */
export const dirtyDozenCases = [
  { id: 1, name: 'Unverified Email Spoof', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Self-Assigned Faculty Role', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Shadow Field Injection', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Identity Spoofing on Booking', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Direct Approval Bypass', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'PII Cross-Read on /users/{other}/private/info', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Blanket Booking Scrape without requesterUid filter', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'ID Poisoning (>128 chars or invalid chars)', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Orphaned Equipment Reference', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Immutable Field Tampering (createdAt/requesterUid)', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Terminal State Mutation (rejected -> pending)', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Client Timestamp Forgery (non-serverTimestamp)', expected: 'PERMISSION_DENIED' },
] as const;
