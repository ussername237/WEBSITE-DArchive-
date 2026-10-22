import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNavigation from "../components/AppNavigation.jsx";
import { getSession } from "../lib/auth.js";
import {
  ensureStarterMovies,
  fetchMovies,
  hydrateMoviePosters,
  hasTmdb,
  loadMovies,
  saveMovies,
  searchTmdbMovies,
} from "../lib/movies.js";

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const email = session?.email || "";
  const [movies, setMovies] = useState(() => loadMovies(email));
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [posterNotice, setPosterNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState("loading");
  const [saveError, setSaveError] = useState("");
  const [saveRetry, setSaveRetry] = useState(0);
  const [collectionRetry, setCollectionRetry] = useState(0);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("added");
  const [openNoteUid, setOpenNoteUid] = useState(null);
  const [undoMovie, setUndoMovie] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchingTmdb, setSearchingTmdb] = useState(false);
  const [addError, setAddError] = useState("");
  const [addNotice, setAddNotice] = useState("");
  const posterRefreshInProgress = useRef(false);
  const undoTimer = useRef(null);
  const saveVersion = useRef(0);

  async function refreshMissingPosters(allowBeforeLoaded = false) {
    if (
      !email ||
      !hasTmdb ||
      (!collectionLoaded && !allowBeforeLoaded) ||
      posterRefreshInProgress.current
    ) {
      return;
    }
    posterRefreshInProgress.current = true;
    try {
      const result = await hydrateMoviePosters(email);
      const latestMovies = loadMovies(email);
      setMovies(latestMovies);
      await saveMovies(email, latestMovies);
      localStorage.setItem(
        `mv_poster_check_${email}`,
        String(Date.now() - (result.failed > 0 ? 23 * 60 * 60 * 1000 : 0))
      );
      if (result.failed > 0) {
        setPosterNotice(
          "Sebagian poster belum dapat diperiksa dari TMDB. Pemeriksaan akan dicoba lagi nanti."
        );
      } else if (result.unresolved > 0) {
        setPosterNotice(
          "Beberapa poster belum tersedia di TMDB. Kami akan memeriksanya kembali secara otomatis."
        );
      } else {
        setPosterNotice("");
      }
    } catch (error) {
      setPosterNotice(error.message || "Gagal memeriksa poster dari TMDB.");
      localStorage.setItem(
        `mv_poster_check_${email}`,
        String(Date.now() - 23 * 60 * 60 * 1000)
      );
    } finally {
      posterRefreshInProgress.current = false;
    }
  }

  useEffect(() => {
    if (!email) return;
    let active = true;
    const localMovies = loadMovies(email);
    fetchMovies(email)
      .then(async (serverMovies) => {
        let items = serverMovies;
        const hasMigratedBrowserCollection = localStorage.getItem(
          `mv_static_migrated_${email}`
        );
        if (!serverMovies.length && !hasMigratedBrowserCollection) {
          if (localMovies.length) {
            items = localMovies;
            await saveMovies(email, items);
          } else {
            items = await ensureStarterMovies(email);
          }
        }
        if (!active) return;
        setMovies(items);
        setCollectionLoaded(true);
        return refreshMissingPosters(true);
      })
      .catch((error) => {
        if (active) {
          setSaveError(error.message || "Gagal memuat koleksi film.");
          setSaveStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [email, collectionRetry]);

  useEffect(() => {
    if (!email || !hasTmdb || !collectionLoaded) return;
    const refreshIfDue = () => {
      const lastCheck = Number(
        localStorage.getItem(`mv_poster_check_${email}`) || 0
      );
      if (Date.now() - lastCheck >= 6 * 60 * 60 * 1000) {
        refreshMissingPosters();
      }
    };
    const interval = window.setInterval(refreshIfDue, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshIfDue);
    window.addEventListener("focus", refreshIfDue);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfDue);
      window.removeEventListener("focus", refreshIfDue);
    };
  }, [email, collectionLoaded]);

  useEffect(() => {
    if (!email || !collectionLoaded) return;
    const version = ++saveVersion.current;
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      saveMovies(email, movies)
        .then(() => {
          if (saveVersion.current === version) {
            setSaveStatus("saved");
            setSaveError("");
          }
        })
        .catch((error) => {
          if (saveVersion.current !== version) return;
          setSaveStatus("error");
          setSaveError(error.message || "Gagal menyimpan koleksi ke server.");
        });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [movies, email, collectionLoaded, saveRetry]);

  useEffect(
    () => () => {
      window.clearTimeout(undoTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!email) return;
    function syncMovies(event) {
      if (collectionLoaded && event.key === `mv_movies_${email}`) {
        setMovies(loadMovies(email));
      }
    }
    window.addEventListener("storage", syncMovies);
    return () => window.removeEventListener("storage", syncMovies);
  }, [email, collectionLoaded]);

  const watchedCount = useMemo(
    () => movies.filter((movie) => movie.watched).length,
    [movies]
  );
  const unwatchedCount = useMemo(
    () => movies.filter((movie) => !movie.watched).length,
    [movies]
  );
  const favoriteCount = useMemo(
    () => movies.filter((movie) => movie.favorite).length,
    [movies]
  );
  const watchedPercent = movies.length
    ? Math.round((watchedCount / movies.length) * 100)
    : 0;
  const visibleMovies = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    const filtered = movies.filter((movie) => {
      const matchesQuery =
        !query ||
        movie.title.toLowerCase().includes(query) ||
        String(movie.year || "").includes(query) ||
        String(movie.note || "").toLowerCase().includes(query);
      const matchesFilter =
        collectionFilter === "all" ||
        (collectionFilter === "watched" && movie.watched) ||
        (collectionFilter === "unwatched" && !movie.watched) ||
        (collectionFilter === "favorites" && movie.favorite);
      return matchesQuery && matchesFilter;
    });

    return filtered.sort((a, b) => {
      if (collectionSort === "title-asc") {
        return a.title.localeCompare(b.title, "id");
      }
      if (collectionSort === "title-desc") {
        return b.title.localeCompare(a.title, "id");
      }
      if (collectionSort === "year-desc") {
        return String(b.year || b.expectedYear || "").localeCompare(
          String(a.year || a.expectedYear || "")
        );
      }
      if (collectionSort === "year-asc") {
        return String(a.year || a.expectedYear || "").localeCompare(
          String(b.year || b.expectedYear || "")
        );
      }
      return movies.indexOf(a) - movies.indexOf(b);
    });
  }, [movies, collectionSearch, collectionFilter, collectionSort]);
  const watchedMovies = useMemo(
    () => visibleMovies.filter((movie) => movie.watched),
    [visibleMovies]
  );
  const unwatchedMovies = useMemo(
    () => visibleMovies.filter((movie) => !movie.watched),
    [visibleMovies]
  );
  const hasActiveCollectionView =
    Boolean(collectionSearch.trim()) || collectionFilter !== "all";

  function updateMovie(uid, updates) {
    if (!collectionLoaded) return;
    setMovies((current) =>
      current.map((movie) =>
        movie.uid === uid ? { ...movie, ...updates } : movie
      )
    );
  }

  function removeMovie(movie) {
    if (!collectionLoaded) return;
    window.clearTimeout(undoTimer.current);
    setUndoMovie(movie);
    setMovies((current) => current.filter((item) => item.uid !== movie.uid));
    undoTimer.current = window.setTimeout(() => setUndoMovie(null), 8000);
  }

  function undoRemoveMovie() {
    if (!undoMovie || !collectionLoaded) return;
    window.clearTimeout(undoTimer.current);
    setMovies((current) =>
      current.some((movie) => movie.uid === undoMovie.uid)
        ? current
        : [undoMovie, ...current]
    );
    setUndoMovie(null);
  }

  async function searchTmdb(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setAddError("Masukkan judul film terlebih dahulu.");
      return;
    }
    setSearchingTmdb(true);
    setAddError("");
    setAddNotice("");
    setSearchResults([]);
    try {
      const results = await searchTmdbMovies(title, newYear.trim());
      setSearchResults(results);
      if (!results.length) {
        setAddNotice("Film tidak ditemukan di TMDB. Anda masih bisa menyimpannya secara manual.");
      }
    } catch (error) {
      setAddError(error.message || "Pencarian film ke TMDB gagal.");
    } finally {
      setSearchingTmdb(false);
    }
  }

  function addMovie(movie) {
    if (!collectionLoaded) return;
    const duplicate = movies.some(
      (item) =>
        item.tmdbId === movie.tmdbId ||
        (item.title.toLowerCase() === movie.title.toLowerCase() &&
          item.year === movie.year)
    );
    if (duplicate) {
      setAddError("Film tersebut sudah ada di koleksi.");
      return;
    }
    const nextMovie = {
      ...movie,
      uid: Date.now(),
      watched: false,
      favorite: false,
      personalRating: 0,
      personalRatingScale: 10,
    };
    const next = [nextMovie, ...movies];
    setMovies(next);
    setSearchResults([]);
    setNewTitle("");
    setNewYear("");
    setAddError("");
    setAddNotice(
      movie.poster
        ? `${movie.title} ditambahkan dengan poster TMDB.`
        : `${movie.title} ditambahkan, tetapi TMDB belum menyediakan posternya.`
    );
  }

  async function addManualMovie() {
    if (!collectionLoaded) return;
    const title = newTitle.trim();
    const year = newYear.trim();
    if (!title) {
      setAddError("Masukkan judul film terlebih dahulu.");
      return;
    }
    const fullTitle = year ? `${title} ${year}` : title;
    const duplicate = movies.some(
      (item) =>
        normalizeMovieTitle(item.title) === normalizeMovieTitle(title) &&
        (!year || item.year === year || item.expectedYear === year)
    );
    if (duplicate) {
      setAddError("Film tersebut sudah ada di koleksi.");
      return;
    }
    const slug = fullTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nextMovie = {
      uid: Date.now(),
      tmdbId: `manual-${slug}`,
      title,
      year: "",
      expectedYear: year,
      releaseDate: "",
      lang: "",
      rating: null,
      personalRating: 0,
      personalRatingScale: 10,
      poster: null,
      backdrop: null,
      overview: "",
      genres: [],
      watched: false,
      favorite: false,
      metadataSource: "",
    };
    const next = [nextMovie, ...movies];
    setMovies(next);
    setSearchResults([]);
    setNewTitle("");
    setNewYear("");
    setAddError("");
    if (!hasTmdb) {
      setAddNotice(`${fullTitle} ditambahkan. Tambahkan VITE_TMDB_KEY untuk mendeteksi poster TMDB.`);
      return;
    }
    try {
      const results = await searchTmdbMovies(title, year);
      const normalizedTitle = normalizeMovieTitle(title);
      const match = results.find(
        (movie) =>
          normalizeMovieTitle(movie.title) === normalizedTitle &&
          (!year || movie.year === year)
      );
      if (!match) {
        setAddNotice(`${fullTitle} tersimpan. Belum ditemukan kecocokan judul/tahun yang tepat di TMDB.`);
        return;
      }
      const matchedMovie = {
        ...match,
        uid: nextMovie.uid,
        watched: false,
        favorite: false,
        personalRating: 0,
        personalRatingScale: 10,
      };
      const updated = next.map((movie) =>
        movie.uid === nextMovie.uid ? matchedMovie : movie
      );
      setMovies(updated);
      setAddNotice(
        match.poster
          ? `${fullTitle} ditambahkan dan poster TMDB berhasil ditemukan.`
          : `${fullTitle} cocok dengan data TMDB, tetapi posternya belum tersedia.`
      );
    } catch (error) {
      setAddError(
        `${fullTitle} tersimpan, tetapi pencarian posternya gagal: ${
          error.message || "kesalahan TMDB."
        }`
      );
    }
  }

  function renderMovieRows(list) {
    return list.map((movie, index) => (
      <article
        key={movie.uid}
        className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:gap-4 sm:p-4"
      >
        <button
          type="button"
          onClick={() =>
            navigate(`/movie/${movie.tmdbId}`, { state: { movie } })
          }
          className="movie-open-button flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Poster
            src={movie.poster}
            title={movie.title}
            priority={index < 6}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-100">
              {movie.title}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {movie.year || "Tahun belum diketahui"}
              <span className="ml-2 text-slate-600">·</span>
              <span className="ml-2">Lihat detail</span>
            </span>
          </span>
        </button>
        {movie.watched && (
          <div
            className="personal-rating order-3 flex basis-full items-center justify-end gap-0.5 sm:order-none sm:basis-auto sm:gap-1"
            aria-label={`Rating pribadi ${movie.title}`}
          >
            <button
              type="button"
              onClick={() =>
                updateMovie(movie.uid, {
                  personalRating: Math.floor(Math.random() * 10) + 1,
                  personalRatingScale: 10,
                })
              }
              aria-label={`Acak ulang rating film ${movie.title}`}
              title="Acak ulang rating"
              className="rating-randomize"
            >
              <span className="rating-randomize__icon" aria-hidden="true">⚄</span>
              <span>Acak</span>
            </button>
            <span
              className="rating-score"
              aria-live="polite"
              aria-label={
                movie.personalRating
                  ? `Rating ${movie.personalRating} dari 10`
                  : "Belum ada rating"
              }
            >
              {movie.personalRating ? `${movie.personalRating}/10` : "—/10"}
            </span>
          </div>
        )}
        <button
          type="button"
          aria-label={movie.favorite ? "Hapus dari favorit" : "Tambah ke favorit"}
          aria-pressed={Boolean(movie.favorite)}
          onClick={() =>
            updateMovie(movie.uid, { favorite: !movie.favorite })
          }
          className={
            "movie-action movie-action--favorite grid h-9 w-9 shrink-0 place-items-center rounded-full border text-base " +
            (movie.favorite ? "is-active" : "")
          }
        >
          <span className="movie-action__icon" aria-hidden="true">
            {movie.favorite ? "★" : "☆"}
          </span>
        </button>
        <button
          type="button"
          aria-label={
            movie.watched
              ? "Pindahkan ke belum ditonton"
              : "Tambah ke sudah ditonton"
          }
          title={
            movie.watched
              ? "Pindahkan ke belum ditonton"
              : "Tambah ke sudah ditonton"
          }
          onClick={() => updateMovie(movie.uid, { watched: !movie.watched })}
          className={
            "movie-action movie-action--watched grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm sm:flex sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs " +
            (movie.watched ? "is-active" : "")
          }
        >
          <span className="movie-action__icon" aria-hidden="true">
            {movie.watched ? "✓" : "+"}
          </span>
          <span className="hidden sm:inline">
            {movie.watched ? "Sudah ditonton" : "Tambah ke sudah ditonton"}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Hapus ${movie.title} dari koleksi`}
          title="Hapus dari koleksi"
          onClick={() => removeMovie(movie)}
          className="movie-action grid h-9 w-9 shrink-0 place-items-center rounded-full border border-red-300/15 text-sm text-red-200/80 transition hover:border-red-300/40 hover:bg-red-300/10 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 sm:flex sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="m19 6-1 14H6L5 6" />
            <path d="M10 11v5M14 11v5" />
          </svg>
          <span className="hidden sm:inline">Hapus</span>
        </button>
        <button
          type="button"
          aria-expanded={openNoteUid === movie.uid}
          aria-label={`${openNoteUid === movie.uid ? "Tutup" : "Buka"} catatan ${movie.title}`}
          title="Catatan pribadi"
          onClick={() =>
            setOpenNoteUid((current) =>
              current === movie.uid ? null : movie.uid
            )
          }
          className="movie-action grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-sm text-slate-300 transition hover:border-white/25 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:flex sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
          <span className="hidden sm:inline">
            {movie.note?.trim() ? "Edit catatan" : "Catatan"}
          </span>
        </button>
        {openNoteUid === movie.uid && (
          <label className="order-last basis-full">
            <span className="sr-only">Catatan pribadi untuk {movie.title}</span>
            <textarea
              value={movie.note || ""}
              onChange={(event) =>
                updateMovie(movie.uid, { note: event.target.value })
              }
              maxLength={1000}
              rows={3}
              placeholder="Tulis catatan pribadi untuk film ini..."
              className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/25 focus:ring-2 focus:ring-white/5"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-600">
              {(movie.note || "").length}/1000
            </span>
          </label>
        )}
      </article>
    ));
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-100">
      <AppNavigation />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-3xl border border-white/[0.07] bg-[#111318] p-6 sm:p-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-slate-500">
                KOLEKSI PRIBADI DARCHIVE
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                DArchive
              </h1>
              <p className="mt-2 text-xs text-slate-500">
                Koleksi tersimpan di browser ini dan tidak tersinkron antarperangkat.
              </p>
            </div>
            <div
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] " +
                (collectionLoaded
                  ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200/80"
                  : "border-white/10 bg-white/[0.03] text-slate-400")
              }
              role="status"
            >
              <span
                className={
                  "relative flex h-2 w-2 " +
                  (collectionLoaded ? "" : "opacity-50")
                }
              >
                {collectionLoaded && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-40" />
                )}
                <span
                  className={
                    "relative inline-flex h-2 w-2 rounded-full " +
                    (collectionLoaded ? "bg-emerald-300" : "bg-slate-400")
                  }
                />
              </span>
              {collectionLoaded ? "Statistik live" : "Memuat statistik..."}
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Total koleksi",
                value: movies.length,
                filter: "all",
                detail: "Film tersimpan",
                accent: "text-cyan-200",
                glow: "bg-cyan-300",
                icon: (
                  <>
                    <rect x="3" y="4" width="18" height="16" rx="3" />
                    <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
                  </>
                ),
              },
              {
                label: "Sudah ditonton",
                value: watchedCount,
                filter: "watched",
                detail: `${watchedPercent}% dari koleksi`,
                accent: "text-emerald-200",
                glow: "bg-emerald-300",
                icon: <path d="m5 12 4 4L19 6" />,
              },
              {
                label: "Belum ditonton",
                value: unwatchedCount,
                filter: "unwatched",
                detail: "Siap masuk watchlist",
                accent: "text-violet-200",
                glow: "bg-violet-300",
                icon: (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </>
                ),
              },
              {
                label: "Favorit",
                value: favoriteCount,
                filter: "favorites",
                detail: "Pilihan spesialmu",
                accent: "text-rose-200",
                glow: "bg-rose-300",
                icon: (
                  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
                ),
              },
            ].map((stat) => {
              const active =
                (stat.filter === "all" && collectionFilter === "all") ||
                collectionFilter === stat.filter;
              return (
                <button
                  key={stat.filter}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCollectionFilter(stat.filter);
                    document
                      .getElementById("collection-list")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={
                    "group relative isolate min-h-32 overflow-hidden rounded-2xl border p-4 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:p-5 " +
                    (active
                      ? "border-white/20 bg-white/[0.055] shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
                      : "border-white/[0.07] bg-black/20")
                  }
                >
                  <span
                    className={
                      "pointer-events-none absolute -right-8 -top-8 -z-10 h-24 w-24 rounded-full opacity-[0.07] blur-2xl transition duration-300 group-hover:opacity-20 " +
                      stat.glow
                    }
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{stat.label}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`h-4 w-4 ${stat.accent} opacity-80`}
                    >
                      {stat.icon}
                    </svg>
                  </span>
                  <AnimatedNumber
                    value={stat.value}
                    className="mt-3 block text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {stat.detail}
                  </span>
                  <span
                    className={
                      "absolute inset-x-4 bottom-0 h-[2px] origin-left rounded-full transition-transform duration-300 " +
                      (active ? "scale-x-100 bg-white/40" : "scale-x-0 bg-white/30 group-hover:scale-x-100")
                    }
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/[0.07] bg-[#111318] p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Tambah film pribadi</h2>
            <p className="mt-1 text-sm text-slate-400">
              Masukkan judul untuk mencari poster dan data film asli dari TMDB.
            </p>
          </div>
          <form
            onSubmit={searchTmdb}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto_auto]"
          >
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Judul film"
              aria-label="Judul film"
              className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/20"
            />
            <input
              value={newYear}
              onChange={(event) => setNewYear(event.target.value)}
              placeholder="Tahun (opsional)"
              aria-label="Tahun film"
              inputMode="numeric"
              maxLength={4}
              className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/20"
            />
            <button
              type="submit"
              disabled={searchingTmdb}
              className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-white disabled:opacity-50"
            >
              {searchingTmdb ? "Mencari..." : "Cari di TMDB"}
            </button>
            <button
              type="button"
              onClick={addManualMovie}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/5"
            >
              Simpan manual
            </button>
          </form>
          {!hasTmdb && (
            <p className="mt-3 text-xs text-amber-200/80">
              TMDB belum terhubung. Film bisa disimpan manual, tetapi deteksi poster memerlukan VITE_TMDB_KEY.
            </p>
          )}
          {addError && (
            <p role="alert" className="mt-3 text-sm text-red-200">{addError}</p>
          )}
          {addNotice && (
            <p role="status" className="mt-3 text-sm text-slate-300">{addNotice}</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-xs text-slate-500">
                Pilih hasil yang tepat agar poster dan tahun tidak tertukar.
              </p>
              <div className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.07]">
                {searchResults.map((movie) => (
                  <article key={movie.tmdbId} className="flex items-center gap-3 p-3">
                    <Poster src={movie.poster} title={movie.title} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-100">{movie.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {movie.year || "Tahun belum tersedia"}
                        {movie.rating ? ` · ★ ${movie.rating} TMDB` : ""}
                        {!movie.poster ? " · Poster belum tersedia" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addMovie(movie)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-950 hover:bg-slate-200"
                    >
                      Tambahkan
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="collection-list" className="mt-10 scroll-mt-24">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Koleksi Anda</p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                Semua film
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span
                className={
                  "text-xs " +
                  (saveStatus === "error"
                    ? "text-red-300"
                    : saveStatus === "saving"
                      ? "text-slate-400"
                      : "text-emerald-300/80")
                }
                role="status"
                aria-live="polite"
              >
                {saveStatus === "saving"
                  ? "Menyimpan..."
                  : saveStatus === "error"
                    ? collectionLoaded
                      ? "Gagal menyimpan"
                      : "Gagal memuat koleksi"
                    : saveStatus === "loading"
                      ? "Memuat koleksi..."
                      : "Tersimpan"}
              </span>
              <button
                type="button"
                onClick={() => navigate("/explore")}
                className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-200 transition hover:border-white/25 hover:bg-white/5"
              >
                Cari film
              </button>
            </div>
          </div>

          {saveStatus === "error" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/15 bg-red-300/[0.04] px-4 py-3">
              <p className="text-xs text-red-200">
                {saveError || "Koleksi belum berhasil disimpan."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSaveError("");
                  if (collectionLoaded) {
                    setSaveRetry((current) => current + 1);
                  } else {
                    setSaveStatus("loading");
                    setCollectionRetry((current) => current + 1);
                  }
                }}
                className="rounded-full border border-red-200/20 px-3 py-1.5 text-xs text-red-100 transition hover:bg-red-200/10"
              >
                {collectionLoaded ? "Coba simpan lagi" : "Muat ulang"}
              </button>
            </div>
          )}

          {undoMovie && (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm text-slate-200">
                “{undoMovie.title}” dihapus dari koleksi.
              </p>
              <button
                type="button"
                onClick={undoRemoveMovie}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Urungkan
              </button>
            </div>
          )}

          <div className="mb-5 grid gap-3 rounded-2xl border border-white/[0.07] bg-[#101216] p-3 sm:grid-cols-[minmax(0,1fr)_180px_180px] sm:p-4">
            <label className="relative">
              <span className="sr-only">Cari di koleksi</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                value={collectionSearch}
                onChange={(event) => setCollectionSearch(event.target.value)}
                placeholder="Cari judul, tahun, atau catatan..."
                className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/25"
              />
            </label>
            <label>
              <span className="sr-only">Filter koleksi</span>
              <select
                value={collectionFilter}
                onChange={(event) => setCollectionFilter(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#191b20] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-white/25"
              >
                <option value="all">Semua film</option>
                <option value="unwatched">Belum ditonton</option>
                <option value="watched">Sudah ditonton</option>
                <option value="favorites">Favorit</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Urutkan koleksi</span>
              <select
                value={collectionSort}
                onChange={(event) => setCollectionSort(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#191b20] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-white/25"
              >
                <option value="added">Urutan ditambahkan</option>
                <option value="title-asc">Judul: A ke Z</option>
                <option value="title-desc">Judul: Z ke A</option>
                <option value="year-desc">Tahun: terbaru</option>
                <option value="year-asc">Tahun: terlama</option>
              </select>
            </label>
          </div>
          {(collectionSearch || collectionFilter !== "all") && (
            <p className="mb-3 text-xs text-slate-500" aria-live="polite">
              Menampilkan {visibleMovies.length} dari {movies.length} film.
            </p>
          )}

          {posterNotice && (
            <p className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
              {posterNotice}
            </p>
          )}
          <MovieGroup
            title="Belum ditonton"
            count={unwatchedMovies.length}
            emptyText={
              visibleMovies.length
                ? "Tidak ada film yang menunggu ditonton."
                : hasActiveCollectionView
                  ? "Tidak ada film yang cocok dengan pencarian atau filter."
                  : "Tidak ada film yang menunggu ditonton."
            }
          >
            {renderMovieRows(unwatchedMovies)}
          </MovieGroup>
          <MovieGroup
            title="Sudah ditonton"
            count={watchedCount}
            emptyText={
              visibleMovies.length
                ? "Film yang sudah ditonton akan muncul di sini. Anda bisa memberi rating pribadi dengan bintang."
                : hasActiveCollectionView
                  ? "Tidak ada film yang cocok dengan pencarian atau filter."
                  : "Film yang sudah ditonton akan muncul di sini. Anda bisa memberi rating pribadi dengan bintang."
            }
            className="mt-8"
          >
            {renderMovieRows(watchedMovies)}
          </MovieGroup>
        </section>
      </main>
    </div>
  );
}

function AnimatedNumber({ value, className }) {
  const [displayedValue, setDisplayedValue] = useState(0);
  const displayedValueRef = useRef(0);

  useEffect(() => {
    const startValue = displayedValueRef.current;
    const difference = value - startValue;
    const startTime = performance.now();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion || difference === 0) {
      displayedValueRef.current = value;
      setDisplayedValue(value);
      return undefined;
    }

    let frameId;
    function animate(now) {
      const progress = Math.min((now - startTime) / 500, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(startValue + difference * easedProgress);
      displayedValueRef.current = nextValue;
      setDisplayedValue(nextValue);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    }
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return (
    <span className={className} aria-live="polite" aria-atomic="true">
      {displayedValue.toLocaleString("id-ID")}
    </span>
  );
}

function normalizeMovieTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function MovieGroup({ title, count, emptyText, className = "", children }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <span className="text-xs text-slate-500">{count} film</span>
      </div>
      {count ? (
        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101216]">
          {children}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">
          {emptyText}
        </p>
      )}
    </section>
  );
}

function Poster({ src, title, priority = false }) {
  return (
    <span className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.04] text-center text-[9px] text-slate-500">
      {src ? (
        <img
          src={src.replace("/w500/", "/w185/").replace("/w342/", "/w185/")}
          alt=""
          className="h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
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
