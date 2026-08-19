export default function AppLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <div className="flex items-center gap-3 text-sm text-black/50 dark:text-white/50">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black/60 dark:border-white/20 dark:border-t-white/60" />
        Loading…
      </div>
    </div>
  );
}
