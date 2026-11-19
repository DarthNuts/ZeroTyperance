import { LcgRng } from "../../../rng.js";
import { NewGameSession } from "./newgame.js";
import { DemoRun } from "./demo_run.js";
import { CharselCore } from "../../charsel/core.js";
import { VideoModel, Plane } from "../model.js";
import { LevelStartScreen } from "../../start/screen.js";
import { BriefingCore } from "../../briefing/core.js";
import { PauseScreenImpl } from "../../pause/core.js";
export const STATE_CLASSES: readonly (abstract new (...a: never[]) => unknown)[] = [LcgRng, NewGameSession, DemoRun, CharselCore, VideoModel, Plane, LevelStartScreen, BriefingCore, PauseScreenImpl];
