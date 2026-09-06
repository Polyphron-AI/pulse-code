import { describe, expect, it } from "vite-plus/test";
import { findMailPage } from "./MailPagination.ts";

describe("bounded IMAP pagination", () => {
  it("continues within a dense window without dropping the unreturned matches", async () => {
    const source = [100, 99, 98, 97, 96];
    const search = async (lower: number, upper: number) =>
      source.filter((uid) => uid >= lower && uid <= upper);
    const first = await findMailPage(100, 2, search);
    expect(first).toEqual({ uids: [100, 99], nextBeforeUid: 99 });
    expect(await findMailPage(first.nextBeforeUid! - 1, 2, search)).toEqual({
      uids: [98, 97],
      nextBeforeUid: 97,
    });
  });
  it("limits sparse search work and returns an older-history cursor even with no matches", async () => {
    const ranges: number[][] = [];
    const result = await findMailPage(1_000_000, 50, async (low, high) => {
      ranges.push([low, high]);
      return [];
    });
    expect(ranges).toHaveLength(5);
    expect(ranges.every(([low, high]) => high! - low! < 2000)).toBe(true);
    expect(result).toEqual({ uids: [], nextBeforeUid: 990001 });
  });
  it("finishes empty folders and deduplicates defensive provider results", async () => {
    expect(
      await findMailPage(0, 50, async () => {
        throw new Error("No search needed");
      }),
    ).toEqual({ uids: [], nextBeforeUid: null });
    expect(await findMailPage(5, 50, async () => [3, 3, 2, 9])).toEqual({
      uids: [3, 2],
      nextBeforeUid: null,
    });
  });
});
