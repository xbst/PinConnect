# pinout-embed

`pinout-embed` is a Python-Markdown extension for MkDocs / Zensical sites. It lets you drop a generated pinout into a page with an image-style tag, which it replaces at build time with a responsive `<iframe>`.

It only handles embedding. Produce the pinout HTML first with [pinout-gen](../pinout-gen/generating-html.md).

## Install

From the repository root:

```bash
pip install ./pinout_embed
```

If you build your site in a virtual environment, install it into that same environment so MkDocs can find it.

## Enable the extension

Add it to `markdown_extensions` in your `mkdocs.yml`. It relies on the standard `attr_list` extension to read the tag attributes, so enable both:

```yaml
markdown_extensions:
  - attr_list
  - pinout_embed
```

Zensical uses the same Python-Markdown pipeline; add the same two entries to its Markdown extensions configuration.

## Embed a pinout

Use image syntax pointing at your generated HTML, with `type=application/pinout`:

```markdown
![Board Pinout](../path/to/board.pinout.html){ type=application/pinout style="min-height:60vh;width:100%" }
```

At build time the extension turns that into an `<iframe>` that loads the HTML. Details:

- The **path** is resolved like any other asset in your docs, relative to the page.
- The **alt text** (`Board Pinout` above) becomes the iframe's `title` for tooltips and screen readers.
- The **`style`** attribute is passed straight through. If you omit it, the default is `min-height:60vh;width:100%`.
- The iframe is set to `loading="lazy"` and `allowfullscreen`.

Only images tagged `type=application/pinout` are affected; ordinary images pass through untouched.

## Place the files so the site serves them

MkDocs copies non-Markdown files under `docs/` into the built site. Put the generated HTML **and its board image** inside your docs tree and reference the HTML by a path relative to the page.

Because the pinout HTML links its board image by relative path, keep the two together. For example:

```
docs/
├── boards.md
└── pinouts/
    ├── board.pinout.html
    └── board.png
```

Referenced from `docs/boards.md`:

```markdown
![Board Pinout](pinouts/board.pinout.html){ type=application/pinout }
```

A convenient way to keep this in sync is to point `pinout-gen -o` directly at your docs tree when generating:

```bash
pinout-gen board.toml -o docs/pinouts/board.pinout.html
```

Just remember to copy the board image next to it.

## Troubleshooting

- **The tag renders as a plain image / broken image.** The extension is not active. Confirm both `attr_list` and `pinout_embed` are in `markdown_extensions` and that `pinout-embed` is installed in the environment running MkDocs.
- **The iframe is empty or shows a broken image inside.** The HTML path is wrong, or the board image is not next to the HTML in the built site. Check the path relative to the page and that the image was copied along with the HTML.
