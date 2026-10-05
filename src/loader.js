/**
 * Loads the shared EqEditor API bundle and stylesheet - the same one-download-per-URL approach
 * as the CKEditor 5, TinyMCE and Froala plugins, so multiple editors on one page (or an app
 * mounting several editors as the user navigates) never fetch it twice.
 */

var scriptPromises = {};

export function loadScriptOnce( url ) {
    if ( scriptPromises[ url ] ) return scriptPromises[ url ];

    scriptPromises[ url ] = new Promise( function ( resolve, reject ) {
        if ( typeof window !== 'undefined' && typeof window.EqEditor !== 'undefined' ) {
            resolve();
            return;
        }

        var existing = document.querySelector( 'script[src="' + url + '"]' );
        var script = existing || document.createElement( 'script' );

        script.addEventListener( 'load', function () { resolve(); } );
        script.addEventListener( 'error', function () {
            reject( new Error( 'CodeCogs Equation Editor: could not load ' + url ) );
        } );

        if ( !existing ) {
            script.src = url;
            document.head.appendChild( script );
        }
    } );

    return scriptPromises[ url ];
}

// EqEditor.init() switches the converter every TextArea/MathView/Toolbar construction takes on
// to fxTeX Pro - skip it and they keep the placeholder converter for their whole lifetime, even
// once fxeditor.api.min.js itself has loaded. Called once per page; an empty licence is the
// normal, expected state until a real one is configured.
var initPromise = null;

export function ensureInit( licence ) {
    if ( initPromise ) return initPromise;
    initPromise = ( typeof window !== 'undefined' && typeof window.EqEditor !== 'undefined' && typeof window.EqEditor.init === 'function' )
        ? window.EqEditor.init( { licence: licence || '' } ).catch( function ( err ) {
            window.console && console.warn( 'fxTeX Pro: ' + ( err && err.message || err ) );
        } )
        : Promise.resolve();
    return initPromise;
}

export function loadCssOnce( url ) {
    if ( document.querySelector( 'link[href="' + url + '"]' ) ) return;
    var link = document.createElement( 'link' );
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild( link );
}

export function decodeEquation( encoded ) {
    var latex = encoded;
    try {
        latex = decodeURIComponent( encoded );
    } catch ( e ) {
        // Not valid percent-encoding; still worth showing as it stands.
    }
    return latex.replace( /&space;/g, ' ' ).replace( /&plus;/g, '+' ).replace( /&hash;/g, '#' );
}

export function escapeHtml( s ) {
    return String( s )
        .replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
        .replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
}

// Remembers which view (maths or LaTeX markup) the author last chose, across dialog opens and
// page loads - a cookie rather than localStorage because it is one line to read without a
// helper, and every editor instance on the page shares the one preference. Every adapter in
// fxPlugins uses this exact cookie name, so the choice carries across editors too.
var LATEX_COOKIE = 'cc_eqneditor_show_latex';

export function getShowLatexPreference( fallback ) {
    var match = document.cookie.match( /(?:^|; )cc_eqneditor_show_latex=([^;]*)/ );
    return match ? match[ 1 ] === '1' : fallback;
}

export function setShowLatexPreference( visible ) {
    document.cookie = LATEX_COOKIE + '=' + ( visible ? '1' : '0' ) + '; path=/; max-age=31536000; SameSite=Lax';
}

// Gaps in the shared fxeditor.css (loaded separately, asynchronously, from the host
// configured in options) this dialog needs but can't assume it will get: editor.codecogs.com,
// the old default host and still configurable, serves an older stylesheet that predates the CCEqnEditor/
// CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror does not have this
// gap), so the maths/LaTeX mutual-exclusion is written defensively here rather than left to
// fxeditor.css. !important throughout, injected once rather than relying on load order
// against fxeditor.css: which stylesheet's rule wins would otherwise depend on which finishes
// loading last.
// The API's own injected @font-face for "Latin Modern Math" only carries
// local("Latin Modern Math") - no url() fallback - so it silently falls back to a generic
// serif unless that exact font happens to be installed. A later @font-face for the same
// family replaces the API's src list rather than merging with it, so redeclaring it here
// with a real url() fixes every equation and symbol on the page, not just this dialog's.
export function injectStyleOverridesOnce( fontUrl ) {
    if ( document.getElementById( 'cc-eqneditor-style-overrides' ) ) return;
    var style = document.createElement( 'style' );
    style.id = 'cc-eqneditor-style-overrides';
    style.textContent =
        '@font-face { font-family: "Latin Modern Math"; font-display: swap; ' +
            'src: local("Latin Modern Math"), url("' + fontUrl.replace( /prototypes\/latinmodern-math\.otf$/, 'fonts/LatinModernMath-Regular.woff2' ) + '") format("woff2"), url("' + fontUrl + '") format("opentype"); }' +
        // Undo host resets (e.g. .cke_reset_all *) inside the toolbar icons and the maths view's MathML.
        '.CCToolbar svg:has(g[font-family]), .CCToolbar svg:has(g[font-family]) * { font: revert-layer !important; }' +
        // Icons drawn as <text>: the svg gets the API's own .cc_panel font (fxTeX Toolbar, 16px) back over host resets, and each <text> its own font-size attribute (revert-layer lets attributes win).
        '.CCToolbar svg:not(:has(g[font-family])) { font: normal normal 16px "fxTeX Toolbar" !important; }' +
        '.CCToolbar svg:not(:has(g[font-family])) * { font: revert-layer !important; }' +
        '.CCToolbar svg, .CCToolbar svg * { width: revert-layer !important; height: revert-layer !important; max-width: revert-layer !important; }' +
        '.CCToolbar svg g[font-family="fxTeX Toolbar"] { color: #000 !important; }' +
        '.CCMathView math, .CCMathView math * { font: revert-layer !important; ' +
            'width: revert-layer !important; height: revert-layer !important; padding: revert-layer !important; ' +
            'margin: revert-layer !important; text-transform: revert-layer !important; text-align: revert-layer !important; ' +
            'box-sizing: revert-layer !important; white-space: revert-layer !important; }' +
        apiMathRules() +
        // The bottom bar: toggles left, Insert-as and the dialog's buttons right, one type size. All !important - host dialog resets otherwise restyle it.
        '.cc-eqn-bar { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 16px !important; flex: 0 0 auto !important; ' +
            'margin: 8px 0 0 !important; padding: 10px 0 0 !important; border: 0 !important; border-top: 1px solid #e2e8f0 !important; ' +
            'background: none !important; font: 13px/1.3 system-ui, -apple-system, "Segoe UI", Arial, sans-serif !important; color: #1c2530 !important; }' +
        '.cc-eqn-bar-right { display: flex !important; align-items: center !important; gap: 8px !important; margin: 0 0 0 auto !important; padding: 0 !important; font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-switch { display: inline-flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important; ' +
            'padding: 0 !important; font: inherit !important; color: #54647c !important; cursor: pointer !important; user-select: none !important; white-space: nowrap !important; }' +
        '.cc-eqn-bar .cc-switch input { position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; ' +
            'padding: 0 !important; border: 0 !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; opacity: 0 !important; }' +
        '.cc-eqn-bar .cc-switch-track { position: relative !important; display: inline-block !important; flex: 0 0 auto !important; width: 28px !important; ' +
            'height: 16px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 8px !important; ' +
            'background: #ccc !important; transition: background .2s !important; }' +
        '.cc-eqn-bar .cc-switch-knob { position: absolute !important; display: block !important; top: 2px !important; left: 2px !important; ' +
            'width: 12px !important; height: 12px !important; margin: 0 !important; border-radius: 50% !important; background: #fff !important; transition: left .2s !important; }' +
        '.cc-eqn-bar .cc-switch input:checked + .cc-switch-track { background: #4caf50 !important; }' +
        '.cc-eqn-bar .cc-switch input:checked + .cc-switch-track .cc-switch-knob { left: 14px !important; }' +
        '.cc-eqn-bar .cc-switch input:focus-visible + .cc-switch-track { outline: 2px solid #003794 !important; outline-offset: 2px !important; }' +
        '.cc-eqn-bar .cc-switch input:disabled ~ * { opacity: .5 !important; cursor: default !important; }' +
        '.cc-eqn-bar .cc-switch-label { font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-switch input:checked ~ .cc-switch-label { color: #003794 !important; font-weight: 600 !important; }' +
        '.cc-eqn-bar .cc-eqn-select { width: auto !important; height: 30px !important; margin: 0 !important; padding: 0 8px !important; ' +
            'border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; font: inherit !important; color: #1c2530 !important; cursor: pointer !important; }' +
        '.cc-eqn-bar .cc-eqn-btn { display: inline-flex !important; align-items: center !important; height: 30px !important; margin: 0 !important; ' +
            'padding: 0 16px !important; border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; ' +
            'font: inherit !important; color: #1c2530 !important; cursor: pointer !important; box-shadow: none !important; }' +
        '.cc-eqn-bar .cc-eqn-btn * { font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-eqn-btn.cc-eqn-primary { background: #2c7a4b !important; border-color: #2c7a4b !important; color: #fff !important; }' +
        '.cc-eqneditor-modal-footer.cc-eqn-bar { margin: 0 !important; padding: 10px 14px !important; }' +
        '.CCMathViewHost, .CCLatexInput { min-height: 220px !important; }' +
        '.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
        '.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }' +
        '.CCEqnEditor[data-inline="on"] .CCMathViewHost { justify-content: flex-start !important; }';
    document.head.appendChild( style );
}

// The `design` option (see the README): how the editor looks, set by the site rather than the
// author. The toolbar's rows and scale go to Toolbar.link() itself; everything else is applied
// here, once the editor is mounted - CSS scoped to this editor's root, then the starting state of
// the LaTeX toggle and the "Insert as" menu.
// The dialog's size when the design does not set one: about 700 by 450 pixels.
var DEFAULT_WIDTH = 700, DEFAULT_HEIGHT = 450;
function designWidth( design ) { return Number( design && design.width ) > 0 ? Number( design.width ) : DEFAULT_WIDTH; }
function designHeight( design ) { return Number( design && design.height ) > 0 ? Number( design.height ) : DEFAULT_HEIGHT; }
var designCount = 0;
export function applyDesign( root, design, latexToggle, insertSelect ) {
    if ( !root || !design ) return;
    if ( !root.id ) root.id = 'cc-eqn-design-' + ( ++designCount );
    var sel = '#' + root.id, css = '';
    var colour = String( design.colour || '' );
    if ( /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test( colour ) ) {
        css += sel + ' { --cc-accent: ' + colour + ';' +
            ' --cc-accent-soft: color-mix(in srgb, ' + colour + ' 11%, #fff);' +
            ' --cc-accent-soft-ring: color-mix(in srgb, ' + colour + ' 28%, #fff);' +
            ' --cc-accent-mid: color-mix(in srgb, ' + colour + ' 22%, #fff);' +
            ' --cc-accent-mid-ring: color-mix(in srgb, ' + colour + ' 43%, #fff); }';
    }
    if ( Number( design.mathSize ) > 0 ) css += sel + ' .CCMathView { font-size: ' + Number( design.mathSize ) + 'px !important; }';
    if ( Number( design.latexSize ) > 0 ) css += sel + ' .CCLatexInput { font-size: ' + Number( design.latexSize ) + 'px !important; }';
    if ( design.toolbar === false ) css += sel + ' .CCToolbar { display: none !important; }';
    if ( design.history === false ) css += sel + ' .CCEditorBar { display: none !important; }';
    if ( css ) {
        var style = document.createElement( 'style' );
        style.textContent = css;
        root.appendChild( style );
    }
    // The dialog's width and height (`width`, `height`), before any scaling: the box takes the width,
    // and the editing area whatever height makes the whole dialog the height asked for - measured,
    // since everything else in it (toolbar rows, the bottom bar) varies with the design. Hosts that
    // size their dialogs themselves (TinyMCE 4, CKEditor 4) are given both when they open it instead.
    var sizedBox = root.closest( '.tox-dialog, .mce-window, .cke_dialog, .ck-balloon-panel, .cc-eqneditor-modal, .tc-drop-down' ) || root;
    if ( !sizedBox.matches( '.mce-window, .cke_dialog' ) ) {
        sizedBox.style.setProperty( 'width', designWidth( design ) + 'px', 'important' );
        var area = root.querySelector( '.CCMathViewHost' );
        if ( area ) {
            // Measured, then measured again as the dialog settles - the toolbar fits itself to its row
            // after the dialog first lays out, and the fonts arrive - correcting by the difference each time.
            // A box with a height of its own (Froala's and Tiptap's modals) sizes to its contents instead.
            sizedBox.style.setProperty( 'height', 'auto', 'important' );
            var sizing = document.createElement( 'style' );
            root.appendChild( sizing );
            var h = 0;
            var fit = function () {
                var shown = root.querySelector( '.CCLatexInput' ) && getComputedStyle( area ).display === 'none'
                    ? root.querySelector( '.CCLatexInput' ) : area;
                // Scale may already be applied (see below), and on-screen sizes include it.
                var applied = parseFloat( sizedBox.style.zoom ) || parseFloat( ( sizedBox.style.transform.match( /scale\(([\d.]+)\)/ ) || [] )[ 1 ] ) || 1;
                var now = h || shown.getBoundingClientRect().height / applied;
                h = Math.max( 120, Math.round( now + designHeight( design ) - sizedBox.getBoundingClientRect().height / applied ) );
                // Never taller than the whole dialog asked for: a host that caps its dialog (and scrolls the
                // rest) would otherwise be chased upwards on every pass.
                h = Math.min( h, designHeight( design ) );
                sizing.textContent = '#' + root.id + ' { height: auto !important; } #' + root.id + ' .CCMathViewHost, #' + root.id + ' .CCLatexInput { height: ' + h + 'px !important; min-height: ' + h + 'px !important; }';
            };
            fit();
            [ 150, 500, 1200 ].forEach( function ( t ) { setTimeout( fit, t ); } );
        }
    }
    // The whole dialog, box and contents together - see `dialogSize` in the README. Zoomed where
    // the host lays the dialog out (it grows in place); scaled where the host positions it itself
    // (CKEditor, TinyMCE 4, a TiddlyWiki drop-down), so that placement still holds.
    var size = Number( design.dialogSize );
    if ( size > 0 && size !== 1 ) {
        var box = root.closest( '.tox-dialog, .mce-window, .cke_dialog, .ck-balloon-panel, .cc-eqneditor-modal, .tc-drop-down' ) || root;
        var position = getComputedStyle( box ).position;
        if ( position === 'absolute' || position === 'fixed' ) {
            box.style.transform = 'scale(' + size + ')';
            box.style.transformOrigin = box.matches( '.ck-balloon-panel' ) ? 'top center'
                : box.matches( '.tc-drop-down' ) ? 'top left' : 'center center';
            // A cap on the box's width (CKEditor 5's balloon: 96vw) holds before the scale - divided by it,
            // as for zoom below, or a scaled-down box is squeezed narrower than its own contents.
            box.style.removeProperty( 'max-width' );   // a host that reuses the box (CKEditor 5) would otherwise divide it again
            var cap = getComputedStyle( box ).maxWidth;
            if ( cap !== 'none' ) box.style.setProperty( 'max-width', 'calc(' + cap + ' / ' + size + ')', 'important' );
        } else {
            box.style.zoom = String( size );
            box.style.setProperty( 'max-width', 'calc(96vw / ' + size + ')', 'important' );   // still no wider than the window
        }
    }
    if ( insertSelect && design.insertAs && insertSelect.querySelector( 'option[value="' + design.insertAs + '"]' ) ) {
        insertSelect.value = design.insertAs;
    }
    if ( latexToggle && design.latex && !latexToggle.checked && !latexToggle.disabled ) {
        latexToggle.checked = true;
        latexToggle.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    }
}

// Re-asserts the API's own .CCMathView/.fxtex rules, which host resets and revert-layer override.
// The predictor (design.predictor): whole equations that start the way this one does - the API's
// PredictorView - in a panel on the right of the editing area. The maths view and the markup pane
// share one row with it, so it sits beside whichever is showing. The bar between them drags to
// resize the panel, and its button (or Enter on the bar) folds it away; arrow keys resize it from
// the keyboard. The width and whether it is folded are remembered in this browser.
var PREDICTOR_WIDTH = 220, PREDICTOR_MIN = 140, PREDICTOR_KEY = 'cc-eqn-predictor';
export function addPredictor( root, design, textArea, mathView ) {
    if ( !root || !design || !design.predictor || typeof EqEditor === 'undefined' || !EqEditor.PredictorView ) return;
    var host = root.querySelector( '.CCMathViewHost' ), markup = root.querySelector( '.CCLatexInput' );
    var first = host || markup;
    if ( !first || root.querySelector( '.cc-eqn-work' ) ) return;
    injectPredictorStylesOnce();

    var saved = {};
    try { saved = JSON.parse( localStorage.getItem( PREDICTOR_KEY ) ) || {}; } catch ( e ) {}
    var width = Number( saved.width ) >= PREDICTOR_MIN ? Number( saved.width ) : PREDICTOR_WIDTH;

    var work = document.createElement( 'div' );
    work.className = 'cc-eqn-work';
    first.parentNode.insertBefore( work, first );
    var panes = document.createElement( 'div' );
    panes.className = 'cc-eqn-panes';
    if ( host ) panes.appendChild( host );
    if ( markup ) panes.appendChild( markup );

    var bar = document.createElement( 'div' );
    bar.className = 'cc-eqn-split';
    bar.tabIndex = 0;
    bar.setAttribute( 'role', 'separator' );
    bar.setAttribute( 'aria-orientation', 'vertical' );
    bar.setAttribute( 'aria-label', 'Resize the suggested equations' );
    var fold = document.createElement( 'button' );
    fold.type = 'button';
    fold.className = 'cc-eqn-split-fold';
    bar.appendChild( fold );

    var side = document.createElement( 'aside' );
    side.className = 'cc-eqn-predictor';
    side.id = root.id + '-predictor';
    side.setAttribute( 'aria-label', 'Suggested equations' );

    work.appendChild( panes );
    work.appendChild( bar );
    work.appendChild( side );

    function remember() {
        try { localStorage.setItem( PREDICTOR_KEY, JSON.stringify( { width: width, folded: work.classList.contains( 'cc-eqn-folded' ) } ) ); } catch ( e ) {}
    }
    function setWidth( w ) {
        // Never so wide that the editing area beside it has nothing left.
        var room = work.clientWidth - bar.offsetWidth - 160;
        width = Math.round( Math.max( PREDICTOR_MIN, room > PREDICTOR_MIN ? Math.min( w, room ) : w ) );
        side.style.width = width + 'px';
    }
    function setFolded( folded ) {
        work.classList.toggle( 'cc-eqn-folded', folded );
        fold.textContent = folded ? '‹' : '›';
        fold.title = folded ? 'Show suggested equations' : 'Hide suggested equations';
        bar.setAttribute( 'aria-expanded', folded ? 'false' : 'true' );
    }
    side.style.width = width + 'px';
    setFolded( !!saved.folded );

    fold.addEventListener( 'click', function () { setFolded( !work.classList.contains( 'cc-eqn-folded' ) ); remember(); } );
    bar.addEventListener( 'keydown', function ( e ) {
        if ( e.target !== bar ) return;
        if ( e.key === 'Enter' || e.key === ' ' ) {
            e.preventDefault(); setFolded( !work.classList.contains( 'cc-eqn-folded' ) ); remember();
        } else if ( ( e.key === 'ArrowLeft' || e.key === 'ArrowRight' ) && !work.classList.contains( 'cc-eqn-folded' ) ) {
            e.preventDefault(); setWidth( width + ( e.key === 'ArrowLeft' ? 20 : -20 ) ); remember();
        }
    } );
    // Dragged from anywhere on the bar but its button. Pointer movement is in screen pixels, which a
    // scaled dialog (design.dialogSize) does not share with the panel's own width - hence the ratio.
    bar.addEventListener( 'pointerdown', function ( e ) {
        if ( e.target === fold || e.button !== 0 ) return;
        e.preventDefault();
        var scale = work.getBoundingClientRect().width / ( work.offsetWidth || 1 ) || 1;
        var startX = e.clientX, startW = work.classList.contains( 'cc-eqn-folded' ) ? 0 : width;
        if ( startW === 0 ) { setFolded( false ); startW = PREDICTOR_MIN; setWidth( startW ); }
        bar.setPointerCapture( e.pointerId );
        work.classList.add( 'cc-eqn-dragging' );
        function move( ev ) { setWidth( startW + ( startX - ev.clientX ) / scale ); }
        function up() {
            bar.removeEventListener( 'pointermove', move );
            bar.removeEventListener( 'pointerup', up );
            bar.removeEventListener( 'pointercancel', up );
            work.classList.remove( 'cc-eqn-dragging' );
            remember();
        }
        bar.addEventListener( 'pointermove', move );
        bar.addEventListener( 'pointerup', up );
        bar.addEventListener( 'pointercancel', up );
    } );

    var show = design.predictorShow === 'latex' || design.predictorShow === 'both' ? design.predictorShow : 'mathml';
    var view = EqEditor.PredictorView.link( side.id, { limit: 6, show: show } ).addTextArea( textArea );
    if ( mathView ) view.addMathView( mathView );
}

// !important throughout: hosts reset their dialogs' contents (TinyMCE's .tox, CKEditor's
// .ck-reset_all) more specifically than a plain class rule reaches.
function injectPredictorStylesOnce() {
    if ( document.getElementById( 'cc-eqn-predictor-css' ) ) return;
    var style = document.createElement( 'style' );
    style.id = 'cc-eqn-predictor-css';
    style.textContent =
        '.cc-eqn-work { display: flex !important; flex: 1 1 auto !important; min-height: 0 !important; min-width: 0 !important; align-items: stretch !important; }' +
        '.cc-eqn-panes { display: flex !important; flex-direction: column !important; flex: 1 1 auto !important; min-width: 0 !important; min-height: 0 !important; }' +
        '.cc-eqn-split { flex: 0 0 auto !important; width: 9px !important; margin: 0 2px !important; cursor: col-resize !important; ' +
            'display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important; ' +
            'background: transparent !important; touch-action: none !important; user-select: none !important; outline: none !important; }' +
        '.cc-eqn-split::before { content: "" !important; position: absolute !important; top: 0 !important; bottom: 0 !important; left: 4px !important; ' +
            'width: 1px !important; background: #d5dbe3 !important; }' +
        '.cc-eqn-split:hover::before, .cc-eqn-split:focus-visible::before, .cc-eqn-dragging .cc-eqn-split::before { left: 3px !important; width: 3px !important; background: var(--cc-accent, #003794) !important; }' +
        '.cc-eqn-split-fold { flex: 0 0 auto !important; position: relative !important; z-index: 1 !important; width: 16px !important; height: 34px !important; margin: 0 !important; padding: 0 !important; ' +
            'border: 1px solid #cbd5e0 !important; border-radius: 8px !important; background: #fff !important; color: #52606d !important; ' +
            'font: 14px/1 sans-serif !important; cursor: pointer !important; box-shadow: none !important; display: flex !important; align-items: center !important; justify-content: center !important; }' +
        '.cc-eqn-split-fold:hover { color: var(--cc-accent, #003794) !important; border-color: var(--cc-accent, #003794) !important; }' +
        // contain: size - the list's length is no reason for the dialog to grow; the panel takes the
        // editing area's height (stretched, as a flex item) and scrolls within it. layout, as the API
        // has it, keeps its search box anchored to the panel.
        '.cc-eqn-predictor { flex: 0 0 auto !important; min-width: 0 !important; min-height: 0 !important; overflow: auto !important; box-sizing: border-box !important; contain: size layout !important; }' +
        '.cc-eqn-folded .cc-eqn-predictor { display: none !important; }' +
        '.cc-eqn-dragging, .cc-eqn-dragging * { cursor: col-resize !important; user-select: none !important; }' +
        // The suggestions' maths set as the maths view's is: a host's reset (TinyMCE's .tox
        // :not(svg) { font-family: inherit; font-style: inherit }) outranks the API's .fxtex rules,
        // which left it in the dialog's sans-serif with its letters upright (the browser italicises
        // them through text-transform, which the reset takes too). Reverted to the browser's own
        // maths styling, as the maths view is, then the API's .fxtex rules re-asserted for the panel.
        '.cc-eqn-predictor math, .cc-eqn-predictor math * { font: revert-layer !important; text-transform: revert-layer !important; ' +
            'width: revert-layer !important; height: revert-layer !important; padding: revert-layer !important; margin: revert-layer !important; ' +
            'text-align: revert-layer !important; box-sizing: revert-layer !important; white-space: revert-layer !important; }';
    for ( var i = 0; i < document.styleSheets.length; i++ ) {
        var rules;
        try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
        for ( var j = 0; j < rules.length; j++ ) {
            var r = rules[ j ], decls = '';
            var sel = r.selectorText && r.selectorText.replace( /:where\(\.fxEditor\)\s*/g, '' ).trim();
            if ( !sel || !/^\.fxtex\b/.test( sel ) || sel.indexOf( ',' ) > -1 ) continue;
            for ( var k = 0; k < r.style.length; k++ ) {
                decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
            }
            if ( decls ) style.textContent += '.cc-eqn-predictor ' + sel + '{' + decls + '}';
        }
    }
    document.head.appendChild( style );
}

// Ready to type into, with its cursor showing: the MathView (or the LaTeX pane, when that is the
// one showing) takes focus as the dialog opens - otherwise focus stays on whatever opened it.
// The API draws the MathView's caret where the cursor is at that moment and only redraws it on an
// edit or on focus, but a dialog goes on settling after it opens (fonts arrive, the toolbar fits
// itself to its row) and moves the equation out from under it. Its focus handler only redraws
// (the cursor stays where it is), so it is fired again whenever the editing area changes size.
export function focusEditor( root ) {
    if ( !root ) return;
    var pane = root.querySelector( root.getAttribute( 'data-latex' ) === 'on' ? '.CCLatexInput' : '.CCMathView' );
    if ( pane ) pane.focus( { preventScroll: true } );
    var view = root.querySelector( '.CCMathView' ), host = view && view.parentElement;
    if ( host && !host.ccCaretWatch && typeof ResizeObserver !== 'undefined' ) {
        host.ccCaretWatch = new ResizeObserver( function () {
            var mv = host.querySelector( '.CCMathView' );
            if ( mv && document.activeElement === mv ) mv.dispatchEvent( new FocusEvent( 'focus' ) );
        } );
        host.ccCaretWatch.observe( host );
    }
}

function apiMathRules() {
    var out = '';
    for ( var i = 0; i < document.styleSheets.length; i++ ) {
        var rules;
        try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
        for ( var j = 0; j < rules.length; j++ ) {
            var r = rules[ j ], decls = '';
            if ( !r.selectorText || !/(^|,)\s*(:where\(\.fxEditor\)\s*)?\.(fxtex|CCMathView)\b/.test( r.selectorText ) ) continue;
            for ( var k = 0; k < r.style.length; k++ ) {
                decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
            }
            if ( decls ) {
                out += r.selectorText.replace( /:where\(\.fxEditor\)\s*/g, '' ).split( ',' ).map( function ( s ) {
                    s = s.trim();
                    return /^\.CCMathView\b/.test( s ) ? s : '.CCMathView ' + s;
                } ).join( ',' ) + '{' + decls + '}';
            }
        }
    }
    return out;
}
