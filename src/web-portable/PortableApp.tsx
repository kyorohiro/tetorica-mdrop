import { useRef, useState } from "react";
import "../App.css";
import { TargetFile, FileTargetFile } from "../web/api";
import { usePreviewDialog } from "../web/usePreviewDialog";
import { supportedExtensions } from "../utils";


function PortableApp() {
    const [errorMsg,] = useState<string>("");
    const [, setLoading] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const { showPreviewDialog } = usePreviewDialog();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    function filesToTargets(files: FileList | File[]) {
        const targets: FileTargetFile[] = [];

        for (let i = 0; i < files.length; i++) {
            const f = files[i];

            targets.push({
                id: "",
                entry: f,
                isDir: false,
                isFile: true,
                path: (f as any).webkitRelativePath || f.name,
                createdAt: 0,
                modifiedAt: f.lastModified ?? 0,
                size: f.size ?? 0,
                isRoot: true,
            });
        }

        return targets;
    }

    function openPreview(files: FileList | File[]) {
        const targets = filesToTargets(files);
        if (targets.length === 0) return;

        showPreviewDialog({
            files: targets,
            initialIndex: 0,
            apiServer: ".",
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
                    if (url) URL.revokeObjectURL(url);
                    setLoading(false);
                }
            },
        });
    }

    async function selectFiles() {
        fileInputRef.current?.click();
    }

    async function selectFolders() {
        folderInputRef.current?.click();
    }

    const onDrop = async (ev: React.DragEvent) => {
        ev.preventDefault();
        const files = ev.dataTransfer.files;
        if (files && files.length > 0) {
            openPreview(files);
        }
    };
    const onDragOver = async (ev: React.DragEvent) => {
        ev.preventDefault();
    }
    return (
        <main ref={mainRef} onDrop={onDrop} onDragOver={onDragOver} 
        className="min-h-screen overflow-y-auto bg-slate-950 text-slate-100">
            <div className="mx-auto max-w-3xl px-6 py-8">
                <header className="mb-8">
                    <p className="text-sm text-slate-400"></p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">
                        Tetorica mDrop
                    </h1>
                    <h3 className="mt-1 text-1x1 font-bold tracking-tight">
                        Vieiwer Only No Cloud No Upload into Server
                    </h3>
                </header>
                {errorMsg && (
                    <div className="mb-6 rounded-xl border border-red-400/40 bg-red-950/50 p-4 text-sm text-red-100">
                        <span className="font-bold">Error:</span> {errorMsg}
                    </div>
                )}

                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
                    <div className="flex items-center justify-between gap-3">
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={selectFiles}
                                className="rounded-xl border border-dashed border-slate-600 bg-slate-950 p-6 text-center text-sm text-slate-300 transition hover:border-sky-400 hover:bg-slate-900"
                            >
                                Drop files here, or click to add files
                            </button>

                            <button
                                type="button"
                                onClick={selectFolders}
                                className="rounded-xl border border-dashed border-slate-600 bg-slate-950 p-6 text-center text-sm text-slate-300 transition hover:border-sky-400 hover:bg-slate-900"
                            >
                                Drop folders here, or click to add folders
                            </button>
                        </div>
                        {
                            //
                        }
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(ev) => {
                                const files = ev.currentTarget.files;
                                if (files) openPreview(files);
                                ev.currentTarget.value = "";
                            }}
                        />

                        <input
                            ref={folderInputRef}
                            type="file"
                            multiple
                            // React の型に webkitdirectory がない場合があるので any 扱い
                            {...({ webkitdirectory: "true" } as any)}
                            className="hidden"
                            onChange={(ev) => {
                                const files = ev.currentTarget.files;
                                if (files) openPreview(files);
                                ev.currentTarget.value = "";
                            }}
                        />
                        {
                            //
                        }
                    </div>
                </section>
                <p className="text-sm text-slate-400">zip, rar, image, video, pdf, epub({supportedExtensions.join(", ")})</p>

                {
                    //
                }
            </div>
        </main>
    );
}

export {
    PortableApp
};