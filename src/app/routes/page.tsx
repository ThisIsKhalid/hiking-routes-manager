'use client';

import { Download, FileJson, Map } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function RoutesPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/route');
      const data = await res.json();
      if (data.routes) {
        setRoutes(data.routes);
      } else {
        setError('Failed to load routes');
      }
    } catch (err) {
      setError('Error fetching routes');
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
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hiking_routes_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <p className="text-slate-400">Manage and export your hiking routes</p>
          </div>
          <button
            onClick={handleDownload}
            disabled={!routes.length}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
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
            <h3 className="text-xl font-medium text-slate-300">No routes found</h3>
            <p className="text-slate-500 mt-2">Create your first route to get started.</p>
            <Link href="/" className="inline-block mt-4 text-cyan-400 hover:text-cyan-300 hover:underline">
              Create Route &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {routes.map((route: any) => (
              <div
                key={route.route_id} // using mapped snake_case key
                className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-cyan-500/30 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-cyan-950/50 p-3 rounded-lg text-cyan-400 group-hover:text-cyan-300 group-hover:bg-cyan-900/50 transition-colors">
                    <FileJson size={24} />
                  </div>
                  <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded">
                    {route.route_id}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-slate-100 mb-2">{route.route_name}</h3>
                
                <div className="space-y-2 text-sm text-slate-400">
                  <div className="flex justify-between">
                    <span>Stages:</span>
                    <span className="font-mono text-slate-200">{route.stages?.length || 0}</span>
                  </div>
                  {route.stages?.[0] && (
                     <div className="flex justify-between">
                        <span>First Stage:</span>
                        <span className="truncate max-w-[150px]">{route.stages[0].stage_name}</span>
                     </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
