# vendor/z80 - Z80 CPU core

- Upstream: https://github.com/superzazu/z80 (Nicolas Allemand), commit `e841ed4`.
- Licence: MIT - see `LICENSE` in this folder.
- Used by `render_audio.c` to run the game's Z80 sound driver, read from your own ROM image.

## Local modification

| file | change |
|---|---|
| `z80.c`, `exec_opcode_cb` | `BIT y,(HL)` no longer writes the byte back (`&& x_ != 1`). A real Z80 does not store on `BIT`; the spurious write hit the YM2612 status port at 0x4000 and corrupted the next data write. Invisible on plain RAM, so zexdoc/zexall still pass. |
