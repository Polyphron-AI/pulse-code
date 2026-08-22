const MAX_CACHE_FILE_NAME_LENGTH = 180;
const INVALID_FILE_NAME_CHARACTERS = '<>:"/\\|?*';

let cacheFileSequence = 0;
const inFlightOpens = new Map<string, Promise<void>>();

export interface WorkspaceFileCacheTarget {
  readonly uri: string;
  readonly download: (sourceUrl: string) => Promise<void>;
  readonly remove: () => void;
}

export interface OpenWorkspaceFileWithDependencies {
  readonly createCacheTarget: (fileName: string) => Promise<WorkspaceFileCacheTarget>;
  readonly isSharingAvailable: () => Promise<boolean>;
  readonly share: (uri: string) => Promise<void>;
}

export interface OpenWorkspaceFileWithInput {
  readonly key: string;
  readonly path: string;
  readonly resolveAssetUrl: () => Promise<string | null>;
}

function fileNameCharacter(character: string): string {
  return character.charCodeAt(0) < 32 || INVALID_FILE_NAME_CHARACTERS.includes(character)
    ? "_"
    : character;
}

function truncateFileName(fileName: string): string {
  if (fileName.length <= MAX_CACHE_FILE_NAME_LENGTH) {
    return fileName;
  }
  const extensionIndex = fileName.lastIndexOf(".");
  const extension =
    extensionIndex > 0 && fileName.length - extensionIndex <= 24
      ? fileName.slice(extensionIndex)
      : "";
  return `${fileName.slice(0, MAX_CACHE_FILE_NAME_LENGTH - extension.length)}${extension}`;
}

export function sanitizeWorkspaceFileName(path: string): string {
  const basename = path.split(/[\\/]/).at(-1) ?? "";
  const sanitized = Array.from(basename, fileNameCharacter)
    .join("")
    .trim()
    .replace(/[. ]+$/u, "");
  return truncateFileName(sanitized.length > 0 ? sanitized : "workspace-file");
}

function removeQuietly(target: WorkspaceFileCacheTarget): void {
  try {
    target.remove();
  } catch {
    // The cache is best-effort cleanup; keep the original open failure.
  }
}

async function createNativeCacheTarget(fileName: string): Promise<WorkspaceFileCacheTarget> {
  const { Directory, File, Paths } = await import("expo-file-system");
  cacheFileSequence += 1;
  const directory = new Directory(
    Paths.cache,
    "workspace-file-open",
    `${Date.now()}-${cacheFileSequence}`,
  );
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, fileName);

  return {
    uri: file.uri,
    download: async (sourceUrl) => {
      await File.downloadFileAsync(sourceUrl, file, { idempotent: true });
    },
    remove: () => {
      if (directory.exists) {
        directory.delete();
      }
    },
  };
}

const nativeDependencies: OpenWorkspaceFileWithDependencies = {
  createCacheTarget: createNativeCacheTarget,
  isSharingAvailable: async () => {
    const { isAvailableAsync } = await import("expo-sharing");
    return isAvailableAsync();
  },
  share: async (uri) => {
    const { shareAsync } = await import("expo-sharing");
    await shareAsync(uri, { dialogTitle: "Open file" });
  },
};

async function runOpenWorkspaceFileWith(
  input: OpenWorkspaceFileWithInput,
  dependencies: OpenWorkspaceFileWithDependencies,
): Promise<void> {
  if (!(await dependencies.isSharingAvailable())) {
    throw new Error("Opening files with other apps is unavailable on this device.");
  }

  const assetUrl = await input.resolveAssetUrl();
  if (assetUrl === null) {
    throw new Error("The connected environment did not provide a usable file URL.");
  }

  const target = await dependencies.createCacheTarget(sanitizeWorkspaceFileName(input.path));
  try {
    await target.download(assetUrl);
    await dependencies.share(target.uri);
  } catch (error) {
    removeQuietly(target);
    throw error;
  }
}

export function openWorkspaceFileWith(
  input: OpenWorkspaceFileWithInput,
  dependencies: OpenWorkspaceFileWithDependencies = nativeDependencies,
): Promise<void> {
  const existing = inFlightOpens.get(input.key);
  if (existing !== undefined) {
    return existing;
  }

  const current = runOpenWorkspaceFileWith(input, dependencies).finally(() => {
    if (inFlightOpens.get(input.key) === current) {
      inFlightOpens.delete(input.key);
    }
  });
  inFlightOpens.set(input.key, current);
  return current;
}
