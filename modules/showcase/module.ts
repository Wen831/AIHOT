// The showcase module's addresses: it owns a participation mode and its items sit in the engine's
// own feed (/all?category=github) and detail pages, so it declares no pages or api paths of its own.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({ name: "showcase" });
