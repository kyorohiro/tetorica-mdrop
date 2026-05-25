import React, { useMemo, useRef, useState } from "react";
import { File, Folder, Loader, Archive } from "lucide-react";
import { useDialog } from "../useDialog";
import { usePreviewDialog } from "./usePreviewDialog";
import {
    isAudio,
    isEpub,
    isImage,
    isPdf,
    isText,
    isVideo,
    isArchive,
} from "../utils";
import {
    ZipExtractor,
    type ZipSource,
    type ArchiveExtractorEntry,
    compareByName,
    compareComic,
    ArchiveExtractor,
} from "./extractor";
import { RarExtractor } from "./extractor_rar";
type SortMode = "name" | "modifiedAt" | "comic";
type ZipFileListDialogOptions = {
    title?: string;
    source: ZipSource;
    initialPath?: string;
};
type ZipTargetFile = ArchiveExtractorEntry & {
    name?: string;
};

const parentPathOf = (path: string) => {
    const clean = ZipExtractor.normalizeZipPath(path).replace(/\/+$/, "");
    if (!clean) return "/";
    const parent = clean.split("/").slice(0, -1).join("/");
    return parent ? `/${parent}` : "/";
};
const filenameFromTitle = (title?: string) => {
    const name = title?.trim() || "archive.zip";
    return /\.(zip|cbz|rar|cbr)$/i.test(name) ? name : `${name}.zip`;
};

export const isRarLikePath = (path: string) =>
    /\.(rar|cbr)$/i.test(path);

export const isZipLikePath = (path: string) =>
    /\.(zip|cbz)$/i.test(path);

export const createArchiveExtractor = (source: ZipSource, title?: string): ArchiveExtractor => {
    const name = title ?? "";

    if (isRarLikePath(name)) {
        return RarExtractor.createFromZipSource(source);
    }

    return ZipExtractor.createFromZipSource(source);
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
    const [files, setFiles] = useState<ZipTargetFile[]>([]);
    const [sort, setSort] = useState<SortMode>("comic");
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [password, setPassword] = useState("");
    const extractorRef = useRef<ArchiveExtractor | null>(null);
    const { showPreviewDialog } = usePreviewDialog();
    const { showZipFileListDialog } = useZipFileListDialog();

    React.useEffect(() => {
        let cancelled = false;
        const init = async () => {
            setLoading(true);
            try {
                const extractor = createArchiveExtractor(source, title);
                extractorRef.current = extractor;
                const nextFiles = await extractor.list(initialPath);
                if (cancelled) return;
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
            extractorRef.current = null;
        };
    }, [source, initialPath, title]);
    const readArchiveFile = React.useCallback(
        async (
            file: ZipTargetFile,
            onProgress?: (loaded: number, total: number) => void
        ) => {
            const extractor = extractorRef.current;
            if (!extractor) {
                throw new Error("archive extractor is not initialized");
            }
            extractor.setPassword(password || undefined);
            return await extractor.read(file.path, onProgress);
        },
        [password]
    );
    const load = React.useCallback(
        async (nextPath: string) => {
            const extractor = extractorRef.current;
            if (!extractor) return;
            setLoading(true);
            try {
                const resolvedPath = nextPath === ".." ? parentPathOf(path) : nextPath;
                const nextFiles = await extractor.list(resolvedPath);
                setFiles(nextFiles);
                setPath(resolvedPath);
            } finally {
                setLoading(false);
            }
        },
        [path]
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
    const downloadZipEntry = async (
        file: ZipTargetFile,
        onProgress?: (loaded: number, total: number) => void
    ) => {
        let url: string | undefined;
        try {
            setLoading(true);
            const entryBlob = await readArchiveFile(file, onProgress);
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
                        placeholder="archive password"
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
            {/* ここに warning */}

            <div className="shrink-0 border-b border-yellow-900/40 bg-yellow-950/20 px-4 py-2 text-xs text-yellow-200">
                <span className="font-semibold">Warning: </span>
                Nested ZIP and RAR archives are streamed directly and may generate high network traffic.

            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                    {sortedFiles.map((file, index) => {
                        const filename =
                            file.path === ".." ? ".." : file.path.replace(/.*\//, "");
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
                                            if (loading) return;
                                            load(file.path);
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
                                            if (loading) return;
                                            try {
                                                setLoading(true);
                                                if (
                                                    isImage(file.path) ||
                                                    isVideo(file.path) ||
                                                    isText(file.path) ||
                                                    isAudio(file.path) ||
                                                    isPdf(file.path) ||
                                                    isEpub(file.path)
                                                ) {
                                                    const previewFiles = [...sortedFiles];
                                                    const previewIndex = previewFiles.findIndex(
                                                        (f) => f.path === file.path
                                                    );
                                                    await showPreviewDialog({
                                                        files: previewFiles,
                                                        initialIndex: previewIndex,
                                                        apiServer: "",
                                                        getObjectUrl: async (target, onProgress) => {
                                                            const entryBlob = await readArchiveFile(
                                                                target as ZipTargetFile,
                                                                onProgress
                                                            );
                                                            return URL.createObjectURL(entryBlob);
                                                        },
                                                        download: async (target, onProgress) => {
                                                            await downloadZipEntry(
                                                                target as ZipTargetFile,
                                                                onProgress
                                                            );
                                                        },
                                                    });
                                                    return;
                                                }
                                                if (isArchive(file.path)) {
                                                    setLoadingMessage("");
                                                    const innerBlob = await readArchiveFile(
                                                        file,
                                                        (loaded, total) => {
                                                            setLoadingMessage(`${loaded}/${total}`);
                                                        }
                                                    );
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
                                            {isArchive(file.path) ? (
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