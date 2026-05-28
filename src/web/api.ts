
type Target = {
    id: string,
    path: string,
    isFile: boolean,
    isDir: boolean,
};

type TargetFile = {
    id: string,
    path: string,
    isFile: boolean,
    isDir: boolean,
    size: number,
    createdAt?: number,
    modifiedAt?: number,
    isRoot?: boolean,
}

type FileTargetFile = TargetFile & {
    entry?: File;
};

const getMeta = async (): Promise<{ apiServer: string }> => {
    const apiServer = window.__MDROP_CONFIG__?.apiServer;
    if (!apiServer || apiServer == "") {
        const url = new URL(window.location.href);
        return {
            apiServer: url.origin,
        }
    }
    return {apiServer:apiServer} as { apiServer: string };
};

const getDownloadList = async (): Promise<Target[]> => {

    const meta = await getMeta();
    const resp = await fetch(`${meta.apiServer}/api/downloadList`, {
        headers: {
            "X-mDrop-API-Key": window.__MDROP_CONFIG__?.apiKey ?? "",
        },
    });
    if (!resp.ok) {
        if (resp.status === 401) {
            if (!sessionStorage.getItem("mdrop_api_key_reload")) {
                sessionStorage.setItem("mdrop_api_key_reload", "1");
                alert("Session expired. Reloading now.");
                location.reload();
            }
            alert("Wrong API key. Please restart mDrop.");
            throw new Error("Wrong API key");
        }

        sessionStorage.removeItem("mdrop_api_key_reload");
        throw "";
    }
    const data = await resp.text();
    //console.log(data);
    return JSON.parse(data);
}


const getFiles = async (id: string, path: string): Promise<TargetFile[]> => {

    const meta = await getMeta();
    const resp = await fetch(
        `${meta.apiServer}/api/files?i=${encodeURIComponent(id)}&p=${encodeURIComponent(path)}`, {
        headers: {
            "X-mDrop-API-Key": window.__MDROP_CONFIG__?.apiKey ?? "",
        },
    });
    if (!resp.ok) {
        throw "";
    }
    const data = await resp.text();
    //console.log(data);
    return JSON.parse(data);
}


export {
    getDownloadList,
    getFiles,
    getMeta,
}

export type {
    Target,
    TargetFile,
    FileTargetFile
}