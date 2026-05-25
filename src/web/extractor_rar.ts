//
// RAR
//
import {
  createExtractorFromData,
  type Extractor,
} from "node-unrar-js";

import {
  type ArchiveExtractor,
  type ArchiveExtractorEntry,
  type ZipSource,
} from "./extractor";

import { mimeFromPath } from "../utils";

type UnrarExtractor = Extractor<Uint8Array>;

export class RarExtractor implements ArchiveExtractor {
  private dataPromise?: Promise<Uint8Array>;
  private password: string | undefined;

  constructor(private readonly source: ZipSource) {}

  static createFromZipSource(source: ZipSource) {
    return new RarExtractor(source);
  }

  setPassword(password: string | undefined): void {
    this.password = password;
  }

  private getData(): Promise<Uint8Array> {
    this.dataPromise ??= (async () => {
      const blob =
        this.source.type === "blob"
          ? this.source.blob
          : await fetch(this.source.url).then((r) => r.blob());

      return new Uint8Array(await blob.arrayBuffer());
    })();

    return this.dataPromise;
  }

  private async createExtractor(): Promise<UnrarExtractor> {
    const data = await this.getData();

    return await createExtractorFromData({
      data,
      password: this.password,
    } as any);
  }

  async list(path: string): Promise<ArchiveExtractorEntry[]> {
    const extractor = await this.createExtractor();
    const list = extractor.getFileList();

    const headers = [...list.fileHeaders] as any[];

    return RarExtractor.listRarEntriesFromHeaders(headers, path);
  }

  async read(
    path: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Blob> {
    const extractor = await this.createExtractor();
    const targetPath = RarExtractor.normalizeRarPath(path);

    const extracted = extractor.extract({
      files: [targetPath],
    } as any);

    const files = [...extracted.files] as any[];

    const file = files.find(
      (f) =>
        RarExtractor.normalizeRarPath(f.fileHeader?.name ?? "") === targetPath
    );

    if (!file) {
      console.log("targetPath", targetPath);
      console.log(
        "extracted files",
        files.map((f) => f.fileHeader?.name)
      );

      throw new Error(`rar entry not found: ${path}`);
    }

    const data = file.extraction;

    if (!data) {
      throw new Error(`rar entry extraction failed: ${path}`);
    }

    onProgress?.(data.length, data.length);

    return new Blob([data], {
      type: mimeFromPath(path),
    });
  }

  static normalizeRarPath = (path: string) =>
    path.trim().replace(/^\/+/, "").replace(/\\/g, "/");

  static rarApiPath = (prefix: string, name: string) => {
    if (!prefix) return `/${name}`;
    return `/${prefix}${name}`;
  };

  static isDirectoryHeader(header: any): boolean {
    return !!header.flags?.directory || !!header.directory;
  }

  static listRarEntriesFromHeaders(
    headers: any[],
    dir: string
  ): ArchiveExtractorEntry[] {
    const prefixRaw = RarExtractor.normalizeRarPath(dir).replace(/\/+$/, "");
    const prefix = prefixRaw ? `${prefixRaw}/` : "";

    const results: ArchiveExtractorEntry[] = [];
    const seenDirs = new Set<string>();

    for (const header of headers) {
      const rawName = RarExtractor.normalizeRarPath(header.name ?? "");

      if (!rawName.startsWith(prefix)) continue;

      const rest = rawName.slice(prefix.length);
      if (!rest) continue;

      const slashIndex = rest.indexOf("/");

      if (slashIndex >= 0) {
        const dirName = rest.slice(0, slashIndex);

        if (!dirName || seenDirs.has(dirName)) continue;

        seenDirs.add(dirName);

        results.push({
          id: "rar",
          path: RarExtractor.rarApiPath(prefix, dirName),
          isFile: false,
          isDir: true,
          size: 0,
          createdAt: 0,
          modifiedAt: 0,
        });

        continue;
      }

      if (RarExtractor.isDirectoryHeader(header)) continue;

      results.push({
        id: "rar",
        path: RarExtractor.rarApiPath(prefix, rest),
        isFile: true,
        isDir: false,
        size: Number(header.unpSize ?? header.size ?? 0),
        createdAt: 0,
        modifiedAt: header.time ? new Date(header.time).getTime() : 0,
      });
    }

    return results;
  }
}