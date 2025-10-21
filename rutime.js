(function() {
    'use strict';

    let compiledModulesCache = {};
    let projectFiles = {}; 
    let lastCompiledCode = ''; 
    let userCommands = {}; 

    // --------------------------------------------------------------------
    // MAKRO TANIMLAMA ve PARS ETME FONKSİYONU
    // --------------------------------------------------------------------
    function extractUserCommands(zCode) {
        const lines = zCode.split('\n');
        let currentCommand = null;
        let commandLines = [];
        let cleanZCodeLines = [];
        let fileUserCommands = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('<command^crt>')) {
                currentCommand = { definition: null, body: [] };
            } else if (currentCommand && line === '}') {
                // Makro tanımının Z kodu kısmı başladı
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

    // Yardımcı fonksiyon: Regex için özel karakterleri kaçırma
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    }

    /**
     * Makro kullanımını Z kod şablonuna genişletir.
     * @param {string} line Genişletilecek komut satırı (Örn: console("merhaba"))
     * @returns {string | null} Genişletilmiş Z kodu veya null (makro değilse/hata varsa)
     */
    function expandMacro(line) {
        const macroMatch = line.match(/^(\w+)\s*\(([^)]*)\)$/); 
        if (!macroMatch) return null;

        const cmdName = macroMatch[1];
        const rawArgs = macroMatch[2]; 
        const macro = userCommands[cmdName];

        if (!macro) return null;

        let expandedCode = macro.template;
        // Tırnak içindeki virgülleri koruyan Argüman ayırma (Güvenilirliği artırır)
        const rawArgArray = rawArgs.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(a => a.trim());
        
        // Pozisyonel eşleştirme yap
        macro.paramPlaceholders.forEach((placeholder, index) => {
            if (index < rawArgArray.length) {
                const argValue = rawArgArray[index];
                const regex = new RegExp(escapeRegExp(placeholder), 'g');
                expandedCode = expandedCode.replace(regex, argValue);
            }
        });

        return expandedCode;
    }

    // --------------------------------------------------------------------
    // Z DİLİ DERLEYİCİSİ
    // --------------------------------------------------------------------
    function compileZLang(zCode, fileName, isModule = false) {
        // Makro tanımlarını çıkar ve temizlenmiş kodu al
        const codeWithMacros = extractUserCommands(zCode);
        
        // Genişletme (Expansion) Aşaması
        let currentLines = codeWithMacros.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let expandedLines = [];
        let madeExpansion = true;

        // Bütün makrolar genişleyene kadar döngü
        while (madeExpansion) {
            madeExpansion = false;
            expandedLines = [];
            
            for (const line of currentLines) {
                const expanded = expandMacro(line);
                if (expanded) {
                    // Makro genişledi, yeni satırları ekle
                    expandedLines.push(...expanded.split('\n').map(l => l.trim()).filter(l => l.length > 0));
                    madeExpansion = true;
                } else {
                    // Normal Z kodu satırı veya tanımsız komut
                    expandedLines.push(line);
                }
            }
            currentLines = expandedLines;
        }

        // JS Kodu Üretme Aşaması
        let jsOutput = ''; 
        
        if (!isModule) {
            jsOutput += `\n(function() { // ${fileName}\n`; 
        } else {
             jsOutput += `// MODÜL KODU: ${fileName}\n`;
        }

        let inJsAddon = false;

        for (const line of currentLines) {
            let jsLine = '';

            // 1. ADDON İşleme
            if (line.startsWith('<addon^index/set^js>')) { inJsAddon = true; continue; } 
            else if (line.startsWith('<addon^js>')) { inJsAddon = false; continue; } 
            else if (inJsAddon) { jsOutput += line + '\n'; continue; }
            
            // 2. NORMAL Z KOMUTLARI
            
            // PROMPT
            const promptMatch = line.match(/^<prompt\^set\.index="([^"]+)"&başlık="([^"]+)">$/);
            if (promptMatch) {
                const varName = promptMatch[1];
                const title = promptMatch[2];
                jsLine = `let ${varName} = prompt("${title}");`;
            }
            
            // IMPORT İŞLEMİ 
            else if (line.startsWith('<import^z=')) {
                const importMatch = line.match(/^<import\^z="([^"]+\.z)">$/);
                if (importMatch) {
                    const libFileName = importMatch[1];
                    let moduleJsCode = compiledModulesCache[libFileName];
                    
                    if (!moduleJsCode) {
                        const moduleZCode = projectFiles[libFileName];
                        if (!moduleZCode) {
                            throw new Error(`IMPORT HATA: '${libFileName}' bulunamadı.`);
                        }
                        moduleJsCode = compileZLang(moduleZCode, libFileName, true);
                        compiledModulesCache[libFileName] = moduleJsCode;
                    }
                    
                    jsOutput += moduleJsCode + '\n';
                }
            } 
            
            // KONTROL YAPILARI VE TEMEL Z KOMUTLARI
            else if (line.startsWith('<if^set.incode=')) {
                const match = line.match(/^<if\^set\.incode="([^"]+)">$/);
                jsLine = `if (${match[1]}) {`;
            }
            else if (line.startsWith('<else^if^set.incode=')) {
                const match = line.match(/^<else\^if\^set\.incode="([^"]+)">$/);
                jsLine = `} else if (${match[1]}) {`;
            }
            else if (line === '<else^set>') {
                jsLine = `} else {`;
            }
            else if (line === '<end^if>') {
                jsLine = `}`;
            }
            else if (line.startsWith('<for^set.incode=')) {
                const match = line.match(/^<for\^set\.incode="([^"]+)">$/);
                jsLine = `for (${match[1]}) {`;
            }
            else if (line.startsWith('<while^set.incode=')) {
                const match = line.match(/^<while\^set\.incode="([^"]+)">$/);
                jsLine = `while (${match[1]}) {`;
            }
            else if (line === '<end^loop>') {
                jsLine = `}`;
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
                    // Makro genişletmesi tamamlanmış ama normal komutlara uymayan son hata.
                    jsLine = `// HATA: Tanınmayan komut: ${line}`;
                }
            }

            if (jsLine) {
                jsOutput += jsLine + '\n';
            }
        }
        
        if (!isModule) {
            jsOutput += `\n})();// ${fileName}\n`;
        }

        return jsOutput;
    }
    
    // Zinstall, processSelectedFiles ve ZStart fonksiyonları aynı kalır.
    
    // Zinstall fonksiyonu
    window.Zinstall = function() {
        if (!lastCompiledCode) {
            console.error("HATA: Derleme yapılmadı.");
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
        console.log(`'zlang_output.js' indirildi.`);
    };

    async function processSelectedFiles(files) {
        projectFiles = {};
        compiledModulesCache = {};
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
            console.error("HATA: 'main.z' bulunamadı.");
            return;
        }

        try {
            // Tüm makrolar derleme başlangıcında toplanır ve Genişletme Aşaması çalışır.
            const finalCompiledCode = compileZLang(mainFileContent, 'main.z', false);
            lastCompiledCode = finalCompiledCode;

            console.log("--- DERLEME BAŞARILI ---");
            console.log("ÇIKTI JS KODU:");
            console.log(finalCompiledCode);
            console.log("--- ÇALIŞTIRMA SONUCU ---");
            eval(finalCompiledCode);
            
            console.log("Zinstall() ile indir.");

        } catch (error) {
            console.error("KRİTİK HATA:", error.message);
        }
    }

    // ZStart fonksiyonu
    window.ZStart = function() {
        console.clear();
        console.log("Z DİLİ DERLEYİCİSİ BAŞLADI.");
        console.log("Lütfen dosyaları seçin.");

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

    // Konsola bilgilendirme mesajı
    console.log("%cZ Dili Derleyicisi Yüklendi. Başlamak için konsola ZStart() yazın.", 'color: #00aaff; font-weight: bold;');
})();
