const STORAGE_KEY = "mhrise-armor-sim.build";
const SHARE_HASH_PREFIX = "#build=";

/** Saves the build to localStorage and encodes/decodes it in shareable links. */
export class BuildStorage {
  save(build) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build.toJSON()));
    } catch {
      // Storage can be unavailable (private mode); the build simply won't persist.
    }
  }

  /** A build in the URL hash takes priority over the locally saved one. */
  loadSavedBuild() {
    if (window.location.hash.startsWith(SHARE_HASH_PREFIX)) {
      try {
        const encodedBuild = window.location.hash.slice(SHARE_HASH_PREFIX.length);
        history.replaceState(null, "", window.location.pathname);
        return JSON.parse(atob(decodeURIComponent(encodedBuild)));
      } catch {
        return null;
      }
    }
    try {
      const storedBuild = localStorage.getItem(STORAGE_KEY);
      return storedBuild ? JSON.parse(storedBuild) : null;
    } catch {
      return null;
    }
  }

  createShareUrl(build) {
    const encodedBuild = encodeURIComponent(btoa(JSON.stringify(build.toJSON())));
    return `${window.location.origin}${window.location.pathname}${SHARE_HASH_PREFIX}${encodedBuild}`;
  }
}
