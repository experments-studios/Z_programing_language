  (function() {
    'use strict';

    let compiledModulesCache = {};
    let projectFiles = {}; 
    let lastCompiledCode = ''; 

    function compileZLang(zCode, fileName) {
        const lines = zCode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        let jsOutput = `\n(function() { // ${fileName}\n`; 

        let inJsAddon = false;
        let inHtmlAddon = false;

        for (const line of lines) {
            let jsLine = '';
            
            // ADDON İşleme
            if (line.startsWith('<addon^index/set^js>')) { inJsAddon = true; continue; } 
            else if (line.startsWith('<addon^js>')) { inJsAddon = false; continue; } 
            else if (inJsAddon) { jsOutput += line + '\n'; continue; }
            if (line.startsWith('<addon^index/set^html>')) { inHtmlAddon = true; continue; } 
            else if (line.startsWith('<addon^html>')) { inHtmlAddon = false; continue; } 
            else if (inHtmlAddon) { jsOutput += line + '\n'; continue; }

            if (!inJsAddon && !inHtmlAddon) {
                
                // PROMPT
                const promptMatch = line.match(/^<prompt\^set\.index="([^"]+)"&başlık="([^"]+)">$/);
                if (promptMatch) {
                    const varName = promptMatch[1];
                    const title = promptMatch[2];
                    jsLine = `let ${varName} = prompt("${title}");`;
                }
                
                // UI/CSS MANİPÜLASYONU
                const uiMatch = line.match(/^<ui\.e\^selector="([^"]+)"&css="([^"]+):([^"]+)">$/);
                if (uiMatch) {
                    const selector = uiMatch[1];
                    const cssProperty = uiMatch[2].replace(/-([a-z])/g, (g) => g[1].toUpperCase()); 
                    const cssValue = uiMatch[3];
                    jsLine = `document.querySelector('${selector}').style.${cssProperty} = '${cssValue}';`;
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
                            moduleJsCode = compileZLang(moduleZCode, libFileName);
                            compiledModulesCache[libFileName] = moduleJsCode;
                        }
                        jsOutput += moduleJsCode;
                    }
                } 
                
                // KONTROL YAPILARI VE DİĞER Z KOMUTLARI
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
                        jsLine = `// HATA: ${line}`;
                    }
                }

                if (jsLine) {
                    jsOutput += jsLine + '\n';
                }
            }
        }
        jsOutput += `\n})();// ${fileName}\n`;
        return jsOutput;
    }

    // Zinstall fonksiyonu
    window.Zinstall = function() {
        if (!lastCompiledCode) {
            console.error("HATA: Derleme yapılmadı.");
            return;
        }
        const blob = new Blob([lastCompiledCode], {type: 'text/javascript'});
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
        let mainFileContent = null;
        let zFileCount = 0;

        for (const file of files) {
            if (file.name.endsWith('.z')) {
                zFileCount++;
                try {
                    // FileReader'ı Promise ile asenkron okuma
                    const content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = (e) => reject(e); // Hata yakalama eklendi
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
            console.error("HATA: 'main.z' bulunamadı.");
            return;
        }

        try {
            const finalCompiledCode = compileZLang(mainFileContent, 'main.z');
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

    // startCompiler fonksiyonu (Artık window.ZStart olarak çağrılacak)
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
                // Elementi hemen kaldırmak yerine, kullanıcı işlemi bittiğinde kaldırmak daha güvenli
                document.body.removeChild(input);
            } catch(e) {}
        });

        // input elementi tıklanmadan önce DOM'a eklenmeli
        input.style.display = 'none';
        document.body.appendChild(input);
        
        // Burası güvenlik açısından hassas nokta.
        // Kullanıcı komutu (ZStart()) bir kullanıcı hareketi sayıldığı için click çalışmalıdır.
        input.click();
    };

    // Konsola bilgilendirme mesajı
    console.log("%cZ Dili Derleyicisi Yüklendi. Başlamak için konsola ZStart() yazın.", 'color: #00aaff; font-weight: bold;');
})();


