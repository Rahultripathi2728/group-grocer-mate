import {
  ShoppingBag,
  Utensils,
  Car,
  Zap,
  Film,
  Heart,
  Gift,
  MoreHorizontal,
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

export const getCategoryById = (id: string | null | undefined): Category => {
  return categories[id || 'general'] || categories.general;
};

export const categoryList = Object.values(categories);
