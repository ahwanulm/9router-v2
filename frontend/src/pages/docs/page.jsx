
export default function DocsPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
            <span className="material-symbols-outlined text-primary text-[18px]">menu_book</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-main">API Reference</h1>
            <p className="text-xs text-text-muted">Image &amp; Video Generation — all providers, models, and parameters</p>
          </div>
        </div>
        <a
          href="/image-video-docs.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface-2 transition-all"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          Open in new tab
        </a>
      </div>

      {/* Docs iframe — fills remaining height */}
      <iframe
        src="/image-video-docs.html"
        className="flex-1 w-full border-0 min-h-0"
        title="Image & Video API Reference"
      />
    </div>
  );
}
