// Point d'entrée du banc d'écoute (tools/audio-lab) : expose le module audio sur window.
import * as A from '../../src/game/audio/index';
import { SFX_DEFS } from '../../src/game/audio/Sfx';
(window as unknown as Record<string, unknown>).SCAudio = { ...A, SFX_DEFS };
