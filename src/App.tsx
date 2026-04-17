import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      <div>Hello, World! ${greetMsg}</div>
      <button onClick={greet}>click</button>
    </main>
  );
}

export default App;
