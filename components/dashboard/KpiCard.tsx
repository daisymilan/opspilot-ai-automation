export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-black/50 dark:text-white/50">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {hint ? <span className="text-xs text-black/50 dark:text-white/50">{hint}</span> : null}
    </div>
  );
}
