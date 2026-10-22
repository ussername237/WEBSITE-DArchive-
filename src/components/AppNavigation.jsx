import { NavLink } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Ringkasan" },
  { to: "/explore", label: "Cari" },
  { to: "/favorites", label: "Favorit" },
];

export default function AppNavigation() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0a0b0e]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <NavLink to="/dashboard" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-bold tracking-widest text-slate-200">
            DZ
          </span>
          <span className="text-sm font-semibold tracking-[0.04em] text-slate-100">
            DArchive
          </span>
        </NavLink>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                "whitespace-nowrap rounded-full px-3 py-2 text-xs transition " +
                (isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {!["localhost", "127.0.0.1"].includes(window.location.hostname) && (
            <a
              href="/cdn-cgi/access/logout?returnTo=/"
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
            >
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
