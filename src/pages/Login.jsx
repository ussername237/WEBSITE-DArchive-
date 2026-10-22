import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "../lib/auth.js";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isRegister) {
        if (form.password.length < 10) {
          throw new Error("Password minimal 10 karakter.");
        }
        await register(form.name.trim(), form.email.trim(), form.password);
      } else {
        await login(form.email.trim(), form.password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Tidak dapat memproses akun.");
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/10";

  return (
    <div className="min-h-screen bg-[#090a0d] text-white">
      <header className="border-b border-white/[0.07] bg-[#0d0f13]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/welcome" className="inline-flex items-center gap-3" aria-label="Kembali ke beranda">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-bold tracking-[0.18em] text-slate-200">
              DZ
            </span>
            <span
              className="text-lg font-semibold tracking-[0.04em]"
            >
              DArchive
            </span>
          </Link>
          <Link
            to="/welcome"
            className="rounded-full border border-white/10 bg-white/3 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            Kembali
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="rounded-[28px] border border-white/[0.07] bg-[#111318] p-6 sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Koleksi DArchive
          </span>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-4xl">
            Film kamu dijamin tersimpan rapi, kok. Enjoy!
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
            Jangan lupa simpan film favorit kamu di sini.
          </p>
        </section>

        <section className="rounded-[28px] border border-white/[0.07] bg-[#111318] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                {isRegister ? "Buat akun" : "Masuk"}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                {isRegister ? "Mulai koleksi" : "Selamat datang di DArchive"}
              </h2>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-bold text-slate-300">
              <div>
                DZ
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Nama
                </label>
                <input
                  className={input}
                  placeholder="Nama lengkap"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Email
              </label>
              <input
                className={input}
                type="email"
                placeholder="nama@email.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Password
              </label>
              <input
                className={input}
                type="password"
                placeholder="Minimal 10 karakter"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
            >
              {submitting
                ? "Memproses..."
                : isRegister
                  ? "Daftar sekarang"
                  : "Masuk ke Halaman utama"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError("");
              }}
              className="font-medium text-slate-300 transition hover:text-white hover:underline"
            >
              {isRegister ? "Masuk" : "Daftar"}
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
