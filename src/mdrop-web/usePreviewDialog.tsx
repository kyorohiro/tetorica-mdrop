import React, { useState } from "react";
import { useDialog } from "../useDialog";
import type { TargetFile } from "./api";
import { PreviewPage } from "./preview/PreviewPage";
import { preivewGlobalSetting } from "./preview/preivewSetting";

type PreviewDialogOptions = {
    files: TargetFile[];
    initialIndex: number;
    apiServer?: string;
    coverSrc?: string;
    getObjectUrl?: (
        file: TargetFile,
        onProgress?: (loaded: number, total: number) => void
    ) => Promise<string>;
    download?: (
        file: TargetFile,
        onProgress?: (loaded: number, total: number) => void
    ) => Promise<void>;
    isClose?: boolean;
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
        file.isRoot ? "" : file.path ?? "/"
    )}`;
};

export function usePreviewDialog() {
    const { showDialog } = useDialog();

    const showPreviewDialog = React.useCallback(
        async (opts: PreviewDialogOptions) => {
            return await showDialog<void>(({ close }) => (
                <PreviewDialog
                    {...opts}
                    onClose={opts.isClose !== false ? close : undefined}
                />
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
    coverSrc,
    getObjectUrl,
    download,
    onClose,
}: PreviewDialogOptions & { onClose?: () => void }) {
    console.log(">> coverSrc", !!coverSrc);
    const [index, setIndex] = React.useState(initialIndex);
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

    const touchRef = React.useRef<{
        startX: number;
        startY: number;
        startTime: number;
    } | null>(null);

    const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        touchRef.current = {
            startX: t.clientX,
            startY: t.clientY,
            startTime: Date.now(),
        };
    }, []);

    const handleTouchEnd = React.useCallback(
        (e: React.TouchEvent) => {
            const start = touchRef.current;
            touchRef.current = null;

            if (!start) return;

            const t = e.changedTouches[0];
            const dx = t.clientX - start.startX;
            const dy = t.clientY - start.startY;
            const dt = Date.now() - start.startTime;

            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            // 横フリックだけ拾う
            if (absX < 50) return;
            if (absX < absY * 1.2) return;
            if (dt > 800) return;

            if (dx < 0) {
                move(1); // 左にフリック => 次へ
            } else {
                move(-1); // 右にフリック => 前へ
            }
        },
        [move]
    );

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose?.();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                move(1);
            }
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                move(-1);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [move, onClose]);

    if (!file) return null;

    return (
        <div className="flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-slate-950 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100dvw-2rem)] sm:rounded-2xl sm:border sm:border-slate-700 sm:shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 text-slate-100">
                <div className="min-w-0 truncate text-sm">
                    {index + 1} / {files.length} {file.path}
                    {loadingMessage ? ` : ${loadingMessage}` : ""}
                </div>

                <div className="flex shrink-0 gap-2">
                    {
                    (!!preivewGlobalSetting.isOpen) &&
                        <button
                            type="button"
                            onClick={() => {
                                const link = document.createElement("a");
                                link.href = downloadUrl(apiServer, file);
                                link.target = "_blank";
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                            Open
                        </button>
                    }
                    <button
                        type="button"
                        onClick={async () => {
                            if (download) {
                                await download(file, (loaded, total) => {
                                    setLoadingMessage(`${loaded}/${total}`);
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

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>

            <div
                className="flex min-h-0 flex-1 items-center justify-center bg-black"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <PreviewPage
                    key={`${file.id}:${file.path}`}
                    file={file}
                    apiServer={apiServer}
                    getObjectUrl={getObjectUrl}
                    onLoadingMessage={setLoadingMessage}
                    coverSrc={coverSrc}
                />
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