# Settlement ka hisaab fix (diagnosis + plan)

## Jo hua (Aman/Rahul case)

Settlement page do alag-alag hisaab dikhata hai aur use karta hai — yahi asli bug hai.

1. **Dikhne wala hisaab (net):** "Who Pays Whom" me har jodi (pair) ke dono taraf ke amount aapas me kaat ke ek hi line dikhayi jaati hai.
   Example: Aman ko Rahul se ₹500 dena hai (Rahul ke bills me), Rahul ko Aman se ₹300 dena hai (Aman ke bills me) → screen par sirf "Aman → Rahul ₹200".

2. **Settle karne wala hisaab (one-sided):** "Settle my share" dabane par sirf Aman ke apne saare pending share paid ho jaate hain — poore ₹500 — aur Rahul ka ₹300 pending hi rehta hai.

Result: Aman ne ₹200 (net) bheja, magar system ne ₹500 clear kar diya, aur Rahul ka ₹300 alag se pending dikh gaya. Isi liye Aman ke settle karte hi poora hisaab palat gaya aur "ab Rahul ko pay karna hai ₹300" aa gaya. Paisa ₹300 ka double count hua.

## Do sath wali kamiyan

- **Counterparty ka record nahi:** settlement sirf "kisne, kitna" store karta hai — "kisko diya" nahi. Isliye kabhi verify nahi ho paata ki Aman ne Rahul ko net ₹200 diya tha.
- **"Pay only some bills" page (Pay selected bills):** ye bhi bill-wise one-sided settle karta hai, net hisaab ko bilkul ignore karke — usse yahi gadbad aur badhti hai. Aapke kehne par ise hata denge.

## Fix plan

**A. Net hisaab hi settle ho (core fix)**
- Naya per-jodi settle: "Rahul ko ₹200 settle karo" — us button se Aman ke Rahul-wale pending share **aur** Rahul ke Aman-wale pending share, dono ek sath paid ho jaate hain (kyunki net ₹200 se dono side khatam). Amount mismatch ho to chhote side ko poora aur bade side ko net tak adjust kiya jayega, taaki koi paisa gum ya double na ho.
- Screen par jo net amount dikh raha hai, wahi settle hoga — display aur action ek jaise.

**B. Settlement ka proper record**
- Settlement row me counterparty (kisko pay kiya) aur net amount save hoga, aur history me "Aman → Rahul ₹200" dikhega. Group balance hamesha isi ledger se milega.

**C. Purana flow hatana**
- "Settle my share" (poora group ek sath, one-sided) aur "Pay only some bills" page dono hata denge, aur unke links/route bhi. Jagah par sirf per-person "Pay & settle" cards rahenge — har card par UPI link + settle button.

**D. Purana data theek karna**
- Ek baar ka cleanup: jahan ek side paid aur doosri side unpaid pada hai (Aman/Rahul jaisa case), use net ke hisaab se sahi kar denge, taaki aaj ka balance sach dikhe.

**E. Verify**
- Aman ke settle karne ke baad Rahul ki screen par balance ₹0 hona chahiye (na palat kar naya amount aana chahiye), aur naye bill ke baad hisaab zero se shuru ho.

## Technical notes

- Nayi RPC `settle_with_member(p_group_id, p_other_user)`: dono taraf ke `expense_splits` net karke `is_paid` set karti hai (SECURITY DEFINER, caller khud hi apni taraf se call kar sakta hai), aur `settlements` me `counterparty_id` + `net_amount` insert karti hai.
- `settlements` table me `counterparty_id uuid` add hoga (migration + GRANT).
- `settle_my_share` / `settle_my_splits` remove; `PaySelectedBillsPage.tsx` aur uska route delete.
- `GroupExpensesBreakdown.tsx` ka pair-netting logic RPC ke saath exactly match karega (shared helper).
