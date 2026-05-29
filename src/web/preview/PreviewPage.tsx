import React from "react";
import { ReactReader } from "react-reader";
import type { TargetFile } from "../api";
import {
    heicToObjectUrl,
    isArchive,
    isAudio,
    isEpub,
    isHeic,
    isImage,
    isPdf,
    isText,
    isVideo,
    makeBlobFromUrl,
} from "../../utils";
import { useZipFileListDialog } from "../useZipFileListDialog";
import { downloadUrl } from "../usePreviewDialog";

type PreviewPageStatus = "none" | "loading" | "loaded" | "error";

export type PreviewPageProps = {
    file: TargetFile;
    apiServer?: string;
    coverSrc?: string;
    getObjectUrl?: (
        file: TargetFile,
        onProgress?: (loaded: number, total: number) => void
    ) => Promise<string>;
    onLoadingMessage?: (message: string) => void;
};

export function PreviewPage({
    file,
    apiServer = "",
    getObjectUrl,
    onLoadingMessage,
    coverSrc,
}: PreviewPageProps) {
    const [status, setStatus] = React.useState<PreviewPageStatus>("none");
    const [src, setSrc] = React.useState("");
    const [text, setText] = React.useState("");
    const [error, setError] = React.useState("");
    const [epubLocation, setEpubLocation] = React.useState<string | number>(0);
    const renditionRef = React.useRef<any>(null);

    const { showZipFileListDialog } = useZipFileListDialog();

    const getUrlFromTargetFile = React.useCallback(
        async (target: TargetFile) => {
            return getObjectUrl
                ? await getObjectUrl(target, (loaded, total) => {
                    onLoadingMessage?.(`${loaded}/${total}`);
                })
                : downloadUrl(apiServer, target);
        },
        [apiServer, getObjectUrl, onLoadingMessage]
    );

    React.useEffect(() => {
        let alive = true;
        const objectUrls: string[] = [];

        const addObjectUrl = (url: string) => {
            if (url.startsWith("blob:")) {
                objectUrls.push(url);
            }
        };

        const run = async () => {
            setStatus("loading");
            setSrc("");
            setText("");
            setError("");
            onLoadingMessage?.("");

            const nextSrc = await getUrlFromTargetFile(file);
            addObjectUrl(nextSrc);

            if (!alive) return;

            if (isText(file.path)) {
                const resp = await fetch(nextSrc);
                if (!resp.ok) {
                    throw new Error(`Failed to load text: ${resp.status}`);
                }

                const nextText = await resp.text();
                if (!alive) return;

                setText(nextText);
                setStatus("loaded");
                return;
            }

            if (isHeic(file.path)) {
                onLoadingMessage?.("Converting HEIC...");

                const resp = await fetch(nextSrc);
                if (!resp.ok) {
                    throw new Error(`Failed to load HEIC: ${resp.status}`);
                }

                const heicBlob = await resp.blob();
                const convertedUrl = await heicToObjectUrl(heicBlob);
                addObjectUrl(convertedUrl);

                if (!alive) return;

                setSrc(convertedUrl);
                setStatus("loaded");
                onLoadingMessage?.("");
                return;
            }

            setSrc(nextSrc);
            setStatus("loaded");
        };

        run().catch((err) => {
            console.error(err);
            if (!alive) return;

            setError(err instanceof Error ? err.message : String(err));
            setStatus("error");
            onLoadingMessage?.("Failed to load preview");
        });

        return () => {
            alive = false;
            for (const url of objectUrls) {
                URL.revokeObjectURL(url);
            }
        };
    }, [file, getUrlFromTargetFile, onLoadingMessage]);

    if (status === "none" || status === "loading") {
        return <div className="text-sm text-slate-400">Loading...</div>;
    }

    if (status === "error") {
        return (
            <div className="max-w-lg px-4 text-center text-sm text-red-300">
                <div>Preview failed</div>
                <div className="mt-2 break-all text-xs text-red-400">
                    {error}
                </div>
            </div>
        );
    }

    if (isVideo(file.path)) {
        return (
            <video
                src={src}
                controls
                autoPlay
                className="max-h-full max-w-full"
            />
        );
    }

    if (isAudio(file.path)) {
        return (
            <div className="w-full max-w-2xl px-6 text-center">
                <div className="mb-4 break-all text-sm text-slate-300">
                    {file.path}
                </div>
                <audio src={src} controls autoPlay className="w-full" />
            </div>
        );
    }

    if (isImage(file.path) || isHeic(file.path)) {
        return (
            <img
                src={src}
                alt={file.path}
                className="max-h-full max-w-full object-contain"
            />
        );
    }

    if (isPdf(file.path)) {
        return (
            <iframe
                src={src}
                title={file.path}
                className="h-full w-full bg-white"
            />
        );
    }

    if (isText(file.path)) {
        return (
            <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-4 text-left text-xs text-slate-100">
                {text}
            </pre>
        );
    }

    if (isEpub(file.path)) {
        return (
            <div className="h-full w-full bg-white text-black">
                <ReactReader
                    epubInitOptions={{ openAs: "epub" }}
                    url={src}
                    location={epubLocation}
                    locationChanged={(nextLocation: string) => {
                        setEpubLocation(nextLocation);
                    }}
                    getRendition={(rendition) => {
                        renditionRef.current = rendition;
                    }}
                />
            </div>
        );
    }
    if (isArchive(file.path)) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-sm text-slate-400">
                {coverSrc && (
                    <img
                        src={coverSrc}
                        alt="cover"
                        className="max-h-[70%] max-w-[90%] rounded-lg object-contain"
                    />
                )}

                <button
                    type="button"
                    onClick={async () => {
                        const f = await getUrlFromTargetFile(file);
                        try {
                            await showZipFileListDialog({
                                initialPath: "/",
                                title: file.path,
                                source: {
                                    type: "blob",
                                    blob: await makeBlobFromUrl(f),
                                },
                            });
                        } finally {
                            if (f.startsWith("blob:")) {
                                URL.revokeObjectURL(f);
                            }
                        }
                    }}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                    OPEN
                </button>
            </div>
        );
    }

    return <div className="text-sm text-slate-400">Preview not supported</div>;
}