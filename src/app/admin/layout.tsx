import React from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col sm:flex-row">
      <aside className="w-full sm:w-64 bg-slate-900 text-slate-300 p-4 border-r border-slate-800 flex flex-col">
        <h1 className="text-xl font-bold text-white mb-8 px-2 border-b border-slate-700 pb-4">
          Admin Dashboard
        </h1>
        <nav className="flex flex-col space-y-2">
          <a href="/admin" className="px-3 py-2 rounded bg-slate-800 text-white hover:bg-slate-700 transition">
            Documents List
          </a>
          <a href="/admin/upload" className="px-3 py-2 rounded hover:bg-slate-700 transition tracking-wide text-sm font-medium">
            Upload Manual
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
