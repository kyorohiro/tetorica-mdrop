import {
  BlobReader,
  BlobWriter,
  ERR_ENCRYPTED,
  ERR_INVALID_PASSWORD,
  HttpReader,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";
import { isCover, mimeFromPath } from "../utils";

export type ZipSource =
  | { type: "blob"; blob: Blob }
  | { type: "url"; url: string };

export type ArchiveExtractorEntry = {
  id: string,
  path: string,
  isFile: boolean,
  isDir: boolean,
  size: number,
  createdAt: number,
  modifiedAt: number,
};

export type ZipTargetFile = ArchiveExtractorEntry & {
  entry?: Entry;
  name?: string;
};

const collator = new Intl.Collator("ja", {
    numeric: true,
    sensitivity: "base",
});

export const compareByName = (a: ZipTargetFile, b: ZipTargetFile) =>
    collator.compare(a.path, b.path);

export const compareComic = (a: ZipTargetFile, b: ZipTargetFile) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    if (isCover(a.path) && !isCover(b.path)) return -1;
    if (!isCover(a.path) && isCover(b.path)) return 1;
    return compareByName(a, b);
};

export interface ArchiveExtractor {
  setPassword(password: string | undefined): void;
  list(path: string): Promise<ArchiveExtractorEntry[]>;
  read(path: string, onProgress?: (loaded: number, total: number) => void): Promise<Blob>;
}

export class ZipExtractor implements ArchiveExtractor {
  private entriesPromise?: Promise<Entry[]>;
  private password: string | undefined;
  constructor(private readonly z: ZipReader<unknown>) { }

  static createFromZipSource(source: ZipSource) {
    return new ZipExtractor(this.createZipReader(source))
  }

  private getEntriesCached(): Promise<Entry[]> {
    this.entriesPromise ??= this.z!.getEntries();
    return this.entriesPromise
  }

  setPassword(password: string | undefined): void {
    this.password = password;
  }
  async list(path: string): Promise<ArchiveExtractorEntry[]> {
    const entries = await this.getEntriesCached();
    return ZipExtractor.listZipEntriesFromEntries(entries, path);
  }

  async read(path: string, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
    const entries = await this.getEntriesCached();
    const targetPath = ZipExtractor.normalizeZipPath(path);
    const entry = entries.find(
      e => ZipExtractor.normalizeZipPath(e.filename) === targetPath
    );

    if (!entry) {
      throw new Error(`zip entry not found: ${path}`);
    }

    return ZipExtractor.getZipEntryBlob({
      id: "zip",
      path,
      isFile: !entry.directory,
      isDir: !!entry.directory,
      size: entry.uncompressedSize ?? entry.compressedSize ?? 0,
      createdAt: 0,
      modifiedAt: entry.lastModDate?.getTime?.() ?? 0,
      entry,
    }, this.password, onProgress);

  }

  //
  //
  static normalizeZipPath = (path: string) => path.trim().replace(/^\/+/, "");
  static zipApiPath = (prefix: string, name: string) => {
    if (!prefix) return `/${name}`;
    return `/${prefix}${name}`;
  };
  static createZipReader = (source: ZipSource) => {
    if (source.type === "blob") {
      return new ZipReader(new BlobReader(source.blob));
    } else {
      return new ZipReader(new HttpReader(source.url, {
        useRangeHeader: true,
        preventHeadRequest: false,
      } as any));
    }
  };
  static isZipFileEntry(entry: Entry): entry is FileEntry {
    return !entry.directory;
  }
  static async getZipEntryBlob(
    file: ZipTargetFile,
    password?: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Blob> {
    const entry = file.entry;

    if (!entry) throw new Error("zip entry is missing");
    if (!ZipExtractor.isZipFileEntry(entry)) throw new Error("zip entry is directory");

    try {
      return await entry.getData(new BlobWriter(mimeFromPath(file.path)), {
        password: password || undefined,
        onprogress: (loaded: number, total: number) => {
          onProgress?.(loaded, total);
        },
      } as any);
    } catch (error: any) {
      // エラーの型（クラス）で直接判定します
      // ★ エラーの名前（name）が特定の文字列かどうかで判定する
      console.log("> error ", error, error?.name);
      if (error?.name === ERR_ENCRYPTED || error?.name === ERR_INVALID_PASSWORD) {
        console.error("暗号化エラーをキャッチしました");
        alert("wrong password");
      } else if (`${error}`.includes(`File contains encrypted entry`)) {
        alert("wrong password");
      } else if (error) {
        alert(`${error}`)
      }
      throw error;
    }
  }
  static listZipEntriesFromEntries(
    entries: Entry[],
    dir: string
  ): ZipTargetFile[] {
    const prefixRaw = ZipExtractor.normalizeZipPath(dir).replace(/\/+$/, "");
    const prefix = prefixRaw ? `${prefixRaw}/` : "";

    const results: ZipTargetFile[] = [];
    const seenDirs = new Set<string>();

    for (const entry of entries) {
      const rawName = entry.filename.replace(/^\/+/, "");

      if (!rawName.startsWith(prefix)) continue;

      const rest = rawName.slice(prefix.length);
      if (!rest) continue;

      const slashIndex = rest.indexOf("/");

      if (slashIndex >= 0) {
        const dirName = rest.slice(0, slashIndex);
        if (!dirName || seenDirs.has(dirName)) continue;

        seenDirs.add(dirName);

        results.push({
          id: "zip",
          name: dirName,
          path: ZipExtractor.zipApiPath(prefix, dirName),
          isFile: false,
          isDir: true,
          size: 0,
          createdAt: 0,
          modifiedAt: 0,
        });

        continue;
      }

      if (entry.directory) continue;

      results.push({
        id: "zip",
        name: rest,
        path: ZipExtractor.zipApiPath(prefix, rest),
        isFile: true,
        isDir: false,
        size: entry.uncompressedSize ?? entry.compressedSize ?? 0,
        createdAt: 0,
        modifiedAt: entry.lastModDate?.getTime?.() ?? 0,
        entry,
      });
    }

    return results;
  }
}
