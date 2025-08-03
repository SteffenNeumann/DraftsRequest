// App-Kosten Diagramm-Generator (automatische Datensammlung aus Drafts)

// Funktion zum Durchsuchen und Sammeln von App-Daten
function sammleAppDaten() {
	// Definiere das Tag wie im Beispielscript
	const appTag = "abo";

	// Verwende die korrekte Drafts API-Syntax: query(content, folder, tags)
	let appDrafts = Draft.query("", "all", [appTag]);

	let appDaten = [];

	for (let draft of appDrafts) {
		let content = draft.content;
		let lines = content.split("\n");

		let appInfo = {
			name: "",
			preis: 0,
			intervall: "M",
			kategorie: "Sonstiges",
			monatlicheWerte: [], // Für Verlaufsdiagramme
			zusatzPreise: [], // Sammle alle gefundenen Preise
		};

		// Extrahiere App-Informationen aus dem Draft-Inhalt
		let inCodeBlock = false;

		for (let line of lines) {
			line = line.trim();

			// Prüfe auf Markdown-Codeblock Start/Ende
			if (line.startsWith("```")) {
				inCodeBlock = !inCodeBlock;
				continue;
			}

			// App-Name aus Titel-Zeile (beginnt mit #) - nur außerhalb von Codeblöcken
			if (!inCodeBlock && line.startsWith("#") && !appInfo.name) {
				appInfo.name = line.replace("#", "").trim();
			}

			// Preis-Extraktion für dein Template-Format: "Preis/Monat:" oder "Preis/Jahr:"
			// Sammle ALLE Preise (auch aus Notizen und Codeblöcken)
			let preisMatch = line.match(
				/Preis\s*\/\s*(Monat|Jahr)\s*:\s*([0-9,\.]+)/i
			);
			if (preisMatch) {
				let gefundenerPreis = parseFloat(preisMatch[2].replace(",", "."));
				let gefundenerIntervall = preisMatch[1].toLowerCase().includes("jahr")
					? "J"
					: "M";

				// Hauptpreis setzen (erster gefundener Preis außerhalb von Codeblöcken)
				if (!inCodeBlock && appInfo.preis === 0) {
					appInfo.preis = gefundenerPreis;
					appInfo.intervall = gefundenerIntervall;
				} else {
					// Zusätzliche Preise sammeln
					appInfo.zusatzPreise.push({
						preis: gefundenerPreis,
						intervall: gefundenerIntervall,
					});
				}
			}

			// Kategorie-Extraktion für dein Template-Format: "Kategorie :" - nur außerhalb von Codeblöcken
			if (!inCodeBlock) {
				let kategorieMatch = line.match(/^Kategorie\s*:\s*(.+)/i);
				if (kategorieMatch) {
					appInfo.kategorie = kategorieMatch[1].trim();
				}
			}

			// Monatliche Werte für Verlaufsdiagramme
			let verlaufMatch = line.match(
				/(?:verlauf|monthly|monatlich|monatliche\s+kosten).*?[:=\s]+(.+)/i
			);
			if (verlaufMatch) {
				appInfo.monatlicheWerte = verlaufMatch[1]
					.split(",")
					.map((w) => parseFloat(w.trim().replace(",", ".")));
			}
		}

		// Verwende Draft-Titel als App-Name falls nicht gefunden
		if (!appInfo.name) {
			appInfo.name = draft.title.replace(/#/g, "").trim();
		}

		// Summiere alle Preise (Hauptpreis + Zusatzpreise)
		if (appInfo.zusatzPreise.length > 0) {
			let gesamtpreis = appInfo.preis;

			// Konvertiere Hauptpreis zu jährlich für einheitliche Berechnung
			let hauptpreisJaehrlich =
				appInfo.intervall === "J" ? appInfo.preis : appInfo.preis * 12;

			// Addiere alle Zusatzpreise (konvertiert zu jährlich)
			for (let zusatz of appInfo.zusatzPreise) {
				let zusatzJaehrlich =
					zusatz.intervall === "J" ? zusatz.preis : zusatz.preis * 12;
				hauptpreisJaehrlich += zusatzJaehrlich;
			}

			// Setze Gesamtpreis zurück (basierend auf ursprünglichem Intervall)
			appInfo.preis =
				appInfo.intervall === "J"
					? hauptpreisJaehrlich
					: hauptpreisJaehrlich / 12;
		}

		// Füge nur Apps mit gültigen Daten hinzu
		if (appInfo.name && appInfo.preis > 0) {
			appDaten.push(appInfo);
		}
	}

	return appDaten;
}

// Sammle App-Daten
var appDaten = sammleAppDaten();

if (appDaten.length === 0) {
	alert(
		"⚠️ Keine App-Daten gefunden! Erstellen Sie Drafts mit dem Tag 'abo' und verwenden Sie das Template:\n\n# App Name\nPreis/Monat: 19.99\nPreis/Jahr: 239.88\nKategorie: Streaming\nAbo seit: [[date]]\n\n> Notes"
	);
	Script.complete();
}

// ------------------ 1. Balkendiagramm (Apps/Preis) --------------------
// Verwende gesammelte App-Daten
var apps = [];
for (var i = 0; i < appDaten.length; i++) {
	var app = appDaten[i];
	var monatlich = app.intervall == "M" ? app.preis : app.preis / 12;
	apps.push({
		name: app.name,
		originalPreis: app.preis,
		intervall: app.intervall == "M" ? "Monatlich" : "Jährlich",
		monatlicheKosten: monatlich,
	});
}

// Sortierung und Diagrammaufbau
apps.sort((a, b) => b.monatlicheKosten - a.monatlicheKosten);
var maxKosten = Math.max(...apps.map((app) => app.monatlicheKosten));
var skalierung = 25;
var gesamtMonatlich = apps.reduce((sum, app) => sum + app.monatlicheKosten, 0);
var gesamtJaehrlich = gesamtMonatlich * 12;

var diagramm = `## ABO-KOSTEN VERGLEICH\n\n`;
diagramm += `**${apps.length} Abos,Gesamtkosten:** ${gesamtMonatlich.toFixed(
	2
)}€/Monat • ${gesamtJaehrlich.toFixed(2)}€/Jahr\n\n`;

apps.forEach(function (app) {
	var balkenLaenge = Math.round(
		(app.monatlicheKosten / maxKosten) * skalierung
	);
	var balken = "▓".repeat(balkenLaenge);
	var appName = `[[${app.name}]]`.padEnd(18);
	var kosten = `${app.monatlicheKosten.toFixed(2)}€`;
	diagramm += `${appName}|${balken}   ${kosten}\n`;
});

diagramm += `\n\n`;

// ------------------ 2. Kreisdiagramm (Kategorien/Preis) --------------------
// Gruppiere Apps nach Kategorien
var kategorienMap = {};

for (var i = 0; i < appDaten.length; i++) {
	var app = appDaten[i];
	var monatlich = app.intervall == "M" ? app.preis : app.preis / 12;
	var kategorie = app.kategorie || "Sonstiges";

	if (!kategorienMap[kategorie]) {
		kategorienMap[kategorie] = 0;
	}
	kategorienMap[kategorie] += monatlich;
}

var kategorien = Object.keys(kategorienMap);
var kosten = Object.values(kategorienMap);

if (kategorien.length > 0) {
	var gesamt = kosten.reduce((sum, k) => sum + k, 0);
	var prozente = kosten.map((k) => (k / gesamt) * 100);

	diagramm += "##  KATEGORIEN-ÜBERSICHT\n\n";

	var icons = ["📺", "💼", "🎮", "🎵", "☁️", "📚", "🛒", "🏃", "📱", "🎨"];
	var sortiert = kategorien
		.map((kat, i) => ({
			name: kat,
			kosten: kosten[i] || 0,
			prozent: prozente[i] || 0,
		}))
		.sort((a, b) => b.kosten - a.kosten);

	sortiert.forEach(function (item, idx) {
		var icon = icons[idx % icons.length];
		var balkenLaenge = Math.round((item.prozent / 100) * 6); // Angepasst für kürzere Balken
		// Entferne ANSI-Farbcodes, da sie in Drafts nicht unterstützt werden
		var balken = "▒".repeat(balkenLaenge);
		var kategorieName = item.name.padEnd(18);
		var kategorieKosten = `${item.kosten.toFixed(2)}€`.padStart(8);
		var kategorieProzent = `${item.prozent.toFixed(1)}%`.padStart(6);
		diagramm += `${icon} ${kategorieName} ${kategorieKosten}   ${kategorieProzent} |${balken}\n`;
	});

	diagramm += `\n`;
}

// ------------------ 3. Monatliche Kostenentwicklung --------------------
function erstelleMonatlicheKostenvisualisierung() {
	var kostenVisualisierung = "## 📈 MONATLICHE KOSTENENTWICKLUNG\n\n";

	// Gruppiere Abos nach Abrechnungsintervall
	var monatlicheAbos = [];
	var jaehrlicheAbos = [];

	for (var i = 0; i < appDaten.length; i++) {
		var app = appDaten[i];
		var monatlicheKosten = app.intervall == "M" ? app.preis : app.preis / 12;

		if (app.intervall == "M") {
			monatlicheAbos.push({
				name: app.name,
				kosten: app.preis,
				kategorie: app.kategorie,
			});
		} else {
			jaehrlicheAbos.push({
				name: app.name,
				kosten: app.preis,
				monatlicheKosten: monatlicheKosten,
				kategorie: app.kategorie,
			});
		}
	}

	// Berechne Gesamtkosten
	var gesamtMonatlicheAbos = monatlicheAbos.reduce(
		(sum, app) => sum + app.kosten,
		0
	);
	var gesamtJaehrlicheAbos = jaehrlicheAbos.reduce(
		(sum, app) => sum + app.kosten,
		0
	);
	var gesamtJaehrlichMonatlich = jaehrlicheAbos.reduce(
		(sum, app) => sum + app.monatlicheKosten,
		0
	);
	var gesamtAlleMonatlich = gesamtMonatlicheAbos + gesamtJaehrlichMonatlich;

	// Übersicht der Abrechnungsarten
	kostenVisualisierung += `**Abrechnungsübersicht:**\n`;
	kostenVisualisierung += `🔄 Monatliche Abos: ${
		monatlicheAbos.length
	} Apps • ${gesamtMonatlicheAbos.toFixed(2)}€/Monat\n`;
	kostenVisualisierung += `📅 Jährliche Abos: ${
		jaehrlicheAbos.length
	} Apps • ${gesamtJaehrlicheAbos.toFixed(
		2
	)}€/Jahr (${gesamtJaehrlichMonatlich.toFixed(2)}€/Monat)\n`;
	kostenVisualisierung += `💰 **Gesamt: ${gesamtAlleMonatlich.toFixed(
		2
	)}€/Monat • ${(gesamtAlleMonatlich * 12).toFixed(2)}€/Jahr**\n\n`;

	// Erstelle 12-Monats-Verlauf (Horizontal)
	kostenVisualisierung += `**12-Monats-Kostenverlauf (Horizontal):**\n`;

	var monate = [
		"Jan",
		"Feb",
		"Mär",
		"Apr",
		"Mai",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Okt",
		"Nov",
		"Dez",
	];
	var monatsKosten = [];
	var monatsAbos = []; // Speichere welche Abos in welchem Monat fällig werden

	// Initialisiere Monatsarrays
	for (var m = 0; m < 12; m++) {
		monatsKosten[m] = gesamtMonatlicheAbos; // Grundkosten durch monatliche Abos
		monatsAbos[m] = [];

		// Füge monatliche Abos zu jedem Monat hinzu
		for (var i = 0; i < monatlicheAbos.length; i++) {
			monatsAbos[m].push({
				name: monatlicheAbos[i].name,
				kosten: monatlicheAbos[i].kosten,
				typ: "monatlich",
			});
		}
	}

	// Verteile jährliche Abos gleichmäßig über die Monate
	for (var j = 0; j < jaehrlicheAbos.length; j++) {
		var zielMonat = j % 12; // Verteilung über das Jahr
		monatsKosten[zielMonat] += jaehrlicheAbos[j].kosten;
		monatsAbos[zielMonat].push({
			name: jaehrlicheAbos[j].name,
			kosten: jaehrlicheAbos[j].kosten,
			typ: "jährlich",
		});
	}

	// Finde maximale Kosten für Skalierung
	var maxKosten = Math.max(...monatsKosten);
	var skalierung = 30;

	// Horizontale Darstellung
	kostenVisualisierung += `\nMonat    Kosten     Verlauf\n`;
	kostenVisualisierung += `${"═".repeat(45)}\n`;

	for (var monat = 0; monat < 12; monat++) {
		var kosten = monatsKosten[monat];
		var balkenLaenge = Math.round((kosten / maxKosten) * skalierung);
		var balken = "█".repeat(Math.max(1, balkenLaenge));

		var monatsAnzeige = monate[monat].padEnd(8);
		var kostenAnzeige = `${kosten.toFixed(0)}€`.padStart(8);

		kostenVisualisierung += `${monatsAnzeige} ${kostenAnzeige} |${balken}\n`;
	}

	kostenVisualisierung += `\n**📅 Abo-Fälligkeiten nach Monaten:**\n`;
	kostenVisualisierung += `${"═".repeat(50)}\n`;

	for (var monat = 0; monat < 12; monat++) {
		if (monatsAbos[monat].length > 0) {
			kostenVisualisierung += `\n**${monate[monat]} (${monatsKosten[
				monat
			].toFixed(0)}€):**\n`;

			// Sortiere Abos nach Kosten (höchste zuerst)
			var sortierteAbos = monatsAbos[monat].sort((a, b) => b.kosten - a.kosten);

			var monatlicheGesamtKosten = 0;
			var jaehrlicheGesamtKosten = 0;

			for (var k = 0; k < sortierteAbos.length; k++) {
				var abo = sortierteAbos[k];
				var symbol = abo.typ === "monatlich" ? "🔄" : "📅";
				var kostenInfo =
					abo.typ === "monatlich"
						? `${abo.kosten.toFixed(2)}€/Monat`
						: `${abo.kosten.toFixed(2)}€/Jahr`;

				kostenVisualisierung += `  ${symbol} ${abo.name.padEnd(
					20
				)} ${kostenInfo}\n`;

				if (abo.typ === "monatlich") {
					monatlicheGesamtKosten += abo.kosten;
				} else {
					jaehrlicheGesamtKosten += abo.kosten;
				}
			}

			// Zusammenfassung für den Monat
			if (jaehrlicheGesamtKosten > 0) {
				kostenVisualisierung += `  ────────────────────────────────────\n`;
				kostenVisualisierung += `  💰 Monatliche Abos: ${monatlicheGesamtKosten.toFixed(
					2
				)}€\n`;
				kostenVisualisierung += `  💰 Jährliche Abos:  ${jaehrlicheGesamtKosten.toFixed(
					2
				)}€\n`;
				kostenVisualisierung += `  💰 **Gesamt:        ${monatsKosten[
					monat
				].toFixed(2)}€**\n`;
			}
		}
	}

	kostenVisualisierung += `\n`;

	// Aufschlüsselung nach Abrechnungsart
	if (monatlicheAbos.length > 0) {
		kostenVisualisierung += `**🔄 Monatliche Abos (${monatlicheAbos.length}):**\n`;
		monatlicheAbos.sort((a, b) => b.kosten - a.kosten);

		for (var i = 0; i < monatlicheAbos.length; i++) {
			var app = monatlicheAbos[i];
			var anteil = (app.kosten / gesamtMonatlicheAbos) * 100;
			var balkenLaenge = Math.round((anteil / 100) * 8);
			var balken = "▓".repeat(Math.max(1, balkenLaenge));
			kostenVisualisierung += `  ${app.name.padEnd(15)} ${app.kosten.toFixed(
				2
			)}€ |${balken} ${anteil.toFixed(1)}%\n`;
		}
		kostenVisualisierung += `\n`;
	}

	if (jaehrlicheAbos.length > 0) {
		kostenVisualisierung += `**📅 Jährliche Abos (${jaehrlicheAbos.length}):**\n`;
		jaehrlicheAbos.sort((a, b) => b.kosten - a.kosten);

		for (var i = 0; i < jaehrlicheAbos.length; i++) {
			var app = jaehrlicheAbos[i];
			var anteil = (app.monatlicheKosten / gesamtJaehrlichMonatlich) * 100;
			var balkenLaenge = Math.round((anteil / 100) * 8);
			var balken = "▒".repeat(Math.max(1, balkenLaenge));
			kostenVisualisierung += `  ${app.name.padEnd(15)} ${app.kosten.toFixed(
				2
			)}€/Jahr (${app.monatlicheKosten.toFixed(
				2
			)}€/Monat) |${balken} ${anteil.toFixed(1)}%\n`;
		}
		kostenVisualisierung += `\n`;
	}

	return kostenVisualisierung;
}

// Füge die monatliche Kostenvisualisierung hinzu
diagramm += erstelleMonatlicheKostenvisualisierung();

editor.setText(diagramm);
