import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNavigation from "../components/AppNavigation.jsx";
import { getSession } from "../lib/auth.js";
import {
  fetchLatestMovies,
  fetchMovies,
  hasOmdb,
  hasTmdb,
  loadMovies,
  saveMovies,
  searchMovies,
} from "../lib/movies.js";

export default function Explore() {
  const navigate = useNavigate();
  const session = getSession();
  const [movies, setMovies] = useState([]);
  const [collection, setCollection] = useState(() => loadMovies(session.email));
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [sourceWarning, setSourceWarning] = useState("");
  const [source, setSource] = useState("demo");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLatestMovies()
      .then((result) => {
        if (!active) return;
        setMovies(result.movies);
        setSource(result.source);
        setPage(result.page || 1);
        setHasMore(result.hasMore);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Gagal memuat film terbaru.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchMovies(session.email)
      .then((items) => {
        if (active) {
          setCollection(items);
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

  async function submitSearch(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      const result = await searchMovies(query.trim());
      setMovies(result.movies);
      setPage(1);
      setHasMore(result.hasMore);
      setSourceWarning(result.warning);
      setSource(hasTmdb && hasOmdb ? "combined" : hasOmdb ? "omdb" : "tmdb");
    } catch (searchError) {
      setError(searchError.message || "Pencarian film gagal.");
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }

  async function loadMoreMovies() {
    if (loading || searching || !hasMore) return;
    setLoading(true);
    setError("");
    try {
      const nextPage = page + 1;
      const result = query.trim()
        ? await searchMovies(query.trim(), nextPage)
        : await fetchLatestMovies(nextPage);
      setMovies((current) => [...current, ...result.movies]);
      setPage(result.page || nextPage);
      setHasMore(result.hasMore);
      setSourceWarning(result.warning || "");
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat halaman film berikutnya.");
    } finally {
      setLoading(false);
    }
  }

  async function addMovie(movie) {
    if (!collectionLoaded) return;
    const alreadyAdded = collection.some(
      (item) =>
        (movie.tmdbId && item.tmdbId === movie.tmdbId) ||
        item.title === movie.title
    );
    if (alreadyAdded) return;
    const next = [{ ...movie, uid: Date.now(), watched: false, favorite: false }, ...collection];
    try {
      await saveMovies(session.email, next);
      setCollection(next);
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Gagal menyimpan film.");
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-100">
      <AppNavigation />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <p className="text-xs tracking-[0.18em] text-slate-500">KATALOG</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Cari film
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Film terbaru, pencarian, trailer, dan detail dari TMDB.
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400">
              {source === "combined"
                ? "TMDB + OMDb"
                : source === "omdb"
                  ? "Data OMDb"
                  : source === "tmdb"
                    ? "Data TMDB"
                    : "Mode demo"}
            </span>
          </div>
        </header>

        <form
          onSubmit={submitSearch}
          className="mb-8 flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-[#111318] p-3 sm:flex-row"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari judul film..."
            aria-label="Cari judul film"
            className="min-w-0 flex-1 rounded-xl bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-white/20"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white disabled:opacity-50"
          >
            {searching ? "Mencari..." : "Cari"}
          </button>
        </form>

        {!hasTmdb && (
          <p className="mb-6 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs text-amber-100/80">
            Tambahkan VITE_TMDB_KEY ke .env.local untuk katalog, detail, dan trailer TMDB.
          </p>
        )}
        {!hasOmdb && (
          <p className="mb-6 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs text-amber-100/80">
            Tambahkan VITE_OMDB_KEY untuk menambah hasil pencarian dari OMDb.
          </p>
        )}
        {error && (
          <p className="mb-6 rounded-xl border border-red-300/10 bg-red-300/[0.04] p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {sourceWarning && (
          <p className="mb-6 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs text-amber-100/80">
            {hasTmdb
              ? "Hasil TMDB tetap tersedia, tetapi sumber tambahan gagal"
              : "Sumber pencarian gagal"}
            : {sourceWarning}
          </p>
        )}

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            {query ? "Hasil pencarian" : "Sedang tayang"}
          </h2>
          <span className="text-xs text-slate-600">{movies.length} film</span>
        </div>
        {loading ? (
          <p className="rounded-2xl border border-white/[0.07] p-8 text-center text-sm text-slate-500">
            Memuat daftar film...
          </p>
        ) : movies.length ? (
          <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101216]">
            {movies.map((movie) => {
              const added = collection.some(
                (item) =>
                  item.tmdbId === movie.tmdbId || item.title === movie.title
              );
              return (
                <article
                  key={movie.tmdbId}
                  className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4"
                >
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
                        {movie.rating ? ` · ★ ${movie.rating}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/movie/${movie.tmdbId}`, { state: { movie } })}
                    className="movie-open-button hidden rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 sm:block"
                  >
                    Trailer & detail
                  </button>
                  <button
                    type="button"
                    disabled={added || !collectionLoaded}
                    onClick={() => addMovie(movie)}
                    className="rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-950 transition hover:bg-slate-200 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    {added
                      ? "Tersimpan"
                      : collectionLoaded
                        ? "Simpan"
                        : "Memuat..."}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
            Tidak ada film ditemukan. Periksa ejaan atau coba judul lain.
          </p>
        )}
        {!loading && hasMore && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMoreMovies}
              className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              Muat film lainnya
            </button>
          </div>
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
          loading="lazy"
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
