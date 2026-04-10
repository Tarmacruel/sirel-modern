import { Skeleton } from "@/components/ui/skeleton";

interface SectionSkeletonProps {
  hero?: boolean;
  cards?: number;
  rows?: number;
}

export function SectionSkeleton({ hero = false, cards = 3, rows = 4 }: SectionSkeletonProps) {
  return (
    <div className="space-y-4">
      {hero ? <Skeleton className="h-[220px] w-full rounded-[32px]" /> : null}
      {cards > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: cards }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-[28px]" />
          ))}
        </div>
      ) : null}
      <div className="space-y-3 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}
