// Aktien-Daten API Script für Drafts
// Liest aktuelle Aktiendaten aus und schreibt sie in den Draft
// Überwacht Schwellenwerte und löst Aktionen aus

// Funktion zum Parsen des Draft-Titels
function parseDraftTitel(titel) {
	// Format: "ADS.DE/min150/max250"
	console.log(`DEBUG: Parsing Titel = "${titel}"`);

	// Entferne Leerzeichen am Anfang und Ende sowie # Zeichen
	titel = titel.replace(/^#+\s*/, "").trim();
	console.log(`DEBUG: Titel nach Bereinigung = "${titel}"`);

	const parts = titel.split("/");
	console.log(`DEBUG: Parts = [${parts.join(", ")}]`);

	if (parts.length !== 3) {
		return {
			erfolg: false,
			fehler: `Ungültiges Titel-Format. Erwartet: "SYMBOL/minWERT/maxWERT", erhalten: "${titel}" (${parts.length} Teile statt 3)\n\nBeispiele:\n• ADS.DE/min150/max250\n• TSLA/min200/max300\n• SAP.DE/min120/max180`,
		};
	}

	const symbol = parts[0].trim();
	const minStr = parts[1].trim();
	const maxStr = parts[2].trim();

	console.log(
		`DEBUG: Symbol="${symbol}", MinStr="${minStr}", MaxStr="${maxStr}"`
	);

	// Extrahiere numerische Werte - noch flexiblere Regex
	const minMatch = minStr.match(/min\s*(\d+(?:[.,]\d+)?)/i);
	const maxMatch = maxStr.match(/max\s*(\d+(?:[.,]\d+)?)/i);

	console.log(`DEBUG: MinMatch=${minMatch}, MaxMatch=${maxMatch}`);

	if (!minMatch || !maxMatch) {
		return {
			erfolg: false,
			fehler: `Ungültiges Schwellenwert-Format.\n\nErwartet: min150/max250\nGefunden: "${minStr}" und "${maxStr}"\n\nBeispiele:\n• min150/max250\n• min 200/max 300\n• min120.5/max180.75`,
		};
	}

	// Ersetze Komma durch Punkt für parseFloat
	const minWert = parseFloat(minMatch[1].replace(",", "."));
	const maxWert = parseFloat(maxMatch[1].replace(",", "."));

	console.log(`DEBUG: MinWert=${minWert}, MaxWert=${maxWert}`);

	if (isNaN(minWert) || isNaN(maxWert)) {
		return {
			erfolg: false,
			fehler: `Ungültige Zahlenwerte: min=${minWert}, max=${maxWert}`,
		};
	}

	if (minWert >= maxWert) {
		return {
			erfolg: false,
			fehler: `Minimum (${minWert}) muss kleiner als Maximum (${maxWert}) sein`,
		};
	}

	return {
		erfolg: true,
		symbol: symbol,
		minWert: minWert,
		maxWert: maxWert,
	};
}

// Funktion zum Setzen von Markern im Draft
function setzeMarker(markerTyp, wert, schwellenwert) {
	const marker = `\n🚨 **${markerTyp.toUpperCase()}-ALARM**: Kurs ${wert.toFixed(
		2
	)}€ hat Schwellenwert ${schwellenwert}€ ${
		markerTyp === "minimum" ? "unterschritten" : "überschritten"
	}! ⚠️\n`;
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
📅 **Zeitpunkt:** ${new Date().toLocaleString("de-DE", {
		timeZone: "Europe/Berlin",
	})}

${
	markerTyp === "minimum"
		? "📉 Der Kurs ist unter den Minimum-Schwellenwert gefallen!"
		: "📈 Der Kurs hat den Maximum-Schwellenwert überschritten!"
}

#aktien-alarm #${symbol.toLowerCase().replace(".", "")} #schwellenwert
    `.trim();

	// Erstelle neuen Draft für die Alarm-Nachricht
	const alarmDraft = Draft.create();
	alarmDraft.title = nachrichtTitel;
	alarmDraft.content = nachrichtInhalt;
	alarmDraft.addTag("aktien-alarm");
	alarmDraft.addTag(symbol.toLowerCase().replace(".", ""));
	alarmDraft.update();

	// Hier können Sie zusätzliche Aktionen ausführen:
	// - E-Mail senden
	// - Slack/Teams Nachricht
	// - Push-Benachrichtigung

	return {
		erfolg: true,
		nachrichtId: alarmDraft.uuid,
		titel: nachrichtTitel,
	};
}

// Funktion zum Abrufen der Aktiendaten
async function holeAktiendaten(aktienSymbol) {
	// Korrigiere das Aktien-Symbol für Yahoo Finance
	// Deutsche Aktien benötigen oft .DE statt .de
	let correctedSymbol = aktienSymbol.toUpperCase();
	if (correctedSymbol === "ADS.DE") {
		correctedSymbol = "ADS.DE"; // Adidas Deutschland
	}

	const API_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${correctedSymbol}`;
	console.log(`DEBUG: API URL = ${API_URL}`);

	try {
		// HTTP Request an Yahoo Finance API
		let http = HTTP.create();
		let response = http.request({
			url: API_URL,
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
				Accept: "application/json, text/plain, */*",
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache",
				Pragma: "no-cache",
			},
		});

		console.log(`DEBUG: Response Status = ${response.statusCode}`);
		console.log(`DEBUG: Response Success = ${response.success}`);

		if (response.success && response.statusCode === 200) {
			let data = JSON.parse(response.responseText);
			console.log(`DEBUG: Received data structure:`, Object.keys(data));

			// Prüfe ob chart.result existiert
			if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
				return {
					erfolg: false,
					fehler: `Keine Daten für Symbol ${correctedSymbol} gefunden. Prüfen Sie das Aktien-Symbol.`,
				};
			}

			// Extrahiere relevante Daten
			let result = data.chart.result[0];
			let meta = result.meta;
			let quote = result.indicators.quote[0];

			console.log(`DEBUG: Meta:`, meta ? Object.keys(meta) : "undefined");

			// Aktueller Kurs
			let aktuellerKurs =
				meta.regularMarketPrice ||
				meta.previousClose ||
				(quote.close && quote.close[quote.close.length - 1]);

			if (!aktuellerKurs) {
				return {
					erfolg: false,
					fehler: `Kein aktueller Kurs für ${correctedSymbol} verfügbar`,
				};
			}

			let waehrung = meta.currency || "EUR";
			let marktStatus = meta.marketState || "UNKNOWN";

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
			let vorherSchlusskurs = meta.previousClose || aktuellerKurs;
			let veraenderung = aktuellerKurs - vorherSchlusskurs;
			let veraenderungProzent =
				vorherSchlusskurs > 0 ? (veraenderung / vorherSchlusskurs) * 100 : 0;

			// Formatiere die Ausgabe
			let ausgabe = `\n## 📈 ${correctedSymbol} Kursdaten\n`;
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
			ausgabe += `**Symbol:** ${correctedSymbol}\n`;
			ausgabe += `**Firmenname:** ${
				meta.longName || meta.shortName || "N/A"
			}\n`;

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
			// Erweiterte Fehlerbehandlung
			let errorDetails = `Status: ${response.statusCode}`;
			if (response.error) {
				errorDetails += `, Error: ${response.error}`;
			}
			if (response.responseText) {
				try {
					let errorData = JSON.parse(response.responseText);
					if (errorData.chart && errorData.chart.error) {
						errorDetails += `, API Error: ${errorData.chart.error.description}`;
					}
				} catch (e) {
					// Response ist kein JSON
					errorDetails += `, Response: ${response.responseText.substring(
						0,
						200
					)}`;
				}
			}

			return {
				erfolg: false,
				fehler: `HTTP Fehler: ${errorDetails}\n\nMögliche Lösungen:\n- Prüfen Sie das Symbol: ${correctedSymbol}\n- Versuchen Sie die alternative API\n- Symbol könnte anders geschrieben sein (z.B. ADS.DE vs ADDYY)`,
			};
		}
	} catch (error) {
		return {
			erfolg: false,
			fehler: `Fehler beim Abrufen der Daten: ${error.message}\n\nTipp: Versuchen Sie die alternative API`,
		};
	}
}

// Alternative API-Funktion (Finnhub - kostenlos ohne API-Key für Basis-Daten)
async function holeAktiendatenAlternativ(aktienSymbol) {
	// Finnhub API (kostenlos für Basis-Daten)
	let symbol = aktienSymbol.toUpperCase();

	// Deutsche Aktien für Finnhub anpassen
	if (symbol === "ADS.DE") {
		symbol = "ADS.DE";
	}

	const FINNHUB_URL = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=demo`;
	console.log(`DEBUG: Alternative API URL = ${FINNHUB_URL}`);

	try {
		let http = HTTP.create();
		let response = http.request({
			url: FINNHUB_URL,
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; DraftsApp/1.0)",
			},
		});

		console.log(`DEBUG: Finnhub Response Status = ${response.statusCode}`);

		if (response.success && response.statusCode === 200) {
			let data = JSON.parse(response.responseText);
			console.log(`DEBUG: Finnhub data:`, data);

			// Prüfe ob gültige Daten vorhanden sind
			if (!data.c || data.c === 0) {
				return {
					erfolg: false,
					fehler: `Keine Daten für Symbol ${symbol} in Finnhub gefunden`,
				};
			}

			let aktuellerKurs = data.c; // Current price
			let vorherSchlusskurs = data.pc; // Previous close
			let veraenderung = aktuellerKurs - vorherSchlusskurs;
			let veraenderungProzent = (veraenderung / vorherSchlusskurs) * 100;

			let zeitstempel = new Date().toLocaleString("de-DE", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				timeZone: "Europe/Berlin",
			});

			let ausgabe = `\n## 📈 ${symbol} Kursdaten (Finnhub)\n`;
			ausgabe += `**Zeitstempel:** ${zeitstempel}\n`;
			ausgabe += `**Aktueller Kurs:** ${aktuellerKurs.toFixed(2)} EUR\n`;
			ausgabe += `**Vorheriger Schluss:** ${vorherSchlusskurs.toFixed(
				2
			)} EUR\n`;
			ausgabe += `**Veränderung:** ${
				veraenderung >= 0 ? "+" : ""
			}${veraenderung.toFixed(2)} EUR (${
				veraenderung >= 0 ? "+" : ""
			}${veraenderungProzent.toFixed(2)}%)\n`;
			ausgabe += `**Höchstkurs heute:** ${data.h.toFixed(2)} EUR\n`;
			ausgabe += `**Tiefstkurs heute:** ${data.l.toFixed(2)} EUR\n`;
			ausgabe += `**Eröffnungskurs:** ${data.o.toFixed(2)} EUR\n`;
			ausgabe += `**Symbol:** ${symbol}\n`;

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
		}

		return {
			erfolg: false,
			fehler: `Finnhub API Fehler: Status ${response.statusCode}`,
		};
	} catch (error) {
		return {
			erfolg: false,
			fehler: `Finnhub Fehler: ${error.message}`,
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

	// Debug: Zeige den aktuellen Titel an
	let title = draft.title;
	console.log(`DEBUG: Draft-Titel (original) = "${title}"`);

	// Entferne # aus dem Titel (Markdown-Header)
	if (title) {
		title = title.replace(/^#+\s*/, "").trim(); // Entfernt # am Anfang und folgende Leerzeichen
	}
	console.log(`DEBUG: Draft-Titel (bereinigt) = "${title}"`);

	// Fallback für leeren Titel
	if (!title || title.trim() === "") {
		alert(
			"❌ Draft-Titel ist leer!\n\nBitte setzen Sie den Titel im Format: 'ADS.DE/min150/max250'\n(ohne # am Anfang)"
		);
		context.cancel();
		return;
	}

	// Parse den Draft-Titel für Symbol und Schwellenwerte
	const titelInfo = parseDraftTitel(title);

	if (!titelInfo.erfolg) {
		alert(
			`❌ Titel-Parsing-Fehler: ${titelInfo.fehler}\n\nAktueller Titel: "${title}"\nErwartetes Format: "ADS.DE/min150/max250"`
		);
		context.cancel();
		return;
	}

	const { symbol, minWert, maxWert } = titelInfo;
	console.log(`DEBUG: Symbol = ${symbol}, Min = ${minWert}, Max = ${maxWert}`);

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
			const nachrichtErgebnis = sendeAlarmNachricht(
				symbol,
				aktuellerKurs,
				"minimum",
				minWert
			);
			if (nachrichtErgebnis.erfolg) {
				markersGesetzt.push(`Minimum-Alarm (${nachrichtErgebnis.titel})`);
			}
		}

		if (aktuellerKurs >= maxWert) {
			// Maximum-Schwellenwert überschritten
			const marker = setzeMarker("maximum", aktuellerKurs, maxWert);
			zusaetzlicheAusgabe += marker;

			// Sende Alarm-Nachricht
			const nachrichtErgebnis = sendeAlarmNachricht(
				symbol,
				aktuellerKurs,
				"maximum",
				maxWert
			);
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
		let neuerInhalt =
			aktuellerInhalt +
			ergebnis.daten +
			schwellenwertInfo +
			zusaetzlicheAusgabe;

		draft.content = neuerInhalt;
		draft.update();

		// Erfolgs-Nachricht
		let successPrompt = Prompt.create();
		successPrompt.title = "✅ Aktiendaten aktualisiert";
		let nachricht = `${symbol}: ${ergebnis.kurs.toFixed(2)}€\nVeränderung: ${
			ergebnis.veraenderung >= 0 ? "+" : ""
		}${ergebnis.veraenderung.toFixed(2)}€\nZeit: ${
			ergebnis.zeitstempel
		}\n\nSchwellenwerte: ${minWert}€ - ${maxWert}€`;

		if (markersGesetzt.length > 0) {
			nachricht += `\n\n🚨 ALARME AUSGELÖST:\n${markersGesetzt.join("\n")}`;
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
						zusaetzlicheAusgabe += setzeMarker(
							"minimum",
							aktuellerKurs,
							minWert
						);
						sendeAlarmNachricht(symbol, aktuellerKurs, "minimum", minWert);
					}

					if (aktuellerKurs >= maxWert) {
						zusaetzlicheAusgabe += setzeMarker(
							"maximum",
							aktuellerKurs,
							maxWert
						);
						sendeAlarmNachricht(symbol, aktuellerKurs, "maximum", maxWert);
					}

					let aktuellerInhalt = draft.content;
					let neuerInhalt =
						aktuellerInhalt + alternativErgebnis.daten + zusaetzlicheAusgabe;

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
