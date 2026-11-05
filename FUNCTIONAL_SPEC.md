# Jourplaneraren funktionsspecifikation utkast

Uppdaterad 4 november 2026. Utkastet samlar beslut för en ny app som bevarar Jourplanerarens verksamhetslogik. Design, användarflöden och teknikval kan ändras. Beslutade regler nedan gäller som mål för den nya appen; de beskriver inte att ändringarna redan är implementerade.

Specifikationen är ännu inte komplett. Avsnittet Befintligt underlag att granska innehåller funktioner från dagens app som återstår att beskriva och stämma av. Exakta beräkningsregler behöver också färdigställas innan hela fördelningen kan implementeras entydigt.

## Beslutade regler

### Familjer och jourskyldighet

- Familjen är enheten för jourfördelning.
- Barn har individuella slutdatum. Slutdatumet är sista dagen inkluderad. Jouren upphör efter sista barnets slutdatum; finns ett syskon kvar fortsätter jourskyldigheten. Jourskyldig tid beräknas bara till och med sista dagen. Redan gjorda scheman ska visa berörda tilldelningar som avvikelser för medveten ändring; de flyttas inte automatiskt när slutdatum registreras.
- Visningen använder barnens namn och efternamn, utan prefixet Familjen. I schemat visas barnen som är kvar på respektive datum.
- Rättvisan ska ta hänsyn både till familjer som började samtidigt och till deras faktiska jourskyldiga tid. Familjer ska inte få extra pass för att komma ikapp tid innan de började joura.
- Registrerad jourbefrielse räknas bort från jourskyldig tid. När befrielsen upphör får familjen sin normala andel framåt. Pass från befrielseperioden ska inte tas igen.
- Befrielse för styrelsearbete gäller bara jour, inte helgstädning.
- Vanlig registrerad ledighet blockerar jourdatum, men minskar inte familjens jourandel. Ledighet ska inte automatiskt omvandlas till jourbefrielse på grund av sin längd.

### När ett nytt barn börjar

- Befrielse föreslås automatiskt när ett nytt barn registreras med startdatum.
- Standardlängden är fyra veckor från barnets startdatum.
- Användaren kan ändra befrielsens längd eller stänga av den.
- Samma inställning och längd gäller för både jour och helgstädning.

### Rättvis jourfördelning

- Antalet pass ska balanseras mellan familjerna både totalt och separat för jour 1, jour 2 och jour 3, med hänsyn till jourskyldig tid.
- Minst 14 kalenderdagar mellan pass på jour 1 och 2 har hög prioritet. Det gäller även två pass på samma av dessa nivåer.
- Minst 14 dagar ska också eftersträvas när tredjejour ingår, men har lägre prioritet än avståndet mellan pass på jour 1 och 2.
- Kortare avstånd mellan pass på jour 1 och 2 visas som varningar och kan godtas manuellt.
- Kortare avstånd där tredjejour ingår visas som information. Användaren kan ändra pass, generera om olåsta pass eller godkänna avvikelserna.
- Jämn fördelning inom kalendermånaden prioriteras före historisk utjämning. Historiska skillnader ska jämnas ut gradvis.
- När avstånd och månadsfördelning är likvärdiga prioriteras variation mellan veckodagar före historisk utjämning.

Beslut 4 november 2026: bland tillåtna tilldelningar gäller följande prioritetsordning: 14 dagars avstånd mellan jour 1–2, månadsbalans, APT-balans, 14 dagars avstånd när jour 3 ingår, veckodagsvariation och sist historisk balans. Befrielse, frånvaro, spärrade veckodagar och ett pass per familj och dag är tillgänglighetsvillkor.

### APT

- Planeringen utgår från ett APT per månad.
- Förstajour på en APT-dag innebär obligatoriskt arbete från klockan 16.00 och ska därför balanseras särskilt mellan familjerna.
- Tidigare schemalagd APT-förstajour ska vägas in över flera månader och schemaperioder.
- APT-balans prioriteras före veckodagsvariation.
- Även för APT ska jourbefriad tid räknas bort, utan krav på att ta igen pass efter befrielsen.

### Utkast och låsta pass

- Innan utskick är schemat ett utkast som kan ändras.
- Manuellt valda eller ändrade jourpass låses automatiskt.
- Användaren kan låsa och låsa upp enskilda pass.
- Vid uttryckligt val av Fördela om olåsta pass behålls alla låsta pass medan olåsta pass får fördelas om.
- Ett jourbyte ändrar bara berörda pass och ska inte generera om övriga pass.

### Originalschema och jourbyten

- Originalschemat fastställs när schemat markeras som utskickat.
- Rättvisestatistiken bygger på originalschemat. Senare jourbyten påverkar inte fördelningen av kommande pass.
- Jourbyten ska kunna registreras i schemavyn även efter utskick.
- Originaltilldelning och aktuell bemanning behöver kunna skiljas åt.
- Statistiken avser schemalagd tilldelning och ska inte framställas som bekräftelse på faktiskt utfört arbete.

### Kalenderpublicering

- Kalenderändringar ska granskas innan användaren publicerar dem med en knapptryckning.
- Efter jourbyten ska appen visa att schemat ändrats sedan senaste publicering.
- Granskade ändringar ska därefter kunna uppdateras i Google Kalender via en knapp.
- Jourbyten ska bara påverka berörda kalenderposter.
- Återställning ska inte automatiskt uppdatera kalendern; även dessa ändringar kräver granskning och knapptryckning.

### Helgstädning

- Nya familjer placeras automatiskt sist i städkön.
- En befintlig familj som får ett nytt syskon behåller sin köplats.
- En familj som är befriad från städning när ett nytt barn börjar hoppas över under befrielsen och behåller sin tur. Den flyttas inte sist bara för att den hoppas över.
- En familj med registrerad ledighet under en städhelg hoppas också över och behåller sin tur.
- Ingen helgstädning ska tilldelas under storhelger, jullov eller registrerade stängningsperioder.
- Även helgen direkt efter en helt stängd vardagsvecka är städfri.
- Om en städhelg ställs in behåller familjen sin tur. Tilldelningen flyttas till nästa möjliga städhelg och efterföljande tilldelningar flyttas fram.
- En missad RE-dag ger ett extra helgstäduppdrag utöver familjens ordinarie städtur. Ett redan tilldelat städuppdrag ersätter inte extrapasset; familjen ska tilldelas ytterligare ett uppdrag.
- Efter RE-dagen får användarna ett mejl med de familjer som ska ha extra städning. Uppgifterna registreras manuellt när nästa schema förbereds; appen ska inte själv avgöra vilka som missat RE-dagen eller automatiskt läsa mejlet.
- Varje extrapass läggs som en extra köpost först i städkön och tilldelas vid nästa möjliga städhelg. Familjens ordinarie köplats och redan tilldelade städuppdrag behålls.
- Orsaken till extrapasset dokumenteras med koppling till den missade RE-dagen, så att tilldelningen kan förklaras i efterhand.

Exakt vilka storhelger och angränsande datum som ska ge städfri helg återstår att precisera.

### Ändringshistorik och användaridentitet

- Ändringar ska kunna spåras med vem, tidpunkt, vilken uppgift som ändrades och värden före och efter.
- Även kalenderpublicering och återställning ska registreras i historiken.
- Ändringar i ett schema hör till dess schemaperiods historik. Det omfattar tilldelningar, låsningar, godkända avvikelser, jourbyten och publicering.
- Periodens historik följer med schemat även efter arkivering.
- Ändringar i gemensamma uppgifter, exempelvis familjeregler och städkö, ska också kunna spåras. Hur dessa knyts till berörda perioder återstår att precisera.
- Den nya Cloudflare-appen ska använda personliga inloggningar genom Cloudflare Access: engångskod via mejl samt separat MFA med autentiseringsapp. Endast uttryckligen tillåtna mejladresser ska få åtkomst.
- Personlig verifierad identitet ersätter det tidigare förslaget om ett gemensamt konto med manuellt namnval. GitHub används inte som inloggningsleverantör.

### Återställning

- En tidigare sparad version ska kunna återställas per schemaperiod.
- Återställningen ska bara gälla vald period och registreras som en ny händelse i historiken.
- Återställning är bara tillåten för utkast. Utskickade scheman ändras genom jourbyten.
- Hur periodåterställning samspelar med den gemensamma städkön och gemensamma familjeregler behöver preciseras.

## Exempel som ska kunna verifieras

1. Två familjer började samtidigt. En har varit jourbefriad för styrelsearbete under ett år. Den ska inte få extra pass för det befriade året när den återgår till jour. Styrelsebefrielsen tar inte bort familjens städuppdrag.
2. Ett nytt syskon börjar. Fyra veckors befrielse föreslås för både jour och städ. Användaren kan ändra längden eller stänga av befrielsen. Om familjens städtur infaller under befrielsen hoppas den över utan att förlora sin tur.
3. En familj är ledig i tre veckor. Datumen blockeras för jour, men ledigheten minskar inte familjens jourandel. Om en städhelg ingår i ledigheten hoppas familjen över i städkön och behåller sin tur.
4. Ett manuellt valt pass har låsts. När olåsta pass fördelas om ligger detta pass kvar. Om användaren låser upp det får det fördelas om vid nästa uttryckliga omfördelning.
5. Ett utskickat APT-pass byts från familj A till B. Aktuell bemanning visar B, men rättvisestatistiken behåller originalets tilldelning till A. Kalenderändringen publiceras efter granskning och knapptryckning.
6. Förskolan har varit stängd hela vardagsveckan. Helgen efter får inget städuppdrag. Familjernas turordning bevaras och städuppdragen flyttas fram.
7. En tidigare utkastversion av en period återställs. Andra perioder återställs inte. Återställningen är synlig i historiken och kalendern ändras först efter separat granskning och publicering.

## Övriga verksamhetsområden att specificera

Följande verksamhetsområden inventerades i den tidigare genomgången. Detaljerna behöver fortfarande beskrivas i den fullständiga specifikationen. Tabellen innebär inte att nya beslut om dessa detaljer har fattats.

| Område | Underlag och regler att beskriva |
| --- | --- |
| Perioder | Två eller tre journivåer, datumgränser, periodbyten, förslag på nästa period, ändring och borttagning, skydd för påbörjade och passerade perioder. |
| Datum | Svenska helgdagar och aftnar, manuella stängningar med orsak, APT, avvikande antal journivåer på enskilda datum. |
| Familjeregister | Aktiv och befriad status, start och slut på jourskyldighet, barn, spärrade veckodagar, frånvaro, skydd för familjer med historik. |
| Fördelning | Ett pass per familj och dag, obemannade pass, datumordning och nivåordning, historikkällor, skiljeregel vid helt lika läge, låsta pass som blivit otillåtna, pass över periodgränser. |
| Kontroll av schema | Obligatoriska underlagskontroller, hinder, intervallvarningar, förslag för att rätta bara berörda pass, när kontroller blir inaktuella. |
| Städkö | RE-dagar per läsår, städperiodens gränser, avdelningsrotation, manuella köändringar, flera köposter för samma familj, missad RE-dag och köprioritet. |
| Statistik | Läsår, äldre årssiffror, daterade originalpass, tredjejour, skydd mot dubbelräkning, uppskattade och verkliga startdatum, APT-historik. |
| Visning och export | Schema, familjer, regler, jourstatistik, städschema och kö; Excel och PDF; utkastmarkering; datum, stängningsorsaker, APT och RE-information. |
| Import | Vilka importflöden som ska ingå samt hantering av oklara familjekopplingar och konflikter. Äldre krav innehåller funktioner som inte får antas vara färdiga i dagens app. |
| Kalender | Granskningsunderlag, skydd mot ändringar efter granskning, nya och ändrade poster, borttagning av gamla appposter, avgränsning till appens kalender, delvis misslyckad publicering. |
| Gemensam lagring | Automatisk sparning, osparade ändringar, samtidig redigering, hämtning av senaste underlag, versionshistorik och felhantering. |
| Delning | Mailmallar, manuell utskickshantering och bilagor, markering som utskickat. |
| Dataskydd | Privat familjeunderlag, tillåtna resurser, separation mellan test och skarpa data samt skydd för personuppgifter. |

## Återstående beräkningsbeslut

- Historiska jämförelseperioder och normalisering av äldre statistik behöver fortfarande preciseras. För en ny schemaperiod beräknas familjens vikt som aktiva kalenderdagar minus registrerad jourbefrielse, utan kompensation för tiden före start eller under befrielse (beslut 4 november 2026). Ledighet minskar inte vikten.
- Eventuellt krav på uttryckligt godkännande av information om korta intervall där tredjejour ingår.
- Beräkningsgrund när äldre APT- eller befrielsehistorik saknas.
- Exakta städfria storhelger, datumgränser, delvis stängda veckor och hur frånvaro som överlappar en del av helgen behandlas.
- Spårbarhet och återställning för uppgifter som är gemensamma för flera schemaperioder.

Detta är ett fristående kravunderlag för Jourplanner 2. Fortsatt specificering utgår från besluten och de återstående verksamhetsområdena ovan.

## Första Cloudflare-prototypen

Beslut 1 november 2026: börja med en klickbar prototyp med påhittade testdata för familjer, jourschema och städkö. Ändringar i denna version finns endast under det aktuella besöket och sparas inte gemensamt. Exempelschemat är inte resultatet av den färdiga fördelningsalgoritmen. Skarpa familjeuppgifter, gemensam lagring, kalenderkoppling och utskick ingår inte i prototypen.

Beslut 4 november 2026: behåll den ursprungliga varmare designen. Schemat ska kunna visas som vecka, månad med kalenderrutor och hela en tremånadersperiod. En första lokal jourgenerator ska använda beslutad prioritetsordning, kunna fördela om olåsta pass och visa avvikelser. Verklig historik saknas i prototypen; äldre rättvisa kan därför inte verifieras där.


## Fortsatta beslut och implementationsläge 4–5 november 2026

- Gemensam sparning i Cloudflare D1 är godkänd. Projektet är ideellt och ska kosta 0 kr; inga betalda planer eller tillägg får aktiveras. Användaren bekräftade Workers Free.
- Helgstädning planeras mellan höstens och vårens RE-dag, med uppehåll på RE-helger. En städhelg är också fri om fredag–måndag innehåller svensk röd dag eller afton, under registrerat jullov eller stängning samt efter en helt stängd vardagsvecka.
- Om ledighet eller barnbefrielse berör någon del av lördag–söndag hoppas familjen över och behåller sin tur.
- Google Kalender ska använda 30 minuter långa händelser för att visa vem som kan ringas in. Föreslagen starttid från användaren är 08.00. APT-arbetets start 16.00 ska fortfarande framgå av texten. Kalenderkopplingen är ännu inte implementerad eller ansluten.

Nu implementerat för kontroll: D1-sparning med revisionskonflikter, verifierad aktör och atomisk historik; sparade tremånadersperioder; datumregler och journivåer per datum; barnstart med justerbar befrielse; fastställt original och jourbyten; periodstatistik från originalet; städgenerering, RE-extrapass och köflytt vid utskick; utkaståterställning; Excel-export samt utskrift till PDF.

För denna version är återställningen begränsad till periodens utkast. Gemensamt familjeunderlag, städkö och andra perioder behålls. Ändringar i gemensamma uppgifter registreras i en separat gemensam historik. Städplanens familjeregler och kö kontrolleras på nytt vid fastställande. En ändring i underlaget kräver ny uttrycklig städgenerering. Köflytt sker inte vid förhandsvisning.

En inställd framtida städhelg i senast fastställda städperiod flyttar uppdrag inom perioden; uppdrag som inte får plats får förtur i nästa period och förbrukar inte en ny ordinarie tur. Automatisk flytt genom flera redan fastställda perioder stöds ännu inte. Full läsårsstatistik och äldre import återstår också. Detta implementationsläge ersätter inte kvarvarande specifikationsfrågor ovan.

Skarpa familjeuppgifter ska vänta tills appens separata MFA-krav har slutförts och verifierats. Den registrerade autentiseringsappen bevisar inte i sig att MFA krävs för varje inloggning till appen.


## Beslut 5 november 2026: byten, avdelningar och testunderlag

- Jourpass ska kunna dras och släppas på ett annat pass för att byta tilldelning. I utkast byts och låses båda passen samtidigt. I utskickade perioder registreras bytet med orsak och bibehållet original. Båda nya tilldelningarna måste följa tillgänglighetsreglerna; ingen familj får dubbelbokas. Ett bemannat utkastpass kan flyttas till en obemannad plats, varvid den ursprungliga platsen blir obemannad och låst. Passdialogen erbjuder samma byte utan dragning.
- Avdelningarna heter Körsbäret, Päronet och Äpplet.
- Testunderlaget ska innehålla cirka 40 familjer: 35 jourskyldiga och 5 jourbefriade. Några jourskyldiga ska ha fredagar spärrade. Det nya påhittade underlaget har 48 olika barn, 40 familjer och 7 familjer med fredagsspärr. Befintliga familjer ska inte skrivas över av testinläggningen.
- Veckonummer ska finnas i schemat. Visning och export använder ISO-veckonummer, med korrekt veckoår vid årsskiftet.
