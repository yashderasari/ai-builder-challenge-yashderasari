import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto py-16 space-y-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Asset tracking</h1>
        <p className="text-gray-500 text-lg">
          Multi-site lab asset management — scan workflows for techs, dashboard and reconciliation for managers.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Tech card */}
        <div className="rounded-xl border bg-white p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Lab technician</p>
            <h2 className="text-xl font-semibold text-gray-900">Scan workflows</h2>
            <p className="text-sm text-gray-500">Receive, store, deploy, and transfer assets using a scanner or phone camera.</p>
          </div>
          <div className="space-y-2">
            <Link href="/tech/receive" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Receive</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
            <Link href="/tech/store" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Store</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
            <Link href="/tech/deploy" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Deploy</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
            <Link href="/tech/transfer" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Transfer custody</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
          </div>
        </div>

        {/* Manager card */}
        <div className="rounded-xl border bg-white p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Asset manager</p>
            <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-500">Monitor fleet health, review asset details, and run three-way reconciliation.</p>
          </div>
          <div className="space-y-2">
            <Link href="/manager" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Asset list</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
            <Link href="/manager/reconcile" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50 group">
              <span className="font-medium text-gray-800">Reconciliation report</span>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
