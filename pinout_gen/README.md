# pinout-gen

**Renamed to `pinconnect`.** The command line and the designer are now one tool, installed from the repository root:

```bash
pip install "git+https://github.com/xbst/PinConnect.git@master"
pinconnect board.toml -i      # render a board (same output as pinout-gen board.toml -i)
pinconnect                    # open the visual designer
```

This folder stays so that old install lines keep working, including `#subdirectory=pinout_gen` URLs and `pinout-gen @ ...` lines in requirements files. Installing it installs `pinconnect` and keeps the `pinout-gen` command and the `pinout_gen` import name, with the same behavior as before. It will not be removed, but new setups should install `pinconnect` directly.

See the [PinConnect README](../README.md) for usage.
