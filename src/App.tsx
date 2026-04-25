import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";


type ServerStatus = {
  running: boolean;
  port?: number | null;
  url?: string | null;
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


  return (
    <main className="container">
      <h3># Greeting</h3>
      <p>
        <div>Hello, World! ${greetMsg}</div>
        <button onClick={greet}>click</button>
      </p>

      <h3># Server</h3>
      <p>
        <div></div>
        <button onClick={startServer}>Start</button>
        <div></div>
        <button onClick={stopServer}>Stop</button>
        <div></div>
        <button onClick={getServerStatus}>Status</button>

      </p>
    </main>
  );
}


export default App;
