
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
    createdAt: number,
    modifiedAt: number,
}
const getMeta = async (): Promise<{ apiServer: string }> => {
    const metaResp = await fetch("./meta.json");
    if (!metaResp.ok) {
        const url = new URL(window.location.href);
        return {
            apiServer: url.origin,
        }
    }
    const data = await metaResp.text();
    //console.log(data);
    const d = JSON.parse(data);
    //console.log(d.apiServer)
    return d as { apiServer: string };
};

const getDownloadList = async (): Promise<Target[]> => {

    const meta = await getMeta();
    const resp = await fetch(`${meta.apiServer}/api/downloadList`);
    if (!resp.ok) {
        throw "";
    }
    const data = await resp.text();
    //console.log(data);
    return JSON.parse(data);
}


const getFiles = async (id: string, path: string): Promise<TargetFile[]> => {

    const meta = await getMeta();
    const resp = await fetch(
        `${meta.apiServer}/api/files?i=${encodeURIComponent(id)}&p=${encodeURIComponent(path)}`
    );
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
   TargetFile
}