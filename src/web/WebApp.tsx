import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { Loader } from "lucide-react";
import { getDownloadList, getFiles, getMeta, Target, TargetFile } from "./api";

const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function WebApp() {
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [sharedTargets, setSharedTargets] = useState<Target[]>([]);
    const [curretTargetId, setCurrentTargetId] = useState<string>();
    const [currentPath, setCurrentPath] = useState<string>();
    const [curretFiles, setCurrentFiles] = useState<TargetFile[]>([])
    const [apiServer, setApiServer] = useState("");
    const [loading, setLoading] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    //const [current

    const onReload = useCallback(async () => {
        console.log("> onReload");
        setLoading(true);
        try {
            console.log("u1-d1");
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
    }, [])

    const onSelectTarget = async (target: Target) => {
        setCurrentTargetId(target.id);
        // 戻るボタン対策で、一応保存しておく
        const url = new URL(window.location.href);
        url.searchParams.set('t', target.id);
        url.searchParams.set('p', '/');
        const state = Object.fromEntries(url.searchParams);
        window.history.pushState(state, '', url.href);
        //
        //
        const files = await getFiles(target.id, '/');
        //console.log(">> files: ", files);
        setCurrentFiles(files ?? []);
        setCurrentPath('/');
    }


    const onSelectTargetFile2 = async (id: string, path: string) => {
        //console.log("> onSelectTargetFile2")
        const files = await getFiles(id, path);
        //console.log(">> files: ", files);
        setCurrentFiles(files ?? []);
        setCurrentPath(path);
        setCurrentTargetId(id);
    }
    const onSelectTargetFile = async (target: TargetFile) => {
        setCurrentTargetId(target.id);
        // 戻るボタン対策で、一応保存しておく
        const url = new URL(window.location.href);
        url.searchParams.set('t', target.id);
        url.searchParams.set('p', target.path);
        const state = Object.fromEntries(url.searchParams);
        window.history.pushState(state, '', url.href);
        //
        //
        onSelectTargetFile2(target.id, target.path);
    }
    const onPopState = async () => {
        console.log("> onPopState")

        const url = new URL(window.location.href);
        const targetId = url.searchParams.get("t") ?? "";
        const path = url.searchParams.get("p") || "/";
        const scrollY = url.searchParams.get("scrollY") || 0
        setCurrentTargetId(targetId);
        setCurrentPath(path);
        onReload();
        onSelectTargetFile2(targetId, path);

        // 3. データ読み込み後、一呼吸おいて（時間差で）スクロールを実行
        setTimeout(() => {
            console.log("> paint");
            if (mainRef.current) {
                mainRef.current.scrollTo({
                    top: +scrollY,
                    behavior: "auto" //"smooth" // スーッと動かしたいなら "smooth"、一瞬で移動なら "auto"
                });
            }
        }, 300); // 300ミリ秒（0.3秒）の時間差
    };
    useEffect(() => {



        window.addEventListener("popstate", onPopState);


        return () => window.removeEventListener("popstate", onPopState);

    }, []);

    useEffect(() => {
        //
        onPopState();

    }, [onReload]);


    const handleMainScroll = (e: React.UIEvent) => {
        const currentScrollY = e.currentTarget.scrollTop;

        // 1. 現在のURLオブジェクトを作成
        const currentUrl = new URL(window.location.href);

        // 2. URLの検索パラメータ（クエリ）に scrollY を直接セットする
        // ※ 整数値にするため Math.round を入れるとより安全です
        currentUrl.searchParams.set("scrollY", String(Math.round(currentScrollY)));

        // 3. 履歴の state にも同期させつつ、URL自体を書き換える
        const state = Object.fromEntries(currentUrl.searchParams);
        window.history.replaceState(state, "", currentUrl.href);
    };

    return (
        <main ref={mainRef} className="h-screen overflow-y-auto bg-slate-950 text-slate-100" onScroll={handleMainScroll}>
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
                                                <a

                                                    className="truncate font-medium text-sky-300 hover:underline"

                                                    href={`${apiServer}/download/${file.id}`}

                                                >

                                                    <div className="truncate font-medium text-slate-100">
                                                        {filename}
                                                    </div>

                                                </a>
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
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            className="inline-flex w-20 items-center justify-center rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            onClick={onReload}
                        >
                            {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Reload"}
                        </button>
                    </div>

                    <div className="mt-4 space-y-2">
                        {curretFiles.map((file) => {
                            let filename = file.path.replace(/.*\//, "")
                            //console.log("file:", file);
                            return (
                                <div
                                    key={file.id + file.path}
                                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">

                                            {file.isFile &&
                                                <a

                                                    className="truncate font-medium text-sky-300 hover:underline"

                                                    href={`${apiServer}/download/${file.id}${file.path}`}

                                                >

                                                    <div className="truncate font-medium text-slate-100">
                                                        {filename}
                                                    </div>

                                                </a>
                                            }
                                            {!file.isFile &&
                                                <div className="truncate font-medium text-slate-100" onClick={() => {
                                                    onSelectTargetFile(file);
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
            </div>
        </main>
    );
}

export {
    WebApp
};