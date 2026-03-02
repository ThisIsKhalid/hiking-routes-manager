"use client";

import RouteFormUpdate from "./components/RouteFormUpdate";

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-white font-sans p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-6xl w-full space-y-8">
        <header className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-cyan-400 to-purple-400 drop-shadow-lg">
            Hiking Routes Manager
          </h1>
          <p className="text-lg text-slate-300">
            Create and edit complex hiking routes with stages, detailed metrics,
            and accommodation data.
          </p>
        </header>

        <main className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
          <RouteFormUpdate targetRouteId="" />
        </main>
      </div>
    </div>
  );
}
