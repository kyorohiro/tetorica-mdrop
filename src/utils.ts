export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

export const supportedExtensions = [
  // Images
  "png", "jpg", "jpeg", "webp", "gif", "svg", "avif",

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