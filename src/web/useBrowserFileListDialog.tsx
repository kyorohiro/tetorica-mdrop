import React, { useMemo, useState } from "react";
import { File, Folder, Loader } from "lucide-react";
import { useDialog } from "../useDialog";
import { TargetFile, FileTargetFile } from "./api";
import { usePreviewDialog } from "./usePreviewDialog";
import { isAudio, isEpub, isImage, isPdf, isText, isVideo } from "../utils";
import { useZipFileListDialog } from "./useZipFileListDialog";
import { buildPortablePackage, getPortableHtmlText, getReadmeEn, getReadmeJp, getUnrarWasm } from "./buildPortablePackage";

type SortMode = "name" | "modifiedAt" | "comic";

const collator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

const isCover = (path: string) => {
  const name = path.replace(/.*\//, "");
  return /^(cover|表紙|hyoushi|000)\.(png|jpe?g|webp|gif|svg|avif)$/i.test(name);
};

const compareByName = (a: TargetFile, b: TargetFile) =>
  collator.compare(a.path, b.path);

export const compareComic = (a: TargetFile, b: TargetFile) => {
  if (a.isDir && !b.isDir) return -1;
  if (!a.isDir && b.isDir) return 1;
  if (isCover(a.path) && !isCover(b.path)) return -1;
  if (!isCover(a.path) && isCover(b.path)) return 1;
  return compareByName(a, b);
};

const parentPathOf = (path: string) => {
  const clean = path.replace(/\/+$/, "");
  if (!clean || clean === "/") return "/";
  const parent = clean.split("/").slice(0, -1).join("/");
  return parent || "/";
};

function normalizePath(path: string) {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function listBrowserFiles(allFiles: FileTargetFile[], currentPath: string): TargetFile[] {
  const cleanPath = normalizePath(currentPath);
  const prefix = cleanPath ? `${cleanPath}/` : "";

  const dirs = new Map<string, TargetFile>();
  const directFiles: TargetFile[] = [];

  for (const file of allFiles) {
    const rawPath = normalizePath(file.path);

    if (prefix && !rawPath.startsWith(prefix)) continue;

    const rest = prefix ? rawPath.slice(prefix.length) : rawPath;
    if (!rest) continue;

    const slashIndex = rest.indexOf("/");

    if (slashIndex < 0) {
      directFiles.push(file);
      continue;
    }

    const dirName = rest.slice(0, slashIndex);
    const dirPath = prefix + dirName;

    if (!dirs.has(dirPath)) {
      dirs.set(dirPath, {
        id: `dir:${dirPath}`,
        path: dirPath,
        isFile: false,
        isDir: true,
        size: 0,
        createdAt: undefined,
        modifiedAt: undefined,
      });
    }
  }

  return [...dirs.values(), ...directFiles];
}

type BrowserFileListDialogOptions = {
  title?: string;
  files: FileTargetFile[];
  initialPath?: string;
};

export function useBrowserFileListDialog() {
  const { showDialog } = useDialog();

  const showBrowserFileListDialog = React.useCallback(
    async (opts: BrowserFileListDialogOptions) => {
      return await showDialog<void>(({ close }) => (
        <BrowserFileListDialog {...opts} onClose={close} />
      ));
    },
    [showDialog]
  );

  return { showBrowserFileListDialog };
}

function BrowserFileListDialog({
  title,
  files: allFiles,
  initialPath = "/",
  onClose,
}: BrowserFileListDialogOptions & { onClose: () => void }) {
  const [path, setPath] = useState(initialPath);
  const [files, setFiles] = useState<TargetFile[]>(() =>
    listBrowserFiles(allFiles, initialPath)
  );
  const [sort, setSort] = useState<SortMode>("comic");
  const [loading, setLoading] = useState(false);

  const { showConfirmDialog } = useDialog();
  const { showPreviewDialog } = usePreviewDialog();
  const { showZipFileListDialog } = useZipFileListDialog();

  const load = React.useCallback(
    async (nextPath: string) => {
      setLoading(true);
      try {
        const resolvedPath = nextPath === ".." ? parentPathOf(path) : nextPath;
        setFiles(listBrowserFiles(allFiles, resolvedPath));
        setPath(resolvedPath);
      } finally {
        setLoading(false);
      }
    },
    [allFiles, path]
  );

  React.useEffect(() => {
    load(initialPath);
  }, [initialPath]);

  const sortedFiles = useMemo<TargetFile[]>((() => {
    const next = [...files];

    next.sort((a, b) => {
      if (sort === "modifiedAt") {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
      }

      if (sort === "comic") return compareComic(a, b);

      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return compareByName(a, b);
    });

    if (normalizePath(path) !== "") {
      return [
        {
          id: "parent",
          path: "..",
          isFile: false,
          isDir: true,
          size: 0,
          createdAt: undefined,
          modifiedAt: undefined,
        },
        ...next,
      ];
    }

    return next;
  }) as () => TargetFile[], [files, sort, path]);

  const getObjectUrl = async (file: TargetFile): Promise<string> => {
    return URL.createObjectURL((file as FileTargetFile).entry!);
  };

  const download = async (file: TargetFile): Promise<void> => {
    const entry = (file as FileTargetFile).entry!;
    const url = URL.createObjectURL(entry);

    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = file.path.replace(/.*\//, "");
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onClone = async () => {
    let url;
    try {
      setLoading(true);
      console.log(">> clone")
      const r = await showConfirmDialog({
        title: "Create Portable Clone",
        body: (
          <div className="space-y-2">
            <p>
              Create a portable ZIP package that includes this viewer and the selected files.
            </p>
            <p>
              The generated ZIP can be opened locally in a browser and shared as a self-contained viewer package.
            </p>
            <p className="text-amber-300">
              Please include only files that you have the right to copy or distribute.
            </p>
            <p className="text-slate-400">
              Files: {allFiles.length.toLocaleString()}
            </p>
          </div>
        ),
        okText: "Create ZIP",
        cancelText: "Cancel",
      });
      if (!r) {
        return;
      }
      let zip = await buildPortablePackage(//
        allFiles,
        await getPortableHtmlText(),
        await getUnrarWasm(),
        await getReadmeEn(),
        await getReadmeJp()
      );
      url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mdrop_clone_${Date.now()}.zip`;
      //a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setLoading(false);
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }
  return (
    <div className="flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-slate-950 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100dvw-2rem)] sm:rounded-2xl sm:border sm:border-slate-700 sm:shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{title ?? "Files"}</h2>
          <div className="break-all text-xs text-slate-400">{path}</div>
        </div>

        <button
          type="button"
          onClick={onClone}
          className="rounded-lg border border-rose-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Clone
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
        >
          <option value="comic">Comic</option>
          <option value="name">Name</option>
          <option value="modifiedAt">Modified</option>
        </select>

        <button
          type="button"
          className="inline-flex w-20 items-center justify-center rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          onClick={() => load(path)}
        >
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Reload"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {sortedFiles.map((file) => {
            const filename = file.path === ".." ? ".." : file.path.replace(/.*\//, "");

            return (
              <div
                key={file.id + file.path}
                className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm"
              >
                {file.isFile ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={async () => {
                      if (
                        isImage(file.path) ||
                        isVideo(file.path) ||
                        isText(file.path) ||
                        isAudio(file.path) ||
                        isPdf(file.path) ||
                        isEpub(file.path)
                      ) {
                        const index = sortedFiles.findIndex((f) => f.path === file.path);

                        await showPreviewDialog({
                          files: sortedFiles,
                          initialIndex: index,
                          apiServer: ".",
                          getObjectUrl,
                          download,
                        });

                        return;
                      }

                      if (
                        file.path.endsWith(".zip") ||
                        file.path.endsWith(".cbz") ||
                        file.path.endsWith(".rar") ||
                        file.path.endsWith(".cbr")
                      ) {
                        await showZipFileListDialog({
                          title: filename,
                          source: {
                            type: "blob",
                            blob: (file as FileTargetFile).entry!,
                          } as any,
                          initialPath: "/",
                        });

                        return;
                      }

                      await download(file);
                    }}
                  >
                    <div className="flex items-start gap-2 font-medium text-slate-100">
                      <File className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                      <span className="min-w-0 break-all text-cyan-50">{filename}</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => load(file.path)}
                  >
                    <div className="flex items-start gap-2 font-medium text-slate-100">
                      <Folder className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span className="min-w-0 break-all text-amber-50">
                        {filename}/
                      </span>
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}