# pinout-embed

A Python-Markdown extension for embedding PinConnect pinouts in MkDocs / Zensical sites. It replaces an image-style tag with a responsive `<iframe>` at build time.

```bash
pip install ./pinout_embed
```

Enable it (with `attr_list`) in `mkdocs.yml`:

```yaml
markdown_extensions:
  - attr_list
  - pinout_embed
```

Then embed a generated pinout:

```markdown
![Board Pinout](board.pinout.html){ type=application/pinout style="min-height:60vh;width:100%" }
```

**Usage:** see [docs/pinout-embed/mkdocs-zensical.md](../docs/pinout-embed/mkdocs-zensical.md).
