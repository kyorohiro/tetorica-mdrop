import { invoke } from "@tauri-apps/api/core";

type SharedFileInfo = {
    id: string;
    name: string;
    path: string;
    url: string;
};

type ServerStatus = {
    running: boolean;
    port?: number | null;
    url?: string | null;
    ips?: string[] | null;
    isHttps?: boolean | null;
    localOnly?: boolean | null;
    id?: string | null;
    password?: string | null;
    hostname?: string | null;
};

type BonjourStatus = {
    running: boolean;
    service_name?: string | null;
    service_type?: string | null;
    port?: number | null;
};

type StartServerReq = {
    hostname: string;
    port: string;
    id: string;
    password: string;
    isHttps: boolean;
    localOnly: boolean;
};

type WebMdropConfig = {
    apikey?: string | null;
};

const startServer = async (req: StartServerReq): Promise<ServerStatus> => {
    return await invoke<ServerStatus>("start_server", { req });
};

const stopServer = async (): Promise<ServerStatus> => {
    return await invoke<ServerStatus>("stop_server");
};

const getServerStatus = async (): Promise<ServerStatus> => {
    return await invoke<ServerStatus>("get_server_status");
};

const startBonjour = async (): Promise<BonjourStatus> => {
    return await invoke<BonjourStatus>("start_bonjour");
};

const stopBonjour = async (): Promise<BonjourStatus> => {
    return await invoke<BonjourStatus>("stop_bonjour");
};

const getBonjourStatus = async (): Promise<BonjourStatus> => {
    return await invoke<BonjourStatus>("get_bonjour_status");
};

const unshareAllFiles = async (): Promise<void> => {
    await invoke("unshare_all_files");
};

const shareFile = async (path: string): Promise<SharedFileInfo> => {
    return await invoke<SharedFileInfo>("share_file", {
        req: { path },
    });
};

const unshareFileById = async (id: string): Promise<void> => {
    await invoke("unshare_file", {
        req: { id },
    });
};

const getWebMdropConfig = async (): Promise<WebMdropConfig> => {
    return await invoke<WebMdropConfig>("get_web_mdrop_config");
};

const updateWebMdropConfig = async (): Promise<void> => {
    const mdropConfig = getWebMdropConfig();
    const serverStatus = await getServerStatus();

    if (!window.__MDROP_CONFIG__) {
        window.__MDROP_CONFIG__ = {}
    }
    window.__MDROP_CONFIG__.apiServer = `${serverStatus.isHttps ? "https://" : "http://"}localhost:${serverStatus.port}`;
    window.__MDROP_CONFIG__.apiKey = `${(await mdropConfig).apikey}`;
    console.log(window.__MDROP_CONFIG__)
}
export {
    startServer,
    stopServer,
    getServerStatus,
    startBonjour,
    stopBonjour,
    getBonjourStatus,
    unshareAllFiles,
    shareFile,
    unshareFileById,
    getWebMdropConfig,
    updateWebMdropConfig
};

export type {
    SharedFileInfo,
    ServerStatus,
    BonjourStatus,
    StartServerReq,
    WebMdropConfig,
};