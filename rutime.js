let compiledModulesCache = {};
let projectFiles = {}; 

function compileZLang(zCode, fileName) {
    const lines = zCode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let jsOutput = `\n(function() { // ZLang Modülü: ${fileName}\n`;

    let inJsAddon = false;
    let inHtmlAddon = false;

    for (const line of lines) {
        let jsLine = '';
        
        if (line.startsWith('<addon^index/set^js>')) { inJsAddon = true; continue; } 
        else if (line.startsWith('<addon^js>')) { inJsAddon = false; continue; } 
        else if (inJsAddon) { jsOutput += line + '\n'; continue; }
        if (line.startsWith('<addon^index/set^html>')) { inHtmlAddon = true; continue; } 
        else if (line.startsWith('<addon^html>')) { inHtmlAddon = false; continue; } 
        else if (inHtmlAddon) { jsOutput += line + '\n'; continue; }

        if (!inJsAddon && !inHtmlAddon) {
            
            if (line.startsWith('<import^z=')) {
                const importMatch = line.match(/^<import\^z="([^"]+\.z)">$/);
                if (importMatch) {
                    const libFileName = importMatch[1];
                    let moduleJsCode = compiledModulesCache[libFileName];

                    if (!moduleJsCode) {
                        const moduleZCode = projectFiles[libFileName];
                        if (!moduleZCode) {
                            throw new Error(`IMPORT HATA: '${libFileName}' bulunamadı.`);
                        }
                        
                        moduleJsCode = compileZLang(moduleZCode, libFileName);
                        compiledModulesCache[libFileName] = moduleJsCode;
                    }

                    jsOutput += `// Import: ${libFileName}\n`;
                    jsOutput += moduleJsCode;
                }
            } 
            
            else {
                const printIndexMatch = line.match(/^<print\^set\.index="([^"]+)">$/);
                const incodeValue = line.match(/^<print\^set\.incode="([^"]+)">$/);
                const setMatch = line.match(/^<set\^(\w+)\s*=\s*(.*)$/);
                
                if (printIndexMatch) {
                    jsLine = `console.log("${printIndexMatch[1]}");`;
                } else if (incodeValue) {
                    jsLine = `console.log(${incodeValue[1]});`;
                } else if (setMatch) {
                    const varName = setMatch[1].trim();
                    const value = setMatch[2].trim();
                    jsLine = `let ${varName} = ${value};`;
                } else if (line.startsWith('//') || line.startsWith('#')) {
                    jsLine = line; 
                } else {
                    jsLine = `// HATA: ${line}`;
                }
            }

            if (jsLine) {
                jsOutput += jsLine + '\n';
            }
        }
    }
    jsOutput += `\n})();// ZLang Modülü Bitişi: ${fileName}\n`;
    return jsOutput;
}

async function processSelectedFiles(files) {
    projectFiles = {};
    compiledModulesCache = {};
    let mainFileContent = null;
    let zFileCount = 0;

    for (const file of files) {
        if (file.name.endsWith('.z')) {
            zFileCount++;
            try {
                const content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(file);
                });
                
                projectFiles[file.name] = content;
                if (file.name === 'main.z') {
                    mainFileContent = content;
                }
            } catch (e) {
                console.error(`HATA: ${file.name} okunamadı.`, e);
                return;
            }
        }
    }
    
    if (zFileCount === 0) {
        console.error("HATA: Hiçbir .z uzantılı dosya seçilmedi.");
        return;
    }

    if (!mainFileContent) {
        console.error("HATA: Ana giriş dosyası olan 'main.z' bulunamadı.");
        return;
    }

    try {
        const finalCompiledCode = compileZLang(mainFileContent, 'main.z');

        console.log("--- DERLEME BAŞARILI ---");
        console.log("ÇIKTI JS KODU:");
        console.log(finalCompiledCode);
        console.log("--- ÇALIŞTIRMA SONUCU ---");
        eval(finalCompiledCode);

    } catch (error) {
        console.error("KRİTİK HATA: Proje derlenemedi.");
        console.error(error.message);
    }
}

function startCompiler() {
    console.clear();
    console.log("Z DİLİ DERLEYİCİSİ BAŞLATILDI: Lütfen açılan pencerede tüm .z dosyalarınızı seçin.");

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.z'; 
    input.multiple = true; 

    input.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            processSelectedFiles(files);
        } else {
            console.warn("Seçim iptal edildi.");
        }
        document.body.removeChild(input); 
    });

    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
}

startCompiler();
