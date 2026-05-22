import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Loader, Folder, File } from "lucide-react";
import { getDownloadList, getFiles, getMeta, Target, TargetFile } from "./api";
import { downloadUrl, usePreviewDialog } from "./usePreviewDialog";

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

///
const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function WebApp() {
    const [errorMsg,] = useState<string>("");
    const [sharedTargets, setSharedTargets] = useState<Target[]>([]);
    const [, setCurrentTargetId] = useState<string>();
    const [, setCurrentPath] = useState<string>();
    const [currentFiles, setCurrentFiles] = useState<TargetFile[]>([])
    const [apiServer, setApiServer] = useState("");
    const [loading, setLoading] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const { showPreviewDialog } = usePreviewDialog();
    const [sort, setSort] = useState<"name" | "modifiedAt" | "comic">("comic")
    //const [current

    const sortedCurrentFiles = useMemo(() => {

        const next = [...currentFiles];

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

        return next;

    }, [currentFiles, sort]);
    //
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
        await onReload();
        await onSelectTargetFile2(targetId, path);

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


    const handleMainScroll = () => {
        if (!mainRef.current) {
            return;
        }
        const currentScrollY = mainRef.current!.scrollTop;

        // 1. 現在のURLオブジェクトを作成
        const currentUrl = new URL(window.location.href);

        // 2. URLの検索パラメータ（クエリ）に scrollY を直接セットする
        // ※ 整数値にするため Math.round を入れるとより安全です
        currentUrl.searchParams.set("scrollY", String(Math.round(currentScrollY)));

        // 3. 履歴の state にも同期させつつ、URL自体を書き換える
        const state = Object.fromEntries(currentUrl.searchParams);
        console.log("currentScrollY ", currentScrollY)
        window.history.replaceState(state, "", currentUrl.href);
    };

    return (
        <main ref={mainRef} className="h-screen overflow-y-auto bg-slate-950 text-slate-100">
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

                            onClick={onReload}

                        >

                            {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Reload"}

                        </button>

                    </div>

                    <div className="mt-4 space-y-2">
                        {sortedCurrentFiles.map((file) => {
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

                                                    //href={`${apiServer}/download/${file.id}${file.path}`}
                                                    onClick={async () => {
                                                        if (file.isFile && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file.path)) {
                                                            const previewFiles = sortedCurrentFiles.map((v) => v);
                                                            /*.filter((f) =>

                                                                true//f.isFile && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f.path)

                                                            );*/

                                                            const index = previewFiles.findIndex((f) => f.path === file.path);

                                                            await showPreviewDialog({

                                                                files: previewFiles,

                                                                initialIndex: index,

                                                                apiServer,

                                                            });
                                                        } else {
                                                            await handleMainScroll();
                                                            await sleep(10);
                                                            window.location.href = downloadUrl(apiServer, file);
                                                        }
                                                    }}
                                                >

                                                    <div className="flex items-start gap-2 font-medium text-slate-100">
                                                        <File className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                                                        <span className="min-w-0 break-all text-cyan-50">
                                                            {filename}
                                                        </span>
                                                    </div>

                                                </a>
                                            }
                                            {!file.isFile &&
                                                <div className="flex items-start gap-2 font-medium text-slate-100" onClick={async () => {
                                                    await handleMainScroll();
                                                    await onSelectTargetFile(file);
                                                }}>
                                                    <Folder className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                                    <span className="min-w-0 break-all text-amber-50">
                                                        {filename}
                                                    </span>
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