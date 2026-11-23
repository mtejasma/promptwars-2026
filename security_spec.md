# LabLink Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every path not explicitly matched is denied read and write.
2. **Verified Identity**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Role Integrity & No Self-Escalation**: Users can create their `/users/{userId}` profile only with `role == 'student'` unless they already pass `isAdmin()`. Users cannot mutate `role` on update or write to `/admins/{adminId}`.
4. **PII Isolation**: Email and campus ID are strictly isolated in `/users/{userId}/private/info`, readable/writable only by `isOwner(userId)` or `isAdmin()`.
5. **Booking Ownership & Equipment Existence**: A `Booking` can only be created when `requesterUid == request.auth.uid`, `equipmentId` exists in `/equipment`, and initial status is `'pending'` or `'conflict'` (or `'approved'` only if `!requiresFacultyApproval` and no overlapping conflict, or `isAdmin()`).
6. **Terminal State Lock**: Bookings in `'rejected'`, `'cancelled'`, or `'completed'` cannot be modified by non-admins.
7. **SlotBlock Relational Sync**: A `SlotBlock` can only be created alongside or referencing a valid `Booking` (`existsAfter(/databases/$(database)/documents/bookings/$(incoming().bookingId))`), and cannot expose PII.
8. **Strict Key & Size Bounds**: Every document enforces `keys().hasAll(...) && keys().hasOnly(...)`, regex-guarded IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars), bounded strings/arrays, and server timestamps (`request.time`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoof**: Signed-in user with `email_verified: false` attempting `bookings` create -> `PERMISSION_DENIED`.
2. **Self-Assigned Faculty Role**: Student creating `/users/{uid}` with `role: 'faculty'` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection (Ghost Key)**: Creating a booking with an extra `isAdminApproved: true` field -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Booking**: Student A creating a booking with `requesterUid: "student-B-uid"` -> `PERMISSION_DENIED`.
5. **Direct Approval Bypass**: Student updating their own `pending` booking `status` to `'approved'` when `requiresFacultyApproval == true` -> `PERMISSION_DENIED`.
6. **PII Cross-Read**: Student A reading `/users/{studentB}/private/info` -> `PERMISSION_DENIED`.
7. **Blanket Booking Scrape**: Non-admin student listing `/bookings` without `where('requesterUid', '==', uid)` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Creating `/bookings/<1500-char-id>` or `/bookings/bad$id` -> `PERMISSION_DENIED`.
9. **Orphaned Equipment Reference**: Creating a booking referencing non-existent `equipmentId: "fake_eq_999"` -> `PERMISSION_DENIED`.
10. **Immutable Field Tampering**: Updating a booking to change `createdAt` or `requesterUid` -> `PERMISSION_DENIED`.
11. **Terminal State Mutation**: Student updating a `'rejected'` booking back to `'pending'` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Creating a booking with a backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
