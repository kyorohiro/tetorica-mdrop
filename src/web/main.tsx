import ReactDOM from "react-dom/client";

import { DialogProvider } from "../useDialog";
import { WebApp } from "./WebApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <DialogProvider>
      <WebApp/>
    </DialogProvider>
);
