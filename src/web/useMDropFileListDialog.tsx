import React, { useMemo, useState } from "react";
import { File, Folder, Loader } from "lucide-react";
import { useDialog } from "../useDialog";
import { TargetFile, getFiles } from "./api";
import { downloadUrl, usePreviewDialog } from "./usePreviewDialog";
import { isAudio, isEpub, isImage, isPdf, isText, isVideo } from "../utils";
import { useZipFileListDialog } from "./useZipFileListDialog";

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

const compareComic = (a: TargetFile, b: TargetFile) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    if (isCover(a.path) && !isCover(b.path)) return -1;
    if (!isCover(a.path) && isCover(b.path)) return 1;
    return compareByName(a, b);
};

type FileListDialogOptions = {
    title?: string;
    apiServer: string;
    targetId: string;
    initialPath?: string;
};

const parentPathOf = (path: string) => {
    const clean = path.replace(/\/+$/, "");
    if (!clean || clean === "/") {
        return "/";
    }
    const parent = clean.split("/").slice(0, -1).join("/");
    return parent || "/";
};
export function useMDropFileListDialog() {
    const { showDialog } = useDialog();

    const showMDropFileListDialog = React.useCallback(
        async (opts: FileListDialogOptions) => {
            return await showDialog<void>(({ close }) => (
                <FileListDialog {...opts} onClose={close} />
            ));
        },
        [showDialog]
    );

    return { showMDropFileListDialog };
}

function FileListDialog({
    title,
    apiServer,
    targetId,
    initialPath = "/",
    onClose,
}: FileListDialogOptions & { onClose: () => void }) {
    const [path, setPath] = useState(initialPath);
    const [files, setFiles] = useState<TargetFile[]>([]);
    const [sort, setSort] = useState<SortMode>("comic");
    const [loading, setLoading] = useState(false);

    const { showPreviewDialog } = usePreviewDialog();
    const { showZipFileListDialog } = useZipFileListDialog();


    const load = React.useCallback(
        async (nextPath: string) => {
            setLoading(true);

            try {
                const resolvedPath = nextPath === ".."
                    ? parentPathOf(path)
                    : nextPath;

                const nextFiles = await getFiles(targetId, resolvedPath);
                setFiles(nextFiles ?? []);
                setPath(resolvedPath);
            } finally {
                setLoading(false);
            }
        },
        [targetId, path]
    );
    /*
        const load = React.useCallback(
            async (nextPath: string) => {
                console.log("> load")
                setLoading(true);
                if (nextPath == "..") {
                    console.log(">> 1", path)
                    nextPath = path.split("/").slice(0, -1).join("/");
                }
                try {
                    console.log(">> 2", nextPath);
                    const nextFiles = await getFiles(targetId, nextPath);
                    setFiles(nextFiles ?? []);
                    setPath(nextPath);
                } finally {
                    setLoading(false);
                }
            },
            [targetId]
        );
        */

    React.useEffect(() => {
        load(initialPath);
    }, [initialPath]);

    const sortedFiles = useMemo<TargetFile[]>(() => {
        const next = [...files];
        let hasParent = false;
        console.log(">>hasParent 1", hasParent, path)
        if (path != "/" && path != "") {
            console.log(">>hasParent 2", hasParent, ">", path, "<")
            hasParent = true;
        }
        next.sort((a, b) => {
            if (sort === "modifiedAt") {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
            }

            if (sort === "comic") {
                return compareComic(a, b);
            }

            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            return compareByName(a, b);
        });


        if (hasParent) {
            console.log(">>hasParent 3", hasParent, path)
            return [{
                id: "p1",
                path: "..",
                isFile: false,
                isDir: false,
                size: 0,
                createdAt: undefined,
                modifiedAt: undefined,
            }, ...next, {
                id: "p2",
                path: "..",
                isFile: false,
                isDir: false,
                size: 0,
                createdAt: undefined,
                modifiedAt: undefined,
            }] as any;
        } else {
            return next;
        }
    }, [files, sort, path]);

    return (
        <div className="flex h-[calc(100vh-2rem)] w-[min(96vw,900px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{title ?? "Files"}</h2>
                    <div className="break-all text-xs text-slate-400">{path}</div>
                </div>

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
                        const filename = file.path.replace(/.*\//, "");

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
                                            if (isImage(file.path) || isVideo(file.path) || isText(file.path) || isAudio(file.path) || isPdf(file.path) || isEpub(file.path)) {
                                                const index = sortedFiles.findIndex((f) => f.path === file.path);

                                                await showPreviewDialog({
                                                    files: sortedFiles,
                                                    initialIndex: index,
                                                    apiServer,
                                                });
                                            } else {
                                                // showZipFileListDialog
                                                if (file.path.endsWith(".zip") || file.path.endsWith(".cbz")|| file.path.endsWith(".rar") || file.path.endsWith(".cbr")) {
                                                    await showZipFileListDialog({
                                                        title: filename,
                                                        source: {
                                                            type: "url",
                                                            url: downloadUrl(apiServer, file),
                                                        },
                                                        initialPath: "/",

                                                    });

                                                    return;

                                                } else {
                                                    //window.location.href = downloadUrl(apiServer, file);
                                                    const a = document.createElement("a");
                                                    a.href = downloadUrl(apiServer, file);
                                                    a.target = "_blank";
                                                    a.download = file.path.replace(/.*\//, "");
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                }

                                            }
                                        }}

                                    >
                                        <div className="flex items-start gap-2 font-medium text-slate-100">
                                            <File className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                                            <span className="min-w-0 break-all text-cyan-50">
                                                {filename}
                                            </span>
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