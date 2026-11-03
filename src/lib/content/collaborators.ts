/*
  Collaborators on an Instagram post: accounts invited to show it on their
  own profile too. The products post with the parent brand, @temppo.uy, so
  the company's feed collects everything (see the column's default). The
  invitation has to be accepted from @temppo.uy; until then — or if it never
  is — the post stays on the product's account only.
*/

/** Instagram takes up to three collaborators per post. */
export const MAX_COLLABORATORS = 3;

const USERNAME = /^[a-z0-9._]{1,30}$/;

/**
 * "@temppo.uy, otra" → ["temppo.uy", "otra"]. Separated by commas or
 * spaces, with or without @, any case; repeats dropped.
 */
export function parseCollaborators(input: string): { usernames: string[] } | { error: string } {
  const usernames = [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((u) => u.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
  const bad = usernames.find((u) => !USERNAME.test(u));
  if (bad) return { error: `«${bad}» no es un usuario de Instagram` };
  if (usernames.length > MAX_COLLABORATORS) return { error: `Instagram permite hasta ${MAX_COLLABORATORS} colaboradores` };
  return { usernames };
}

export function formatCollaborators(usernames: string[]) {
  return usernames.map((u) => `@${u}`).join(", ");
}
