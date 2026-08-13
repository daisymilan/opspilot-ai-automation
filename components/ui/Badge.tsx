const TONE_CLASSES = {
  neutral: "border-black/10 dark:border-white/15 text-black/70 dark:text-white/70",
  success: "border-green-600/30 text-green-700 dark:text-green-400",
  warning: "border-amber-600/30 text-amber-700 dark:text-amber-400",
  danger: "border-red-600/30 text-red-700 dark:text-red-400",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
