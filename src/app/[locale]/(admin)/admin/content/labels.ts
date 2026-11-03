/** How the content calendar names kinds and states. */

export const KIND_LABEL: Record<string, string> = {
  POST: "Post",
  CAROUSEL: "Carrusel",
  REEL: "Reel",
  STORY: "Historia",
};

export const STATUS: Record<string, { label: string; className: string }> = {
  IDEA: { label: "Idea", className: "bg-white/10 text-white/60" },
  READY: { label: "Lista", className: "bg-sky-500/20 text-sky-200" },
  SCHEDULED: { label: "Programada", className: "bg-amber-500/20 text-amber-200" },
  PUBLISHING: { label: "Publicando", className: "bg-violet-500/20 text-violet-200" },
  PUBLISHED: { label: "Publicada", className: "bg-emerald-500/20 text-emerald-200" },
  FAILED: { label: "Falló", className: "bg-red-500/20 text-red-300" },
};

export const TZ = "America/Montevideo";
