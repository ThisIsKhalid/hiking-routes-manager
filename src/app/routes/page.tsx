"use client";

import { Download, FileJson, Map, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import RouteFormUpdate, {
  type RouteFormValues,
} from "../components/RouteFormUpdate";

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteFormValues[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteFormValues | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/route");
      const data = await res.json();
      if (data.routes) {
        setRoutes(data.routes as RouteFormValues[]);
      } else {
        setError("Failed to load routes");
      }
    } catch (err) {
      if (err) setError("Error fetching routes");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!routes.length) return;

    // Format matches the requirement: { routes: [ ... ] }
    // The API already returns { routes: [ ... ] } structure if we just fetched from /api/route?
    // Actually /api/route returns { routes: [...] }.
    // We stored that in state 'routes'.
    // So we just wrap it back.

    const downloadData = { routes };
    const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hiking_routes_export_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenUpdate = (route: RouteFormValues) => {
    setSelectedRoute(route);
    setIsModalOpen(true);
  };

  const handleCloseUpdate = () => {
    setIsModalOpen(false);
  };

  const handleUpdated = () => {
    setIsModalOpen(false);
    fetchRoutes();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-cyan-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">All Routes</h1>
            <p className="text-slate-400">
              Manage and export your hiking routes
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={!routes.length}
            className="flex items-center gap-2 px-6 py-3 bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Download size={20} />
            Download All JSON
          </button>
        </header>

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-500/50 text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {routes.length === 0 && !error ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800">
            <Map size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-medium text-slate-300">
              No routes found
            </h3>
            <p className="text-slate-500 mt-2">
              Create your first route to get started.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-cyan-400 hover:text-cyan-300 hover:underline"
            >
              Create Route &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {routes.map((route) => (
              <div
                key={route.route_id} // using mapped snake_case key
                onClick={() => handleOpenUpdate(route)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-cyan-500/30 transition-colors group cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpenUpdate(route);
                  }
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-cyan-950/50 p-3 rounded-lg text-cyan-400 group-hover:text-cyan-300 group-hover:bg-cyan-900/50 transition-colors">
                    <FileJson size={24} />
                  </div>
                  <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded">
                    {route.route_id}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-100 mb-2">
                  {route.route_name}
                </h3>

                <div className="space-y-2 text-sm text-slate-400">
                  <div className="flex justify-between">
                    <span>Stages:</span>
                    <span className="font-mono text-slate-200">
                      {route.stages?.length || 0}
                    </span>
                  </div>
                  {route.stages?.[0] && (
                    <div className="flex justify-between">
                      <span>First Stage:</span>
                      <span className="truncate max-w-37.5">
                        {route.stages[0].stage_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && selectedRoute && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-6">
          <div className="absolute inset-0" onClick={handleCloseUpdate} />
          <div className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-cyan-400">
                  Update Route
                </p>
                <h2 className="text-2xl font-bold text-white">
                  {selectedRoute.route_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCloseUpdate}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <RouteFormUpdate
              initialData={selectedRoute}
              targetRouteId={selectedRoute.route_id}
              onCancel={handleCloseUpdate}
              onUpdated={handleUpdated}
            />
          </div>
        </div>
      )}
    </div>
  );
}
