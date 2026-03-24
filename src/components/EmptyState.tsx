interface EmptyStateProps {
  onImport: () => void;
}

export default function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-xs mx-auto text-center">
      <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-6">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          className="text-gray-400"
        >
          <path
            d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Your library is empty
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Import an EPUB file to get started.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 active:bg-blue-800 transition-colors duration-150"
      >
        Import a book
      </button>
      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        or drag and drop an .epub file anywhere
      </p>
    </div>
  );
}
