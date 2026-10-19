// The results module's addresses: it owns no pages or api paths of its own; its score source feeds
// the engine's daily result section (reports/compose.ts) and its fetch schedule runs in the worker.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({ name: "results" });
