import React, { useState } from "react";
import { useDialog } from "../useDialog";
import type { TargetFile } from "./api";
import { isImage, isText, isVideo } from "./useZipFileListDialog";

type PreviewDialogOptions = {
    files: TargetFile[];
    initialIndex: number;
    apiServer?: string;
    getObjectUrl?: (file: TargetFile, onProgress?: (loaded: number, total: number) => void) => Promise<string>;
    download?: (file: TargetFile, onProgress?: (loaded: number, total: number) => void) => Promise<void>;
};

export const downloadUrl = (apiServer: string, file: TargetFile): string => {
    const encodePath = (path: string) =>
        path
            .split("/")
            .map((part) =>
                encodeURIComponent(part)
                    .replace(/\[/g, "%5B")
                    .replace(/\]/g, "%5D")
            )
            .join("/");

    return `${apiServer}/download/${encodeURIComponent(file.id)}${encodePath(
        file.path ?? "/"
    )}`;
};

export function usePreviewDialog() {
    const { showDialog } = useDialog();

    const showPreviewDialog = React.useCallback(
        async (opts: PreviewDialogOptions) => {
            return await showDialog<void>(({ close }) => (
                <PreviewDialog {...opts} onClose={close} />
            ));
        },
        [showDialog]
    );

    return { showPreviewDialog };
}

function PreviewDialog({
    files,
    initialIndex,
    apiServer = "",
    getObjectUrl,
    download,
    onClose,
}: PreviewDialogOptions & { onClose: () => void }) {
    const [index, setIndex] = React.useState(initialIndex);
    const [src, setSrc] = React.useState("");
    const [text, setText] = React.useState("");
    const [loadingMessage, setLoadingMessage] = useState("");

    const file = files[index];

    const move = React.useCallback(
        (delta: number) => {
            setIndex((current) =>
                Math.max(0, Math.min(current + delta, files.length - 1))
            );
        },
        [files.length]
    );

    React.useEffect(() => {
        if (!file) return;

        let alive = true;
        let objectUrl: string | null = null;

        const run = async () => {
            setSrc("");
            setText("");
            setLoadingMessage(``)
            const nextSrc = getObjectUrl
                ? await getObjectUrl(file, (loaded, total) => {
                    setLoadingMessage(`${loaded}/${total}`)
                })
                : downloadUrl(apiServer, file);

            if (!alive) {
                if (nextSrc.startsWith("blob:")) {
                    URL.revokeObjectURL(nextSrc);
                }
                return;
            }
            if (isText(file.path)) {
                const resp = await fetch(nextSrc);
                const nextText = await resp.text();
                if (!alive) return;
                setText(nextText);
                if (nextSrc.startsWith("blob:")) {
                    objectUrl = nextSrc;
                }
                return;
            } else {
                if (nextSrc.startsWith("blob:")) {
                    objectUrl = nextSrc;
                }
                setSrc(nextSrc);
            }
        };

        run().catch(console.error);

        return () => {
            alive = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [file, apiServer, getObjectUrl]);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown" || e.key === "ArrowRight") move(1);
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [move, onClose]);

    if (!file) return null;

    return (
        <div className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 text-slate-100">
                <div className="min-w-0 truncate text-sm">
                    {index + 1} / {files.length} {file.path} : {loadingMessage}
                </div>

                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={async () => {
                            if (download) {
                                await download(file, (loaded, total) => {
                                    setLoadingMessage(`${loaded}/${total}`)
                                });
                                return;
                            }

                            const link = document.createElement("a");
                            link.href = downloadUrl(apiServer, file);
                            link.download = "";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
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

            <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
                {!src && !text ? (
                    <div className="text-sm text-slate-400">Loading...</div>
                ) : isVideo(file.path) ? (
                    <video
                        src={src}
                        controls
                        autoPlay
                        className="max-h-full max-w-full"
                    />
                ) : isImage(file.path) ? (
                    <img
                        src={src}
                        alt={file.path}
                        className="max-h-full max-w-full object-contain"
                    />
                ) : isText(file.path) ? (
                    <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-4 text-left text-xs text-slate-100">
                        {text}
                    </pre>
                ) : (
                    <div className="text-sm text-slate-400">
                        Preview not supported
                    </div>
                )}
            </div>

            <div className="flex justify-center gap-3 border-t border-slate-800 px-4 py-3">
                <button
                    type="button"
                    onClick={() => move(-1)}
                    disabled={index <= 0}
                    className="rounded-lg border border-slate-700 px-4 py-1 text-sm text-slate-300 disabled:opacity-40"
                >
                    Prev
                </button>

                <button
                    type="button"
                    onClick={() => move(1)}
                    disabled={index >= files.length - 1}
                    className="rounded-lg border border-slate-700 px-4 py-1 text-sm text-slate-300 disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
}