// Lightweight same-tab realtime sync for profile photo changes.
//
// The app has no single global "current user" store — MarketplaceHeader,
// each dashboard shell, chat, etc. each fetch GET /auth/me or
// GET /profile/me independently (see UserMenu.jsx's comment: "user comes
// from GET /auth/me"). Rather than introduce a global store as a side
// effect of "add photo upload," this gives every one of those independent
// components a cheap way to patch just the two fields that changed the
// moment an upload finishes, without a refetch or a page reload.
//
// This covers same-tab updates only. Cross-tab / cross-device / other
// users' open sessions (e.g. someone else's chat window showing your
// avatar) are covered by the backend's 'profile:updated' Socket.io event
// (see profileController.js) for any surface that keeps a live socket
// connection open — today that's chat. Extending that to every surface
// listed here would mean keeping a persistent socket connected app-wide,
// which is a separate, larger change from wiring up photo upload itself.
export const PROFILE_PHOTO_UPDATED_EVENT = 'jedida:profile-photo-updated';

export function broadcastProfilePhotoUpdate({ userId, avatarUrl, coverImageUrl, field }) {
  window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_UPDATED_EVENT, {
    detail: { userId, avatarUrl, coverImageUrl, field }
  }));
}

// Convenience subscriber for components holding a `user` object in state.
// Only patches state when the event is about the same user currently
// loaded, and only touches the field(s) the event actually reports.
//
// Usage:
//   useEffect(() => subscribeToProfilePhotoUpdates(user?.id, (patch) =>
//     setUser((prev) => prev && ({ ...prev, ...patch }))
//   ), [user?.id]);
export function subscribeToProfilePhotoUpdates(userId, onPatch) {
  if (!userId) return () => {};
  const handler = (e) => {
    const { userId: updatedUserId, avatarUrl, coverImageUrl } = e.detail || {};
    if (updatedUserId !== userId) return;
    const patch = {};
    if (avatarUrl !== undefined) patch.avatar_url = avatarUrl;
    if (coverImageUrl !== undefined) patch.cover_image_url = coverImageUrl;
    onPatch(patch);
  };
  window.addEventListener(PROFILE_PHOTO_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_PHOTO_UPDATED_EVENT, handler);
}
