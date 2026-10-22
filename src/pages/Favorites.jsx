import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNavigation from "../components/AppNavigation.jsx";
import { getSession } from "../lib/auth.js";
import { fetchMovies, loadMovies, saveMovies } from "../lib/movies.js";

export default function Favorites() {
  const navigate = useNavigate();
  const session = getSession();
  const [movies, setMovies] = useState(() =>
    loadMovies(session.email).filter((movie) => movie.favorite)
  );
  const [error, setError] = useState("");
  const [collectionLoaded, setCollectionLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMovies(session.email)
      .then((items) => {
        if (active) {
          setMovies(items.filter((movie) => movie.favorite));
          setCollectionLoaded(true);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Gagal memuat koleksi.");
      });
    return () => {
      active = false;
    };
  }, [session.email]);

  useEffect(() => {
    function syncMovies(event) {
      if (event.key === `mv_movies_${session.email}`) {
        setMovies(loadMovies(session.email).filter((movie) => movie.favorite));
      }
    }
    window.addEventListener("storage", syncMovies);
    return () => window.removeEventListener("storage", syncMovies);
  }, [session.email]);

  async function removeFavorite(movie) {
    if (!collectionLoaded) return;
    const allMovies = loadMovies(session.email).map((item) =>
      item.uid === movie.uid ? { ...item, favorite: false } : item
    );
    try {
      await saveMovies(session.email, allMovies);
      setMovies(allMovies.filter((item) => item.favorite));
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Gagal menyimpan perubahan.");
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-100">
      <AppNavigation />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <p className="text-xs tracking-[0.18em] text-slate-500">KOLEKSI KHUSUS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Film favorit
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Daftar pribadi yang Anda tandai untuk disimpan.
          </p>
        </header>

        {error && (
          <p className="mb-5 rounded-xl border border-red-300/10 bg-red-300/[0.04] p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        {!collectionLoaded ? (
          <p className="rounded-2xl border border-white/[0.07] p-8 text-center text-sm text-slate-500">
            Memuat koleksi favorit...
          </p>
        ) : movies.length ? (
          <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101216]">
            {movies.map((movie) => (
              <article key={movie.uid} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/movie/${movie.tmdbId}`, { state: { movie } })
                  }
                  className="movie-open-button flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Poster src={movie.poster} title={movie.title} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-100">
                      {movie.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {movie.year || "Tahun belum diketahui"}
                      {movie.watched
                        ? ` · Sudah ditonton · Rating pribadi: ${
                            movie.personalRating
                              ? `${movie.personalRating}/10`
                              : "belum diberikan"
                          }`
                        : " · Belum ditonton"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!collectionLoaded}
                  onClick={() => removeFavorite(movie)}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400 transition hover:border-red-300/20 hover:text-red-200"
                >
                  Hapus favorit
                </button>
              </article>
            ))}
          </div>
        ) : (
          <section className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-sm text-slate-300">Belum ada film favorit.</p>
            <p className="mt-2 text-xs text-slate-500">
              Tandai film dengan bintang dari Dashboard atau Cari.
            </p>
            <button
              type="button"
              onClick={() => navigate("/explore")}
              className="mt-5 rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-950"
            >
              Cari film
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function Poster({ src, title }) {
  return (
    <span className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.04] text-center text-[9px] text-slate-500">
      {src ? (
        <img
          src={src.replace("/w500/", "/w185/").replace("/w342/", "/w185/")}
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          width="48"
          height="64"
        />
      ) : (
        title.slice(0, 20)
      )}
    </span>
  );
}
