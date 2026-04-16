import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

interface SearchableFilterConfig {
  key: string;
  placeholder: string;
  searchPlaceholder?: string;
  options: FilterOption[];
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  searchableFilters?: SearchableFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, val: string) => void;
  showDateRange?: boolean;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (val: string) => void;
  onToDateChange?: (val: string) => void;
  onClear?: () => void;
}

export function FilterBar({
  searchValue, onSearchChange, searchPlaceholder = "Search...",
  filters = [], searchableFilters = [], filterValues = {}, onFilterChange,
  showDateRange = false, fromDate = "", toDate = "",
  onFromDateChange, onToDateChange, onClear,
}: FilterBarProps) {
  const hasActiveFilters = searchValue || 
    Object.values(filterValues).some(v => v && v !== "all") || 
    fromDate || 
    toDate;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {searchableFilters.map((f) => (
            <SearchableSelect
              key={f.key}
              options={[{ label: `All ${f.placeholder}`, value: "" }, ...f.options]}
              value={filterValues[f.key] ?? ""}
              onChange={(v) => onFilterChange?.(f.key, v)}
              placeholder={f.placeholder}
              searchPlaceholder={f.searchPlaceholder ?? `Search ${f.placeholder.toLowerCase()}...`}
              className="w-[180px] h-9 text-sm"
            />
          ))}
          {filters.map((f) => (
            <Select key={f.key} value={filterValues[f.key] || "all"} onValueChange={(v) => onFilterChange?.(f.key, v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label}</SelectItem>
                {f.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {showDateRange && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => onFromDateChange?.(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                <Input type="date" value={toDate} onChange={(e) => onToDateChange?.(e.target.value)} className="h-9 text-sm w-40" />
              </div>
            </>
          )}
          {hasActiveFilters && onClear && (
            <Button variant="outline" size="sm" onClick={onClear} className="h-9">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
