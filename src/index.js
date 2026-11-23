import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { createEqnEditorDialog } from './dialog.js';
import { decodeEquation, outputCode, texOf, texAround, texPieces, injectTexStylesOnce, loadScriptOnce, ensureInit } from './loader.js';
import { domToOutputSpec } from './dom-to-output-spec.js';

var DEFAULT_EDITOR_HOST = 'https://fxtex.codecogs.com';
var DEFAULT_RENDER_URL = 'https://fxtex.codecogs.com';

// A bare host means https; a full origin (e.g. http://localhost:8010 for local development) is used as it is.
function serverOrigin( host ) {
    return /^https?:\/\//.test( host ) ? host.replace( /\/+$/, '' ) : 'https://' + host;
}

// The dialog, set up from the extension's options.
function dialogFor( options ) {
    return createEqnEditorDialog( {
        scriptUrl: options.scriptUrl || ( serverOrigin( options.server ) + '/fxeditor.api.min.js' ),
        cssUrl: options.cssUrl || ( serverOrigin( options.server ) + '/fxeditor.css' ),
        mathmlCssUrl: options.mathmlCssUrl,
        renderUrl: options.renderUrl,
        licence: options.licence,
        design: options.design
    } );
}

// What the dialog's result puts in the document: for "Insert as LaTeX", the LaTeX as text fxTeX
// Pro typesets where the page is shown ($...$ inline, $$...$$ not); otherwise an equation node.
function contentOf( result, type ) {
    if ( result.mode === 'latex' ) return type.schema.text( texOf( result.latex, result.inline ) );
    var attrs = { latex: result.latex, src: null, mathml: null };
    if ( result.mode === 'mathml' ) attrs.mathml = outputCode( result.output, 'mathml' );
    else attrs.src = outputCode( result.output, 'url' );
    return type.create( attrs );
}

// Puts the dialog's result in place of from-to, as one step. Text keeps the marks (bold and so on)
// of what it replaces.
function replaceWith( editor, from, to, result, type ) {
    var state = editor.view.state;
    var content = contentOf( result, type );
    var tr = content.isText ? state.tr.insertText( content.text, from, to ) : state.tr.replaceWith( from, to, content );
    editor.view.dispatch( tr );
    editor.commands.focus();
}

var TEX_KEY = new PluginKey( 'ccTexAsMaths' );

/**
 * LaTeX in the text - $...$ and $$...$$, as fxTeX reads them on the page that shows the content -
 * shown as the maths it is while it is edited (design.latexAsMaths, on unless set false). The
 * document is not touched: the maths is a decoration drawn in place of the LaTeX, which stays in
 * the document as text and is what getHTML() gives. Put the cursor inside one (the arrow keys
 * reach it) and its LaTeX shows instead, to edit by hand; double-click it for the equation editor.
 */
function texAsMathsPlugin( options ) {
    var ready = false, starting = false, cache = {};

    function mathmlOf( tex ) {
        var key = ( tex.display ? 'D' : 'I' ) + tex.latex;
        if ( !( key in cache ) ) {
            var mathml = '';
            try { mathml = EqEditor.Output.latexToMathML( tex.latex, true, !tex.display ); } catch ( e ) { mathml = ''; }
            // Without fxTeX Pro (no licence), its error: the LaTeX is shown instead.
            cache[ key ] = mathml && mathml.indexOf( '<merror' ) === -1 ? mathml : '';
        }
        return cache[ key ];
    }

    // fxTeX Pro is loaded when there is first LaTeX to show, and the decorations drawn again then.
    function start( view ) {
        if ( starting ) return;
        starting = true;
        var scriptUrl = options.scriptUrl || ( serverOrigin( options.server ) + '/fxeditor.api.min.js' );
        loadScriptOnce( scriptUrl ).then( function () { return ensureInit( options.licence ); } ).then( function () {
            ready = true;
            if ( !view.isDestroyed ) view.dispatch( view.state.tr.setMeta( TEX_KEY, 'ready' ) );
        } ).catch( function () {} );
    }

    return new Plugin( {
        key: TEX_KEY,
        view: function ( view ) {
            injectTexStylesOnce();
            if ( view.state.doc.textContent.indexOf( '$' ) !== -1 ) start( view );
            return {
                update: function ( view ) {
                    if ( !starting && view.state.doc.textContent.indexOf( '$' ) !== -1 ) start( view );
                }
            };
        },
        props: {
            decorations: function ( state ) {
                if ( !ready ) return null;
                var decorations = [], selection = state.selection;
                var codeMark = state.schema.marks.code;
                state.doc.descendants( function ( node, pos ) {
                    if ( !node.isTextblock ) return true;
                    if ( node.type.spec.code ) return false;
                    // An equation node or anything else not text takes one place, as in the document.
                    var text = node.textBetween( 0, node.content.size, null, '\ufffc' );
                    if ( text.indexOf( '$' ) === -1 ) return false;
                    var at = pos + 1;
                    texPieces( text ).forEach( function ( piece ) {
                        var from = at, to = at + piece.text.length;
                        at = to;
                        if ( !piece.tex ) return;
                        // Being edited by hand - the cursor or selection inside it: its LaTeX shows.
                        if ( selection.from < to && selection.to > from &&
                            !( selection.empty && ( selection.from === from || selection.from === to ) ) ) return;
                        if ( codeMark && state.doc.rangeHasMark( from, to, codeMark ) ) return;
                        var mathml = mathmlOf( piece.tex );
                        if ( !mathml ) return;
                        var display = piece.tex.display;
                        decorations.push( Decoration.widget( from, function () {
                            var span = document.createElement( 'span' );
                            span.className = display ? 'cc-tex cc-tex-display' : 'cc-tex';
                            span.setAttribute( 'contenteditable', 'false' );
                            span.innerHTML = mathml;
                            return span;
                        }, { side: -1, key: 'cc-tex:' + piece.text, ignoreSelection: true } ) );
                        decorations.push( Decoration.inline( from, to, { class: 'cc-tex-source' } ) );
                    } );
                    return false;
                } );
                return DecorationSet.create( state.doc, decorations );
            }
        }
    } );
}

/**
 * Parses one of EqEditor's rendering URLs (the four codecogs.com equation-image endpoints)
 * back into the LaTeX that produced it - used when loading or pasting in content this
 * extension did not itself just create, e.g. content saved before this plugin was added.
 */
function latexFromRenderUrl( src ) {
    var match = ( src || '' ).match( /(gif|svg|png)\.(image|latex)\?(.*)/ );
    return match ? decodeEquation( match[ 3 ] ) : '';
}

function mathmlToOutputSpec( mathmlHtml ) {
    var div = document.createElement( 'div' );
    div.innerHTML = mathmlHtml;
    var mathEl = div.firstElementChild;
    return mathEl ? domToOutputSpec( mathEl ) : [ 'math', {} ];
}

/**
 * The CodeCogs Equation Editor as a Tiptap node extension.
 *
 * Tiptap has no toolbar or dialog system of its own - the host application builds its own UI
 * and calls editor commands - so this extension exposes one command, `insertEquation()`, for a
 * host's own toolbar button to call, and handles the dialog and double-click-to-edit itself
 * (see dialog.js). Add it to your extensions list:
 *
 *   import { EqnEditor } from '@codecogs/fxeditor-tiptap';
 *   import '@codecogs/fxeditor-tiptap/eqneditor.css';
 *
 *   const editor = new Editor({
 *       extensions: [ StarterKit, EqnEditor.configure({ showLatex: false }) ]
 *   });
 *
 *   myToolbarButton.onclick = () => editor.commands.insertEquation();
 *
 * insertEquation() is asynchronous inside (it opens the dialog and waits for the user), but -
 * like Tiptap's own image-upload examples - returns synchronously and inserts later, once the
 * user presses Ok. It always returns true: whether anything actually landed in the document
 * depends on what the user does next, not on whether the command could run.
 */
export var EqnEditor = Node.create( {
    name: 'eqnEditorEquation',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,

    addOptions: function () {
        return {
            server: DEFAULT_EDITOR_HOST,
            renderUrl: DEFAULT_RENDER_URL,
            scriptUrl: null,
            cssUrl: null,
            mathmlCssUrl: null,
            // Passed straight to EqEditor.init() - an empty licence is the normal, expected
            // state until a real one is configured, not a required option.
            licence: '',
            // How the editor looks - toolbar rows and scale, colour, sizes; see the README.
            design: {},
            HTMLAttributes: {}
        };
    },

    addAttributes: function () {
        // renderHTML below places each of these explicitly, in whichever one of the three
        // output shapes 'insertAs' calls for - so all three opt out of Tiptap's default
        // behaviour of also writing every attribute onto the element as its own HTML
        // attribute (which would otherwise leak a stray latex="..." onto the <img>).
        var noAutoRender = function () { return {}; };

        return {
            latex: { default: '', renderHTML: noAutoRender },
            // Set only in 'url' mode - the <img> src the equation was last rendered to.
            src: { default: null, renderHTML: noAutoRender },
            // Set only in 'mathml' mode - the exact MathML (plus its speech wrapper) EqEditor
            // produced, stored verbatim rather than regenerated on every render so that
            // rendering this node never depends on EqEditor being loaded.
            mathml: { default: null, renderHTML: noAutoRender }
        };
    },

    parseHTML: function () {
        return [
            {
                tag: 'img[src*="codecogs.com/svg.image"]',
                getAttrs: function ( el ) {
                    return { latex: el.getAttribute( 'alt' ) || latexFromRenderUrl( el.getAttribute( 'src' ) ), src: el.getAttribute( 'src' ) };
                }
            },
            {
                tag: 'img[src*="codecogs.com/png.image"]',
                getAttrs: function ( el ) {
                    return { latex: el.getAttribute( 'alt' ) || latexFromRenderUrl( el.getAttribute( 'src' ) ), src: el.getAttribute( 'src' ) };
                }
            },
            {
                tag: 'img[src*="codecogs.com/gif.latex"]',
                getAttrs: function ( el ) {
                    return { latex: el.getAttribute( 'alt' ) || latexFromRenderUrl( el.getAttribute( 'src' ) ), src: el.getAttribute( 'src' ) };
                }
            },
            {
                tag: 'img[src*="codecogs.com/png.latex"]',
                getAttrs: function ( el ) {
                    return { latex: el.getAttribute( 'alt' ) || latexFromRenderUrl( el.getAttribute( 'src' ) ), src: el.getAttribute( 'src' ) };
                }
            },
            {
                tag: 'math[title]',
                getAttrs: function ( el ) {
                    return { latex: ( el.getAttribute( 'title' ) || '' ).trim(), mathml: el.outerHTML };
                }
            }
        ];
    },

    renderHTML: function ( props ) {
        var node = props.node;
        var HTMLAttributes = props.HTMLAttributes;

        if ( node.attrs.mathml ) {
            return mathmlToOutputSpec( node.attrs.mathml );
        }

        // class="fxtex", as every inserted equation has: a site sizes them all with one rule.
        return [ 'img', mergeAttributes( this.options.HTMLAttributes, HTMLAttributes, {
            class: 'fxtex',
            src: node.attrs.src || '',
            alt: node.attrs.latex || ''
        } ) ];
    },

    // The live editing view. Separate from renderHTML (which is what editor.getHTML() uses)
    // so that double-click-to-edit can live here without affecting what actually gets saved.
    addNodeView: function () {
        var extensionOptions = this.options;

        return function ( props ) {
            var node = props.node;
            var getPos = props.getPos;
            var editor = props.editor;

            var dom = document.createElement( 'span' );
            dom.className = 'cc-eqneditor-node';

            function render( n ) {
                if ( n.attrs.mathml ) {
                    dom.innerHTML = n.attrs.mathml;
                } else {
                    dom.innerHTML = '';
                    var img = document.createElement( 'img' );
                    img.className = 'fxtex';
                    img.src = n.attrs.src || '';
                    img.alt = n.attrs.latex || '';
                    dom.appendChild( img );
                }
            }
            render( node );

            dom.addEventListener( 'dblclick', function () {
                // Inline or not, as it was: an inline image's URL starts its LaTeX with \inline, and
                // MathML not inline has no display="block".
                var inline = node.attrs.mathml ? !/<math\b[^>]*\sdisplay="block"/.test( node.attrs.mathml )
                    : /\.image\?(\\|%5C)inline\b/i.test( node.attrs.src || '' );
                dialogFor( extensionOptions ).open( node.attrs.latex, node.attrs.mathml ? 'mathml' : 'svg', inline ).then( function ( result ) {
                    if ( !result ) return;

                    var pos = typeof getPos === 'function' ? getPos() : null;
                    if ( pos === null || pos === undefined ) return;

                    replaceWith( editor, pos, pos + node.nodeSize, result, node.type );
                } );
            } );

            return {
                dom: dom,
                update: function ( updatedNode ) {
                    if ( updatedNode.type.name !== node.type.name ) return false;
                    node = updatedNode;
                    render( node );
                    return true;
                }
            };
        };
    },

    addProseMirrorPlugins: function () {
        var design = this.options.design || {};
        return design.latexAsMaths === false ? [] : [ texAsMathsPlugin( this.options ) ];
    },

    addStorage: function () {
        return { onDoubleClick: null };
    },

    // Double-click LaTeX in the text, as "Insert as LaTeX" puts it, to edit it: the $...$ or
    // $$...$$ round where the double-click landed is the equation, and OK replaces it.
    onCreate: function () {
        var editor = this.editor;
        var options = this.options;
        var type = editor.schema.nodes[ this.name ];

        this.storage.onDoubleClick = function ( e ) {
            if ( e.target && e.target.closest && e.target.closest( '.cc-eqneditor-node' ) ) return;
            var view = editor.view;
            var at = view.posAtCoords( { left: e.clientX, top: e.clientY } );
            if ( !at ) return;
            var $pos = view.state.doc.resolve( at.pos );
            var block = $pos.parent;
            if ( !block.isTextblock ) return;
            // An equation node, or anything else that is not text, counts as one character, as
            // it takes one place in the document.
            var text = block.textBetween( 0, block.content.size, null, '\ufffc' );
            var found = texAround( text, $pos.parentOffset );
            if ( !found ) return;

            var from = $pos.start() + found.start, to = $pos.start() + found.end;
            var was = text.slice( found.start, found.end );
            e.preventDefault();
            // The word the double-click selected is in this page, as the dialog is: left selected,
            // the dialog's own editing area put the equation into it, not itself.
            var selection = view.dom.ownerDocument.getSelection();
            if ( selection ) selection.removeAllRanges();

            dialogFor( options ).open( found.latex, 'latex', !found.display ).then( function ( result ) {
                if ( !result ) return;
                // Not if the text has changed under it since.
                if ( to > editor.state.doc.content.size || editor.state.doc.textBetween( from, to, null, '\ufffc' ) !== was ) return;
                replaceWith( editor, from, to, result, type );
            } );
        };
        editor.view.dom.addEventListener( 'dblclick', this.storage.onDoubleClick );
    },

    onDestroy: function () {
        if ( this.storage.onDoubleClick && this.editor.view && this.editor.view.dom ) {
            this.editor.view.dom.removeEventListener( 'dblclick', this.storage.onDoubleClick );
        }
    },

    addCommands: function () {
        var extensionOptions = this.options;
        var name = this.name;

        return {
            insertEquation: function () {
                return function ( props ) {
                    var editor = props.editor;

                    dialogFor( extensionOptions ).open( '' ).then( function ( result ) {
                        if ( !result ) return;

                        if ( result.mode === 'latex' ) {
                            editor.chain().focus().insertContent( { type: 'text', text: texOf( result.latex, result.inline ) } ).run();
                        } else {
                            editor.chain().focus().insertContent( contentOf( result, editor.schema.nodes[ name ] ).toJSON() ).run();
                        }
                    } );

                    // Handled synchronously; the insert itself happens later, once the user
                    // has actually written an equation - see the module doc above.
                    return true;
                };
            }
        };
    }
} );

export default EqnEditor;
