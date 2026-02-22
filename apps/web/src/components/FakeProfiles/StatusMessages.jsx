export function StatusMessages({ error, savingHint }) {
  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {savingHint && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
          {savingHint}
        </div>
      )}
    </>
  );
}
