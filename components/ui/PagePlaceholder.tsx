interface PagePlaceholderProps {
  title: string;
  description: string;
  phase: string;
}

export function PagePlaceholder({ title, description, phase }: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-black/60 dark:text-white/60 max-w-prose">{description}</p>
      <span className="mt-4 inline-flex w-fit items-center rounded-full border border-black/10 dark:border-white/10 px-3 py-1 text-xs text-black/50 dark:text-white/50">
        {phase}
      </span>
    </div>
  );
}
