export default function ReconcileLoading() {
  return (
    <div className="max-w-7xl space-y-8 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-4 w-48 bg-gray-100 rounded" />

      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-72 bg-gray-200 rounded" />
        <div className="h-4 w-56 bg-gray-100 rounded" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-6 py-5 flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-48 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-6 py-5 flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-48 bg-gray-100 rounded" />
          </div>
        </div>
      </div>

      {/* Totals bar */}
      <div className="flex gap-6">
        <div className="h-4 w-28 bg-gray-100 rounded" />
        <div className="h-4 w-36 bg-gray-100 rounded" />
        <div className="h-4 w-32 bg-gray-100 rounded" />
      </div>

      {/* Issues table */}
      <div className="space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-96 bg-gray-100 rounded" />
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-gray-50 border-b h-10" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <div className="w-24 h-4 bg-gray-200 rounded" />
              <div className="w-36 h-4 bg-gray-100 rounded" />
              <div className="w-8 h-6 bg-gray-100 rounded-full mx-auto" />
              <div className="w-8 h-6 bg-gray-100 rounded-full mx-auto" />
              <div className="w-8 h-6 bg-gray-100 rounded-full mx-auto" />
              <div className="w-24 h-4 bg-gray-100 rounded" />
              <div className="flex-1 h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
