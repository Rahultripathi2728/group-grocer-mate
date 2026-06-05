# Plan: Add Expense Full-Screen + Audit + Push Fix

## 1. Add Expense — Full-screen on all devices

**File:** `src/components/expenses/AddExpenseSheet.tsx` (and possibly `AddExpenseDialog.tsx`)

Convert from centered modal/bottom-sheet to edge-to-edge full-screen on every viewport, matching your screenshot 1 (back arrow header on left, group/Home chip on right, scrollable body, fixed "Submit expense" CTA at bottom).

- Replace `Dialog`/`Sheet` `max-w-*` and rounded corners with `w-screen h-[100dvh] max-w-none rounded-none`
- Sticky header: back arrow + "Add Expense" title + group chip
- Sticky bottom: "Submit expense" full-width black button
- Body: scrollable, normal padding
- Animation: slide-up from bottom (mobile feel) on all devices
- Keep all existing functionality (Equal/Unequal/Item-wise splits, members, date, scan bill, etc.)

## 2. Push notifications — diagnose & fix

**Files to check:**
- `supabase/functions/send-push-notification/index.ts` — VAPID signing, payload, error handling
- `supabase/functions/get-vapid-public-key/index.ts`
- `src/hooks/usePushNotifications.ts` — subscription registration
- `public/sw.js` — push event handler
- DB trigger `send_push_on_notification` — verify it's actually attached to `notifications` table (currently no triggers exist per schema dump — **this is the bug**)

**Likely root cause:** schema shows "no triggers in database" — the `send_push_on_notification` function exists but is not attached to a trigger on `notifications`, so no push is ever fired when a notification row is inserted.

**Fix:** migration to (re)create the trigger `AFTER INSERT ON notifications` calling `send_push_on_notification()`. Also check edge function logs for failures and the SW for proper `push` listener with `showNotification` + icon.

Capacitor/native caveat: web-push (VAPID) only fires inside the browser engine; on installed Capacitor APK without FCM, push won't fire in background. I'll document this clearly — actually delivering OS-level notifications to your Android phone requires either (a) installing the app as PWA from Chrome (then web push works in background via Chrome's service), or (b) adding `@capacitor/push-notifications` + Firebase (separate setup). I'll fix the web-push path; native FCM is out of scope.

## 3. Balance simplification — verify math

Memory says "always simplified (current)". I'll audit `GroupExpensesBreakdown.tsx` `calculateBalances()` to confirm:
- Net per user = sum(paid) − sum(owed)
- Greedy matching (largest creditor ↔ largest debtor) produces minimum transactions
- Floating-point tolerance (0.01) applied
- Settled expenses excluded
- Per-user `amount_owed` from `expense_splits` honoured

Any deviation → fix.

## 4. Full project bug audit

I'll review and produce a written report covering:
- **ExpensesPage** — month nav, filters, persistence
- **CalendarPage** — date calc/timezone, summary chips, delete dialog
- **GroupExpensesBreakdown** — settlement math, settled-flag handling, split fallback logic
- **SimplifiedBalances** — UPI fetch, settle confirmation
- **GroupsPage** — join-by-code, admin delete, leave group
- **AddExpenseSheet** — split validation, item-wise totals, equal/unequal sum check, payer selection
- **AuthContext / ResetPasswordPage** — session handling
- **NotificationsPage / NotificationBell** — read state, badge sync
- **Edge functions** — CORS, error responses, VAPID flow
- **DB triggers / RLS** — missing triggers, policy gaps

For each bug found I'll list: file, severity, fix applied (or recommendation if out of scope).

## Order of work

1. Build full-screen Add Expense (UI only — no logic changes)
2. Create migration to attach `send_push_on_notification` trigger
3. Audit balance math + fix any bugs found
4. Walk the rest of the codebase, fix obvious bugs, document the rest
5. Report findings at the end

## Notes

- I will NOT add a Splitwise-style on/off toggle (you chose "always simplified")
- I will NOT change UPI / scan bill / categorization behavior
- I will NOT touch backend role/permissions unless a bug demands it
- Expect 4–6 file edits + 1 migration; audit report in the final message
