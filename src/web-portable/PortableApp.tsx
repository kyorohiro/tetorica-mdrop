import { useEffect, useRef, useState } from "react";
import "../App.css";
import { Target, TargetFile, FileTargetFile } from "../web/api";
import { usePreviewDialog } from "../web/usePreviewDialog";


function PortableApp({ active }: { active?: boolean }) {
    const [errorMsg,] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const { showPreviewDialog } = usePreviewDialog();

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
                        </h2>
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
    PortableApp
};