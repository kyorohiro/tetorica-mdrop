import { useCallback, useEffect, useRef, useState } from "react";
import "../App.css";
import { Loader } from "lucide-react";
import { FileTargetFile, getDownloadList, getMeta, Target, TargetFile } from "./api";
import { useMDropFileListDialog } from "./useMDropFileListDialog";
import { usePreviewDialog } from "./usePreviewDialog";
import { sleep, isAudio, isEpub, isImage, isPdf, isText, isVideo, isArchive } from "../utils";


function WebApp({ active }: { active?: boolean }) {
    const [errorMsg,] = useState<string>("");
    const [sharedTargets, setSharedTargets] = useState<Target[]>([]);
    const [apiServer, setApiServer] = useState("");
    const [loading, setLoading] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const { showMDropFileListDialog: showFileListDialog } = useMDropFileListDialog();
    const { showPreviewDialog } = usePreviewDialog();
    //
    const onReload = useCallback(async () => {
        setLoading(true);
        try {
            const metaResp = await getMeta();
            setApiServer(metaResp.apiServer);
            const resp = await getDownloadList();
            setSharedTargets(resp);
            await sleep(300);
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    }, [/**/, active])


    const onSelectTarget = async (target: Target) => {
        await showFileListDialog({
            title: target.path.replace(/^.*[\/]/, ""),
            apiServer,
            targetId: target.id,
            initialPath: "/",
        });
    }

    const onDrop = async (ev: React.DragEvent) => {
        ev.preventDefault();

        const files = ev.dataTransfer.files ?? [];
        if (!files || files.length == 0) return;
        const targets: FileTargetFile[] = []
        for (let i = 0; i < files.length; i++) {
            const f = files[i]
            targets.push({
                id: "",
                entry: f,
                isDir: false,
                isFile: true,
                path: f.name,
                createdAt: 0, modifiedAt: 0, size: 0, isRoot: true,
            }
            )
        }

        // File は Blob を継承しているので、そのまま渡せる
        showPreviewDialog({
            files: targets,
            initialIndex: 0,
            apiServer,
            getObjectUrl: async (file: TargetFile): Promise<string> => {
                return URL.createObjectURL((file as FileTargetFile).entry!);
            },
            download: async (file: TargetFile): Promise<void> => {
                let url: string | undefined;
                try {
                    setLoading(true);
                    url = URL.createObjectURL((file as FileTargetFile).entry!);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.path.replace(/.*\//, "");
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
            }
        });
    }

    const onDragOver = (ev: React.DragEvent) => {
        ev.preventDefault();
    };
    useEffect(()=>{
        onReload()
    }, [onReload]);
    return (
        <main ref={mainRef} onDrop={onDrop} onDragOver={onDragOver} className="h-screen overflow-y-auto bg-slate-950 text-slate-100">
            <div className="mx-auto max-w-3xl px-6 py-8">
                <header className="mb-8">
                    <p className="text-sm text-slate-400">Local file sharing prototype</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">
                        Tetorica mDrop
                    </h1>
                </header>
                {errorMsg && (
                    <div className="mb-6 rounded-xl border border-red-400/40 bg-red-950/50 p-4 text-sm text-red-100">
                        <span className="font-bold">Error:</span> {errorMsg}
                    </div>
                )}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                            Shared Files
                            <span className="ml-2 text-sm font-normal text-slate-400">
                                {sharedTargets.length}
                            </span>
                        </h2>


                        <button
                            type="button"
                            className="inline-flex w-20 items-center justify-center rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            onClick={onReload}
                        >
                            {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Reload"}
                        </button>
                    </div>

                    <div className="mt-4 space-y-2">
                        {sharedTargets.map((file) => {
                            let filename = file.path.replace(/.*\//, "")
                            //console.log("file:", file);
                            return (
                                <div
                                    key={file.id ?? ""}
                                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">

                                            {file.isFile &&
                                                <div

                                                    className="break-all font-medium text-sky-300 hover:underline"

                                                    //href={`${apiServer}/download/${file.id}`}
                                                    onClick={async () => {
                                                        if (isImage(file.path) || isVideo(file.path) || isText(file.path) || isAudio(file.path) || isPdf(file.path) || isEpub(file.path) || isArchive(file.path)) {
                                                            //const index = sortedFiles.findIndex((f) => f.path === file.path);

                                                            await showPreviewDialog({
                                                                files: [{ ...file, createdAt: 0, modifiedAt: 0, size: 0, isRoot: true }],
                                                                initialIndex: 0,
                                                                apiServer,
                                                            });
                                                            return false;
                                                        } else {
                                                            //`${apiServer}/download/${file.id}`
                                                            const a = document.createElement("a");
                                                            a.href = `${apiServer}/download/${file.id}`;
                                                            a.download = file.path.replace(/.*\//, "") || "download";

                                                            document.body.appendChild(a);
                                                            a.click();
                                                            document.body.removeChild(a);
                                                        }
                                                    }}
                                                >

                                                    <div className="truncate font-medium text-slate-100">
                                                        {filename}
                                                    </div>

                                                </div>
                                            }
                                            {!file.isFile &&
                                                <div className="truncate font-medium text-slate-100" onClick={() => {
                                                    onSelectTarget(file);
                                                }}>
                                                    {filename}/
                                                </div>
                                            }
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
                {
                    //
                }
            </div>
        </main>
    );
}

export {
    WebApp
};