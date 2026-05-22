import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Loader } from "lucide-react";

const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};


function WebApp() {
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [sharedFiles, setSharedFiles] = useState<{
        id: string,
        path: string,
        isFile: boolean,
        isDir: boolean,
    }[]>([]);
    const [apiServer, setApiServer] = useState("");
    const [loading, setLoading] = useState(false);

    const onReload = useCallback(async () => {
        console.log("> onReload");
        setLoading(true);
        try {
            console.log("u1-d1");
            const metaResp = await fetch("./meta.json");
            let _apiServer = "";
            if (metaResp.ok) {
                const data = await metaResp.text();
                console.log(data);
                const d = JSON.parse(data);
                console.log(d.apiServer)
                _apiServer = d.apiServer;
                setApiServer(d.apiServer);
            }
            console.log("u1-d2");
            const resp = await fetch(`${_apiServer}/api/download_list`);
            if (resp.ok) {
                const data = await resp.text();
                console.log(data);
                setSharedFiles(JSON.parse(data));
            }
            await sleep(300);
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    }, [])
    useEffect(() => {
        //
        onReload();
    }, [onReload]);
    return (
        <main className="h-screen overflow-y-auto bg-slate-950 text-slate-100">
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
                                {sharedFiles.length}
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
                        {sharedFiles.map((file) => {
                            let filename = file.path.replace(/.*\//, "")
                            return (
                                <div
                                    key={file.id ?? ""}
                                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-slate-100">
                                                {filename}
                                            </div>
                                            {
                                                //<a
                                                //  className="break-all text-sky-300 underline underline-offset-4"
                                                //  href={rootUrl().replace(RegExp("\\/$"), "") + "/" + urlPath.replace(RegExp("^\\/"), "")}
                                                //  target="_blank"
                                                //  rel="noreferrer"
                                                // >
                                                //</div>   {rootUrl().replace(RegExp("\\/$"), "") + "/" + urlPath.replace(RegExp("^\\/"), "")}
                                                // </a>
                                            }
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </div>
        </main>
    );
}

export {
    WebApp
};