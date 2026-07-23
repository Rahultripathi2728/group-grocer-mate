## What will change

### 1. Add Expense chooser → small bottom sheet (full-screen only on form)
- `AddExpenseSheet.tsx`: revert the **chooser** view (Group circles + "Add as personal") to the original short `Sheet` (bottom, `side="bottom"`, auto height). The **form** view stays full-screen `Dialog` as it is now.

### 2. Bottom nav becomes 4 tabs (List removed, Settlement promoted)
New nav order: **Calendar · My Expenses · Settlement · Groups**

- `BottomNav.tsx`: remove `List`, add `Settlement` (icon `CheckCircle2`).
- `App.tsx`: drop `/list` route + `ListPage` import. Add `/settlement` route. Keep `/expenses` mounting only the "My Expenses" view.

### 3. Split `ExpensesPage` into two separate pages
- **New `MyExpensesPage.tsx`** (`/expenses`): exactly the current "Personal" tab content (date range filter, BudgetCard, stats, recent expenses, charts) — **no Tabs wrapper**.
- **New `SettlementPage.tsx`** (`/settlement`):
  - Horizontal scrollable group **avatar circles** (same look as AddExpense chooser — `Users` icon in circle, name under).
  - Click circle → selects that group, shows its `GroupExpensesBreakdown` below (existing component).
  - Persist selection in `localStorage` (`settlement_selected_group`).
  - Empty state if no groups: "Create a group from the Groups tab".
- Delete old `ExpensesPage.tsx`.

### 4. Simplify expense detail (no "who pays whom")
- `SimplifiedBalances.tsx`: keep "Your Balance" header + chips + "Mark All as Settled" button. **Remove** the entire "Who Pays Whom" per-balance list + UPI pay buttons (per user: no breakdown of who-pays-whom).
- `GroupExpensesBreakdown.tsx` per-expense accordion content: when a user expands a single expense (within "Who Spent How Much"), show only:
  - Total amount · Your share · Type (group/personal) · Status (Settled/Pending) · Date · Added by · **Split type** (Equal / Unequal / Item-wise) · **Split detail** = number of people involved, plus item list if item-wise. No per-person amount list, no settlement arrows.

### 5. Remove List feature completely (frontend + DB)
- Delete files: `src/pages/ListPage.tsx`, any `List*` components under `src/components/list/` if present.
- Remove route, nav item, any imports.
- Migration: `DROP TABLE public.grocery_items; DROP TABLE public.grocery_lists;` and drop the related triggers/functions `notify_group_on_grocery_item`, `notify_group_on_grocery_check`. ⚠️ **All list data permanently deleted.**

### 6. Fix duplicate notifications
Root cause to verify & fix:
- DB trigger `notify_group_on_expense` inserts a notification → trigger `send_push_on_notification` fires the edge function. That's one push.
- But the chooser/form was being mounted twice (Sheet + Dialog open simultaneously in some states) — already gated. Will audit `bills` loop in `AddExpenseSheet.handleSubmit`: it iterates `for (const b of bills)` and inserts each expense, which causes a per-bill push. If user adds 2 bills they get 2 pushes (correct). But if `notify_group_on_expense` AND a client-side notification call exist, that's the dupe.
- Audit:
  1. Check whether anywhere in client code we ALSO call `supabase.functions.invoke('send-push-notification')` after inserting an expense. If yes → remove (DB trigger already handles it).
  2. Check whether `send_push_on_notification` is bound to both `AFTER INSERT` and another event on `notifications` (would double).
  3. Ensure `send-push-notification` edge function isn't being called twice per event (one push per subscription per notification row).
- Fix whichever duplicate path exists. Most likely: a leftover client-side `.functions.invoke('send-push-notification')` call → remove it.

## Files touched
- Edit: `src/components/expenses/AddExpenseSheet.tsx`, `src/components/layout/BottomNav.tsx`, `src/App.tsx`, `src/components/expenses/SimplifiedBalances.tsx`, `src/components/expenses/GroupExpensesBreakdown.tsx`
- New: `src/pages/MyExpensesPage.tsx`, `src/pages/SettlementPage.tsx`
- Delete: `src/pages/ListPage.tsx`, `src/pages/ExpensesPage.tsx`, `src/components/expenses/AddExpenseDialog.tsx` (unused after audit)
- New migration: drop grocery tables + 2 related trigger functions
- Audit & fix push duplication (likely remove a client-side invoke)

## Out of scope (confirm if you want these too)
- I will NOT touch loans, calendar visuals, friend/profile pages, or notification UI.
- Capacitor / GitHub Pages config untouched.
