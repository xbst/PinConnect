# pinout-gen: Installation

`pinout-gen` is a Python CLI. It needs **Python 3.9 or newer**.

## Install from the repository

Using a virtual environment is recommended so the tool and its dependencies stay isolated, but it is optional.

**PowerShell**

```powershell
python -m venv venv
./venv/Scripts/activate
pip install .\pinout_gen
```

**Linux / macOS**

```bash
python3 -m venv venv
source venv/bin/activate
pip install ./pinout_gen
```

On Python versions older than 3.11 this also pulls in `tomli` (the TOML parser); on 3.11+ the standard-library `tomllib` is used and nothing extra is installed.

## Verify

```bash
pinout-gen --help
```

If you see the usage message, you are ready to [generate HTML](generating-html.md).

## Editable install (for development)

If you plan to modify the generator, install it in editable mode so code changes take effect without reinstalling:

```bash
pip install -e ./pinout_gen
```

## Note on the `extension` extra

The package defines an optional `extension` extra (`pip install ./pinout_gen[extension]`) that adds the `markdown` library. Embedding pinouts in a docs site is handled by the separate [pinout-embed](../pinout-embed/mkdocs-zensical.md) package, so you do not need this extra for the normal workflow.
