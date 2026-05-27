import ReactDOM from "react-dom/client";

import { DialogProvider } from "../useDialog";
import { PortableApp } from "./PortableApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <DialogProvider>
      <PortableApp/>
    </DialogProvider>
);
