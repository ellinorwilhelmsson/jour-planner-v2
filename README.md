# Jourplaneraren

Klickbar prototyp med påhittade familjer, exempelschema och städkö. Ändringar finns bara i den öppna sidans minne och återställs vid omladdning. En första jourgenerator för tremånadersperioder ingår. Ingen databas, kalenderkoppling eller utskick ingår.

## Utveckla

Node.js 24 och npm behövs.

```sh
npm ci
npm run dev
```

Öppna den lokala URL som Wrangler visar. `local` använder Cloudflares lokala Access-simulering med `demo@example.com`. Den inställningen gäller endast `wrangler dev`, inte publicerade Workers. Använd aldrig verkligt familjeunderlag i prototypen.

```sh
npm run check
npm run build
```

## Publicera i det egna Cloudflare-kontot

Använd officiella Wrangler och återanvänd befintlig inloggning efter kontroll med `npx wrangler whoami`. På Windows sparas OAuth krypterat med nyckeln i Windows Credential Manager (`--use-keyring`). Om inloggning krävs, kör kommandot nedan, godkänn i webbläsaren och fortsätt samma session. Lägg aldrig token eller klienthemligheter i Git eller kommandoradsargument.

```sh
npx wrangler login --device --use-keyring --scopes account:read user:read workers:write workers_scripts:write
```

Utöka inte till alla Wranglers standardbehörigheter bara för att `whoami` visar en varning om saknade scopes. Prototypen använder varken KV, D1, Pages eller zonrutter.

`npm run deploy` publicerar Worker `jourplaneraren` i konto `7a8e6db3082a866ded1d858dd40d495a`. Den nekar alla anrop tills Worker-level Cloudflare Access har konfigurerats. Inget GitHub-integrationskonto krävs.

Under Workers & Pages → Jourplaneraren → Access: skydda **All traffic**, tillåt endast den avsedda personliga mejladressen och använd One-time PIN. I Access-applikationens MFA-inställningar krävs **Authenticator application**. Tillåt inte Everyone eller en hel mejldomän. App Launchers separat tillåtna inloggning räcker inte som skydd för Workern.

Kontrollera anonymt att både `/`, `/client.js` och `/api/me` leder till Access eller nekas. Testa därefter tillåten inloggning med mejlkod och registrerad MFA. Kontrollera att ett otillåtet konto nekas.

Worker-koden använder Cloudflares verifierade `ctx.access` och en exakt mejllista; förfalskade HTTP-identitetsheaders godtas inte. Frontendfiler levereras genom Workern, utan Static Assets-bindning, eftersom Cloudflares interna asset-router inte vidarebefordrar `ctx.access`. Ingen produktionsinställning för att kringgå autentisering finns.

Referenser: [Access för Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [Independent MFA](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/).

## Fortsatt arbete

Se FUNCTIONAL_SPEC.md. Kalendern visar vecka, månad eller tre månader. Generera schema fördelar jourpass över öppna vardagar, behåller låsta pass och lämnar obemannat när tillgängliga familjer saknas. Familjereglerna stödjer start/slut, jourbefrielse, ledighet och spärrade veckodagar. Formuläret stödjer ett befrielse- och ett ledighetsintervall; beräkningsmodellen stödjer flera. Datumregler ändras under Period och datum. Helgdagar och lov måste kontrolleras och registreras; de få förifyllda datumen är testunderlag.

Generatorn använder kronologisk tilldelning med lexikografisk prioritering: intervall jour 1–2, månadsbalans totalt och per nivå, APT, intervall med jour 3, veckodagsvariation och historisk balans. Det är en första heuristik, utan garanti om globalt optimalt schema. Intervallavvikelser, omöjlig bemanning och otillåtna låsningar visas för manuell granskning. Ändrade familjeregler eller manuella pass gör kontrollerna inaktuella tills användaren väljer Kontrollera igen eller nästa uttryckliga generering. Kontrollera igen granskar befintliga tilldelningar utan att flytta pass. Varningsmarkeringar visar meddelanden vid hover, fokus och klick; varningslistan kan öppna berört datum. En separat kapacitetskontroll förklarar när tillgängliga familjer är för få för att 14 dagars primärjourintervall överhuvudtaget ska vara möjligt. Den kontrollen bevisar vissa omöjliga fall men garanterar inte att övriga underlag är genomförbara.

Inget tidigare originalschema är importerat och historisk utjämning är därför inte verifierad med verkligt underlag. Automatisk fyra veckors befrielse vid barnstart, publicering/originalschema, jourbyten, avvikande journivå per dag, generering av helgstädning och gemensam lagring återstår. Städkön är fortfarande en manuell prototyp. Ändringar sparas endast i sidans minne.

Barn registreras var för sig med namn och valfritt slutdatum (sista dagen inkluderad). När sista barnet har slutat upphör jourtillgängligheten och jourskyldig tid räknas bara fram till dess. Ett syskon utan slutdatum håller familjen aktiv. Befintliga tilldelningar bevaras och flaggas om de ligger efter sista barnets slutdatum; olåsta pass kan fördelas om och låsta pass kräver manuell ändring/upplåsning. Namn visas som barnens namn och efternamn; kalendern visar kvarvarande barn för respektive datum.
