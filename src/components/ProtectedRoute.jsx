import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getAuthenticatedUser } from "../lib/auth.js";

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAuthenticatedUser()
      .then((user) => {
        if (active) setStatus(user ? "authenticated" : "anonymous");
      })
      .catch((authError) => {
        if (!active) return;
        setError(authError.message || "Sesi tidak dapat diverifikasi.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0d] text-sm text-slate-400">
        Memverifikasi sesi aman...
      </main>
    );
  }
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (status === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0d] px-4 text-white">
        <section className="max-w-lg rounded-2xl border border-red-300/10 bg-[#111318] p-6">
          <h1 className="text-lg font-semibold">Sesi belum dapat diverifikasi</h1>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          <Link
            to="/login"
            className="mt-5 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          >
            Kembali ke login
          </Link>
        </section>
      </main>
    );
  }
  return children;
}
