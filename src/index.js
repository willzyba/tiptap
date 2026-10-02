import { Node, mergeAttributes } from '@tiptap/core';
import { createEqnEditorDialog } from './dialog.js';
import { decodeEquation } from './loader.js';
import { domToOutputSpec } from './dom-to-output-spec.js';

var DEFAULT_EDITOR_HOST = 'fxeditor.codecogs.com';
var DEFAULT_RENDER_URL = 'https://latex.codecogs.com';

// A bare host means https; a full origin (e.g. http://localhost:8010 for local development) is used as it is.
function serverOrigin( host ) {
    return /^https?:\/\//.test( host ) ? host.replace( /\/+$/, '' ) : 'https://' + host;
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

        return [ 'img', mergeAttributes( this.options.HTMLAttributes, HTMLAttributes, {
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
                    img.src = n.attrs.src || '';
                    img.alt = n.attrs.latex || '';
                    dom.appendChild( img );
                }
            }
            render( node );

            dom.addEventListener( 'dblclick', function () {
                var dialog = createEqnEditorDialog( {
                    scriptUrl: extensionOptions.scriptUrl || ( serverOrigin( extensionOptions.server ) + '/eqneditor.api.min.js' ),
                    cssUrl: extensionOptions.cssUrl || ( serverOrigin( extensionOptions.server ) + '/eqneditor.css' ),
                    mathmlCssUrl: extensionOptions.mathmlCssUrl || ( serverOrigin( extensionOptions.server ) + '/fxtex.css' ),
                    renderUrl: extensionOptions.renderUrl,
                    licence: extensionOptions.licence,
                    design: extensionOptions.design
                } );

                dialog.open( node.attrs.latex ).then( function ( result ) {
                    if ( !result ) return;

                    var attrs = { latex: result.latex, src: null, mathml: null };
                    if ( result.mode === 'mathml' ) {
                        attrs.mathml = result.output.exportAs( 'mathml' );
                    } else {
                        attrs.src = result.output.exportAs( 'url' );
                    }

                    var pos = typeof getPos === 'function' ? getPos() : null;
                    if ( pos === null ) return;

                    editor.view.dispatch( editor.view.state.tr.setNodeMarkup( pos, undefined, attrs ) );
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

    addCommands: function () {
        var extensionOptions = this.options;
        var name = this.name;

        return {
            insertEquation: function () {
                return function ( props ) {
                    var editor = props.editor;

                    var dialog = createEqnEditorDialog( {
                        scriptUrl: extensionOptions.scriptUrl || ( serverOrigin( extensionOptions.server ) + '/eqneditor.api.min.js' ),
                        cssUrl: extensionOptions.cssUrl || ( serverOrigin( extensionOptions.server ) + '/eqneditor.css' ),
                        mathmlCssUrl: extensionOptions.mathmlCssUrl || ( serverOrigin( extensionOptions.server ) + '/fxtex.css' ),
                        renderUrl: extensionOptions.renderUrl,
                        licence: extensionOptions.licence,
                    design: extensionOptions.design
                    } );

                    dialog.open( '' ).then( function ( result ) {
                        if ( !result ) return;

                        var attrs = { latex: result.latex, src: null, mathml: null };
                        if ( result.mode === 'mathml' ) {
                            attrs.mathml = result.output.exportAs( 'mathml' );
                        } else {
                            attrs.src = result.output.exportAs( 'url' );
                        }

                        editor.chain().focus().insertContent( { type: name, attrs: attrs } ).run();
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
