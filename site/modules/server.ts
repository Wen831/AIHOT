// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import { showcaseServer } from "@aihot/showcase/server";
import { lexiconGuardServer } from "@aihot/lexicon-guard/server";

export const SERVER_MODULES: readonly ServerModule[] = [showcaseServer, lexiconGuardServer];
