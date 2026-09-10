/** Bounds each IMAP search response and work per page, including sparse search matches. */
export async function findMailPage(
  upperUid: number,
  limit: number,
  search: (lower: number, upper: number) => Promise<readonly number[]>,
) {
  const page: number[] = [];
  let upper = upperUid;
  for (let window = 0; window < 5 && upper >= 1; window++) {
    const lower = Math.max(1, upper - 1999);
    const matches = [...new Set(await search(lower, upper))]
      .filter((uid) => uid >= lower && uid <= upper)
      .sort((a, b) => b - a);
    const remaining = limit - page.length;
    page.push(...matches.slice(0, remaining));
    if (page.length === limit) {
      return {
        uids: page,
        nextBeforeUid: matches.length > remaining || lower > 1 ? page.at(-1)! : null,
      };
    }
    upper = lower - 1;
  }
  return { uids: page, nextBeforeUid: upper >= 1 ? upper + 1 : null };
}
