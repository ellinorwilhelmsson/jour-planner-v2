# Jourplaneraren

Privat planering av jour och helgstädning för en förskola. Cloudflare Workers levererar appen, Cloudflare Access verifierar personliga konton och D1 sparar gemensamt underlag och ändringshistorik. Ingen GitHub-integration behövs i Cloudflare.

## Kostnadsram

Projektet ska kosta **0 kr**. Användaren bekräftade Workers **Free** den 4 november 2026. Aktivera aldrig Workers Paid, betalda tillägg, betalda externa tjänster eller en köpt domän inom denna uppgift. Befintlig `workers.dev`-adress används. D1-behörigheten ändrar inte abonnemanget. Kontots gränser delas med andra appar i samma privata konto; andra appar ska inte ändras.

D1 Free stoppar databasfrågor när gratisgränsen nås. Workers Free har också en daglig anropsgräns och en snäv CPU-gräns. Schemagenerering och Excel-export körs därför i webbläsaren; servern validerar och sparar förslaget med versionskontroll. Om gratisnivån inte räcker ska lösningen anpassas, inte uppgraderas automatiskt. Se [D1-priser](https://developers.cloudflare.com/d1/platform/pricing/) och [Workers-gränser](https://developers.cloudflare.com/workers/platform/limits/).

## Utveckla och kontrollera

Node.js 24 och npm behövs.

```sh
npm ci
npx wrangler d1 migrations apply jourplaneraren-local --env local --local
npm run dev
```

Den lokala databasen innehåller påhittade familjer. Omladdning behåller ändringarna. Produktionens databas startar utan familjeuppgifter, RE-datum eller testlov; fyll i underlaget innan generering. Lokala testdata kopieras aldrig automatiskt dit. Access-simuleringen med `demo@example.com` finns bara i `local`-miljön.

```sh
npm run check
npm run build
```

Tester omfattar autentisering, hårda schemavillkor, låsningar, barnstart och slut, D1-transaktioner med verklig SQLite, samtidig redigering, revisionskonflikter, återställning, original vid jourbyte, historisk befrielse, städregler, RE-extrapass och Excel-struktur.

## Datamodell och arbetsflöde

- Ett litet gemensamt JSON-underlag lagras i en D1-rad. Uppdatering och historikhändelse skrivs atomiskt. Varje sparning kräver aktuell revision; en konflikt skriver aldrig över en senare ändring. Historiken innehåller serververifierad aktör, tid samt före- och eftervärden.
- Perioder omfattar tre månader och kan skapas, väljas och arkiveras. Datumregler stödjer två/tre jourer, avvikande jourantal, svenska röda dagar/aftnar, stängningar och APT. Utskick kräver ett giltigt APT-datum per öppen månad och rättade hårda fel. Intervallavvikelser godkänns uttryckligen.
- Manuella jourändringar låses. Olåsta pass fördelas bara om genom uttrycklig generering. Även låsta pass som blivit inaktiva kan tas bort uttryckligen med spårbar historik.
- Barn har eget namn, start, slut och befrielselängd. Fyra veckor föreslås från barnstart, 0 stänger av befrielsen. Sista dagen är inkluderad; ett kvarvarande syskon håller familjen aktiv. Flera befrielse- och ledighetsintervall stöds.
- Utskick fryser ett original med familjeregler och APT. Jourbyten ändrar aktuell bemanning, medan statistik och framtida historisk balans bygger på originalet. Jourskyldig tid räknas utan befrielse; vanlig ledighet minskar inte vikten. Inga historiska underskott skapas för befriad tid. Äldre uppgifter som inte finns i appen räknas inte som importerad historik.
- Städning planeras mellan RE-dagarna enligt beslutade städfria helger. Ledighet eller barnbefrielse under någon del av helgen hoppar över familjen med bibehållen tur. Styrelsebefrielse från jour påverkar inte städning. RE-extrapass är separata poster med orsak och behåller ordinarie köplats.
- En genererad städplan flyttar inte kön. Vid utskick kontrolleras att familjeregler, kö och städregler fortfarande motsvarar förslaget; därefter flyttas kön. Planer med städning fastställs i datumordning. En inställd framtida städhelg flyttar berörda uppdrag framåt; det som inte får plats har förtur i nästa period. Senare redan fastställda städplaner måste hanteras först.
- Utkast kan återställas till en sparad tidigare periodversion. Gemensamma familjer, kö, andra perioder och kalenderbaslinje återställs inte. Återställning är en ny historikhändelse. Utskickade perioder ändras genom byten.
- Excel-export innehåller aktuell jour, original, städplan, kö, familjeregler och statistik. Utkast märks. PDF skapas med webbläsarens utskriftsfunktion. Export av familjeregler är privat underlag och ska väljas med omsorg vid manuell delning.

Generatorn är deterministisk och jämför prioriteringarna i beslutad ordning. Det är en heuristik utan garanti om globalt optimalt schema. Kapacitetskontrollen kan bevisa vissa omöjliga 14-dagarsintervall, men garanterar inte att alla övriga underlag är genomförbara.

## Inloggning och publicering

Återanvänd Wranglers inloggning och stödda tysta förnyelse. På Windows används krypterad cache med nyckel i Windows Credential Manager. Vid verkligt autentiseringsfel: godkänn den pågående enhetsinloggningen, inte en ny parallell session. Lägg aldrig token, klienthemligheter eller familjedata i Git eller kommandoradsargument.

```sh
npx wrangler login --device --use-keyring --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler d1 migrations apply jourplaneraren --remote
npm run deploy
```

Worker `jourplaneraren` och dess D1-databas finns i privat konto `7a8e6db3082a866ded1d858dd40d495a`. `scripts/cloudflare-status.mjs` gör enbart läsningar via Wranglers dokumenterade `auth token --json`; token fångas i privat processminne, skickas endast till Cloudflares API och skrivs aldrig ut. Fakturerings-API kräver separat behörighet som inte begärts; gratisplanen bekräftades av användaren.

Worker-koden kräver verifierad `ctx.access` och exakt mejllista (`ALLOWED_EMAILS`, med `ALLOWED_EMAIL` som bakåtkompatibelt alternativ). HTTP-identitetsheaders godtas inte. Alla frontendfiler levereras genom samma skyddade Worker. Skriv-API kräver samma origin och JSON. Den andra användarens mejladress är fortfarande uppskjuten enligt överenskommelse; ändra både Access-policy och serverns tillåtelselista när den ska läggas till.

Worker-level Access **All traffic** är aktiverat för avsedd personlig mejladress och mejlkod. Autentiseringsappen är registrerad, men **appspecifikt MFA-krav behöver fortfarande slutföras och verifieras innan skarpa familjeuppgifter läggs in**. Ändra inte globala MFA-regler för andra appar. Kontrollera anonymt att `/`, `/client.js` och `/api/state` leder till Access eller nekas, och därefter avsedd inloggning och otillåtet konto. Se [Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) och [Independent MFA](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/).

## Kvarvarande arbete

Google Kalender-publicering och OAuth-koppling återstår att implementera och ansluta. Reserverade tabeller och ett gransknings-API innebär inte att publicering fungerar. Beslutad riktning är 30-minutershändelser kl. 08.00 och APT-text om 16.00; Google-behörigheter ska begränsas till appens egen kalender. Ingen extern kalender eller e-post ändras från nuvarande version.

Import av äldre statistik och äldre familjekopplingar, full läsårsstatistik och vidare verksamhetsdetaljer i FUNCTIONAL_SPEC.md återstår. Statistikvyn visar nu vald period. Appen skickar inte mejl; markera som utskickat efter eget manuellt utskick. Inga betalda tjänster ska införas för återstående funktioner.
