let pyodide = null;
let pyodideReady = false;
let errorMarkerId = null;
let editor = null;

const Range = ace.require("ace/range").Range;
ace.require("ace/ext/language_tools");

const pythonKeywords = [
    "def", "return", "if", "else", "elif", "while", "for", "in",
    "import", "from", "as", "class", "try", "except", "finally", "with",
    "pass", "break", "continue", "lambda", "yield", "global", "nonlocal", "assert", "del"
];

const customCompleter = {
    getCompletions: function (editor, session, pos, prefix, callback) {
        const completions = pythonKeywords.map(word => {
            return {
                caption: word,
                value: word,
                meta: "keyword"
            };
        });
        callback(null, completions);
    }
};
ace.require("ace/ext/language_tools").addCompleter(customCompleter);

export function initializeEditor(dotNetHelper) {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/python");

    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true
    });

    editor.commands.addCommand({
        name: "autocomplete",
        bindKey: { win: "Tab", mac: "Tab" },
        exec: function (editor) {
            editor.execCommand("startAutocomplete");
        }
    });

    editor.session.on("change", function () {
        dotNetHelper.invokeMethodAsync("OnEditorChanged", editor.getValue());
    });
}

export function getEditorContent() {
    return editor ? editor.getValue() : "";
}

async function loadPyodideAndPackages() {
    pyodide = await loadPyodide();
    pyodideReady = true;
}
window.loadPyodideAndPackages = loadPyodideAndPackages;

window.runPythonCode = async function (code) {
    if (!pyodideReady) {
        return { output: "", error: "Pyodide is still loading...", line: 0 };
    }

    try {
        await pyodide.loadPackagesFromImports(code);

        pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = sys.stdout
        `);

        await pyodide.runPythonAsync(code);
        let output = pyodide.runPython("sys.stdout.getvalue()");
        return { output: output || "(no output)", error: null, line: null };
    } catch (err) {
        let match = err.toString().match(/File "<exec>", line (\d+)/);
        let line = match ? parseInt(match[1]) - 1 : 0;
        const errorLines = err.toString().split("\n");
        const lastLine = errorLines[errorLines.length - 3] + "\n" + errorLines[errorLines.length - 2]; 
        return {
            output: "",
            error: lastLine,
            line: line
        };

    }
}

export function highlightErrorLine(lineNumber, message, type = "error") {
    if (!editor) return;

    if (errorMarkerId !== null) {
        editor.session.removeMarker(errorMarkerId);
        errorMarkerId = null;
    }

    editor.session.setAnnotations([{
        row: lineNumber,
        column: 0,
        text: message,
        type: type // "warning" یا "error"
    }]);

    errorMarkerId = editor.session.addMarker(
        new Range(lineNumber, 0, lineNumber, 1),
        type === "error" ? "ace_error-marker" : "ace_warning-marker",
        "fullLine"
    );
}


export function clearErrors() {
    if (!editor) return;

    editor.session.clearAnnotations();
    if (errorMarkerId !== null) {
        editor.session.removeMarker(errorMarkerId);
        errorMarkerId = null;
    }
}
