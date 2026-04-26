import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

//import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useDialog } from "./useDialog";

type ServerStatus = {
  running: boolean;
  port?: number | null;
  url?: string | null;
  ips?: string[] | null;
};

type BonjourStatus = {
  running: boolean;
  service_name?: string | null;
  service_type?: string | null;
  port?: number | null;
};

type SharedFileInfo = {
  id: string;
  name: string;
  path: string;
  url: string;
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
  //  const [greetMsg, setGreetMsg] = useState("");
  const [serverStatus, setServerStatus] =
    useState<ServerStatus>(initialServerStatus);
  const [bonjourStatus, setBonjourStatus] =
    useState<BonjourStatus>(initialBonjourStatus);
  const [errorMsg, setErrorMsg] = useState("");
  const [sharedFiles, setSharedFiles] = useState<SharedFileInfo[]>([]);
  //
  const [hostname, setHostname] = useState("tetorica-mdrop.local");
  const [port, setPort] = useState("7878");
  const dialog = useDialog();
  const [localOnly, setLocalOnly] = useState(true);

  async function sharePaths(paths: string[]) {
    try {
      setErrorMsg("");

      for (const path of paths) {
        const file = await invoke<SharedFileInfo>("share_file", {
          req: { path },
        });

        setSharedFiles((prev) => [file, ...prev]);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg(String(e));
    }
  }

  async function selectFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
    });

    if (!selected) {
      return;
    }

    const paths = Array.isArray(selected) ? selected : [selected];
    await sharePaths(paths);
  }

  async function callCommand<T>(
    command: string,
    onSuccess: (ret: T) => void,
    args?: any
  ): Promise<void> {
    try {
      setErrorMsg("");
      const ret = await invoke<T>(command, args);
      console.log(command, ret);
      onSuccess(ret);
    } catch (e) {
      console.error(command, e);
      setErrorMsg(String(e));
      throw e;
    }
  }

  //async function greet() {
  //  try {
  //    setErrorMsg("");
  //    const msg = await invoke<string>("greet", { name: "n" });
  //    setGreetMsg(msg);
  //  } catch (e) {
  //    setErrorMsg(String(e));
  //  }
  //}

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlistenPromise = appWindow.onDragDropEvent(async (event) => {
      console.log(event);

      if (event.payload.type !== "drop") {
        return;
      }

      const paths = event.payload.paths;
      console.log(paths);

      await sharePaths(paths);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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

        {
          //<section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          //  <h2 className="mb-3 text-lg font-semibold">Greeting</h2>
          //  <p className="mb-4 rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
          //    {greetMsg || "No greeting yet."}
          //  </p>
          //  <Button onClick={greet}>Greet</Button>
          //</section>
        }

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Shared Files</h2>

          <button
            type="button"
            onClick={selectFiles}
            className="mt-4 w-full rounded-xl border border-dashed border-slate-600 bg-slate-950 p-6 text-center text-sm text-slate-300 transition hover:border-sky-400 hover:bg-slate-900"
          >
            Drop files here, or click to select files
          </button>

          <div className="mt-4 space-y-2">
            {sharedFiles.map((file) => (
              <div
                key={file.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
              >
                <div className="font-medium text-slate-100">{file.name}</div>
                <a
                  className="break-all text-sky-300 underline underline-offset-4"
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {file.url}
                </a>
              </div>
            ))}
          </div>
        </section>
        <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Server</h2>
            <Badge active={serverStatus.running} />
          </div>

          <div className="space-y-2">
            <StatusRow label="Running" value={serverStatus.running ? "Yes" : "No"} />
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
                  </a>
                ) : (
                  "-"
                )
              }
            />
            <StatusRow
              label="IP"
              value={
                (serverStatus.ips ?? []).join(",")
              }
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                if (!hostname.endsWith(".local")) {
                  dialog.showConfirmDialog({
                    title: "Failed to start",
                    body: "require hostname ends with .local",
                  })
                  return;
                }
                try {
                  await callCommand<ServerStatus>("start_server", setServerStatus, {
                    req: {
                      hostname,
                      port,
                    },
                  })
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
                }
              }
              }
              disabled={serverStatus.running}
            >
              Start
            </Button>
            <Button
              onClick={async () => {
                //
                try {
                  await callCommand<ServerStatus>("stop_server", setServerStatus)
                  await callCommand<BonjourStatus>("stop_bonjour", setBonjourStatus)
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
                }
              }
              }
              disabled={!serverStatus.running}
              variant="secondary"
            >
              Stop
            </Button>
            <Button
              onClick={async () => {
                try {
                  await callCommand<ServerStatus>("get_server_status", setServerStatus)
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
                }
              }
              }
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
              onClick={async () => {
                try {
                  await callCommand<BonjourStatus>("start_bonjour", setBonjourStatus)
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
                }
              }
              }
              disabled={!serverStatus.running || bonjourStatus.running}
            >
              Start Bonjour
            </Button>
            <Button
              onClick={async () => {
                try {
                  await callCommand<BonjourStatus>("stop_bonjour", setBonjourStatus)
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
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
                  await callCommand<BonjourStatus>(
                    "get_bonjour_status",
                    setBonjourStatus,
                  )
                } catch (e) {
                  dialog.showConfirmDialog({
                    title: "Error",
                    body: `${e}`
                  })
                }
              }
              }
              variant="ghost"
            >
              Bonjour Status
            </Button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
            <div className="mb-1 text-slate-400">Bonjour URL</div>
            <code className="break-all text-sky-300">
              http://{hostname}:{port}/
            </code>
            {
              //<code className="break-all text-sky-300">
              //  http://tetorica-mdrop.local:7878/
              //</code>
            }
          </div>
        </section>
        {
          //
          //
          //
        }
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
                  placeholder="tetorica-mdrop.local"
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
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setLocalOnly(enabled);
                    await invoke("set_local_only", { enabled });
                  }}
                />
                <span className="text-slate-300">Local only</span>
              </label>

              <p className="text-xs text-slate-500">
                Allow access only from local/private network addresses.
              </p>
              <p className="text-xs text-slate-500">
                Default: tetorica-mdrop.local:7878
              </p>
            </div>
            {

            }
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
    <button className={`${base} ${variants[variant]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default App;