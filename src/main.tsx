import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WebApp } from "./web/WebApp"; // パスは実際に合わせる
import { DialogProvider } from "./useDialog";
import "./App.css";

type Tab = "drop" | "viewer";

function Root() {
  const [tab, setTab] = useState<Tab>("drop");

  return (
    <DialogProvider>
      <main className="h-screen overflow-y-auto bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-5 flex gap-2 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              className={`flex-1 rounded-lg px-4 py-2 text-sm ${tab === "drop"
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-800"
                }`}
              onClick={() => setTab("drop")}
            >
              Drop
            </button>

            <button
              className={`flex-1 rounded-lg px-4 py-2 text-sm ${tab === "viewer"
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-800"
                }`}
              onClick={() => setTab("viewer")}
            >
              Viewer
            </button>
          </div>

          <div className={tab === "drop" ? "block" : "hidden"}>
            <App />
          </div>

          <div className={tab === "viewer" ? "block" : "hidden"}>
            <WebApp active={tab === "viewer"}/>
          </div>
        </div>
      </main>
    </DialogProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);