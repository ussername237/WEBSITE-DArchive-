import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MovieCarousel from "../components/MovieCarousel.jsx";
import { fetchTrendingMovies, hasTmdb } from "../lib/movies.js";
import "./Landing.css";

const ACCENTS = [
  ["#252a33", "#111318"],
  ["#20252e", "#0d0f13"],
  ["#29303a", "#111318"],
  ["#222731", "#0d0f13"],
];

/**
 * Halaman pengantar DArchive.
 * Navbar + intro + carousel sorotan + grid film populer.
 */
export default function Landing() {
  const nextPath = "/dashboard";

  const [state, setState] = useState({
    movies: [],
    source: "demo",
    error: "",
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchTrendingMovies({ signal: controller.signal }).then((result) => {
      if (!active) return;
      setState({
        movies: result.movies,
        source: result.source,
        error: result.error,
        loading: false,
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const { movies, loading, source, error } = state;
  const ratings = movies
    .map((movie) => movie.rating)
    .filter((rating) => typeof rating === "number");
  const averageRating = ratings.length
    ? (
        ratings.reduce((total, value) => total + value, 0) / ratings.length
      ).toFixed(1)
    : "—";

  return (
    <div className="mv-page">
      <header className="mv-nav">
        <div className="mv-shell mv-nav__inner">
          <Link className="mv-brand" to="/" aria-label="DArchive — beranda">
            <span className="mv-brand__mark" aria-hidden="true">
              DZ
            </span>
            <span className="mv-brand__text">
              DArchive
            </span>
          </Link>

          <nav className="mv-nav__links" aria-label="Navigasi utama">
            <a href="#populer">Film</a>
            <Link to={nextPath}>Daftar tontonan</Link>
            <Link to="/dashboard">Dashboard</Link>
          </nav>

          <div className="mv-nav__actions">
            <span
              className={"mv-status" + (source === "tmdb" ? " is-live" : "")}
              title={
                source === "tmdb"
                  ? "Data TMDB aktif"
                  : "Mode demo (data contoh, belum ada API key)"
              }
            >
              {source === "tmdb" ? "TMDB live" : "Mode demo"}
            </span>
            <Link className="mv-btn mv-btn--ghost mv-nav__cta" to={nextPath}>
              Buka koleksi
            </Link>
          </div>
        </div>
      </header>

      <main className="mv-shell">
        {/* ---------------------------------------------------------- Intro */}
        <section className="mv-hero">
          <div className="mv-hero__text">
            <span className="mv-eyebrow">
              Koleksi DArchive · {new Date().getFullYear()}
            </span>
            <h1>
              PENYIMPANAN FILM <span className="mv-hero__accent">PRIBADI</span> DARCHIVE
            </h1>
            <div className="mv-hero__actions">
              <a className="mv-btn mv-btn--primary" href="#populer">
                Cari film
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="mv-hero__icon"
                >
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </a>
              <Link className="mv-btn mv-btn--ghost" to={nextPath}>
                Buka daftar tontonan
              </Link>
            </div>
          </div>

          <aside className="mv-hero__panel" aria-label="Ringkasan koleksi">
            <div className="mv-hero__stat">
              <span className="mv-hero__stat-label">Judul di layar</span>
              <strong className="mv-hero__stat-value">
                {loading ? "—" : movies.length}
              </strong>
            </div>
            <div className="mv-hero__stat">
              <span className="mv-hero__stat-label">Rating rata-rata</span>
              <strong className="mv-hero__stat-value">
                {loading ? "—" : averageRating}
                <small>/10</small>
              </strong>
            </div>
            <div className="mv-hero__stat">
              <span className="mv-hero__stat-label">Sumber data</span>
              <strong className="mv-hero__stat-value mv-hero__stat-value--text">
                {source === "tmdb" ? "TMDB" : "Contoh"}
              </strong>
            </div>
          </aside>
        </section>

        {/* ------------------------------------------------------- Carousel */}
        <div id="sorotan" className="mv-section">
          <MovieCarousel
            movies={movies}
            loading={loading}
            ctaHref={nextPath}
            ctaLabel="Simpan ke daftar"
          />
        </div>

        {/* ------------------------------------------------------------ Grid */}
        <section
          id="populer"
          className="mv-section"
          aria-labelledby="populer-title"
        >
          <div className="mv-section-head">
            <div>
              <span className="mv-eyebrow">Paling banyak dibuka</span>
              <h2 id="populer-title" className="mv-section-title">
                Sedang populer
              </h2>
            </div>
            <span className="mv-section-hint">
              {loading ? "Memuat…" : movies.length + " judul"}
            </span>
          </div>

          {loading ? (
            <div className="mv-poster-grid" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mv-poster">
                  <div className="mv-poster__media mv-skel" />
                  <div className="mv-poster__title mv-skel mv-poster__title--skel" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="mv-poster-grid">
              {movies.map((movie, i) => (
                <li key={movie.tmdbId || movie.title}>
                  <PosterCard movie={movie} index={i} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------- Notice */}
        {(source === "demo" && !hasTmdb) || error ? (
          <div
            className={"mv-notice" + (error ? " mv-notice--warn" : "")}
            role="status"
          >
            <span className="mv-notice__icon" aria-hidden="true">
              {error ? "!" : "i"}
            </span>
            <div>
              <strong>{error ? "Gagal memuat data TMDB" : "Mode demo aktif"}</strong>
              <p>
                {error
                  ? error +
                    " Sementara ini DArchive memakai data contoh dari src/lib/movies.js."
                  : "Poster dan rating asli akan muncul setelah Anda mengisi VITE_TMDB_KEY di file .env.local, lalu restart npm run dev."}
              </p>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="mv-footer">
        <div className="mv-shell mv-footer__inner">
          <span className="mv-brand mv-brand--small">
            <span className="mv-brand__mark" aria-hidden="true">
              DZ
            </span>
            <span className="mv-brand__text">
              DArchive
            </span>
          </span>
          <p className="mv-footer__copy">
            © {new Date().getFullYear()} DArchive
          </p>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PosterCard({ movie, index }) {
  const [failed, setFailed] = useState(false);
  const showPoster = Boolean(movie.poster) && !failed;
  const accent = ACCENTS[index % ACCENTS.length];

  return (
    <article className="mv-poster">
      <Link
        to={`/movie/${movie.tmdbId}`}
        state={{ movie }}
        aria-label={`Lihat detail ${movie.title}`}
        className="movie-open-button mv-poster__link"
      >
        <div
          className="mv-poster__media"
          style={{ "--accent-a": accent[0], "--accent-b": accent[1] }}
        >
          {showPoster ? (
            <img
              src={movie.poster}
              alt={"Poster " + movie.title}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="mv-poster__fallback" aria-hidden="true">
              <span>{movie.title}</span>
            </div>
          )}

          {typeof movie.rating === "number" && (
            <span className="mv-poster__rating">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
              </svg>
              {movie.rating.toFixed(1)}
            </span>
          )}

        </div>
        <h3 className="mv-poster__title">{movie.title}</h3>
        <p className="mv-poster__meta">
          {movie.year || "—"}
          {movie.genres && movie.genres.length
            ? " · " + movie.genres.join(" · ")
            : ""}
        </p>
      </Link>
    </article>
  );
}
