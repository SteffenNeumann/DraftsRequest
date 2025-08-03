// Aktien-Daten API Script für Drafts
// Liest aktuelle Aktiendaten aus und schreibt sie in den Draft

// Konfiguration
const AKTIEN_SYMBOL = "ADS.DE"; // Adidas Symbol für Yahoo Finance
const API_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${AKTIEN_SYMBOL}`;

// Funktion zum Abrufen der Aktiendaten
async function holeAktiendaten() {
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
			let ausgabe = `\n## 📈 ${AKTIEN_SYMBOL} Kursdaten\n`;
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
async function holeAktiendatenAlternativ() {
	// Für Alpha Vantage benötigen Sie einen kostenlosen API-Schlüssel
	const API_KEY = "YOUR_API_KEY_HERE"; // Ersetzen Sie dies durch Ihren API-Schlüssel
	const ALPHA_URL = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${AKTIEN_SYMBOL}&apikey=${API_KEY}`;

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

				let ausgabe = `\n## 📈 ${AKTIEN_SYMBOL} Kursdaten (Alpha Vantage)\n`;
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

	// Zeige Ladeanzeige
	let loadingPrompt = Prompt.create();
	loadingPrompt.title = "📊 Lade Aktiendaten...";
	loadingPrompt.message = `Rufe aktuelle Kursdaten für ${AKTIEN_SYMBOL} ab...`;
	loadingPrompt.addButton("Abbrechen");

	// Starte den API-Aufruf
	let ergebnis = await holeAktiendaten();

	if (ergebnis.erfolg) {
		// Erfolg: Daten an Draft anhängen
		let aktuellerInhalt = draft.content;
		let neuerInhalt = aktuellerInhalt + ergebnis.daten;

		draft.content = neuerInhalt;
		draft.update();

		// Erfolgs-Nachricht
		let successPrompt = Prompt.create();
		successPrompt.title = "✅ Aktiendaten aktualisiert";
		successPrompt.message = `${AKTIEN_SYMBOL}: ${ergebnis.kurs.toFixed(
			2
		)} EUR\nVeränderung: ${
			ergebnis.veraenderung >= 0 ? "+" : ""
		}${ergebnis.veraenderung.toFixed(2)} EUR\nZeit: ${ergebnis.zeitstempel}`;
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
				let alternativErgebnis = await holeAktiendatenAlternativ();

				if (alternativErgebnis.erfolg) {
					let aktuellerInhalt = draft.content;
					let neuerInhalt = aktuellerInhalt + alternativErgebnis.daten;

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
