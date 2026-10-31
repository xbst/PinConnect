# pinout-embed

**Moved to [md-iframe](https://github.com/xbst/md-iframe).** The Markdown extension now lives in its own repository and embeds any HTML page, not only pinouts:

```bash
pip install "git+https://github.com/xbst/md-iframe.git@master"
```

```yaml
markdown_extensions:
  - attr_list
  - md_iframe
```

This folder stays so that old install lines keep working, including `#subdirectory=pinout_embed` URLs and `pinout-embed @ ...` lines in requirements files. Installing it installs md-iframe, and existing sites build unchanged: `- pinout_embed` still loads the extension, `pinout_embed:PinoutExtension` still imports, and `{ type=application/pinout }` tags still embed. It will not be removed, but new setups should install md-iframe directly.
