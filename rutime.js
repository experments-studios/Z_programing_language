// =========================================================
// ZLANG DERLEYİCİSİ V3.0 - SADECE TARAYICI KONSOLU İÇİN
// =========================================================

/**
 * Z Dili (ZLang) kodunu JavaScript'e derler.
 * @param {string} zCode - Derlenecek Z Dili kodu.
 * @returns {string} - Oluşturulan JavaScript kodu.
 */
function compileZLang(zCode) {
    const lines = zCode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let jsOutput = '// Z Dili Derleyici Çıktısı (ZLang to JS)\n\n';

    let inJsAddon = false;
    let inHtmlAddon = false;

    for (const line of lines) {
        let jsLine = '';

        // --- ADDON (Eklenti) Kontrolü ---
        if (line.startsWith('<addon^index/set^js>')) {
            inJsAddon = true;
            continue;
        } else if (line.startsWith('<addon^js>')) {
            inJsAddon = false;
            jsOutput += '\n';
            continue;
        } else if (inJsAddon) {
            jsOutput += line + '\n';
            continue;
        }
        
        if (line.startsWith('<addon^index/set^html>')) {
            inHtmlAddon = true;
            jsOutput += '/* HTML Eklentisi Başlangıcı:\n';
            continue;
        } else if (line.startsWith('<addon^html>')) {
            inHtmlAddon = false;
            jsOutput += '*/\n';
            continue;
        } else if (inHtmlAddon) {
            jsOutput += line + '\n';
            continue;
        }
        // --- ADDON Bitişi ---

        if (!inJsAddon && !inHtmlAddon) {
            
            const printIndexMatch = line.match(/^<print\^set\.index="([^"]+)">$/);
            if (printIndexMatch) {
                jsLine = `console.log("${printIndexMatch[1]}");`;
            }
            
            else if (line.startsWith('<print\^set\.incode=')) {
                const incodeValue = line.match(/^<print\^set\.incode="([^"]+)">$/);
                if (incodeValue) {
                    jsLine = `console.log(${incodeValue[1]});`;
                }
            }
            
            else if (line.startsWith('<set^')) {
                const setMatch = line.match(/^<set\^(\w+)\s*=\s*(.*)$/);
                if (setMatch) {
                    const varName = setMatch[1].trim();
                    const value = setMatch[2].trim();
                    jsLine = `let ${varName} = ${value};`;
                }
            }
            
            else if (line.startsWith('<import^z=')) {
                const importMatch = line.match(/^<import\^z="([^"]+\.z)">$/);
                if (importMatch) {
                    const libName = importMatch[1];
                    jsLine = `// ZLang Import: ${libName} (Harici modül içe aktarma simülasyonu)`;
                }
            }
            
            else {
                if (line.startsWith('//') || line.startsWith('#')) {
                     jsLine = line; 
                } else {
                     jsLine = `// HATA: Tanınmayan ZLang komutu: ${line}`;
                }
            }

            if (jsLine) {
                jsOutput += jsLine + '\n';
            }
        }
    }

    return jsOutput;
}

// =========================================================
// DERLEME PROSEDÜRÜNÜ BAŞLATAN FONKSİYON
// (compile << file^commmand simülasyonu)
// =========================================================

function startZCompiler() {
    console.clear();
    console.log("%c========================================", 'color: blue; font-weight: bold;');
    console.log("%cZ DİLİ DERLEYİCİSİ BAŞLATILIYOR (Konsol Modu)", 'color: blue; font-weight: bold;');
    console.log("%c========================================", 'color: blue; font-weight: bold;');
    console.log("\n-> Z Kodunu okumak için bir dosya seçmeniz gerekmektedir.");
    console.log("-> Bu, sizin istediğiniz 'compile << file^commmand' komutunun tarayıcıdaki karşılığıdır.");

    // Geçici bir dosya giriş elementi oluştur
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.z'; // Sadece .z uzantılı dosyaları kabul et

    // Dosya seçildiğinde çalışacak olay dinleyicisi
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];

        if (!file) {
            console.error("HATA: Dosya seçimi iptal edildi.");
            return;
        }

        if (!file.name.endsWith('.z')) {
            console.error(`HATA: Lütfen bir .z uzantılı dosya seçin. Seçilen: ${file.name}`);
            return;
        }

        const reader = new FileReader();

        // Dosya okuma başarılı olduğunda
        reader.onload = function(e) {
            const zCode = e.target.result;
            try {
                // 1. Derleme işlemini çalıştır
                const compiledCode = compileZLang(zCode);
                
                // 2. Kullanıcıya derlenmiş JS kodunu ver
                console.log("\n%c*** DERLEME BAŞARILI! ***", 'color: green; font-weight: bold; font-size: 1.1em;');
                console.log(`Dosya Adı: ${file.name}`);
                
                console.log("\n%c========================================", 'color: purple;');
                console.log("%cDERLENMİŞ JAVASCRIPT KODU ÇIKTISI (.js)", 'color: purple; font-weight: bold;');
                console.log("%c(Bu kodu kopyalayıp .js dosyası olarak kaydedebilirsiniz)", 'color: purple;');
                console.log("%c========================================", 'color: purple;');
                console.log(compiledCode);
                console.log("%c========================================\n", 'color: purple;');
                
                // 3. (Opsiyonel) Kodu doğrudan çalıştır
                console.log("\n%c=== DERLENMİŞ KODUN ÇALIŞTIRILMASI SONUCU ===", 'color: #ff9900; font-weight: bold;');
                eval(compiledCode);
                console.log("%c==============================================", 'color: #ff9900;');

            } catch (error) {
                console.error("DERLEME İŞLEMİ SIRASINDA KRİTİK HATA:", error.message);
            }
        };
        
        reader.onerror = function() {
            console.error("HATA: Dosya okuma işlemi başarısız oldu.");
        };

        // Dosyayı metin olarak oku
        reader.readAsText(file);
    });

    // Dosya seçme penceresini açmak için elementi tıklat
    input.click(); 
}

// Fonksiyonu hemen çalıştır (Konsola yapıştırıldıktan sonra)
startZCompiler();