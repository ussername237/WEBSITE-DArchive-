const PROFILE_KEY = "darchive_private_profile";
const DEFAULT_PROFILE = {
  id: "private-owner",
  name: "Koleksi pribadi",
  email: "darchive-owner@local.invalid",
};

export function getSession() {
  let legacyProfile = null;
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    legacyProfile = saved?.id && saved?.email
      ? saved
      : ["mv_static_user", "mv_local_user"]
          .map((key) => {
            try {
              return JSON.parse(localStorage.getItem(key) || "null");
            } catch {
              return null;
            }
          })
          .find((profile) => profile?.email);
  } catch {
    legacyProfile = null;
  }

  const profile = legacyProfile?.email
    ? {
        ...DEFAULT_PROFILE,
        name: legacyProfile.name || DEFAULT_PROFILE.name,
        email: legacyProfile.email,
      }
    : DEFAULT_PROFILE;
  try {
    localStorage.removeItem("mv_static_accounts");
    localStorage.removeItem("mv_static_user");
    localStorage.removeItem("mv_local_user");
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    return profile;
  }
  return profile;
}
