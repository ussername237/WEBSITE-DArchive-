import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppNavigation from "../components/AppNavigation.jsx";
import { getSession } from "../lib/auth.js";
import {
  fetchMovieDetails,
  fetchMovieVideos,
  fetchMovies,
  hasTmdb,
  loadMovies,
  saveMovies,
} from "../lib/movies.js";

const LANGUAGES = [
  { code: "id-ID", label: "Indonesia" },
  { code: "en-GB", label: "United Kingdom" },
  { code: "en-US", label: "English (USA)" },
  { code: "es-ES", label: "España" },
];

export default function MovieDetails() {
  const { movieId } = useParams();
  const location = useLocation();
  const session = getSession();
  const routeMovie = location.state?.movie;
  const movie = routeMovie || {
    tmdbId: /^\d+$/.test(movieId) ? Number(movieId) : movieId,
    title: "Detail film",
    year: "",
  };
  const [language, setLanguage] = useState("id-ID");
  const [details, setDetails] = useState(null);
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [collectionError, setCollectionError] = useState("");
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [favorite, setFavorite] = useState(() =>
    loadMovies(session.email).some(
      (saved) =>
        ((routeMovie?.uid && saved.uid === routeMovie.uid) ||
          String(saved.tmdbId) === String(movie.tmdbId)) &&
        saved.favorite
    )
  );
  const [saved, setSaved] = useState(() =>
    loadMovies(session.email).some(
      (item) =>
        (routeMovie?.uid && item.uid === routeMovie.uid) ||
        String(item.tmdbId) === String(movie.tmdbId)
    )
  );

  useEffect(() => {
    let active = true;
    fetchMovies(session.email)
      .then((items) => {
        if (!active) return;
        const savedMovie = items.find(
          (item) =>
            (routeMovie?.uid && item.uid === routeMovie.uid) ||
            String(item.tmdbId) === String(movie.tmdbId)
        );
        setFavorite(Boolean(savedMovie?.favorite));
        setSaved(Boolean(savedMovie));
        setCollectionLoaded(true);
        setCollectionError("");
      })
      .catch((loadError) => {
        if (!active) return;
        setCollectionError(
          loadError.message || "Gagal memuat koleksi sebelum menyimpan."
        );
      });
    return () => {
      active = false;
    };
  }, [session.email, movieId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetails(null);
    setVideos([]);
    setError("");

    if (!hasTmdb) {
      setError("VITE_TMDB_KEY belum diatur. Detail resmi dan trailer tidak dapat dimuat.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    fetchMovieDetails(movie, language)
      .then(async (result) => {
        if (!active) return;
        setDetails(result);
        const officialVideos = await fetchMovieVideos(result.id);
        if (active) setVideos(officialVideos);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Gagal memuat detail resmi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [movieId, language, movie.tmdbId]);

  async function updateSavedMovie(isFavorite) {
    if (!collectionLoaded) return;
    const current = loadMovies(session.email);
    const index = current.findIndex(
      (item) =>
        (routeMovie?.uid && item.uid === routeMovie.uid) ||
        String(item.tmdbId) === String(movie.tmdbId)
    );

    if (index >= 0) {
      current[index] = { ...current[index], favorite: isFavorite };
    } else if (isFavorite) {
      current.unshift({
        ...movie,
        title: details?.title || movie.title,
        uid: Date.now(),
        watched: false,
        rating: 0,
        favorite: true,
      });
    }
    try {
      await saveMovies(session.email, current);
      setFavorite(isFavorite);
      setSaved(true);
      setCollectionLoaded(true);
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Gagal menyimpan perubahan.");
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-100">
      <AppNavigation />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/explore"
          aria-label="Kembali ke Cari"
          title="Kembali ke Cari"
          className="detail-back-link"
        >
          <span className="detail-back-link__arrow" aria-hidden="true">←</span>
          <span>Kembali</span>
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-white/[0.07] bg-[#111318]">
          <div className="grid md:grid-cols-[250px_1fr]">
            <div className="min-h-72 bg-black/20">
              {movie.poster || details?.poster ? (
                <img
                  src={movie.poster || details.poster}
                  alt={`Poster ${details?.title || movie.title}`}
                  className="h-full max-h-[420px] w-full object-cover"
                />
              ) : (
                <div className="grid h-full min-h-72 place-items-center p-8 text-center text-sm text-slate-500">
                  {details?.title || movie.title}
                </div>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs tracking-[0.18em] text-slate-500">
                DETAIL FILM · DATA TMDB
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {details?.title || movie.title}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {details?.releaseDate
                  ? formatDate(details.releaseDate)
                  : movie.year || "Tanggal rilis belum diumumkan"}
                {details?.runtime ? ` · ${details.runtime} menit` : ""}
                {details?.genres?.length ? ` · ${details.genres.join(", ")}` : ""}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!collectionLoaded}
                  onClick={() => updateSavedMovie(!favorite)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"
                >
                  {!collectionLoaded
                    ? "Memuat koleksi..."
                    : favorite
                      ? "★ Favorit"
                      : "☆ Tambah ke favorit"}
                </button>
                {!saved && (
                  <button
                    type="button"
                    disabled={!collectionLoaded}
                    onClick={() => {
                      updateSavedMovie(true);
                    }}
                    className="rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-950 disabled:cursor-wait disabled:opacity-50"
                  >
                    Simpan ke koleksi
                  </button>
                )}
              </div>

              <label className="mt-7 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                Bahasa deskripsi
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="rounded-xl border border-white/10 bg-[#191b20] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                >
                  {LANGUAGES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {loading && (
                <p className="mt-6 text-sm text-slate-400">Memuat data resmi...</p>
              )}
              {error && (
                <p className="mt-6 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-sm text-amber-100/80">
                  {error}
                </p>
              )}
              {collectionError && (
                <p className="mt-3 rounded-xl border border-red-300/10 bg-red-300/[0.04] p-3 text-sm text-red-200">
                  {collectionError}
                </p>
              )}
              {details && (
                <div className="mt-6">
                  <h2 className="text-sm font-medium text-slate-200">Sinopsis</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-400">
                    {details.overview ||
                      "Sinopsis dalam bahasa ini belum tersedia di TMDB."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {details && (
          <>
            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Daftar kredit resmi</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Pemeran</h2>
                </div>
                <a
                  href={details.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-500 underline underline-offset-4 hover:text-white"
                >
                  Sumber TMDB ↗
                </a>
              </div>
              {details.cast.length ? (
                <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101216]">
                  {details.cast.map((person) => (
                    <a
                      key={person.id}
                      href={person.instagram || person.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={
                        person.instagram
                          ? `Buka Instagram ${person.name}`
                          : `Buka profil TMDB ${person.name}; Instagram tidak tersedia`
                      }
                      title={
                        person.instagram
                          ? `Buka Instagram @${person.instagram.split("/").filter(Boolean).pop()}`
                          : "Instagram tidak tersedia; buka profil TMDB"
                      }
                      className="group flex min-w-0 items-center gap-3 p-3 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-300/70 active:bg-white/[0.07]"
                    >
                      {person.profile ? (
                        <img
                          src={person.profile}
                          alt=""
                          loading="lazy"
                          className="h-12 w-10 shrink-0 rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-12 w-10 shrink-0 rounded-lg bg-white/[0.05]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200 transition-colors group-hover:text-pink-200">
                          {person.name}
                        </p>
                        {person.character && (
                          <p className="truncate text-xs text-slate-500">
                            {person.character}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-right text-[10px] text-slate-500 transition-colors group-hover:text-pink-200 sm:text-xs">
                        {person.instagram ? "Instagram ↗" : "Profil TMDB ↗"}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-white/[0.07] p-4 text-sm text-slate-500">
                  Data pemeran belum tersedia.
                </p>
              )}
            </section>

            <section className="mt-8">
              <p className="text-xs text-slate-500">Video resmi yang tersedia di TMDB</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Trailer & video</h2>
              {videos.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {videos.slice(0, 4).map((video) => (
                    <a
                      key={video.id}
                      href={`https://www.youtube.com/watch?v=${video.key}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-white/[0.07] bg-[#111318] p-4 transition hover:border-white/20"
                    >
                      <p className="text-sm font-medium text-slate-200">{video.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {video.official ? "Resmi" : "Video"} · {video.type} · Buka YouTube ↗
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-white/[0.07] p-4 text-sm text-slate-500">
                  Belum ada trailer terdaftar di TMDB.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function formatDate(date) {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Tanggal rilis belum diumumkan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
