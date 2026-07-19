# Installation

`pinout-gen` is a Python CLI. It needs **Python 3.9 or newer**.

## Install from the repository

Clone the repository first, and run the commands below from its root:

```bash
git clone https://github.com/xbst/PinConnect.git
cd PinConnect
```

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

## Install without cloning

`pip` can install straight from GitHub, which is convenient in CI:

```bash
pip install "git+https://github.com/xbst/PinConnect.git@master#subdirectory=pinout_gen"
```

Installing from `master` means each run picks up the latest generator, so regenerated pinouts carry the newest fixes and features — see [publishing with GitHub Pages](../pinout-embed/mkdocs-zensical.md#publishing-with-github-pages).

## Note on the `extension` extra

The package defines an optional `extension` extra (`pip install ./pinout_gen[extension]`) that adds the `markdown` library. Embedding pinouts in a docs site is handled by the separate [pinout-embed](../pinout-embed/mkdocs-zensical.md) package, so you do not need this extra for the normal workflow.
