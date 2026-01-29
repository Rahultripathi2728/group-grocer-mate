import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Search, Filter, CalendarIcon, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getCategoryById, categoryList } from '@/lib/categories';

interface ExpenseFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  typeFilter: string;
  onTypeChange: (type: string) => void;
  dateRange: { from: Date | undefined; to: Date | undefined };
  onDateRangeChange: (range: { from: Date | undefined; to: Date | undefined }) => void;
  onExportCSV: () => void;
  onExportPDF: () => void;
  totalResults: number;
}

export default function ExpenseFilters({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  typeFilter,
  onTypeChange,
  dateRange,
  onDateRangeChange,
  onExportCSV,
  onExportPDF,
  totalResults,
}: ExpenseFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = categoryFilter !== 'all' || typeFilter !== 'all' || dateRange.from || dateRange.to;

  const clearFilters = () => {
    onCategoryChange('all');
    onTypeChange('all');
    onDateRangeChange({ from: undefined, to: undefined });
    onSearchChange('');
  };

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-muted/50 border-0"
          />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'shrink-0',
            hasActiveFilters && !showFilters && 'border-primary text-primary'
          )}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Download className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="end">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onExportCSV}
            >
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onExportPDF}
            >
              Export PDF
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 rounded-xl bg-muted/30 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Category */}
            <Select value={categoryFilter} onValueChange={onCategoryChange}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryList.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <cat.icon className="h-3 w-3" />
                      {cat.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type */}
            <Select value={typeFilter} onValueChange={onTypeChange}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="group">Group</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal bg-background',
                    !dateRange.from && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? format(dateRange.from, 'dd MMM') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange.from}
                  onSelect={(date) => onDateRangeChange({ ...dateRange, from: date })}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal bg-background',
                    !dateRange.to && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.to ? format(dateRange.to, 'dd MMM') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={dateRange.to}
                  onSelect={(date) => onDateRangeChange({ ...dateRange, to: date })}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {totalResults} expense{totalResults !== 1 ? 's' : ''} found
      </p>
    </div>
  );
}
