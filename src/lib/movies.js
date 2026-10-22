// Penyimpanan daftar film per pengguna + data film dari TMDB.
import fetchJson from "./fetchJson.js";

const TMDB_KEY = (import.meta.env.VITE_TMDB_KEY || "").trim();
const OMDB_KEY = (import.meta.env.VITE_OMDB_KEY || "").trim();
export const hasTmdb = Boolean(TMDB_KEY);
export const hasOmdb = Boolean(OMDB_KEY);

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const personInstagramCache = new Map();

async function requestTmdb(path, params = {}) {
  const searchParams = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    ...params,
  });
  try {
    return await fetchJson(`${BASE}${path}?${searchParams}`);
  } catch (error) {
    if (error.status === 401) {
      throw new Error("API key TMDB ditolak. Periksa VITE_TMDB_KEY.");
    }
    throw error;
  }
}

function fetchPersonInstagram(personId) {
  if (!personInstagramCache.has(personId)) {
    const request = requestTmdb(`/person/${personId}/external_ids`)
      .then((data) => {
        const username = data.instagram_id?.replace(/^@/, "");
        return username && /^[A-Za-z0-9._]{1,30}$/.test(username)
          ? `https://www.instagram.com/${username}/`
          : null;
      })
      .catch((error) => {
        personInstagramCache.delete(personId);
        throw error;
      });
    personInstagramCache.set(personId, request);
  }
  return personInstagramCache.get(personId);
}

/* ------------------------------------------------------------------------- */
/* Daftar film milik pengguna (tetap dipertahankan untuk Dashboard)           */
/* ------------------------------------------------------------------------- */

export function loadMovies(email) {
  try {
    const key = "mv_movies_" + email;
    const matchingKey = Object.keys(localStorage).find(
      (storedKey) => storedKey.toLowerCase() === key.toLowerCase()
    );
    const v = localStorage.getItem(matchingKey || key);
    return v
      ? JSON.parse(v)
          .map(upgradeSirenHeadMovie)
          .map(upgradePersonalRating)
      : [];
  } catch {
    return [];
  }
}

export async function saveMovies(email, list) {
  if (!email) throw new Error("Profil lokal tidak ditemukan.");
  if (!Array.isArray(list) || list.length > 1000) {
    throw new Error("Koleksi tidak valid (maksimal 1.000 film).");
  }
  try {
    localStorage.setItem("mv_movies_" + email, JSON.stringify(list));
    localStorage.setItem(`mv_static_migrated_${email}`, "1");
  } catch (error) {
    throw new Error(
      error.name === "QuotaExceededError"
        ? "Penyimpanan browser penuh. Hapus sebagian film atau data situs."
        : `Koleksi gagal disimpan di browser: ${error.message}`
    );
  }
  return list;
}

export async function fetchMovies(email) {
  const movies = loadMovies(email);
  if (localStorage.getItem("mv_movies_" + email) !== null) {
    localStorage.setItem(`mv_static_migrated_${email}`, "1");
  } else {
    localStorage.removeItem(`mv_static_migrated_${email}`);
  }
  return movies;
}

/* ------------------------------------------------------------------------- */
/* Data film                                                                  */
/* ------------------------------------------------------------------------- */

// Terjemahan genre_ids TMDB -> label Indonesia
const GENRE_MAP = {
  28: "Laga",
  12: "Petualangan",
  16: "Animasi",
  35: "Komedi",
  80: "Kriminal",
  99: "Dokumenter",
  18: "Drama",
  10751: "Keluarga",
  14: "Fantasi",
  36: "Sejarah",
  27: "Horor",
  10402: "Musik",
  9648: "Misteri",
  10749: "Romansa",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "Perang",
  37: "Barat",
};

// Ubah data mentah TMDB menjadi bentuk yang dipakai aplikasi kita
function toItem(m) {
  return {
    tmdbId: m.id,
    title: m.title || m.original_title || "Tanpa judul",
    year: (m.release_date || "").slice(0, 4),
    releaseDate: m.release_date || "",
    lang: (m.original_language || "").toUpperCase(),
    rating:
      typeof m.vote_average === "number" && m.vote_average > 0
        ? Math.round(m.vote_average * 10) / 10
        : null,
    poster: m.poster_path ? IMG + "/w500" + m.poster_path : null,
    backdrop: m.backdrop_path ? IMG + "/w1280" + m.backdrop_path : null,
    overview: (m.overview || "").trim(),
    genres: (m.genre_ids || [])
      .map((id) => GENRE_MAP[id])
      .filter(Boolean)
      .slice(0, 2),
    metadataSource: "tmdb",
  };
}

function upgradeKnownSeedMovie(movie) {
  if (movie.metadataSource === "tmdb") return movie;
  const normalizedTitle = normalizeTitle(movie.title);
  const migrations = [
    {
      customTitle: "Backrooms",
      oldTitles: ["backrooms", "the backrooms", "escape the backrooms"],
      matches: (title) => title.startsWith("escape the backrooms "),
    },
    {
      customTitle: "The Mummy",
      oldTitles: ["the mummy", "mummy"],
    },
    {
      customTitle: "Playhouse",
      oldTitles: ["playhouse", "play house", "the playhouse", "playhosue"],
    },
    {
      customTitle: "The Return of the Living Dead",
      oldTitles: [
        "the return of the living dead",
        "return of the living dead",
      ],
    },
    {
      customTitle: "Siren Head",
      oldTitles: ["siren head", "sirenhead"],
    },
  ];
  const migration = migrations.find(({ customTitle, oldTitles, matches }) => {
    const canonical = normalizeTitle(customTitle);
    return (
      normalizedTitle === canonical ||
      oldTitles.includes(normalizedTitle) ||
      matches?.(normalizedTitle)
    );
  });

  if (!migration) return movie;

  const canonicalMovie = CUSTOM_MOVIE_LIBRARY.find(
    (item) => item.title === migration.customTitle
  );
  if (!canonicalMovie) return movie;

  return {
    ...movie,
    ...customMovieToItem(canonicalMovie),
    uid: movie.uid,
    watched: movie.watched,
    rating: movie.rating,
    favorite: movie.favorite,
    personalRating: movie.personalRating,
  };
}

function upgradeSirenHeadMovie(movie) {
  const title = normalizeTitle(movie.title).replace(/\b(19|20)\d{2}\b/g, "").trim();
  if (title !== "siren head" && title !== "sirenhead") return movie;

  const canonicalMovie = CUSTOM_MOVIE_LIBRARY.find(
    (item) => item.title === "Siren Head"
  );
  if (!canonicalMovie) return movie;

  return {
    ...movie,
    ...customMovieToItem(canonicalMovie),
    uid: movie.uid,
    watched: Boolean(movie.watched),
    favorite: Boolean(movie.favorite),
    personalRating: movie.personalRating ?? 0,
  };
}

function upgradePersonalRating(movie) {
  if (movie.personalRatingScale === 10) return movie;
  const previousRating = Number(movie.personalRating) || 0;
  return {
    ...movie,
    personalRating: previousRating
      ? Math.min(10, Math.round(previousRating * 2))
      : 0,
    personalRatingScale: 10,
  };
}

const CUSTOM_MOVIE_LIBRARY = [
  { title: "Backrooms", aliases: ["Backrooms", "The Backrooms", "Backrooms 2026"] },
  { title: "The Mummy", aliases: ["The Mummy", "Mummy 2026"] },
  { title: "Resident Evil", aliases: ["Resident Evil", "Resident Evil 2026"] },
  { title: "Other Mommy", aliases: ["Other Mommy", "The Other Mommy"] },
  { title: "Playhouse", aliases: ["Playhouse", "Play House", "Playhosue", "The Playhouse"] },
  {
    title: "The Return of the Living Dead",
    aliases: ["The Return of the Living Dead", "Return of the Living Dead"],
  },
  { title: "Clayface", aliases: ["Clayface", "Clayface 2026"] },
  { title: "Obsession", aliases: ["Obsession", "Obsession 2026"] },
  { title: "Ghost Rider", aliases: ["Ghost Rider", "Ghost Rider 2007"] },
  { title: "Hachi: A Dog's Tale", aliases: ["Hachi: A Dog's Tale", "Hachi A Dog's Tale", "Hachi"] },
  { title: "Eight Below", aliases: ["Eight Below"] },
  { title: "Wind River", aliases: ["Wind River"] },
  { title: "Let the Right One In", aliases: ["Let the Right One In", "Låt den rätte komma in"] },
  { title: "Siren Head", aliases: ["Siren Head", "Sirenhead"] },
  { title: "Whalefall", aliases: ["Whalefall"] },
  { title: "Beware the Boiuna", aliases: ["Beware Boiuna", "Beware the Boiuna", "Boiuna"] },
  { title: "Crawlers", aliases: ["Crawlers"] },
  {
    title: "V/H/S: Mixtape",
    aliases: ["V/H/S Mistape", "V/H/S: Mistape", "V/H/S Mixtape", "V/H/S/MIXTAPE", "VHS Mistape"],
  },
  { title: "Werwulf", aliases: ["Werwulf"] },
  { title: "Hallowarrior", aliases: ["Hallowarrior"] },
  { title: "The Cycle", aliases: ["The Cycle"] },
  { title: "Breeder", aliases: ["Breeder"] },
  { title: "Don't Move", aliases: ["Don't Move", "Dont Move"] },
  { title: "The Pools", aliases: ["The Pools"] },
  { title: "I Am Sam", aliases: ["I Am Sam"] },
  { title: "Togo", aliases: ["Togo"] },
  { title: "A Street Cat Named Bob", aliases: ["A Street Cat Named Bob"] },
  { title: "Big Baby", aliases: ["Big Baby"] },
  {
    title: "In Violet Nature Part 2",
    aliases: ["In Violet Nature Part 2", "In Violet Nature: Part II", "In Violet Nature 2"],
  },
];

function normalizeTitle(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findCustomMovie(query) {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) return null;
  if (normalizedQuery === "escape the backrooms") return null;

  return (
    CUSTOM_MOVIE_LIBRARY.find((movie) => {
      const aliases = [movie.title, ...(movie.aliases || [])];
      return aliases.some((alias) => normalizeTitle(alias) === normalizedQuery);
    }) ||
    CUSTOM_MOVIE_LIBRARY.find((movie) => {
      const aliases = [movie.title, ...(movie.aliases || [])];
      return aliases.some((alias) => normalizeTitle(alias).includes(normalizedQuery));
    }) ||
    CUSTOM_MOVIE_LIBRARY.find((movie) => {
      const aliases = [movie.title, ...(movie.aliases || [])];
      return aliases.some((alias) => normalizedQuery.includes(normalizeTitle(alias)));
    }) ||
    null
  );
}

function customMovieToItem(movie) {
  // This library only identifies aliases; release metadata must come from TMDB.
  return {
    tmdbId: "manual-" + normalizeTitle(movie.title).replace(/\s+/g, "-"),
    title: stripReleaseYear(movie.title),
    year: "",
    expectedYear: movie.year || extractReleaseYear(movie.title),
    releaseDate: "",
    lang: "",
    rating: null,
    poster: null,
    backdrop: null,
    overview: "",
    genres: [],
    metadataSource: "",
  };
}

function extractReleaseYear(title = "") {
  return title.match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

function stripReleaseYear(title = "") {
  return title.replace(/\s+\b(19|20)\d{2}\b/g, "").trim();
}

/**
 * Data cadangan saat API key belum diisi / TMDB tidak bisa dihubungi.
 * Halaman tetap tampil rapi: poster diganti gradien + judul film.
 */
export const FALLBACK_MOVIES = [
  {
    tmdbId: "demo-dune",
    title: "Dune: Part Two",
    year: "2024",
    lang: "EN",
    rating: 8.5,
    poster: null,
    backdrop: null,
    genres: ["Sci-Fi", "Petualangan"],
    overview:
      "Paul Atreides bersatu dengan Fremen untuk membalas kehancuran keluarganya, sambil menahan gelombang ramalan yang bisa mengubah seluruh alam semesta.",
  },
  {
    tmdbId: "demo-batman",
    title: "The Batman",
    year: "2022",
    lang: "EN",
    rating: 7.8,
    poster: null,
    backdrop: null,
    genres: ["Kriminal", "Misteri"],
    overview:
      "Di tahun kedua aksinya, Batman memburu pembunuh berantai yang meninggalkan teka-teki — dan perlahan membuka luka lama Kota Gotham.",
  },
  {
    tmdbId: "demo-interstellar",
    title: "Interstellar",
    year: "2014",
    lang: "EN",
    rating: 8.7,
    poster: null,
    backdrop: null,
    genres: ["Sci-Fi", "Drama"],
    overview:
      "Bumi sekarat. Sekelompok penjelajah menembus lubang cacing demi masa depan umat manusia, dengan harga yang harus dibayar keluarga mereka sendiri.",
  },
  {
    tmdbId: "demo-blade-runner",
    title: "Blade Runner 2049",
    year: "2017",
    lang: "EN",
    rating: 8.0,
    poster: null,
    backdrop: null,
    genres: ["Sci-Fi", "Thriller"],
    overview:
      "Petugas Blade Runner K mengungkap rahasia yang terkubur tiga dekade — temuan yang berpotensi meruntuhkan sisa-sisa peradaban.",
  },
  {
    tmdbId: "demo-sicario",
    title: "Sicario",
    year: "2015",
    lang: "EN",
    rating: 7.6,
    poster: null,
    backdrop: null,
    genres: ["Thriller", "Kriminal"],
    overview:
      "Seorang agen FBI direkrut ke dalam operasi rahasia di perbatasan Meksiko–Amerika, tempat aturan hukum berhenti dan moral mulai kabur.",
  },
  {
    tmdbId: "demo-john-wick",
    title: "John Wick: Chapter 4",
    year: "2023",
    lang: "EN",
    rating: 7.7,
    poster: null,
    backdrop: null,
    genres: ["Laga", "Thriller"],
    overview:
      "Dengan harga di kepalanya yang terus naik, John Wick melawan High Table dari New York sampai Paris untuk merebut kembali kebebasannya.",
  },
];

async function searchOmdbMovies(query, page = 1) {
  const params = new URLSearchParams({
    apikey: OMDB_KEY,
    s: query,
    type: "movie",
    page: String(page),
  });
  const data = await fetchJson(`https://www.omdbapi.com/?${params}`);
  if (data.Response === "False") {
    if (data.Error === "Movie not found!") return { movies: [], total: 0 };
    throw new Error(data.Error || "Pencarian OMDb gagal.");
  }
  return {
    movies: (data.Search || []).map((movie) => ({
      tmdbId: `imdb-${movie.imdbID}`,
      imdbId: movie.imdbID,
      title: movie.Title,
      year: /^\d{4}/.test(movie.Year || "") ? movie.Year.slice(0, 4) : "",
      releaseDate: "",
      lang: "",
      rating: null,
      poster: movie.Poster && movie.Poster !== "N/A" ? movie.Poster : null,
      backdrop: null,
      overview: "",
      genres: [],
      metadataSource: "omdb",
    })),
    total: Number(data.totalResults) || 0,
  };
}

function mergeMovieResults(tmdbMovies, omdbMovies) {
  const known = new Set(
    tmdbMovies.map(
      (movie) =>
        `${normalizeTitle(movie.title)}:${movie.year || ""}`
    )
  );
  return [
    ...tmdbMovies,
    ...omdbMovies.filter((movie) => {
      const key = `${normalizeTitle(movie.title)}:${movie.year || ""}`;
      if (known.has(key)) return false;
      known.add(key);
      return true;
    }),
  ];
}

async function searchMovieSources(query, year = "", page = 1) {
  if (!hasTmdb && !hasOmdb) {
    throw new Error("Tambahkan VITE_TMDB_KEY atau VITE_OMDB_KEY ke .env.local.");
  }

  const tmdbRequest = hasTmdb
    ? requestTmdb("/search/movie", {
        language: "id-ID",
        query,
        page: String(page),
        ...(year ? { primary_release_year: year } : {}),
      })
    : Promise.resolve({ results: [], total_pages: 0 });
  const omdbRequest = hasOmdb
    ? searchOmdbMovies(query, page).catch((error) => ({
        movies: [],
        total: 0,
        error: error.message || "Pencarian OMDb gagal.",
      }))
    : Promise.resolve({ movies: [], total: 0 });
  const [tmdbData, omdbResult] = await Promise.all([tmdbRequest, omdbRequest]);
  const tmdbMovies = (tmdbData.results || []).map(toItem);
  const movies = mergeMovieResults(tmdbMovies, omdbResult.movies);

  return {
    movies,
    hasMore:
      page < (tmdbData.total_pages || 0) ||
      (hasOmdb && page < 100 && page * 10 < omdbResult.total),
    warning: omdbResult.error || "",
  };
}

export async function searchMovies(query, page = 1) {
  return searchMovieSources(query, "", page);
}

export async function searchTmdbMovies(query, year = "", page = 1) {
  const result = await searchMovieSources(query, year, page);
  return result.movies;
}

export async function fetchMovieDetails(movie, language = "id-ID") {
  if (!hasTmdb) {
    throw new Error("Isi VITE_TMDB_KEY untuk memuat tanggal rilis dan pemeran dari TMDB.");
  }

  let movieId = typeof movie.tmdbId === "number" ? movie.tmdbId : null;
  const expectedYear =
    extractReleaseYear(movie.expectedYear || "") ||
    extractReleaseYear(movie.year || "") ||
    extractReleaseYear(movie.title);

  if (!movieId) {
    if (movie.imdbId) {
      const matchData = await requestTmdb(`/find/${movie.imdbId}`, {
        external_source: "imdb_id",
      });
      movieId = matchData.movie_results?.[0]?.id || null;
    }

    if (!movieId) {
      const title = stripReleaseYear(movie.title);
      const searchResult = await requestTmdb("/search/movie", {
        query: title,
        ...(expectedYear ? { primary_release_year: expectedYear } : {}),
      });
      const customMovie = findCustomMovie(movie.title);
      const expectedTitles = new Set(
        [title, ...(customMovie?.aliases || [])].map(normalizeTitle)
      );
      const match = (searchResult.results || []).find((candidate) => {
        const candidateTitle = normalizeTitle(
          candidate.title || candidate.original_title || ""
        );
        const candidateYear = (candidate.release_date || "").slice(0, 4);
        return (
          expectedTitles.has(candidateTitle) &&
          (!expectedYear || candidateYear === expectedYear)
        );
      });

      if (match) movieId = match.id;
    }

    if (!movieId) {
      throw new Error(
        `Data TMDB untuk "${movie.title}" (${expectedYear || "tahun tidak diketahui"}) belum tersedia.`
      );
    }
  }

  const [details, releaseData] = await Promise.all([
    requestTmdb(`/movie/${movieId}`, {
      language,
      append_to_response: "credits",
    }),
    requestTmdb(`/movie/${movieId}/release_dates`),
  ]);
  const countryGroups = releaseData.results || [];
  const theatricalRelease = (group) =>
    group?.release_dates?.find(
      (release) => release.type === 3 && release.release_date
    );
  const releaseGroup =
    countryGroups.find(
      (group) => group.iso_3166_1 === "ID" && theatricalRelease(group)
    ) ||
    countryGroups.find(
      (group) => group.iso_3166_1 === "US" && theatricalRelease(group)
    ) ||
    countryGroups.find((group) => theatricalRelease(group));
  const regionalRelease = theatricalRelease(releaseGroup);
  const cast = (details.credits?.cast || []).slice(0, 12);
  const instagramResults = await Promise.allSettled(
    cast.map((person) => fetchPersonInstagram(person.id))
  );

  return {
    id: details.id,
    title: details.title || details.original_title || movie.title,
    poster: details.poster_path ? `${IMG}/w500${details.poster_path}` : null,
    backdrop: details.backdrop_path
      ? `${IMG}/w1280${details.backdrop_path}`
      : null,
    releaseDate:
      regionalRelease?.release_date || details.release_date || movie.releaseDate || "",
    releaseRegion: releaseGroup?.iso_3166_1 || "TMDB",
    overview: details.overview || "",
    runtime: details.runtime || null,
    genres: (details.genres || []).map((genre) => genre.name),
    cast: cast.map((person, index) => ({
      id: person.id,
      name: person.name,
      character: person.character,
      profile: person.profile_path
        ? `${IMG}/w185${person.profile_path}`
        : null,
      instagram:
        instagramResults[index].status === "fulfilled"
          ? instagramResults[index].value
          : null,
      profileUrl: `https://www.themoviedb.org/person/${person.id}`,
    })),
    sourceUrl: `https://www.themoviedb.org/movie/${movieId}`,
  };
}

export async function fetchMovieVideos(movieId) {
  if (!hasTmdb) {
    throw new Error("Isi VITE_TMDB_KEY untuk memuat trailer dari TMDB.");
  }
  const data = await requestTmdb(`/movie/${movieId}/videos`);
  return (data.results || [])
    .filter((video) => video.site === "YouTube")
    .sort(
      (a, b) =>
        Number(b.official && b.type === "Trailer") -
        Number(a.official && a.type === "Trailer")
    );
}

export async function fetchLatestMovies(page = 1) {
  if (!hasTmdb) {
    return { movies: FALLBACK_MOVIES, source: "demo", page: 1, hasMore: false };
  }
  const data = await requestTmdb("/movie/now_playing", {
    region: "ID",
    page: String(page),
  });
  return {
    movies: (data.results || []).map(toItem),
    source: "tmdb",
    page: data.page || page,
    hasMore: (data.page || page) < (data.total_pages || 0),
  };
}

// Film yang sedang tren minggu ini (dipakai di carousel landing page)
export async function fetchPopular() {
  const url =
    BASE + "/trending/movie/week?api_key=" + TMDB_KEY + "&language=id-ID";
  const data = await fetchJson(url);
  return data.results
    .filter((m) => m.poster_path)
    .slice(0, 7)
    .map(toItem);
}

/**
 * Versi "aman" dari fetchPopular untuk halaman depan:
 * tidak pernah melempar error — selalu mengembalikan
 * { movies, source: "tmdb" | "demo", error }.
 */
export async function fetchTrendingMovies({ signal } = {}) {
  if (!hasTmdb) {
    return { movies: FALLBACK_MOVIES, source: "demo", error: "" };
  }

  try {
    const url =
      BASE + "/trending/movie/week?api_key=" + TMDB_KEY + "&language=id-ID";
    const data = await fetchJson(url, { signal });
    const movies = (data.results || [])
      .filter((m) => m && (m.backdrop_path || m.poster_path))
      .slice(0, 8)
      .map(toItem);

    if (movies.length === 0) {
      return { movies: FALLBACK_MOVIES, source: "demo", error: "" };
    }

    return { movies, source: "tmdb", error: "" };
  } catch (err) {
    if (err.name === "AbortError") {
      return { movies: [], source: "aborted", error: "" };
    }
    return {
      movies: FALLBACK_MOVIES,
      source: "demo",
      error: err.message || "Gagal memuat data TMDB.",
    };
  }
}

const DEFAULT_SEED_LIST = [
  { title: "Resident Evil 2026", watched: true, rating: 0, aliases: ["Resident Evil"] },
  { title: "Other Mommy 2026", watched: true, rating: 8, aliases: ["The Other Mommy", "Other Mommy"] },
  { title: "Hachi A Dog's Tale 2009", watched: true, rating: 0, aliases: ["Hachi: A Dog's Tale", "Hachi"] },
  { title: "The Mummy 2026", watched: true, rating: 0, aliases: ["The Mummy"] },
  { title: "Backrooms 2026", watched: true, rating: 8.5, aliases: ["Backrooms", "The Backrooms", "Backrooms 2026"] },
  { title: "Obsession 2026", watched: true, rating: 8.9, aliases: ["Obsession"] },
  { title: "Eight Below 2006", watched: false, rating: 0, aliases: ["Eight Below"] },
  { title: "Wind River 2017", watched: false, rating: 0, aliases: ["Wind River"] },
  { title: "Let the Right One In 2008", watched: false, rating: 0, aliases: ["Let The Right One In", "Låt den rätte komma in"] },
  { title: "Clayface 2026", watched: true, rating: 9, aliases: ["Clayface"] },
  { title: "Siren Head", watched: false, rating: 0, aliases: ["Siren Head", "Sirenhead"] },
  { title: "Whalefall 2026", watched: false, rating: 0, aliases: ["Whalefall"] },
  { title: "Beware the Boiuna 2026", watched: false, rating: 0, aliases: ["Beware Boiuna", "Boiuna"] },
  { title: "Crawlers 2026", watched: false, rating: 0, aliases: ["Crawlers"] },
  { title: "V/H/S: Mixtape 2026", watched: false, rating: 0, aliases: ["V/H/S Mistape", "V/H/S: Mistape", "V/H/S Mixtape", "V/H/S/MIXTAPE", "VHS Mistape"] },
  { title: "Werwulf 2026", watched: false, rating: 0, aliases: ["Werwulf"] },
  { title: "Hallowarrior 2026", watched: false, rating: 0, aliases: ["Hallowarrior"] },
  { title: "The Cycle 2026", watched: false, rating: 0, aliases: ["The Cycle"] },
  { title: "Breeder 2026", watched: false, rating: 0, aliases: ["Breeder"] },
  { title: "Don't Move 2026", watched: false, rating: 0, aliases: ["Dont Move", "Don't Move"] },
  { title: "Playhouse 2026", watched: false, rating: 0, aliases: ["Playhouse", "Play House", "Playhosue", "The Playhouse", "The Playhouse 2026", "Playhouse 2026"] },
  { title: "The Return of the Living Dead 2026", watched: false, rating: 0, aliases: ["The Return of the Living Dead", "Return of the Living Dead", "Return Of The Living Dead", "Return of the Living Dead 2026", "The Return of the Living Dead 2026"] },
  { title: "The Pools 2026", watched: false, rating: 0, aliases: ["The Pools"] },
  { title: "I Am Sam 2001", watched: false, rating: 0, aliases: ["I Am Sam"] },
  { title: "Togo 2019", watched: false, rating: 0, aliases: ["Togo"] },
  { title: "A Street Cat Named Bob 2016", watched: false, rating: 0, aliases: ["A street Cat Named Bob", "A Street Cat Named Bob"] },
  { title: "Big Baby 2026", watched: false, rating: 0, aliases: ["Big Baby"] },
  { title: "In Violet Nature Part 2 2027", watched: false, rating: 0, aliases: ["In Violet Nature Part II", "In Violet Nature: Part II", "In Violet Nature 2"] },
  { title: "Ghost Rider 2007", watched: true, rating: 0, aliases: ["Ghost Rider"] },
];

function findBestMovieMatch(query, results) {
  const normalizedQuery = query.toLowerCase();
  return (
    results.find((movie) => {
      const title = (movie.title || "").toLowerCase();
      return (
        title === normalizedQuery ||
        title.includes(normalizedQuery) ||
        normalizedQuery.includes(title)
      );
    }) || results[0] || null
  );
}

export async function ensureStarterMovies(email) {
  const existing = loadMovies(email).map(upgradeKnownSeedMovie);
  const seeded = DEFAULT_SEED_LIST.map((entry, index) => {
    const expectedYear = extractReleaseYear(entry.title);
    const customMovie = findCustomMovie(entry.title);
    const baseMovie = customMovie
      ? customMovieToItem(customMovie)
      : {
          tmdbId:
            "manual-" +
            normalizeTitle(stripReleaseYear(entry.title)).replace(/\s+/g, "-"),
          title: stripReleaseYear(entry.title),
          year: "",
          expectedYear,
          releaseDate: "",
          lang: "",
          rating: null,
          poster: null,
          backdrop: null,
          overview: "",
          genres: [],
          metadataSource: "",
        };
    const oldMovie = existing.find((movie) =>
      isSameSeedMovie(movie, entry)
    );
    const oldYear = extractReleaseYear(oldMovie?.year || "");
    const hasVerifiedTmdbData =
      oldMovie?.metadataSource === "tmdb" &&
      oldMovie.expectedYear === expectedYear &&
      (!oldYear || oldYear === expectedYear);

    return {
      uid: oldMovie?.uid ?? Date.now() + index + 1,
      ...baseMovie,
      ...oldMovie,
      tmdbId: hasVerifiedTmdbData ? oldMovie.tmdbId : baseMovie.tmdbId,
      title: hasVerifiedTmdbData ? oldMovie.title : baseMovie.title,
      expectedYear,
      year: hasVerifiedTmdbData ? oldMovie.year || "" : "",
      releaseDate: hasVerifiedTmdbData ? oldMovie.releaseDate || "" : "",
      lang: hasVerifiedTmdbData ? oldMovie.lang || "" : "",
      poster: hasVerifiedTmdbData ? oldMovie.poster || null : null,
      backdrop: hasVerifiedTmdbData ? oldMovie.backdrop || null : null,
      overview: hasVerifiedTmdbData ? oldMovie.overview || "" : "",
      genres: hasVerifiedTmdbData ? oldMovie.genres || [] : [],
      metadataSource: hasVerifiedTmdbData ? "tmdb" : "",
      watched: oldMovie ? Boolean(oldMovie.watched) : Boolean(entry.watched),
      rating: oldMovie
        ? Number(oldMovie.rating) || 0
        : Number(entry.rating) || 0,
      personalRating:
        oldMovie?.personalRating ??
        (entry.rating ? Math.min(10, Math.max(1, Math.round(entry.rating))) : 0),
      personalRatingScale: 10,
      favorite: Boolean(oldMovie?.favorite),
    };
  });

  const matchedUids = new Set(
    existing
      .filter((movie) =>
        DEFAULT_SEED_LIST.some((entry) => isSameSeedMovie(movie, entry))
      )
      .map((movie) => movie.uid)
  );
  const additionalMovies = existing.filter(
    (movie) => !matchedUids.has(movie.uid)
  );
  const collection = [...seeded, ...additionalMovies];
  await saveMovies(email, collection);
  return collection;
}

function isSameSeedMovie(movie, entry) {
  const movieTitle = normalizeTitle(stripReleaseYear(movie.title));
  const seedTitle = normalizeTitle(stripReleaseYear(entry.title));
  const seedAliases = [entry.title, ...(entry.aliases || [])].map((alias) =>
    normalizeTitle(stripReleaseYear(alias))
  );
  return movieTitle === seedTitle || seedAliases.includes(movieTitle);
}

export async function hydrateMoviePosters(email) {
  if (!hasTmdb) return { updated: 0, unresolved: 0, failed: 0 };

  let collection = loadMovies(email);
  const pending = collection.filter(
    (movie) =>
      normalizeTitle(movie.title) !== "siren head" &&
      (movie.expectedYear !== undefined || !movie.poster)
  );
  let updated = 0;
  let unresolved = 0;
  let failed = 0;

  for (let index = 0; index < pending.length; index += 6) {
    const batch = pending.slice(index, index + 6);
    const outcomes = await Promise.allSettled(
      batch.map(async (movie) => {
        const year =
          extractReleaseYear(movie.expectedYear || "") ||
          extractReleaseYear(movie.year || "");
        const title = stripReleaseYear(movie.title);
        const data = await requestTmdb("/search/movie", {
          query: title,
          ...(year ? { primary_release_year: year } : {}),
        });
        const customMovie = findCustomMovie(movie.title);
        const expectedTitles = new Set(
          [title, ...(customMovie?.aliases || [])].map((item) =>
            normalizeTitle(stripReleaseYear(item))
          )
        );
        const exactMatches = (data.results || []).filter((candidate) => {
          const candidateTitles = [
            candidate.title,
            candidate.original_title,
          ].map((candidateTitle) =>
            normalizeTitle(stripReleaseYear(candidateTitle || ""))
          );
          return candidateTitles.some((candidateTitle) =>
            expectedTitles.has(candidateTitle)
          );
        });
        const matchingYear = exactMatches.filter(
          (candidate) =>
            year &&
            extractReleaseYear(candidate.release_date || "") === year
        );
        if (matchingYear.length === 1) return matchingYear[0];
        if (matchingYear.length > 1) return null;
        return exactMatches.length === 1 && !exactMatches[0].release_date
          ? exactMatches[0]
          : null;
      })
    );

    outcomes.forEach((outcome, outcomeIndex) => {
      if (outcome.status === "rejected") {
        failed += 1;
        return;
      }
      const source = outcome.value;
      const target = batch[outcomeIndex];
      if (!source) {
        if (target.expectedYear !== undefined) {
          const title = stripReleaseYear(target.title);
          collection = collection.map((movie) =>
            movie.uid === target.uid
              ? {
                  ...movie,
                  tmdbId:
                    "manual-" + normalizeTitle(title).replace(/\s+/g, "-"),
                  title,
                  year: "",
                  releaseDate: "",
                  lang: "",
                  rating: null,
                  poster: null,
                  backdrop: null,
                  overview: "",
                  genres: [],
                  metadataSource: "",
                }
              : movie
          );
        }
        unresolved += 1;
        return;
      }

      collection = collection.map((movie) =>
        movie.uid === target.uid
          ? {
              ...movie,
              tmdbId: source.id,
              title: source.title || source.original_title || movie.title,
              year: extractReleaseYear(source.release_date || ""),
              releaseDate: source.release_date || "",
              lang: (source.original_language || "").toUpperCase(),
              rating:
                typeof source.vote_average === "number" && source.vote_average > 0
                  ? Math.round(source.vote_average * 10) / 10
                  : null,
              poster: source.poster_path
                ? `${IMG}/w342${source.poster_path}`
                : null,
              backdrop: source.backdrop_path
                ? `${IMG}/w780${source.backdrop_path}`
                : null,
              overview: (source.overview || "").trim(),
              genres: (source.genre_ids || [])
                .map((id) => GENRE_MAP[id])
                .filter(Boolean)
                .slice(0, 2),
              metadataSource: "tmdb",
            }
          : movie
      );
      if (source.poster_path) updated += 1;
      else unresolved += 1;
    });

    await saveMovies(email, collection);
  }

  return { updated, unresolved, failed };
}
