import {
  normalizeLinkUrl,
  workspaceItemKey,
  type EnvironmentId,
  type PreviewSessionSnapshot,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkList,
} from "@t3tools/contracts";

/** Capture metadata before a navigation or selection can change the action's endpoints. */
export function captureWorkspacePage(input: {
  environmentId: EnvironmentId;
  target: WorkspaceLinkEndpoint | null;
  desktop: boolean;
  address: string;
  navigation: PreviewSessionSnapshot["navStatus"] | undefined;
}) {
  const navigation = input.navigation;
  if (input.desktop && navigation?._tag !== "Success") return null;
  const raw = input.desktop && navigation?._tag === "Success" ? navigation.url : input.address;
  const url = normalizeLinkUrl(raw);
  if (!url || !input.target) return null;
  const title = input.desktop && navigation?._tag === "Success" ? navigation.title : url;
  return {
    environmentId: input.environmentId,
    target: structuredClone(input.target),
    page: { ref: { type: "url" as const, url }, title: title.slice(0, 300) },
  };
}

/** Search only the project's already bounded direct links. */
export function findLinkedPages(list: WorkspaceLinkList | null, query: string) {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const seen = new Set<string>();
  return (list?.linked ?? [])
    .filter((view) => {
      if (view.status !== "confirmed" || view.item.ref.type !== "url") return false;
      const key = workspaceItemKey(view.item.ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return `${view.item.title ?? ""}\n${view.item.ref.url}`
        .toLocaleLowerCase("en-GB")
        .includes(needle);
    })
    .slice(0, 50);
}
