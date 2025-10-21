(function() {
    'use strict';

    let compiledModulesCache = {};
    let projectFiles = {}; 
    let lastCompiledCode = ''; 
    let userCommands = {}; 

    // Helper function: Escape special regex characters
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    }

    // --------------------------------------------------------------------
    // MACRO DEFINITION AND PARSING FUNCTION
    // --------------------------------------------------------------------
    function extractUserCommands(zCode) {
        const lines = zCode.split('\n');
        let currentCommand = null;
        let commandLines = [];
        let cleanZCodeLines = [];
        let fileUserCommands = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Skip comments outside macro definition blocks
            if (!currentCommand && (line.startsWith('//') || line.startsWith('#'))) continue;

            if (line.startsWith('<command^crt>')) { currentCommand = { definition: null, body: [] };
            } else if (currentCommand && line === '}') { 
            } else if (currentCommand && line.startsWith('<cmd^add>')) {
                const definition = commandLines[0].trim();
                const defMatch = definition.match(/^(\w+)\s*\(([^)]*)\)$/);

                if (defMatch) {
                    const macroName = defMatch[1];
                    const paramsString = defMatch[2];
                    const params = paramsString.split(',').map(p => p.trim());
                    fileUserCommands[macroName] = { 
                        paramPlaceholders: params,
                        template: commandLines.slice(1).join('\n').trim()
                    };
                }
                currentCommand = null;
                commandLines = [];
            } else if (currentCommand) {
                commandLines.push(lines[i].trim());
            } else {
                cleanZCodeLines.push(lines[i]);
            }
        }
        Object.assign(userCommands, fileUserCommands);
        return cleanZCodeLines.join('\n');
    }

    /**
     * Expands a macro call into its Z code template.
     */
    function expandMacro(line) {
        const macroMatch = line.match(/^(\w+)\s*\(([^)]*)\)$/); 
        if (!macroMatch) return null;

        const cmdName = macroMatch[1];
        const rawArgs = macroMatch[2]; 
        const macro = userCommands[cmdName];

        if (!macro) return null;

        let expandedCode = macro.template;
        
        // Robust argument parsing: Ignores commas within quoted strings.
        const rawArgArray = rawArgs.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
                                 .map(a => a.trim())
                                 .filter(a => a.length > 0);
        
        macro.paramPlaceholders.forEach((placeholder, index) => {
            if (index < rawArgArray.length) {
                const argValue = rawArgArray[index];
                
                // Replace the exact placeholder name with the argument value.
                const regex = new RegExp(escapeRegExp(placeholder), 'g');
                expandedCode = expandedCode.replace(regex, argValue);
            }
        });

        return expandedCode;
    }
    
    // --------------------------------------------------------------------
    // PROJECT BUNDLING FUNCTION
    // --------------------------------------------------------------------
    function bundleProject(fileName, visited = new Set()) {
        if (visited.has(fileName)) {
            throw new Error(`IMPORT LOOP: File '${fileName}' has already been imported.`);
        }
        visited.add(fileName);

        const zCode = projectFiles[fileName];
        if (!zCode) {
            throw new Error(`IMPORT ERROR: File '${fileName}' not found.`);
        }

        const lines = zCode.split('\n');
        let bundledCode = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            const importMatch = trimmedLine.match(/^<import\^z="([^"]+\.z)">$/);

            if (importMatch) {
                const libFileName = importMatch[1];
                // Recursively bundle the imported module
                const importedCode = bundleProject(libFileName, visited);
                bundledCode.push(importedCode);
            } else {
                bundledCode.push(line);
            }
        }
        
        visited.delete(fileName);
        return bundledCode.join('\n');
    }

    // --------------------------------------------------------------------
    // Z LANGUAGE COMPILER (Single Pass)
    // --------------------------------------------------------------------
    function compileZLang(zCode) {
        // 1. Extract all macro definitions globally from the bundled code.
        const codeWithMacros = extractUserCommands(zCode);
        
        // 2. Macro Expansion Pass: Repeat until no more expansions occur.
        let currentLines = codeWithMacros.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let madeExpansion = true;

        while (madeExpansion) {
            madeExpansion = false;
            let nextLines = [];
            
            for (const line of currentLines) {
                const expanded = expandMacro(line);
                if (expanded) {
                    // Macro expanded, append new lines and loop again
                    nextLines.push(...expanded.split('\n').map(l => l.trim()).filter(l => l.length > 0));
                    madeExpansion = true;
                } else {
                    nextLines.push(line);
                }
            }
            currentLines = nextLines;
        }

        // 3. JS Code Generation Pass
        let jsOutput = `(function() {\n`; 
        let inJsAddon = false;

        for (const line of currentLines) {
            let jsLine = '';

            // ADDON BLOCK HANDLING
            if (line.startsWith('<addon^index/set^js>')) { inJsAddon = true; continue; } 
            else if (line.startsWith('<addon^js>')) { inJsAddon = false; continue; } 
            else if (inJsAddon) { jsOutput += line + '\n'; continue; }
            
            // COMMAND MATCHING
            const errorIndexMatch = line.match(/^<error\^set\.index="([^"]+)">$/);
            const errorIncodeMatch = line.match(/^<error\^set\.incode="([^"]+)">$/);
            const alertMatch = line.match(/^<alert\^class="([^"]+)">$/);
            const promptMatch = line.match(/^<prompt\^set\.index="([^"]+)"&başlık="([^"]+)">$/);
            const ifMatch = line.match(/^<if\^set\.incode="([^"]+)">$/);
            const elseIfMatch = line.match(/^<else\^if\^set\.incode="([^"]+)">$/);
            const forMatch = line.match(/^<for\^set\.incode="([^"]+)">$/);
            const whileMatch = line.match(/^<while\^set\.incode="([^"]+)">$/);
            const printIndexMatch = line.match(/^<print\^set\.index="([^"]+)">$/);
            const incodeValue = line.match(/^<print\^set\.incode="([^"]+)">$/);
            const setMatch = line.match(/^<set\^(\w+)\s*=\s*(.*)$/);
            
            if (errorIndexMatch) {
                jsLine = `console.error("${errorIndexMatch[1]}");`;
            } else if (errorIncodeMatch) {
                jsLine = `console.error(${errorIncodeMatch[1]});`;
            } else if (alertMatch) {
                jsLine = `alert("${alertMatch[1]}");`;
            } else if (promptMatch) {
                jsLine = `let ${promptMatch[1]} = prompt("${promptMatch[2]}");`;
            } else if (ifMatch) {
                jsLine = `if (${ifMatch[1]}) {`;
            } else if (elseIfMatch) {
                jsLine = `} else if (${elseIfMatch[1]}) {`;
            } else if (line === '<else^set>') {
                jsLine = `} else {`;
            } else if (line === '<end^if>' || line === '<end^loop>') {
                jsLine = `}`;
            } else if (forMatch) {
                jsLine = `for (${forMatch[1]}) {`;
            } else if (whileMatch) {
                jsLine = `while (${whileMatch[1]}) {`;
            } else if (printIndexMatch) {
                jsLine = `console.log("${printIndexMatch[1]}");`;
            } else if (incodeValue) {
                jsLine = `console.log(${incodeValue[1]});`;
            } else if (setMatch) {
                jsLine = `let ${setMatch[1].trim()} = ${setMatch[2].trim()};`;
            } else {
                throw new Error(`COMPILATION ERROR: Unrecognized command line: ${line}`);
            }

            if (jsLine) {
                jsOutput += jsLine + '\n';
            }
        }
        
        jsOutput += `})();\n`;
        return jsOutput;
    }
    
    // --------------------------------------------------------------------
    // PROJECT MANAGEMENT
    // --------------------------------------------------------------------
    
    window.Zinstall = function() {
        if (!lastCompiledCode) {
            console.error("ERROR: Compilation not performed.");
            return;
        }
        const blob = new Blob([lastCompiledCode], {type: 'text/javascript;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'zlang_output.js';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); 
    };

    async function processSelectedFiles(files) {
        projectFiles = {};
        userCommands = {}; 
        
        let mainFileContent = null;
        let zFileCount = 0;

        for (const file of files) {
            if (file.name.endsWith('.z')) {
                zFileCount++;
                try {
                    const content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = (e) => reject(e);
                        reader.readAsText(file, 'UTF-8'); 
                    });
                    projectFiles[file.name] = content;
                    if (file.name === 'main.z') {
                        mainFileContent = content;
                    }
                } catch (e) {
                    console.error(`ERROR: Could not read file ${file.name}.`, e);
                    return;
                }
            }
        }
        
        if (zFileCount === 0 || !mainFileContent) {
            console.error("ERROR: 'main.z' or any .z file not found.");
            return;
        }

        try {
            console.log("Bundling project into a single Z file...");
            const bundledZCode = bundleProject('main.z');
            
            const finalCompiledCode = compileZLang(bundledZCode);
            lastCompiledCode = finalCompiledCode;

            console.log("--- COMPILATION SUCCESSFUL ---");
            console.log(finalCompiledCode);
            console.log("--- EXECUTION RESULT ---");
            eval(finalCompiledCode);
            
            console.log("Use Zinstall() to download the output.");

        } catch (error) {
            console.error("CRITICAL ERROR:", error.message);
        }
    }

    window.ZStart = function() {
        console.clear();
        console.log("%cZ Language Compiler STARTED.", 'color: #00aaff; font-weight: bold;');
        console.log("Please select project files (.z files).");

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.z'; 
        input.multiple = true; 

        input.addEventListener('change', (event) => {
            const files = event.target.files;
            if (files.length > 0) {
                processSelectedFiles(files);
            }
            try {
                document.body.removeChild(input);
            } catch(e) {}
        });

        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
    };

    console.log("%cZ Language Compiler Loaded. Type ZStart() in the console to begin.", 'color: #00aaff; font-weight: bold;');
})();
    console.log(" ZStart() ", 'color: #00aaff; font-weight: bold;');
})();
 

