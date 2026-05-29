import heic2any from "heic2any";

export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

export const supportedExtensions = [
    // Images
    "png", "jpg", "jpeg", "webp", "gif", "svg", "avif", 
    //
    "heic", "heif",

    // Videos
    "mp4", "m4v", "webm", "ogv", "mov",

    // Audio
    "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus",

    // Documents
    "pdf", "epub",

    // Archives / Comic
    "zip", "cbz",

    // Text / Code
    "txt", "md", "markdown", "json", "html", "css", "js", "jsx",
    "ts", "tsx", "xml", "rs", "toml", "yaml", "yml", "sql",
    "sh", "py", "java", "c", "cpp", "h",
];
export const mimeFromPath = (path: string): string => {
    const lower = path.toLowerCase();

    if (/\.(png)$/i.test(lower)) return "image/png";
    if (/\.(jpe?g)$/i.test(lower)) return "image/jpeg";
    if (/\.(webp)$/i.test(lower)) return "image/webp";
    if (/\.(gif)$/i.test(lower)) return "image/gif";
    if (/\.(svg)$/i.test(lower)) return "image/svg+xml";
    if (/\.(avif)$/i.test(lower)) return "image/avif";
    //
    if (/\.(heic)$/i.test(lower)) return "image/heic";
    if (/\.(heif)$/i.test(lower)) return "image/heif";

    if (/\.(mp4|m4v)$/i.test(lower)) return "video/mp4";
    if (/\.(webm)$/i.test(lower)) return "video/webm";
    if (/\.(ogv)$/i.test(lower)) return "video/ogg";
    if (/\.(mov)$/i.test(lower)) return "video/quicktime";

    if (/\.(mp3)$/i.test(lower)) return "audio/mpeg";
    if (/\.(wav)$/i.test(lower)) return "audio/wav";
    if (/\.(ogg|oga)$/i.test(lower)) return "audio/ogg";
    if (/\.(m4a)$/i.test(lower)) return "audio/mp4";
    if (/\.(aac)$/i.test(lower)) return "audio/aac";
    if (/\.(flac)$/i.test(lower)) return "audio/flac";
    if (/\.(opus)$/i.test(lower)) return "audio/opus";

    if (/\.(pdf)$/i.test(lower)) return "application/pdf";

    if (/\.(json)$/i.test(lower)) return "application/json";
    if (/\.(html)$/i.test(lower)) return "text/html; charset=utf-8";
    if (/\.(css)$/i.test(lower)) return "text/css; charset=utf-8";
    if (/\.(js|jsx|ts|tsx)$/i.test(lower)) return "text/javascript; charset=utf-8";
    if (/\.(md|markdown|txt|xml|rs|toml|yaml|yml|sql|sh|py|java|c|cpp|h)$/i.test(lower)) {
        return "text/plain; charset=utf-8";
    }
    if (/\.(epub)$/i.test(lower)) return "application/epub+zip";
    if (/\.(zip|cbz)$/i.test(lower)) return "application/zip";

    return "application/octet-stream";
};

export const isImage = (path: string) =>
    mimeFromPath(path).startsWith("image/");

export function isHeic(path: string, type?: string) {
  const p = path.toLowerCase();
  return (
    p.endsWith(".heic") ||
    p.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif"
  );
}

export const isVideo = (path: string) =>
    mimeFromPath(path).startsWith("video/");

export const isAudio = (path: string) =>
    mimeFromPath(path).startsWith("audio/");

export const isPdf = (path: string) =>
    mimeFromPath(path) === "application/pdf";

export const isText = (path: string) =>
    mimeFromPath(path).startsWith("text/") ||
    mimeFromPath(path) === "application/json";

export const isEpub = (path: string) =>
    mimeFromPath(path) === "application/epub+zip";

//export const isZipLike = (path: string) => /\.(zip|cbz)$/i.test(path);
export const isArchive = (path: string) =>
    /\.(zip|cbz|rar|cbr)$/i.test(path);

export const isCover = (path: string) => {
    const name = path.replace(/.*\//, "");
    return /^(cover|表紙|hyoushi|000)\.(png|jpe?g|webp|gif|svg|avif)$/i.test(name);
};


export async function makeBlobFromUrl(url: string) {
    try {
        // データを取ってくる
        const response = await fetch(url);

        // Blobに変換する
        const blob = await response.blob();

        return blob;
    } catch (error) {
        console.error(error);
        throw error;
    }
}


export type FileWithRelativePath = File & { webkitRelativePath?: string };

export async function getDroppedFiles(
    ev: React.DragEvent
): Promise<FileWithRelativePath[]> {
    const files: FileWithRelativePath[] = [];

    async function readEntry(entry: any, prefix = ""): Promise<void> {
        if (entry.isFile) {
            await new Promise<void>((resolve, reject) => {
                entry.file((file: File) => {
                    const relativePath = `${prefix}${file.name}`;

                    Object.defineProperty(file, "webkitRelativePath", {
                        value: relativePath,
                        configurable: true,
                    });

                    files.push(file as FileWithRelativePath);
                    resolve();
                }, reject);
            });
            return;
        }

        if (entry.isDirectory) {
            const dirPrefix = `${prefix}${entry.name}/`;
            const reader = entry.createReader();

            while (true) {
                const entries: any[] = await new Promise((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                });

                if (entries.length === 0) break;

                for (const child of entries) {
                    await readEntry(child, dirPrefix);
                }
            }
        }
    }

    const items = Array.from(ev.dataTransfer.items ?? []);

    // await 前に entry / file を確保しておく
    const entriesOrFiles = items
        .map((item) => {
            const entry = (item as any).webkitGetAsEntry?.();
            if (entry) {
                return { type: "entry" as const, entry };
            }

            const file = item.getAsFile?.();
            if (file) {
                return { type: "file" as const, file };
            }

            return null;
        })
        .filter(Boolean);

    for (const item of entriesOrFiles) {
        if (!item) continue;

        if (item.type === "entry") {
            try {
                await readEntry(item.entry, "");
            } catch (e) {
                console.error("readEntry failed:", item.entry?.name, e);
            }
        } else {
            files.push(item.file as FileWithRelativePath);
        }
    }

    return files;
}

export async function heicToObjectUrl(file: Blob) {
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  const blob = Array.isArray(converted) ? converted[0] : converted;
  return URL.createObjectURL(blob);
}