interface ImportButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export default function ImportButton({ onClick, loading }: ImportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="shrink-0 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover focus:outline-2 focus:outline-accent focus:outline-offset-2 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-sm"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="opacity-75"
            />
          </svg>
          Importing…
        </span>
      ) : (
        "+ Add book"
      )}
    </button>
  );
}
