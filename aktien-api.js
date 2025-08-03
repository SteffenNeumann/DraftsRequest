// Aktien-Daten API Script für Drafts
// Liest aktuelle Aktiendaten aus und schreibt sie in den Draft
// Überwacht Schwellenwerte und löst Aktionen aus

// Funktion zum Parsen des Draft-Titels
function parseDraftTitel(titel) {
    // Format: "ADS.DE/min150/max250"
    const parts = titel.split('/');
    
    if (parts.length !== 3) {
        return {
            erfolg: false,
            fehler: `Ungültiges Titel-Format. Erwartet: "SYMBOL/minWERT/maxWERT", erhalten: "${titel}"`
        };
    }
    
    const symbol = parts[0].trim();
    const minStr = parts[1].trim();
    const maxStr = parts[2].trim();
    
    // Extrahiere numerische Werte
    const minMatch = minStr.match(/min(\d+(?:\.\d+)?)/i);
    const maxMatch = maxStr.match(/max(\d+(?:\.\d+)?)/i);
    
    if (!minMatch || !maxMatch) {
        return {
            erfolg: false,
            fehler: `Ungültiges Schwellenwert-Format. Verwenden Sie: min150/max250`
        };
    }
    
    const minWert = parseFloat(minMatch[1]);
    const maxWert = parseFloat(maxMatch[1]);
    
    if (minWert >= maxWert) {
        return {
            erfolg: false,
            fehler: `Minimum (${minWert}) muss kleiner als Maximum (${maxWert}) sein`
        };
    }
    
    return {
        erfolg: true,
        symbol: symbol,
        minWert: minWert,
        maxWert: maxWert
    };
}

// Funktion zum Setzen von Markern im Draft
function setzeMarker(markerTyp, wert, schwellenwert) {
    const marker = `\n🚨 **${markerTyp.toUpperCase()}-ALARM**: Kurs ${wert.toFixed(2)}€ hat Schwellenwert ${schwellenwert}€ ${markerTyp === 'minimum' ? 'unterschritten' : 'überschritten'}! ⚠️\n`;
    return marker;
}

// Funktion zum Senden einer Nachricht (Drafts Action)
function sendeAlarmNachricht(symbol, kurs, markerTyp, schwellenwert) {
    // Erstelle neue Nachricht
    const nachrichtTitel = `🚨 ${symbol} ${markerTyp.toUpperCase()}-ALARM`;
    const nachrichtInhalt = `
📊 **Aktien-Alarm für ${symbol}**

🚨 **${markerTyp.toUpperCase()}-Schwellenwert erreicht!**

💰 **Aktueller Kurs:** ${kurs.toFixed(2)}€
⚠️ **Schwellenwert:** ${schwellenwert}€
📅 **Zeitpunkt:** ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}

${markerTyp === 'minimum' ? '📉 Der Kurs ist unter den Minimum-Schwellenwert gefallen!' : '📈 Der Kurs hat den Maximum-Schwellenwert überschritten!'}

#aktien-alarm #${symbol.toLowerCase().replace('.', '')} #schwellenwert
    `.trim();
    
    // Erstelle neuen Draft für die Alarm-Nachricht
    const alarmDraft = Draft.create();
    alarmDraft.title = nachrichtTitel;
    alarmDraft.content = nachrichtInhalt;
    alarmDraft.addTag("aktien-alarm");
    alarmDraft.addTag(symbol.toLowerCase().replace('.', ''));
    alarmDraft.update();
    
    // Hier können Sie zusätzliche Aktionen ausführen:
    // - E-Mail senden
    // - Slack/Teams Nachricht
    // - Push-Benachrichtigung
    
    return {
        erfolg: true,
        nachrichtId: alarmDraft.uuid,
        titel: nachrichtTitel
    };
}

// Funktion zum Abrufen der Aktiendaten
async function holeAktiendaten(aktienSymbol) {
    const API_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${aktienSymbol}`;
    
	try {
		// HTTP Request an Yahoo Finance API
		let http = HTTP.create();
		let response = http.request({
			url: API_URL,
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			},
		});

		if (response.success) {
			let data = JSON.parse(response.responseText);

			// Extrahiere relevante Daten
			let result = data.chart.result[0];
			let meta = result.meta;
			let quote = result.indicators.quote[0];

			// Aktueller Kurs
			let aktuellerKurs =
				meta.regularMarketPrice || quote.close[quote.close.length - 1];
			let waehrung = meta.currency;
			let marktStatus = meta.marketState;

			// Zeitstempel
			let timestamp = new Date();
			let zeitstempel = timestamp.toLocaleString("de-DE", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				timeZone: "Europe/Berlin",
			});

			// Vorherige Schlusskurs für Veränderung
			let vorherSchlusskurs = meta.previousClose;
			let veraenderung = aktuellerKurs - vorherSchlusskurs;
			let veraenderungProzent = (veraenderung / vorherSchlusskurs) * 100;

			// Formatiere die Ausgabe
			let ausgabe = `\n## 📈 ${aktienSymbol} Kursdaten\n`;
			ausgabe += `**Zeitstempel:** ${zeitstempel}\n`;
			ausgabe += `**Aktueller Kurs:** ${aktuellerKurs.toFixed(
				2
			)} ${waehrung}\n`;
			ausgabe += `**Vorheriger Schluss:** ${vorherSchlusskurs.toFixed(
				2
			)} ${waehrung}\n`;
			ausgabe += `**Veränderung:** ${
				veraenderung >= 0 ? "+" : ""
			}${veraenderung.toFixed(2)} ${waehrung} (${
				veraenderung >= 0 ? "+" : ""
			}${veraenderungProzent.toFixed(2)}%)\n`;
			ausgabe += `**Markt Status:** ${marktStatus}\n`;
			ausgabe += `**Symbol:** ${meta.symbol}\n`;
			ausgabe += `**Firmenname:** ${meta.longName || meta.shortName}\n`;

			// Füge Trend-Emoji hinzu
			let trendEmoji = veraenderung >= 0 ? "📈" : "📉";
			ausgabe = ausgabe.replace("📈", trendEmoji);

			return {
				erfolg: true,
				daten: ausgabe,
				kurs: aktuellerKurs,
				veraenderung: veraenderung,
				zeitstempel: zeitstempel,
			};
		} else {
			return {
				erfolg: false,
				fehler: `HTTP Fehler: ${response.statusCode} - ${response.error}`,
			};
		}
	} catch (error) {
		return {
			erfolg: false,
			fehler: `Fehler beim Abrufen der Daten: ${error.message}`,
		};
	}
}

// Alternative API-Funktion (Alpha Vantage - falls Yahoo Finance nicht funktioniert)
async function holeAktiendatenAlternativ(aktienSymbol) {
	// Für Alpha Vantage benötigen Sie einen kostenlosen API-Schlüssel
	const API_KEY = "YOUR_API_KEY_HERE"; // Ersetzen Sie dies durch Ihren API-Schlüssel
	const ALPHA_URL = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${aktienSymbol}&apikey=${API_KEY}`;

	try {
		let http = HTTP.create();
		let response = http.request({
			url: ALPHA_URL,
			method: "GET",
		});

		if (response.success) {
			let data = JSON.parse(response.responseText);
			let quote = data["Global Quote"];

			if (quote) {
				let aktuellerKurs = parseFloat(quote["05. price"]);
				let veraenderung = parseFloat(quote["09. change"]);
				let veraenderungProzent = parseFloat(
					quote["10. change percent"].replace("%", "")
				);

				let zeitstempel = new Date().toLocaleString("de-DE", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					timeZone: "Europe/Berlin",
				});

				let ausgabe = `\n## 📈 ${aktienSymbol} Kursdaten (Alpha Vantage)\n`;
				ausgabe += `**Zeitstempel:** ${zeitstempel}\n`;
				ausgabe += `**Aktueller Kurs:** ${aktuellerKurs.toFixed(2)} EUR\n`;
				ausgabe += `**Veränderung:** ${
					veraenderung >= 0 ? "+" : ""
				}${veraenderung.toFixed(2)} EUR (${
					veraenderung >= 0 ? "+" : ""
				}${veraenderungProzent.toFixed(2)}%)\n`;
				ausgabe += `**Symbol:** ${quote["01. symbol"]}\n`;

				return {
					erfolg: true,
					daten: ausgabe,
					kurs: aktuellerKurs,
					veraenderung: veraenderung,
					zeitstempel: zeitstempel,
				};
			}
		}

		return {
			erfolg: false,
			fehler: "Keine Daten von Alpha Vantage erhalten",
		};
	} catch (error) {
		return {
			erfolg: false,
			fehler: `Alpha Vantage Fehler: ${error.message}`,
		};
	}
}

// Hauptfunktion
async function hauptfunktion() {
	// Prüfe ob ein Draft aktiv ist
	if (!draft) {
		alert("❌ Kein aktiver Draft gefunden!");
		context.cancel();
		return;
	}

	// Parse den Draft-Titel für Symbol und Schwellenwerte
	const titelInfo = parseDraftTitel(draft.title);
	
	if (!titelInfo.erfolg) {
		alert(`❌ Titel-Parsing-Fehler: ${titelInfo.fehler}\n\nErwartetes Format: "ADS.DE/min150/max250"`);
		context.cancel();
		return;
	}

	const { symbol, minWert, maxWert } = titelInfo;

	// Zeige Ladeanzeige
	let loadingPrompt = Prompt.create();
	loadingPrompt.title = "📊 Lade Aktiendaten...";
	loadingPrompt.message = `Rufe aktuelle Kursdaten für ${symbol} ab...\nÜberwache Schwellenwerte: ${minWert}€ - ${maxWert}€`;
	loadingPrompt.addButton("Abbrechen");

	// Starte den API-Aufruf
	let ergebnis = await holeAktiendaten(symbol);

	if (ergebnis.erfolg) {
		const aktuellerKurs = ergebnis.kurs;
		let markersGesetzt = [];
		let zusaetzlicheAusgabe = "";

		// Prüfe Schwellenwerte
		if (aktuellerKurs <= minWert) {
			// Minimum-Schwellenwert unterschritten
			const marker = setzeMarker("minimum", aktuellerKurs, minWert);
			zusaetzlicheAusgabe += marker;
			
			// Sende Alarm-Nachricht
			const nachrichtErgebnis = sendeAlarmNachricht(symbol, aktuellerKurs, "minimum", minWert);
			if (nachrichtErgebnis.erfolg) {
				markersGesetzt.push(`Minimum-Alarm (${nachrichtErgebnis.titel})`);
			}
		}

		if (aktuellerKurs >= maxWert) {
			// Maximum-Schwellenwert überschritten
			const marker = setzeMarker("maximum", aktuellerKurs, maxWert);
			zusaetzlicheAusgabe += marker;
			
			// Sende Alarm-Nachricht
			const nachrichtErgebnis = sendeAlarmNachricht(symbol, aktuellerKurs, "maximum", maxWert);
			if (nachrichtErgebnis.erfolg) {
				markersGesetzt.push(`Maximum-Alarm (${nachrichtErgebnis.titel})`);
			}
		}

		// Füge Schwellenwert-Info zur Ausgabe hinzu
		let schwellenwertInfo = `**Überwachte Schwellenwerte:** ${minWert}€ - ${maxWert}€\n`;
		if (aktuellerKurs > minWert && aktuellerKurs < maxWert) {
			schwellenwertInfo += `✅ **Status:** Kurs im normalen Bereich\n`;
		}

		// Erfolg: Daten an Draft anhängen
		let aktuellerInhalt = draft.content;
		let neuerInhalt = aktuellerInhalt + ergebnis.daten + schwellenwertInfo + zusaetzlicheAusgabe;

		draft.content = neuerInhalt;
		draft.update();

		// Erfolgs-Nachricht
		let successPrompt = Prompt.create();
		successPrompt.title = "✅ Aktiendaten aktualisiert";
		let nachricht = `${symbol}: ${ergebnis.kurs.toFixed(2)}€\nVeränderung: ${
			ergebnis.veraenderung >= 0 ? "+" : ""
		}${ergebnis.veraenderung.toFixed(2)}€\nZeit: ${ergebnis.zeitstempel}\n\nSchwellenwerte: ${minWert}€ - ${maxWert}€`;
		
		if (markersGesetzt.length > 0) {
			nachricht += `\n\n🚨 ALARME AUSGELÖST:\n${markersGesetzt.join('\n')}`;
		}

		successPrompt.message = nachricht;
		successPrompt.addButton("OK");
		successPrompt.show();

	} else {
		// Fehler: Zeige Fehlermeldung
		let errorPrompt = Prompt.create();
		errorPrompt.title = "❌ Fehler beim Laden der Aktiendaten";
		errorPrompt.message = ergebnis.fehler;
		errorPrompt.addButton("OK");

		// Biete alternative API an
		errorPrompt.addButton("Alternative API versuchen");

		if (errorPrompt.show()) {
			let selected = errorPrompt.buttonPressed;

			if (selected === "Alternative API versuchen") {
				let alternativErgebnis = await holeAktiendatenAlternativ(symbol);

				if (alternativErgebnis.erfolg) {
					// Schwellenwert-Prüfung auch für alternative API
					const aktuellerKurs = alternativErgebnis.kurs;
					let zusaetzlicheAusgabe = "";

					if (aktuellerKurs <= minWert) {
						zusaetzlicheAusgabe += setzeMarker("minimum", aktuellerKurs, minWert);
						sendeAlarmNachricht(symbol, aktuellerKurs, "minimum", minWert);
					}

					if (aktuellerKurs >= maxWert) {
						zusaetzlicheAusgabe += setzeMarker("maximum", aktuellerKurs, maxWert);
						sendeAlarmNachricht(symbol, aktuellerKurs, "maximum", maxWert);
					}

					let aktuellerInhalt = draft.content;
					let neuerInhalt = aktuellerInhalt + alternativErgebnis.daten + zusaetzlicheAusgabe;

					draft.content = neuerInhalt;
					draft.update();

					alert("✅ Aktiendaten über alternative API erfolgreich geladen!");
				} else {
					alert(
						`❌ Alternative API fehlgeschlagen: ${alternativErgebnis.fehler}`
					);
				}
			}
		}
	}
}

// Script ausführen
hauptfunktion();
