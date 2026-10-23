import { loadScriptOnce, loadCssOnce, injectStyleOverridesOnce, ensureInit, applyDesign, focusEditor, addEditorControls } from './loader.js';

// Same fx wordmark used by the CKEditor 5, TinyMCE and Froala plugins.
export var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="20" viewBox="0 0 18 20">' +
    '<path d="M4,9.5H2L2.3,7h2.1l0.3-1.8C4.7,4.6,4.9,4.1,5,3.6c0.2-0.5,0.4-0.9,0.7-1.3c0.3-0.4,0.8-0.7,1.3-0.9' +
    'C7.7,1.1,8.4,1,9.2,1c0.3,0,0.6,0,0.9,0c0.3,0,0.6,0.1,0.9,0.1l-0.5,2.7c-0.2-0.1-0.3-0.1-0.5-0.2' +
    'c-0.1,0-0.3-0.1-0.5-0.1C9,3.7,8.6,3.8,8.4,4C8.1,4.2,7.9,4.7,7.8,5.4L7.6,7h2.3L9.5,9.5H7.2l-1.1,7.7H3L4,9.5z"/>' +
    '<path d="M11.1,15.3l-2.3-3.2h2.5l1.2,1.8l1.2-1.8H16l-2.2,3.2l2.6,3.6h-2.5l-1.5-2.3L10.8,19H8.4L11.1,15.3z"/>' +
    '</svg>';

var instanceCount = 0;

/**
 * One overlay per extension instance, created lazily on first use and reused across opens -
 * same reasoning as the Froala plugin, which this is closely modelled on: Tiptap has no
 * dialog API of its own either.
 *
 * The dialog is maths-view only: no LaTeX markup and no rendered-equation preview are visible
 * until asked for (the LaTeX and Inline toggles, bottom-left of the footer). "Insert as", next
 * to them, chooses what open()'s resolved value describes - MathML the editor produces
 * directly, or an <img> against the SVG rendering service.
 *
 * Returns { open(initialLatex): Promise<{latex, output, mode} | null> }, where mode is
 * 'mathml' or 'svg' (whichever "Insert as" was set to when Ok was pressed) and output is the
 * EqEditor Output instance (for outputCode(output, 'mathml' | 'url'), in loader.js). Resolves null if the
 * user cancelled.
 */
export function createEqnEditorDialog( config ) {
    var n = ++instanceCount;
    var ids = {
        overlay: 'cc-eqn-tt-overlay-' + n,
        root: 'cc-eqn-tt-' + n,
        history: 'cc-eqn-tt-history-' + n,
        toolbar: 'cc-eqn-tt-toolbar-' + n,
        mathview: 'cc-eqn-tt-mathview-' + n,
        latexInput: 'cc-eqn-tt-latex-' + n,
        output: 'cc-eqn-tt-output-' + n
    };

    var design = config.design || {};
    var apiReady = loadScriptOnce( config.scriptUrl );
    loadCssOnce( config.cssUrl );
    loadCssOnce( config.mathmlCssUrl );

    var overlay = null;
    var eqOutput = null, eqTextArea = null, eqMathView = null, eqToolbar = null;
    var mounted = false;

    function createOverlay() {
        var el = document.createElement( 'div' );
        el.className = 'cc-eqneditor-overlay';
        el.id = ids.overlay;
        el.innerHTML =
            '<div class="cc-eqneditor-modal" role="dialog" aria-modal="true" aria-label="Equation Editor">' +
                '<div class="cc-eqneditor-modal-header">' +
                    '<a href="https://editor.codecogs.com" target="_blank" rel="noopener" ' +
                       'class="cc-eqneditor-modal-logo" title="CodeCogs Equation Editor">' + LOGO_SVG + '</a>' +
                    '<span>Equation Editor</span>' +
                    '<button type="button" class="cc-eqneditor-modal-close" aria-label="Cancel">&times;</button>' +
                '</div>' +
                '<div class="cc-eqneditor-modal-body">' +
                    '<div id="' + ids.root + '" class="CCEqnEditor" data-latex="off" data-inline="off">' +
                        '<div class="CCEditorBar"><div id="' + ids.history + '" class="CCHistory"></div></div>' +
                        '<div id="' + ids.toolbar + '"></div>' +
                        '<div id="' + ids.mathview + '" class="CCMathViewHost"></div>' +
                        // Hidden until the LaTeX toggle is on.
                        '<div id="' + ids.latexInput + '" class="CCLatexInput" autocorrect="off" ' +
                             'placeholder="Write LaTeX here..."></div>' +
                        // No rendered-equation preview in the dialog any more - MathView is
                        // the whole editing surface. eqOutput still needs a DOM element to
                        // bind to (it builds the SVG URL for the "Image (SVG)" insert mode),
                        // so the element stays, just not visible.
                        '<img id="' + ids.output + '" class="CCEqnOutput-hidden" alt="">' +
                    '</div>' +
                '</div>' +
                '<div class="cc-eqneditor-modal-footer cc-eqn-bar">' +
                    '<label class="cc-switch" title="Left-align the equation instead of centring it">' +
                        '<input type="checkbox" class="cc-eqneditor-inline-toggle">' +
                        '<span class="cc-switch-track"><span class="cc-switch-knob"></span></span>' +
                        '<span class="cc-switch-label">Inline</span>' +
                    '</label>' +
                    '<label class="cc-switch" title="Show or hide the LaTeX markup">' +
                        '<input type="checkbox" class="cc-eqneditor-latex-toggle">' +
                        '<span class="cc-switch-track"><span class="cc-switch-knob"></span></span>' +
                        '<span class="cc-switch-label">LaTeX</span>' +
                    '</label>' +
                    '<div class="cc-eqn-bar-right cc-eqneditor-modal-actions">' +
                        '<select class="cc-eqneditor-insert-mode cc-eqn-select" title="How to insert the equation">' +
                            '<option value="mathml" selected>Insert MathML</option>' +
                            '<option value="svg">Insert SVG</option>' +
                        '</select>' +
                        '<button type="button" class="cc-eqn-btn cc-eqneditor-modal-cancel">Cancel</button>' +
                        '<button type="button" class="cc-eqn-btn cc-eqn-primary cc-eqneditor-modal-ok">OK</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild( el );
        return el;
    }

    function applyLatexVisible( visible ) {
        var root = document.getElementById( ids.root );
        if ( root ) root.setAttribute( 'data-latex', visible ? 'on' : 'off' );

        // Hiding the markup has to move the toolbar's target back to the maths view, and vice
        // versa, otherwise a button pressed straight afterwards inserts into a hidden pane.
        if ( eqToolbar ) eqToolbar.setActiveTextArea( visible ? eqTextArea : ( eqMathView || eqTextArea ) );
    }

    function applyInline( inline ) {
        var root = document.getElementById( ids.root );
        if ( root ) root.setAttribute( 'data-inline', inline ? 'on' : 'off' );
        if ( eqMathView ) eqMathView.setInline( inline );
        if ( eqOutput ) eqOutput.setInline( inline );
    }

    function mount() {
        if ( mounted ) return;
        mounted = true;

        eqOutput = new EqEditor.Output( ids.output );
        eqOutput.setRenderURL( config.renderUrl );

        eqTextArea = EqEditor.TextArea.link( ids.latexInput )
            .addOutput( eqOutput )
            .addHistoryMenu( new EqEditor.History( ids.history ) );

        eqToolbar = EqEditor.Toolbar.link( ids.toolbar, design.toolbar || 'default', design.toolbarScale || 1 ).addTextArea( eqTextArea );

        var latexToggle = document.querySelector( '#' + ids.overlay + ' .cc-eqneditor-latex-toggle' );

        if ( typeof EqEditor.MathView !== 'undefined' ) {
            eqMathView = EqEditor.MathView.link( ids.mathview ).addTextArea( eqTextArea );
            eqToolbar.addMathView( eqMathView );
        } else {
            // Without a maths view the markup is the only thing to edit in - force it visible
            // and lock the toggle so it cannot be switched to an empty pane.
            applyLatexVisible( true );
            latexToggle.checked = true;
            latexToggle.disabled = true;
        }

        latexToggle.addEventListener( 'change', function ( e ) { applyLatexVisible( e.target.checked ); } );

        document.querySelector( '#' + ids.overlay + ' .cc-eqneditor-inline-toggle' )
            .addEventListener( 'change', function ( e ) { applyInline( e.target.checked ); } );

        addEditorControls( document.getElementById( ids.root ), design, { textArea: eqTextArea, mathView: eqMathView, output: eqOutput,
            latexToggle: latexToggle, inlineToggle: document.querySelector( '#' + ids.overlay + ' .cc-eqneditor-inline-toggle' ) } );
        applyDesign( document.getElementById( ids.root ), design, latexToggle,
            document.querySelector( '#' + ids.overlay + ' .cc-eqneditor-insert-mode' ) );
    }

    return {
        open: function ( initialLatex ) {
            return new Promise( function ( resolve ) {
                if ( !overlay ) overlay = createOverlay();
                overlay.classList.add( 'cc-eqneditor-open' );

                var okBtn = overlay.querySelector( '.cc-eqneditor-modal-ok' );
                var cancelBtn = overlay.querySelector( '.cc-eqneditor-modal-cancel' );
                var closeBtn = overlay.querySelector( '.cc-eqneditor-modal-close' );
                var modeSelect = overlay.querySelector( '.cc-eqneditor-insert-mode' );

                function finish( result ) {
                    overlay.classList.remove( 'cc-eqneditor-open' );
                    if ( eqTextArea ) eqTextArea.close();
                    resolve( result );
                }

                okBtn.onclick = function () {
                    var current = eqTextArea ? eqTextArea.getTextArea().textContent.trim() : '';
                    finish( current ? { latex: current, output: eqOutput, mode: modeSelect.value } : null );
                };
                cancelBtn.onclick = function () { finish( null ); };
                closeBtn.onclick = function () { finish( null ); };

                apiReady.then( function () { return ensureInit( config.licence ); } ).then( function () {
                    injectStyleOverridesOnce( config.cssUrl.slice( 0, config.cssUrl.lastIndexOf( '/' ) + 1 ) + 'prototypes/latinmodern-math.otf' );
                    mount();
                    eqTextArea.clear();
                    if ( initialLatex ) eqTextArea.insert( initialLatex, initialLatex.length );
                    eqTextArea.notifyOutputs();
                    focusEditor( document.getElementById( ids.root ) );
                } ).catch( function ( err ) {
                    console.error( err );
                    finish( null );
                } );
            } );
        }
    };
}
