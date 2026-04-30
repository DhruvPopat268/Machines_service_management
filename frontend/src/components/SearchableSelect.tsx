import { useState, useMemo, useEffect, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  onSearchChange?: (val: string) => void;
  maxInitialDisplay?: number;
  disabled?: boolean;
}

export function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...", 
  searchPlaceholder = "Search...", 
  className, 
  onSearchChange,
  maxInitialDisplay = 10,
  disabled = false
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = options.find((o) => o.value === value);

  // Debounced search with 500ms delay - only when popover is open
  useEffect(() => {
    // Don't schedule debounced calls when popover is closed
    if (!open) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (onSearchChange) {
        onSearchChange(searchQuery);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, onSearchChange, open]);

  const displayOptions = useMemo(() => {
    // Add "All" option at the top only if there are actual options
    if (options.length > 0) {
      return [{ label: `All ${placeholder}`, value: "" }, ...options];
    }
    return options;
  }, [options, placeholder]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Clear any pending debounced calls
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Reset search query
      setSearchQuery("");
      // Immediately reset to initial load when closing
      if (onSearchChange) {
        onSearchChange("");
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }} align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={searchQuery} onValueChange={handleSearchChange} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {displayOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => { onChange(option.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {!searchQuery && options.length >= maxInitialDisplay && (
              <div className="px-2 py-1.5 text-xs text-center text-muted-foreground border-t">
                Showing {options.length} results. Type to search more...
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
