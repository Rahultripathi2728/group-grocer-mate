/**
 * Item-wise split metadata stored on `expenses.split_items`.
 * An item-wise bill is always ONE expense — the items live here.
 */
export interface SplitItem {
  name: string;
  amount: number;
  user_ids: string[];
}

export const parseSplitItems = (raw: unknown): SplitItem[] | null => {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      name: String(r.name ?? 'Item'),
      amount: Number(r.amount ?? 0),
      user_ids: Array.isArray(r.user_ids) ? (r.user_ids as unknown[]).map(String) : [],
    }))
    .filter((r) => r.amount > 0 && r.user_ids.length > 0);
  return rows.length ? rows : null;
};

/** Items that only `userId` shares → that person's 100% personal spend. */
export const soloItemsFor = (items: SplitItem[] | null, userId?: string) =>
  !items || !userId ? [] : items.filter((i) => i.user_ids.length === 1 && i.user_ids[0] === userId);

export const sumItems = (items: SplitItem[]) =>
  Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
