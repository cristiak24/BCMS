/**
 * Simple on/off switches for player-side features that are new enough to
 * want an easy kill switch, without pulling in a remote feature-flag service
 * the project doesn't otherwise have. Flip to false to hide a feature while
 * keeping its code in the tree.
 */
export const PLAYER_FEATURE_FLAGS = {
  /** "Echipa mea" — the player's own teams: picker + per-team squad/coach/schedule/attendance. */
  teammatesView: true,
};
