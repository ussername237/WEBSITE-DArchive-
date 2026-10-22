import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./MovieCarousel.css";

const AUTOPLAY_MS = 7000;

/**
 * MovieCarousel
 * ---------------------------------------------------------------------------
 * Carousel film bergaya "hero card" dengan tema merah-hitam.
 *
 * Fitur:
 * - scroll-snap native (drag / swipe / trackpad) + tombol prev/next
 * - autoplay berhenti saat hover, fokus keyboard, atau tab tidak aktif
 * - navigasi keyboard: ArrowLeft / ArrowRight / Home / End
 * - responsif: kartu penuh di HP, kartu lebar + intipan kartu berikutnya di laptop
 * - tetap rapi walau gambar belum tersedia (mode demo)
 * ---------------------------------------------------------------------------
 */
export default function MovieCarousel({
  movies = [],
  loading = false,
  ctaHref = "/dashboard",
  ctaLabel = "Simpan ke daftar",
}) {
  const trackRef = useRef(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = movies.length;

  /* ---------------------------------------------------------------- scroll */

  const scrollToIndex = useCallback((target, behavior = "smooth") => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[target];
    if (!slide) return;

    const trackBox = track.getBoundingClientRect();
    const slideBox = slide.getBoundingClientRect();

    track.scrollTo({
      left: track.scrollLeft + (slideBox.left - trackBox.left),
      behavior,
    });
  }, []);

  // Indikator selalu mengikuti posisi scroll sebenarnya, bukan tebakan.
  const goTo = useCallback(
    (target) => {
      if (count === 0) return;
      const next = ((target % count) + count) % count;
      indexRef.current = next;
      scrollToIndex(next);
    },
    [count, scrollToIndex]
  );

  // Sinkronkan indikator dengan posisi scroll sebenarnya (mis. saat di-drag).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const trackLeft = track.getBoundingClientRect().left;
        let closest = 0;
        let smallest = Infinity;

        Array.from(track.children).forEach((child, i) => {
          const distance = Math.abs(child.getBoundingClientRect().left - trackLeft);
          if (distance < smallest) {
            smallest = distance;
            closest = i;
          }
        });

        setIndex(closest);
        indexRef.current = closest;
      });
    };

    track.addEventListener("scroll", sync, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", sync);
    };
  }, [count]);

  // Daftar film berganti (mis. API key selesai dimuat) -> kembali ke kartu pertama.
  useEffect(() => {
    setIndex(0);
    indexRef.current = 0;
    const track = trackRef.current;
    if (track) track.scrollTo({ left: 0, behavior: "auto" });
  }, [movies]);

  /* -------------------------------------------------------------- autoplay */

  useEffect(() => {
    if (paused || count < 2 || loading) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) return undefined;

    const timer = window.setInterval(() => {
      const next = (indexRef.current + 1) % count;
      indexRef.current = next;
      scrollToIndex(next);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [paused, count, loading, scrollToIndex]);

  // Jeda saat tab tidak terlihat supaya tidak "melompat" saat kembali.
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ------------------------------------------------------------- keyboard */

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  /* ------------------------------------------------------------------ UI */

  return (
    <section
      className="mv-carousel"
      aria-roledescription="carousel"
      aria-label="Film sorotan minggu ini"
    >
      <header className="mv-head">
        <div>
          <span className="mv-eyebrow">Sorotan minggu ini</span>
          <h2 className="mv-title">Layar lebar, cerita besar</h2>
        </div>

        <div className="mv-nav">
          <span className="mv-counter" aria-live="polite">
            {String(Math.min(index + 1, Math.max(count, 1))).padStart(2, "0")}
            <span className="mv-counter__sep">/</span>
            {String(Math.max(count, 1)).padStart(2, "0")}
          </span>

          <button
            type="button"
            className="mv-arrow"
            onClick={() => goTo(index - 1)}
            aria-label="Film sebelumnya"
            disabled={count < 2}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="mv-arrow"
            onClick={() => goTo(index + 1)}
            aria-label="Film berikutnya"
            disabled={count < 2}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </header>

      <div
        className="mv-track"
        ref={trackRef}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onKeyDown={onKeyDown}
        tabIndex={0}
      >
        {loading && <CarouselSkeleton />}

        {!loading &&
          movies.map((movie, i) => (
            <article
              key={movie.tmdbId || movie.title}
              className="mv-slide"
              aria-roledescription="slide"
              aria-label={i + 1 + " dari " + count + ": " + movie.title}
            >
              <SlideCard
                movie={movie}
                position={i + 1}
                total={count}
                priority={i < 2}
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
              />
            </article>
          ))}
      </div>

      {!loading && count > 1 && (
        <div className="mv-dots" role="tablist" aria-label="Pilih film">
          {movies.map((movie, i) => (
            <button
              key={"dot-" + (movie.tmdbId || movie.title)}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={"Ke film " + (i + 1) + ": " + movie.title}
              className={"mv-dot" + (i === index ? " is-active" : "")}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const ACCENTS = [
  ["#3a1d0b", "#0d0b0a"],
  ["#2b0a0e", "#0a0709"],
  ["#0d1b2a", "#05070c"],
  ["#1c0a1f", "#08070b"],
];

function SlideCard({ movie, position, total, priority, ctaHref, ctaLabel }) {
  const accent = ACCENTS[position % ACCENTS.length];
  const [failed, setFailed] = useState(false);

  const image = movie.backdrop || movie.poster;
  const showImage = Boolean(image) && !failed;
  const trailerUrl =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(movie.title + " trailer resmi");

  return (
    <div
      className={"mv-card" + (showImage ? "" : " mv-card--flat")}
      data-title={showImage ? undefined : movie.title}
      style={{ "--accent-a": accent[0], "--accent-b": accent[1] }}
    >
      {showImage && (
        <img
          className="mv-card__img"
          src={image}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}

      <div className="mv-card__scrim" aria-hidden="true" />
      <div className="mv-card__glow" aria-hidden="true" />

      <span className="mv-card__counter" aria-hidden="true">
        {String(position).padStart(2, "0")} <i>/</i>{" "}
        {String(total).padStart(2, "0")}
      </span>

      <div className="mv-card__content">
        {movie.genres && movie.genres.length > 0 && (
          <ul className="mv-tags">
            {movie.genres.map((genre) => (
              <li key={genre} className="mv-tag">
                {genre}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mv-card__title">
          <Link
            to={`/movie/${movie.tmdbId}`}
            state={{ movie }}
            className="movie-open-button mv-card__title-link"
            aria-label={`Lihat detail ${movie.title}`}
          >
            {movie.title}
          </Link>
        </h3>

        <div className="mv-meta">
          {typeof movie.rating === "number" && (
            <span className="mv-rating" title={"Rating " + movie.rating + " dari 10"}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
              </svg>
              {movie.rating.toFixed(1)}
              <span className="mv-rating__max">/10</span>
            </span>
          )}
          {movie.year && <span className="mv-meta__item">{movie.year}</span>}
          {movie.lang && <span className="mv-meta__item">{movie.lang}</span>}
          <span className="mv-meta__item mv-meta__item--muted">Sub Indo</span>
        </div>

        <p className="mv-card__overview">
          {movie.overview ||
            "Sinopsis belum tersedia dalam bahasa Indonesia untuk judul ini."}
        </p>

        <div className="mv-actions">
          <a
            className="mv-btn mv-btn--ghost"
            href={trailerUrl}
            target="_blank"
            rel="noreferrer"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              className="mv-icon mv-icon--play"
            >
              <path d="M8 5.2v13.6L19 12z" />
            </svg>
            Trailer
          </a>
          <Link className="mv-btn mv-btn--primary" to={ctaHref}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mv-icon">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CarouselSkeleton() {
  return (
    <div className="mv-slide" aria-hidden="true">
      <div className="mv-card mv-card--loading mv-skel">
        <div className="mv-card__content">
          <div className="mv-skel-line" style={{ width: "30%" }} />
          <div className="mv-skel-line mv-skel-line--title" style={{ width: "62%" }} />
          <div className="mv-skel-line" style={{ width: "38%" }} />
          <div className="mv-skel-line" style={{ width: "80%" }} />
        </div>
      </div>
    </div>
  );
}
