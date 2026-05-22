import React from "react";
import { useDialog } from "../useDialog";
import type { TargetFile } from "./api";

type PreviewDialogOptions = {
    files: TargetFile[];
    initialIndex: number;
    apiServer: string;
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

    return `${apiServer}/download/${encodeURIComponent(file.id)}${encodePath(file.path ?? "/")}`;
}

export function usePreviewDialog() {
    const { showDialog } = useDialog();

    const showPreviewDialog = React.useCallback(
        async (opts: PreviewDialogOptions) => {
            return await showDialog<void>(({ close }) => (
                <PreviewDialog
                    files={opts.files}
                    initialIndex={opts.initialIndex}
                    apiServer={opts.apiServer}
                    onClose={close}
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
    apiServer,
    onClose,
}: PreviewDialogOptions & { onClose: () => void }) {
    const [index, setIndex] = React.useState(initialIndex);

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
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-slate-100">
                <div className="min-w-0 truncate text-sm">
                    {index + 1} / {files.length} {file.path}
                </div>

                <button
                    type="button"
                    onClick={() => {
                        //window.location.href = downloadUrl(apiServer, file)
                        //window.open(downloadUrl(apiServer, file), '_blank');
                        const link = document.createElement('a');
                        link.href = downloadUrl(apiServer, file);
                        link.download = ''; // ブラウザにダウンロードを強制する設定
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        // rust 側で　Content-Disposition: attachment するとなお良い
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

            <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
                <img
                    src={downloadUrl(apiServer, file)}
                    alt={file.path}
                    className="max-h-full max-w-full object-contain"
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