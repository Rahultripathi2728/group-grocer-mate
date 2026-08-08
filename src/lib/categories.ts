import {
  ShoppingBag,
  Utensils,
  Car,
  Zap,
  Film,
  Heart,
  Gift,
  MoreHorizontal,
  Tag,
  LucideIcon,
} from 'lucide-react';

export interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const categories: Record<string, Category> = {
  general: {
    id: 'general',
    label: 'General',
    icon: MoreHorizontal,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  food: {
    id: 'food',
    label: 'Food & Groceries',
    icon: Utensils,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    icon: Car,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  utilities: {
    id: 'utilities',
    label: 'Utilities',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment',
    icon: Film,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  shopping: {
    id: 'shopping',
    label: 'Shopping',
    icon: ShoppingBag,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  health: {
    id: 'health',
    label: 'Health',
    icon: Heart,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  other: {
    id: 'other',
    label: 'Other',
    icon: Gift,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
};

/* ---------- user-created categories (kept on the device) ---------- */
const CUSTOM_KEY = 'custom_categories_v1';

const CUSTOM_STYLES = [
  { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
  { color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  { color: 'text-rose-500', bgColor: 'bg-rose-500/10' },
  { color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
];

export const getCustomCategories = (): Category[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; label: string }>) : [];
    return list
      .filter((c) => c && c.id && c.label)
      .map((c, i) => ({
        id: c.id,
        label: c.label,
        icon: Tag,
        ...CUSTOM_STYLES[i % CUSTOM_STYLES.length],
      }));
  } catch {
    return [];
  }
};

/** Adds a device-local category and returns its id. */
export const addCustomCategory = (label: string): string => {
  const clean = label.trim().slice(0, 24);
  const id = `custom_${clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; label: string }>) : [];
    if (!list.some((c) => c.id === id)) {
      list.push({ id, label: clean });
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    }
  } catch { /* ignore */ }
  return id;
};

export const removeCustomCategory = (id: string) => {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; label: string }>) : [];
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.filter((c) => c.id !== id)));
  } catch { /* ignore */ }
};

export const getCategoryById = (id: string | null | undefined): Category => {
  const key = id || 'general';
  if (categories[key]) return categories[key];
  const custom = getCustomCategories().find((c) => c.id === key);
  return custom || categories.general;
};

export const categoryList = Object.values(categories);

// Keyword-based auto-detection for expense categories
const categoryKeywords: Record<string, string[]> = {
  food: [
    // Indian food
    'biryani', 'chai', 'samosa', 'dosa', 'idli', 'paratha', 'roti', 'naan', 'paneer',
    'dal', 'rajma', 'chole', 'pav bhaji', 'vada pav', 'pani puri', 'golgappa', 'momos',
    'thali', 'rasmalai', 'gulab jamun', 'jalebi', 'ladoo', 'barfi', 'halwa', 'kheer',
    'lassi', 'buttermilk', 'chaas', 'tandoori', 'tikka', 'kebab', 'korma', 'masala',
    'curry', 'sabzi', 'bhaji', 'pakora', 'chaat', 'dhokla', 'kachori', 'poha', 'upma',
    'pulao', 'khichdi', 'raita', 'chutney', 'pickle', 'achar', 'papad',
    // General food
    'food', 'lunch', 'dinner', 'breakfast', 'snack', 'meal', 'pizza', 'burger', 'sandwich',
    'coffee', 'tea', 'juice', 'milk', 'bread', 'rice', 'chicken', 'mutton', 'fish', 'egg',
    'fruit', 'vegetable', 'salad', 'pasta', 'noodles', 'soup', 'ice cream', 'cake',
    'chocolate', 'biscuit', 'chips', 'sweets', 'mithai', 'nashta', 'khana', 'grocery',
    'groceries', 'supermarket', 'kirana', 'ration', 'sabji', 'atta', 'sugar', 'oil',
    'spices', 'masale', 'doodh', 'restaurant', 'hotel', 'dhaba', 'canteen', 'cafe',
    'bakery', 'zomato', 'swiggy', 'blinkit', 'zepto', 'instamart', 'bigbasket',
    'dominos', 'mcdonalds', 'kfc', 'subway', 'starbucks', 'dunkin',
  ],
  transport: [
    'petrol', 'diesel', 'fuel', 'gas', 'cng', 'auto', 'rickshaw', 'cab', 'taxi',
    'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'flight', 'ticket', 'parking',
    'toll', 'fastag', 'car wash', 'service', 'tyre', 'tire', 'mechanic', 'garage',
    'insurance', 'driving', 'transport', 'travel', 'yatra', 'safar', 'kiraya',
    'bhada', 'ride', 'commute', 'airfare', 'railway', 'irctc',
  ],
  utilities: [
    'electricity', 'bijli', 'light bill', 'water', 'paani', 'gas bill', 'wifi',
    'internet', 'broadband', 'jio', 'airtel', 'vi', 'bsnl', 'recharge', 'mobile',
    'phone', 'bill', 'rent', 'kiraya', 'maintenance', 'society', 'emi', 'loan',
    'insurance', 'tax', 'postpaid', 'prepaid', 'dth', 'tata sky', 'cylinder',
  ],
  entertainment: [
    'movie', 'film', 'cinema', 'pvr', 'inox', 'netflix', 'hotstar', 'prime',
    'spotify', 'youtube', 'subscription', 'gaming', 'game', 'concert', 'show',
    'party', 'club', 'bar', 'pub', 'beer', 'wine', 'alcohol', 'daaru', 'sharab',
    'hookah', 'bowling', 'amusement', 'park', 'trip', 'picnic', 'outing',
    'vacation', 'holiday', 'tour', 'manoranjan', 'masti',
  ],
  shopping: [
    'clothes', 'kapde', 'shirt', 'pant', 'jeans', 'shoes', 'joote', 'chappal',
    'sandal', 'bag', 'purse', 'wallet', 'watch', 'jewellery', 'jewelry', 'sona',
    'gold', 'silver', 'chandi', 'saree', 'suit', 'kurta', 'dress', 'top',
    'amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'shopping',
    'mall', 'market', 'bazaar', 'electronics', 'laptop', 'phone', 'mobile',
    'headphone', 'earphone', 'charger', 'cable', 'gadget', 'appliance',
    'furniture', 'sofa', 'bed', 'table', 'chair', 'decor', 'home',
  ],
  health: [
    'doctor', 'hospital', 'clinic', 'medicine', 'dawai', 'pharmacy', 'medical',
    'lab', 'test', 'xray', 'scan', 'operation', 'surgery', 'dental', 'dentist',
    'eye', 'spectacles', 'glasses', 'lens', 'gym', 'fitness', 'yoga', 'health',
    'vitamin', 'supplement', 'protein', 'apollo', 'pharmeasy', 'netmeds',
    '1mg', 'practo', 'consultation', 'checkup', 'ilaj', 'dava', 'tablet',
    'syrup', 'injection', 'vaccine', 'insurance', 'sehat', 'swasthya',
  ],
};

/**
 * Auto-detect category from expense description.
 * Matches keywords against the description text (case-insensitive).
 * Returns the best matching category id, or null if no match found.
 */
export function detectCategory(description: string): string | null {
  if (!description || description.trim().length < 2) return null;

  const text = description.toLowerCase().trim();
  const scores: Record<string, number> = {};

  for (const [categoryId, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // Longer keyword matches get higher score
        scores[categoryId] = (scores[categoryId] || 0) + keyword.length;
      }
    }
  }

  // Return category with highest score
  let bestCategory: string | null = null;
  let bestScore = 0;
  for (const [categoryId, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = categoryId;
    }
  }

  return bestCategory;
}
