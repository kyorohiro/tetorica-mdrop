import {
  BlobReader,
  BlobWriter,
  TextReader,
  //Uint8ArrayReader,
  ZipWriter,
} from "@zip.js/zip.js";

type FileTargetFile = {
  path: string;
  entry?: File;
};

export async function getPortableHtmlText() {
  let respPortable = await fetch("./portable.html");
  return await respPortable.text();
}

export async function getUnrarWasm() {
  let respPortable = await fetch("./unrar.wasm");
  return await respPortable.blob()
}

export async function getReadmeEn() {
  let respPortable = await fetch("./ReadMe_en.txt");
  return await respPortable.text();
}

export async function getReadmeJp() {
  let respPortable = await fetch("./ReadMe_jp.txt");
  return await respPortable.text();
}

export async function buildPortablePackage(
  allFiles: FileTargetFile[],
  portableHtmlText: string,
  unrarWasmBlob: Blob,
  readmeEn: string,
  readmeJp: string,
): Promise<Blob> {

  //
  // 1. create data.zip
  //
  const dataZipWriter = new ZipWriter(
    new BlobWriter("application/zip")
  );

  for (const file of allFiles) {
    if (!file.entry) continue;

    await dataZipWriter.add(
      file.path,
      new BlobReader(file.entry)
    );
  }

  const dataZipBlob = await dataZipWriter.close();

  //
  // 2. create index.html
  //
  const indexHtml = portableHtmlText.replace(
    "INIT_DATA_OFF",
    "INIT_DATA_ON"
  );

  //
  // 3. create release.zip
  //
  const releaseZipWriter = new ZipWriter(
    new BlobWriter("application/zip")
  );

  await releaseZipWriter.add(
    "ReadMe_en.txt",
    new TextReader(readmeEn)
  );
  await releaseZipWriter.add(
    "ReadMe_jp.txt",
    new TextReader(readmeJp)
  );
  //
  // add index.html
  //
  await releaseZipWriter.add(
    "index.html",
    new TextReader(indexHtml)
  );

  //
  // add data.zip
  //
  await releaseZipWriter.add(
    "data.zip",
    new BlobReader(dataZipBlob)
  );

  //
  // add unrar.wasm
  //
  await releaseZipWriter.add(
    "unrar.wasm",
    new BlobReader(unrarWasmBlob)
  );

  //
  // finalize
  //
  const releaseZipBlob = await releaseZipWriter.close();

  return releaseZipBlob;
}