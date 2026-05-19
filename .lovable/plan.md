## Goal
Revamp the "Add Expense" flow based on the 3 screenshots, while keeping current theme (dark/grayscale) and **without any database schema changes** (uses existing `expenses` + `expense_splits` tables).

---

## New Flow (3 screens / steps)

### Step 1 — Bottom-sheet "Where to add?"
When user taps the `+` on Calendar/Dashboard, open a bottom-sheet (instead of jumping straight to the dialog) with three sections:

1. **Add expense to recent groups** — horizontal row of group icons (existing groups). Tap a group → opens Add Expense screen pre-selected with that group.
2. **Add an expense, outside groups** — opens Add Expense screen in "custom people" mode (ad-hoc, no group).
3. **Track your personal expense** — opens Add Expense screen in "personal" mode.

### Step 2 — Add Expense screen
- Header: back arrow, "Add Expense" title, top-right chip showing selected group name (or "Personal").
- Member avatars row at top: shows all group members (with names) + an "Add Friends" button when in custom mode.
- **Multiple bills**: a row of bill chips (`Bill 1`, `Bill 2`, …) + `+ Add bill` button. Each bill is its own sub-form (description, amount, category, date, split config). Switching chips swaps the active bill in view.
- Each bill form: Description, Category, Price, Paid By (dropdown of members), Date.
- **Split section**: segmented control — `Equally` | `Unequally`
  - **Equally**: show member chips with tap-to-include/exclude. Amount auto-divides across selected members.
  - **Unequally**: opens a second sheet (screenshot 3) — toggle `By amount` / `By shares`, list each member with checkbox + amount/shares input. Live "People: x/y" counter.
- Submit button at the bottom inserts **all bills** as separate `expenses` rows + their `expense_splits` rows in one go.

### Step 3 — Unequal split sheet
Modal sheet with `By amount` / `By shares` toggle, member rows (avatar, name, checkbox, numeric input), and live validation (sum must equal total).

---

## Files to create
- `src/components/expenses/AddExpenseSheet.tsx` — the new bottom-sheet entry point (step 1).
- `src/components/expenses/AddExpenseScreen.tsx` — full-screen dialog with multi-bill UI (step 2).
- `src/components/expenses/UnequalSplitSheet.tsx` — modal for unequal split (step 3).
- `src/components/expenses/BillTabs.tsx` — Bill 1 / Bill 2 / + Add bill tab strip.

## Files to update
- `src/pages/CalendarPage.tsx`, `src/pages/ExpensesPage.tsx`, `src/components/layout/DashboardLayout.tsx` (wherever `AddExpenseDialog` is opened) → replace with `AddExpenseSheet`.
- Keep `AddExpenseDialog.tsx` for now (no deletes) to avoid breaking anything; switch call sites to the new sheet.

## Technical notes (no DB changes)
- Multiple bills → loop and insert N rows into `expenses`, then build `expense_splits` per bill.
- Unequal split → write per-member `amount_owed` values directly; sum is validated client-side to equal `amount`.
- "Outside groups" (ad-hoc people without a group) → for now restrict to existing group members or self only, because adding non-user "friends" would require schema changes. The "Add Friends" button will show a toast "Coming soon — invite friends to a group first" to stay schema-safe.
- All styling uses existing semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.) — no hardcoded colors, dark theme preserved.
- No migrations. Existing data untouched.

## Out of scope (will note in reply)
- Adding non-registered friends (needs schema).
- Bill image upload, UPI app shortcuts (PhonePe/GPay/Paytm icons in screenshot 2) — UI placeholders only, no integrations.
