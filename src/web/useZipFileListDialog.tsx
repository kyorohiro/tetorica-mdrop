import React, { useMemo, useRef, useState } from "react";
import { File, Folder, Loader, Archive } from "lucide-react";
import {
    BlobReader,
    BlobWriter,
    ERR_ENCRYPTED,
    ERR_INVALID_PASSWORD,
    HttpReader,
    ZipReader,
    type Entry,
    type FileEntry,
} from "@zip.js/zip.js";
import { useDialog } from "../useDialog";
import { usePreviewDialog } from "./usePreviewDialog";
import type { TargetFile } from "./api";

type SortMode = "name" | "modifiedAt" | "comic";

type ZipSource =
    | { type: "blob"; blob: Blob }
    | { type: "url"; url: string };

type ZipFileListDialogOptions = {
    title?: string;
    source: ZipSource;
    initialPath?: string;
};

type ZipTargetFile = TargetFile & {
    entry?: Entry;
    name?: string;
};

const collator = new Intl.Collator("ja", {
    numeric: true,
    sensitivity: "base",
});

export const mimeFromPath = (path: string): string => {
  const lower = path.toLowerCase();

  if (/\.(png)$/i.test(lower)) return "image/png";
  if (/\.(jpe?g)$/i.test(lower)) return "image/jpeg";
  if (/\.(webp)$/i.test(lower)) return "image/webp";
  if (/\.(gif)$/i.test(lower)) return "image/gif";
  if (/\.(svg)$/i.test(lower)) return "image/svg+xml";
  if (/\.(avif)$/i.test(lower)) return "image/avif";

  if (/\.(mp4|m4v)$/i.test(lower)) return "video/mp4";
  if (/\.(webm)$/i.test(lower)) return "video/webm";
  if (/\.(ogv)$/i.test(lower)) return "video/ogg";
  if (/\.(mov)$/i.test(lower)) return "video/quicktime";

  if (/\.(mp3)$/i.test(lower)) return "audio/mpeg";
  if (/\.(wav)$/i.test(lower)) return "audio/wav";
  if (/\.(ogg|oga)$/i.test(lower)) return "audio/ogg";
  if (/\.(m4a)$/i.test(lower)) return "audio/mp4";
  if (/\.(aac)$/i.test(lower)) return "audio/aac";
  if (/\.(flac)$/i.test(lower)) return "audio/flac";
  if (/\.(opus)$/i.test(lower)) return "audio/opus";

  if (/\.(pdf)$/i.test(lower)) return "application/pdf";

  if (/\.(json)$/i.test(lower)) return "application/json";
  if (/\.(html)$/i.test(lower)) return "text/html; charset=utf-8";
  if (/\.(css)$/i.test(lower)) return "text/css; charset=utf-8";
  if (/\.(js|jsx|ts|tsx)$/i.test(lower)) return "text/javascript; charset=utf-8";
  if (/\.(md|markdown|txt|xml|rs|toml|yaml|yml|sql|sh|py|java|c|cpp|h)$/i.test(lower)) {
    return "text/plain; charset=utf-8";
  }

  if (/\.(zip|cbz)$/i.test(lower)) return "application/zip";

  return "application/octet-stream";
};

export const isImage = (path: string) =>
  mimeFromPath(path).startsWith("image/");

export const isVideo = (path: string) =>
  mimeFromPath(path).startsWith("video/");

export const isAudio = (path: string) =>
  mimeFromPath(path).startsWith("audio/");

export const isPdf = (path: string) =>
  mimeFromPath(path) === "application/pdf";

export const isText = (path: string) =>
  mimeFromPath(path).startsWith("text/") ||
  mimeFromPath(path) === "application/json";

const isZipLike = (path: string) => /\.(zip|cbz)$/i.test(path);

const isCover = (path: string) => {
    const name = path.replace(/.*\//, "");
    return /^(cover|表紙|hyoushi|000)\.(png|jpe?g|webp|gif|svg|avif)$/i.test(name);
};

const compareByName = (a: ZipTargetFile, b: ZipTargetFile) =>
    collator.compare(a.path, b.path);

const compareComic = (a: ZipTargetFile, b: ZipTargetFile) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    if (isCover(a.path) && !isCover(b.path)) return -1;
    if (!isCover(a.path) && isCover(b.path)) return 1;
    return compareByName(a, b);
};

const createZipReader = (source: ZipSource) => {
    if (source.type === "blob") {
        return new ZipReader(new BlobReader(source.blob));
    } else {
        return new ZipReader(new HttpReader(source.url, {
            useRangeHeader: true,
            preventHeadRequest: false,
        } as any));
    }
};

const normalizeZipPath = (path: string) => path.trim().replace(/^\/+/, "");

const zipApiPath = (prefix: string, name: string) => {
    if (!prefix) return `/${name}`;
    return `/${prefix}${name}`;
};

const parentPathOf = (path: string) => {
    const clean = normalizeZipPath(path).replace(/\/+$/, "");
    if (!clean) return "/";
    const parent = clean.split("/").slice(0, -1).join("/");
    return parent ? `/${parent}` : "/";
};

const filenameFromTitle = (title?: string) => {
    const name = title?.trim() || "archive.zip";
    return /\.(zip|cbz)$/i.test(name) ? name : `${name}.zip`;
};

const downloadCurrentArchive = async (source: ZipSource, title?: string) => {
    if (source.type === "url") {
        const a = document.createElement("a");
        a.href = source.url;
        a.download = filenameFromTitle(title);
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }

    const url = URL.createObjectURL(source.blob);

    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filenameFromTitle(title);
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        URL.revokeObjectURL(url);
    }
};
function listZipEntriesFromEntries(
    entries: Entry[],
    dir: string
): ZipTargetFile[] {
    const prefixRaw = normalizeZipPath(dir).replace(/\/+$/, "");
    const prefix = prefixRaw ? `${prefixRaw}/` : "";

    const results: ZipTargetFile[] = [];
    const seenDirs = new Set<string>();

    for (const entry of entries) {
        const rawName = entry.filename.replace(/^\/+/, "");

        if (!rawName.startsWith(prefix)) continue;

        const rest = rawName.slice(prefix.length);
        if (!rest) continue;

        const slashIndex = rest.indexOf("/");

        if (slashIndex >= 0) {
            const dirName = rest.slice(0, slashIndex);
            if (!dirName || seenDirs.has(dirName)) continue;

            seenDirs.add(dirName);

            results.push({
                id: "zip",
                name: dirName,
                path: zipApiPath(prefix, dirName),
                isFile: false,
                isDir: true,
                size: 0,
                createdAt: 0,
                modifiedAt: 0,
            });

            continue;
        }

        if (entry.directory) continue;

        results.push({
            id: "zip",
            name: rest,
            path: zipApiPath(prefix, rest),
            isFile: true,
            isDir: false,
            size: entry.uncompressedSize ?? entry.compressedSize ?? 0,
            createdAt: 0,
            modifiedAt: entry.lastModDate?.getTime?.() ?? 0,
            entry,
        });
    }

    return results;
}

function isZipFileEntry(entry: Entry): entry is FileEntry {
    return !entry.directory;
}

async function getZipEntryBlob(
    file: ZipTargetFile,
    password?: string,
    onProgress?: (loaded: number, total: number) => void
): Promise<Blob> {
    const entry = file.entry;

    if (!entry) throw new Error("zip entry is missing");
    if (!isZipFileEntry(entry)) throw new Error("zip entry is directory");

    try {
        return await entry.getData(new BlobWriter(mimeFromPath(file.path)), {
            password: password || undefined,
            onprogress: (loaded: number, total: number) => {
                onProgress?.(loaded, total);
            },
        } as any);
    } catch (error: any) {
        // エラーの型（クラス）で直接判定します
        // ★ エラーの名前（name）が特定の文字列かどうかで判定する
        console.log("> error ", error, error?.name);
        if (error?.name === ERR_ENCRYPTED || error?.name === ERR_INVALID_PASSWORD) {
            console.error("暗号化エラーをキャッチしました");
            alert("wrong password");
        } else if (`${error}`.includes(`File contains encrypted entry`)) {
            alert("wrong password");
        } else if (error) {
            alert(`${error}`)
        }
        throw error;
    }
}

export function useZipFileListDialog() {
    const { showDialog } = useDialog();

    const showZipFileListDialog = React.useCallback(
        async (opts: ZipFileListDialogOptions) => {
            console.log("> showZipFileListDialog", opts);
            return await showDialog<void>(({ close }) => (
                <ZipFileListDialog {...opts} onClose={close} />
            ));
        },
        [showDialog]
    );

    return { showZipFileListDialog };
}

function ZipFileListDialog({
    title,
    source,
    initialPath = "/",
    onClose,
}: ZipFileListDialogOptions & { onClose: () => void }) {
    const [path, setPath] = useState(initialPath);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [files, setFiles] = useState<ZipTargetFile[]>([]);
    const [sort, setSort] = useState<SortMode>("comic");
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [password, setPassword] = useState("");

    const readerRef = useRef<ZipReader<BlobReader | HttpReader> | null>(null);

    const { showPreviewDialog } = usePreviewDialog();
    const { showZipFileListDialog } = useZipFileListDialog();

    React.useEffect(() => {
        let cancelled = false;

        const init = async () => {
            setLoading(true);

            try {
                if (readerRef.current) {
                    await readerRef.current.close().catch(() => { });
                    readerRef.current = null;
                }

                const reader = createZipReader(source);
                readerRef.current = reader;

                const nextEntries = await reader.getEntries();

                if (cancelled) return;

                setEntries(nextEntries);

                const nextFiles = listZipEntriesFromEntries(nextEntries, initialPath);
                setFiles(nextFiles);
                setPath(initialPath);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        init().catch(console.error);

        return () => {
            cancelled = true;

            const reader = readerRef.current;
            readerRef.current = null;

            if (reader) {
                reader.close().catch(() => { });
            }
        };
    }, [source, initialPath]);

    const load = React.useCallback(
        async (nextPath: string) => {
            setLoading(true);

            try {
                const resolvedPath = nextPath === ".." ? parentPathOf(path) : nextPath;
                const nextFiles = listZipEntriesFromEntries(entries, resolvedPath);

                setFiles(nextFiles);
                setPath(resolvedPath);
            } finally {
                setLoading(false);
            }
        },
        [entries, path]
    );

    const sortedFiles = useMemo<ZipTargetFile[]>(() => {
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

        if (path !== "/" && path !== "") {
            return [
                {
                    id: "parent",
                    name: "..",
                    path: "..",
                    isFile: false,
                    isDir: true,
                    size: 0,
                    createdAt: 0,
                    modifiedAt: 0,
                },
                ...next,
            ];
        }

        return next;
    }, [files, sort, path]);

    const downloadZipEntry = async (file: ZipTargetFile, onProgress?: (loaded: number, total: number) => void) => {
        let url;
        try {
            setLoading(true);
            const entryBlob = await getZipEntryBlob(file, password, onProgress);
            url = URL.createObjectURL(entryBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name || file.path.replace(/.*\//, "");
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            if (url) {
                URL.revokeObjectURL(url);
            }
            setLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-2rem)] w-[min(96vw,900px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                        {title ?? "Archive"} {loading ? loadingMessage : ""}
                    </h2>
                    <div className="break-all text-xs text-slate-400">{path}</div>
                </div>

                <div className="flex shrink-0 gap-2">

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="zip password"
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
                    />
                    <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                            if (loading) return;

                            try {
                                setLoading(true);
                                await downloadCurrentArchive(source, title);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                        Download
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                        Close
                    </button>
                </div>
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
                    {sortedFiles.map((file, index) => {
                        const filename = file.path === ".." ? ".." : file.path.replace(/.*\//, "");

                        return (
                            <div
                                key={`${file.id}-${file.path}-${index}`}
                                className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm"
                            >
                                {file.isDir ? (
                                    <button
                                        type="button"
                                        className="w-full text-left"
                                        onClick={() => {
                                            if (loading) {
                                                return;
                                            }
                                            load(file.path)
                                        }}
                                    >
                                        <div className="flex items-start gap-2 font-medium text-slate-100">
                                            <Folder className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                            <span className="min-w-0 break-all text-amber-50">
                                                {filename}/
                                            </span>
                                        </div>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="w-full text-left"
                                        onClick={async () => {
                                            if (loading) {
                                                return;
                                            }
                                            try {
                                                setLoading(true);
                                                if (isImage(file.path) || isVideo(file.path) || isText(file.path)|| isAudio(file.path)) {
                                                    const previewFiles = [...sortedFiles];
                                                    //.filter(
                                                    //    (f) => f.isFile && isImage(f.path)
                                                    //);
                                                    const previewIndex = previewFiles.findIndex(
                                                        (f) => f.path === file.path
                                                    );

                                                    await showPreviewDialog({
                                                        files: previewFiles,
                                                        initialIndex: previewIndex,
                                                        apiServer: "",
                                                        getObjectUrl: async (target, onProgress?: (loaded: number, total: number) => void) => {
                                                            const zipFile = target as ZipTargetFile;
                                                            const entryBlob = await getZipEntryBlob(zipFile, password, onProgress);
                                                            return URL.createObjectURL(entryBlob);
                                                        },
                                                        download: async (target, onProgress?: (loaded: number, total: number) => void) => {
                                                            await downloadZipEntry(target as ZipTargetFile, onProgress);
                                                        },
                                                    });

                                                    return;
                                                }

                                                if (isZipLike(file.path)) {
                                                    setLoadingMessage(``);
                                                    const innerBlob = await getZipEntryBlob(file, password, (loaded, total) => {
                                                        setLoadingMessage(`${loaded}/${total}`)
                                                    });

                                                    await showZipFileListDialog({
                                                        title: filename,
                                                        source: {
                                                            type: "blob",
                                                            blob: innerBlob,
                                                        },
                                                        initialPath: "/",
                                                    });

                                                    return;
                                                }

                                                await downloadZipEntry(file);
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                    >
                                        <div className="flex items-start gap-2 font-medium text-slate-100">
                                            {isZipLike(file.path) ? (
                                                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
                                            ) : (
                                                <File className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                                            )}

                                            <span className="min-w-0 break-all text-cyan-50">
                                                {filename}
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