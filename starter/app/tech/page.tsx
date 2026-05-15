import Link from "next/link";

const WORKFLOWS = [
  {
    href: "/tech/receive",
    label: "Receive",
    description: "New asset arriving at the dock",
    color: "border-blue-200 hover:border-blue-400",
  },
  {
    href: "/tech/store",
    label: "Store",
    description: "Move an asset to storage",
    color: "border-yellow-200 hover:border-yellow-400",
  },
  {
    href: "/tech/deploy",
    label: "Deploy",
    description: "Rack an asset into service",
    color: "border-green-200 hover:border-green-400",
  },
  {
    href: "/tech/transfer",
    label: "Transfer custody",
    description: "Hand off to another person",
    color: "border-purple-200 hover:border-purple-400",
  },
];

export default function TechLandingPage() {
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Scan workflows</h1>
        <p className="text-gray-500 text-sm mt-1">Choose a workflow to begin.</p>
      </div>
      <div className="grid gap-3">
        {WORKFLOWS.map(w => (
          <Link
            key={w.href}
            href={w.href}
            className={`block rounded-lg border-2 bg-white px-5 py-4 transition-colors ${w.color}`}
          >
            <p className="font-semibold text-gray-900">{w.label}</p>
            <p className="text-sm text-gray-500 mt-0.5">{w.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
