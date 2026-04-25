import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type ServerStatus = {
  running: boolean;
  port?: number | null;
  url?: string | null;
};

type BonjourStatus = {
  running: boolean;
  service_name?: string | null;
  service_type?: string | null;
  port?: number | null;
};

function App() {
  const [greetMsg, setGreetMsg] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name: "n" }));
  }

  async function startServer(): Promise<ServerStatus> {
    const ret = await invoke<ServerStatus>("start_server");
    console.log(ret);
    return ret;
  }

  async function stopServer(): Promise<ServerStatus> {
    const ret = await invoke<ServerStatus>("stop_server");
    console.log(ret);
    return ret;
  }

  async function getServerStatus(): Promise<ServerStatus> {
    const ret = await invoke<ServerStatus>("get_server_status");
    console.log(ret);
    return ret;
  }

  async function startBonjour(): Promise<BonjourStatus> {
    const ret = await invoke<BonjourStatus>("start_bonjour");
    console.log(ret);
    return ret;
  }

  async function stopBonjour(): Promise<BonjourStatus> {
    const ret = await invoke<BonjourStatus>("stop_bonjour");
    console.log(ret);
    return ret;
  }

  async function getBonjourStatus(): Promise<BonjourStatus> {
    const ret = await invoke<BonjourStatus>("get_bonjour_status");
    console.log(ret);
    return ret;
  }

  return (
    <main className="container">
      <h3># Greeting</h3>
      <div>
        <div>Hello, World! {greetMsg}</div>
        <button onClick={greet}>click</button>
      </div>

      <h3># Server</h3>
      <div>
        <button onClick={startServer}>Start</button>
        <button onClick={stopServer}>Stop</button>
        <button onClick={getServerStatus}>Status</button>
      </div>

      <h3># Bonjour</h3>
      <div>
        <button onClick={startBonjour}>Start Bonjour</button>
        <button onClick={stopBonjour}>Stop Bonjour</button>
        <button onClick={getBonjourStatus}>Bonjour Status</button>
      </div>
    </main>
  );
}

export default App;