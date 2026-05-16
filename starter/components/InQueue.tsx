"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Asset, AssetState } from "@/lib/types";
import { relativeTime } from "@/lib/format";

type Props = {
  filterState: AssetState | AssetState[];
  nextStep: "store" | "deploy";
  refreshKey?: number;
  currentTag?: string;
};

const SHIFT_WINDOW_MS = 24 * 60 * 60 * 1000;

const CONFIG = {
  store: {
    heading: "Received — waiting to be stored or deployed",
    emptyNote: "Nothing received in the last 24 hours.",
    actionLabel: "Store →",
  },
  deploy: {
    heading: "In storage — waiting to be deployed",
    emptyNote: "Nothing in storage from the last 24 hours.",
    actionLabel: "Deploy →",
  },
};

export function InQueue({ filterState, nextStep, refreshKey, currentTag }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const stateKey = Array.isArray(filterState) ? filterState.join(",") : filterState;

  useEffect(() => {
    setLoading(true);
    const states = stateKey.split(",") as AssetState[];
    api.assets.list()
      .then(all => {
        const now = Date.now();
        setAssets(
          all
            .filter(a => states.includes(a.state))
            .filter(a => now - new Date(a.updated_at).getTime() < SHIFT_WINDOW_MS)
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
        );
      })
      .finally(() => setLoading(false));
  }, [stateKey, refreshKey]);

  const cfg = {
    ...CONFIG[nextStep],
    heading: nextStep === "deploy"
      ? "Received or in storage — ready to deploy"
      : CONFIG[nextStep].heading,
    emptyNote: nextStep === "deploy"
      ? "Nothing received or in storage from the last 24 hours."
      : CONFIG[nextStep].emptyNote,
  };

  return (
    <div className="rounded-lg border bg-white overflow-hidden h-fit">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">In queue</p>
          <p className="text-xs text-gray-500 leading-snug mt-0.5">{cfg.heading}</p>
        </div>
        {!loading && (
          <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-gray-200 text-gray-700">
            {assets.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400">{cfg.emptyNote}</p>
          <p className="text-xs text-gray-300 mt-1">All caught up.</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Tag</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Model</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Manufacturer</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Serial</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Custodian</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.map(asset => {
                const isCurrent = asset.asset_tag === currentTag;
                return (
                  <tr
                    key={asset.asset_tag}
                    className={isCurrent ? "bg-blue-50 border-l-2 border-blue-400" : "hover:bg-gray-50"}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-900 whitespace-nowrap">{asset.asset_tag}</td>
                    <td className="px-4 py-2.5 text-gray-700">{asset.model}</td>
                    <td className="px-4 py-2.5 text-gray-500">{asset.manufacturer}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-500">{asset.serial}</td>
                    <td className="px-4 py-2.5 text-gray-500">{asset.custodian}</td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{relativeTime(asset.updated_at)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {isCurrent ? (
                        <span className="text-blue-600 font-medium">Active</span>
                      ) : (
                        <Link
                          href={`/tech/${nextStep}?tag=${asset.asset_tag}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {cfg.actionLabel}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
