import { ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {item.href && index < items.length - 1 ? (
            <Link href={item.href} className="font-semibold text-[var(--text-secondary)] transition hover:text-[var(--accent-color)]">
              {item.label}
            </Link>
          ) : (
            <span className={index === items.length - 1 ? "font-semibold text-[var(--text-primary)]" : "font-semibold text-[var(--text-secondary)]"}>{item.label}</span>
          )}
          {index < items.length - 1 ? <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" /> : null}
        </div>
      ))}
    </nav>
  );
}
