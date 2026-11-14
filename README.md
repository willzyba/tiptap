# @codecogs/fxeditor-tiptap

[fxEditor](https://fxeditor.codecogs.com), CodeCogs' LaTeX equation editor, as a
[Tiptap](https://tiptap.dev) node extension. Authors build an equation in a maths view or as
LaTeX, and it goes into the document as MathML or as an image.

Full documentation, a live example and a design tool:
**[fxplugins.codecogs.com/docs/tiptap.html](https://fxplugins.codecogs.com/docs/tiptap.html)**

Tiptap is headless - it has no toolbar and no dialog system, unlike CKEditor 5, TinyMCE and
Froala. This package ships raw ESM source for your own bundler (Vite, webpack, ...) to consume,
the same way the CKEditor 5 plugin does, and supplies its own small modal dialog (see
[Why this extension draws its own dialog](#why-this-extension-draws-its-own-dialog)) - but the
**toolbar button is yours to build**. The extension only exposes a command for it to call.

## Install

```bash
npm install @codecogs/fxeditor-tiptap
```

## Use

```js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EqnEditor } from '@codecogs/fxeditor-tiptap';
import '@codecogs/fxeditor-tiptap/eqneditor.css';

const editor = new Editor({
    element: document.querySelector('#editor'),
    extensions: [
        StarterKit,
        EqnEditor.configure({
            server: 'fxtex.codecogs.com',
            licence: 'fx_pk_your-key-here',     // from the licence manager
            design: { colour: '#0f7a4d' }       // optional
        })
    ]
});

myToolbarButton.addEventListener('click', () => {
    editor.commands.insertEquation();
});
```

`insertEquation()` opens the dialog and returns immediately - like Tiptap's own file-upload
examples, the actual insert happens later, once the user has written an equation and pressed
Ok. It always returns `true`; whether anything landed in the document depends on what the user
does next, not on whether the command could run.

Double-click an existing equation to edit it again.

## Options

Passed to `EqnEditor.configure({ ... })`:

| Option | Default | Meaning |
|---|---|---|
| `server` | `'fxtex.codecogs.com'` | Where the equation editor is loaded from - or your own fxTeX Server. A bare host means https. |
| `licence` | `''` | Your fxEditor licence key. Without one, equations show why they cannot render. |
| `design` | `{}` | How the editor looks - toolbar, colour, sizes, the predictor. Build one with the design tool on the [documentation page](https://fxplugins.codecogs.com/docs/tiptap.html#customise). |
| `renderUrl` | `'https://latex.codecogs.com'` | The service that draws equations inserted as images. |
| `scriptUrl` | derived from `server` | Full URL of the equation editor's script, when the default path does not suit. |
| `cssUrl` | derived from `server` | Full URL of the equation editor's stylesheet. |
| `mathmlCssUrl` | derived from `server` | The MathML stylesheet loaded into the editing view. |
| `HTMLAttributes` | `{}` | Extra attributes merged onto an inserted `<img>` (MathML has no `src`/`alt` to attach them to). |

### MathML needs a stylesheet on the page that displays it

Browsers' own MathML does not cover everything the converter produces, so a page that displays
MathML equations needs this line - the same file fxTeX ships:

```html
<link rel="stylesheet" href="https://fxtex.codecogs.com/fxtex.css">
```

The extension loads it into the editing view for you; it cannot add it to the page that
finally displays the content, because that page is yours, not the editor's.

### Tiptap's schema and `<math>`

Unlike TinyMCE, nothing needs configuring here: this extension's own node type is what
produces the `<math>` markup, and Tiptap only ever serialises what a node's own `renderHTML`
returns - there is no separate allow-list to update, and no way for `<math>` content to arrive
except through this node.

## What gets written into the page

An equation goes in as MathML or as an image - the dialog's *Insert* menu, whose starting choice
is `design.insertAs` (`'mathml'` or `'svg'`). Either can be reopened by double-clicking it, because the node's `latex` attribute always carries the source they were
written from - see [`getHTML()`/`getJSON()`](https://tiptap.dev/docs/editor/api/editor) for how
to read that attribute back out programmatically, e.g. for search or export.

## Why this extension draws its own dialog

Tiptap is headless by design, so - like the Froala plugin - this extension opens a small modal
of its own rather than assuming any particular host UI framework. `eqneditor.css` is only that
frame; the equation editor inside it is styled by the stylesheet loaded from `cssUrl`.

## Testing

`npm test` runs the extension against a real Tiptap/ProseMirror instance (via `jsdom`, not a
mock of either) and checks that `renderHTML`/`parseHTML` round-trip correctly for both images
and MathML. It does not exercise the dialog or double-click NodeView wiring, since
those need EqEditor's API bundle loaded from the network.
