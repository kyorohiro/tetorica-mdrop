import { useEffect, useState } from "react";
import "./App.css";

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useDialog } from "./useDialog";
import { QRCodeSVG } from "qrcode.react";

import {
  type SharedFileInfo,
  type ServerStatus,
  type BonjourStatus,
  shareFile,
  unshareFileById,
  unshareAllFiles,
  startServer,
  stopServer,
  getServerStatus,
  startBonjour,
  stopBonjour,
  getBonjourStatus,
  updateWebMdropConfig,
} from "./tauriInvoker";

type ReceivedMessage = {
  from: string;
  method: string;
  text: string;
};

const initialServerStatus: ServerStatus = {
  running: false,
  port: null,
  url: null,
};

const initialBonjourStatus: BonjourStatus = {
  running: false,
  service_name: null,
  service_type: null,
  port: null,
};

function App() {
  const [serverStatus, setServerStatus] =
    useState<ServerStatus>(initialServerStatus);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [bonjourStatus, setBonjourStatus] =
    useState<BonjourStatus>(initialBonjourStatus);
  const [errorMsg, setErrorMsg] = useState("");
  const [sharedFiles, setSharedFiles] = useState<SharedFileInfo[]>([]);

  const [hostname, setHostname] = useState("mdrop.local");
  const [port, setPort] = useState("7878");
  const dialog = useDialog();
  const [localOnly, setLocalOnly] = useState(true);
  const [isHttps, setIsHttps] = useState(false);

  const [_, setReceivedMessages] = useState<ReceivedMessage[]>([]);

  const bonjureRootUrl = () => {
    return (isHttps ? "https" : "http") + `://${hostname}:${port}/`;
  };

  const ipRootUrl = () => {
    return serverStatus.url ?? "";
  };

  const rootUrl = () => {
    return bonjourStatus.running ? bonjureRootUrl() : ipRootUrl();
  };

  async function sharePaths(paths: string[]) {
    try {
      //
      // サーバは自動で起動
      if (!serverStatus.running) {
        let _serverStatus = await onStartServer();
        if(_serverStatus.running) {
          await onStartBonjure();
        } else {
          await dialog.showConfirmDialog({
            title: `Server Not Running! ${serverStatus.running}`,
            body: "Please start the server before dropping files or folders.",
          });
          return;
        }
      }

      setErrorMsg("");

      for (const path of paths) {
        const file = await shareFile(path);
        setSharedFiles((prev) => [file, ...prev]);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg(String(e));
    }
  }

  async function unshareSharedFile(id: string) {
    try {
      setErrorMsg("");

      await unshareFileById(id);

      setSharedFiles((prev) => prev.filter((file) => file.id !== id));
    } catch (e) {
      console.error(e);
      setErrorMsg(String(e));
      dialog.showConfirmDialog({
        title: "Error",
        body: `${e}`,
      });
    }
  }

  async function selectFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    await sharePaths(paths);
  }

  async function selectFolders() {
    const selected = await open({
      multiple: true,
      directory: true,
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    await sharePaths(paths);
  }

  function removeSharedFile(id: string) {
    unshareSharedFile(id);
  }

  async function clearSharedFiles() {
    try {
      setErrorMsg("");
      await unshareAllFiles();
      setSharedFiles([]);
    } catch (e) {
      console.error(e);
      setErrorMsg(String(e));
      dialog.showConfirmDialog({
        title: "Error",
        body: `${e}`,
      });
    }
  }

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlistenPromise = appWindow.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;

      const paths = event.payload.paths;
      await sharePaths(paths);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [serverStatus]);

  useEffect(() => {
    const unlistenPromise = listen<ReceivedMessage>(
      "message-received",
      (event) => {
        setReceivedMessages((prev) => [event.payload, ...prev].slice(0, 100));
        dialog.showConfirmDialog({
          title: "Received Message",
          body: `${event.payload.text} \r\n from ${event.payload.from} (${event.payload.method})`,
        });
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const onStartServer = async (): Promise<ServerStatus> => {
    if (!hostname.endsWith(".local")) {
      dialog.showConfirmDialog({
        title: "Failed to start",
        body: "require hostname ends with .local",
      });
      return serverStatus;
    }

    try {
      setErrorMsg("");
      const status = await startServer({
        hostname,
        port,
        id: "mdrop",
        password,
        isHttps,
        localOnly,
      });
      await updateWebMdropConfig();

      setServerStatus(status);
      return status;
    } catch (e) {
      setErrorMsg(String(e));
      dialog.showConfirmDialog({
        title: "Error",
        body: `${e}`,
      });
      return serverStatus;
    }
  };

  const onStartBonjure = async () => {
    try {
      setErrorMsg("");
      setBonjourStatus(await startBonjour());
    } catch (e) {
      setErrorMsg(String(e));
      dialog.showConfirmDialog({
        title: "Error",
        body: `${e}`,
      });
    }
  };
  return (
    <main className="h-screen overflow-y-auto bg-slate-950 text-slate-100">
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
                {sharedFiles.length}
              </span>
            </h2>

            {sharedFiles.length > 0 && (
              <button
                type="button"
                onClick={clearSharedFiles}
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={selectFiles}
              className="rounded-xl border border-dashed border-slate-600 bg-slate-950 p-6 text-center text-sm text-slate-300 transition hover:border-sky-400 hover:bg-slate-900"
            >
              Drop files here, or click to add files
            </button>

            <button
              type="button"
              onClick={selectFolders}
              className="rounded-xl border border-dashed border-slate-600 bg-slate-950 p-6 text-center text-sm text-slate-300 transition hover:border-sky-400 hover:bg-slate-900"
            >
              Drop folders here, or click to add folders
            </button>
          </div>

          {sharedFiles.map((file) => {
            const urlPath = new URL(file.url).pathname;
            const displayUrl =
              rootUrl().replace(/\/$/, "") + "/" + urlPath.replace(/^\//, "");

            return (
              <div
                key={file.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-100">
                      {file.name}
                    </div>
                    <a
                      className="break-all text-sky-300 underline underline-offset-4"
                      href={displayUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {displayUrl}
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSharedFile(file.id)}
                    className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Server</h2>
            <Badge active={serverStatus.running} />
          </div>

          <div className="space-y-2">
            <StatusRow
              label="Running"
              value={serverStatus.running ? "Yes" : "No"}
            />
            <StatusRow label="Port" value={serverStatus.port ?? "-"} />
            <StatusRow
              label="URL"
              value={
                serverStatus.url ? (
                  <a
                    className="text-sky-300 underline underline-offset-4 hover:text-sky-200"
                    href={serverStatus.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {serverStatus.url}
                    <QRCodeSVG value={serverStatus.url} size={180} level="M" />
                  </a>
                ) : (
                  "-"
                )
              }
            />
            <StatusRow label="IP" value={(serverStatus.ips ?? []).join(",")} />
            <StatusRow label="ID" value={"mdrop"} />
            <StatusRow
              label="Password"
              value={
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 read-only:opacity-50"
                    type={passwordVisible ? "text" : "password"}
                    readOnly={serverStatus.running}
                    value={password || ""}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => setPasswordVisible((v) => !v)}
                  >
                    {passwordVisible ? "Hide" : "Preview"}
                  </button>
                </div>
              }
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => onStartServer()}
              disabled={serverStatus.running}
            >
              Start
            </Button>

            <Button
              onClick={async () => {
                try {
                  setErrorMsg("");
                  setServerStatus(await stopServer());
                  setBonjourStatus(await stopBonjour());
                } catch (e) {
                  setErrorMsg(String(e));
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`,
                  });
                }
              }}
              disabled={!serverStatus.running}
              variant="secondary"
            >
              Stop
            </Button>

            <Button
              onClick={async () => {
                try {
                  setErrorMsg("");
                  setServerStatus(await getServerStatus());
                } catch (e) {
                  setErrorMsg(String(e));
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`,
                  });
                }
              }}
              variant="ghost"
            >
              Status
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Bonjour</h2>
            <Badge active={bonjourStatus.running} />
          </div>

          <div className="space-y-2">
            <StatusRow
              label="Running"
              value={bonjourStatus.running ? "Yes" : "No"}
            />
            <StatusRow label="Name" value={bonjourStatus.service_name ?? "-"} />
            <StatusRow label="Type" value={bonjourStatus.service_type ?? "-"} />
            <StatusRow label="Port" value={bonjourStatus.port ?? "-"} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => onStartBonjure()}
              disabled={!serverStatus.running || bonjourStatus.running}
            >
              Start Bonjour
            </Button>

            <Button
              onClick={async () => {
                try {
                  setErrorMsg("");
                  setBonjourStatus(await stopBonjour());
                } catch (e) {
                  setErrorMsg(String(e));
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`,
                  });
                }
              }}
              disabled={!bonjourStatus.running}
              variant="secondary"
            >
              Stop Bonjour
            </Button>

            <Button
              onClick={async () => {
                try {
                  setErrorMsg("");
                  setBonjourStatus(await getBonjourStatus());
                } catch (e) {
                  setErrorMsg(String(e));
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`,
                  });
                }
              }}
              variant="ghost"
            >
              Bonjour Status
            </Button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
            <div className="mb-1 text-slate-400">Bonjour URL</div>
            <code className="break-all text-sky-300">
              <a
                className="text-sky-300 underline underline-offset-4 hover:text-sky-200"
                href={bonjureRootUrl()}
                target="_blank"
                rel="noreferrer"
              >
                <QRCodeSVG value={bonjureRootUrl()} size={180} level="M" />
                {isHttps ? "https" : "http"}://{hostname}:{port}/
              </a>
            </code>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-slate-200">
              Advanced
            </summary>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Host name</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 read-only:opacity-50"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="mdrop.local"
                  readOnly={serverStatus.running}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Port</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 read-only:opacity-50"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="7878"
                  inputMode="numeric"
                  readOnly={serverStatus.running}
                />
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  checked={localOnly}
                  onChange={(e) => {
                    if (serverStatus.running) return;
                    setLocalOnly(e.target.checked);
                  }}
                  readOnly={serverStatus.running}
                />
                <span className="text-slate-300">Local only</span>
              </label>

              <p className="text-xs text-slate-500">
                Allow access only from local/private network addresses.
              </p>
              <p className="text-xs text-slate-500">
                Default: tetorica-mdrop.local:7878
              </p>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  checked={isHttps}
                  onChange={(e) => {
                    if (serverStatus.running) return;
                    setIsHttps(e.target.checked);
                  }}
                  readOnly={serverStatus.running}
                />
                <span className="text-slate-300">Use Https</span>
              </label>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-sm">
      <div className="text-slate-400">{label}</div>
      <div className="break-all text-slate-100">{value}</div>
    </div>
  );
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs font-medium",
        active
          ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
          : "bg-slate-700/60 text-slate-300 ring-1 ring-slate-600",
      ].join(" ")}
    >
      {active ? "Running" : "Stopped"}
    </span>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base =
    "rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

  const variants = {
    primary: "bg-sky-500 text-white hover:bg-sky-400",
    secondary: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    ghost:
      "border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800",
  };

  return (
    <button
      className={`${base} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default App;