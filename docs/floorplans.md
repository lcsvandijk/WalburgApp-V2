# Plattegronden instellen

De app leest plattegronddata uit `src/data/floorPlans.json`.

In het rooster verschijnt het lopende mannetje alleen als een lokaal of externe locatie in die config gematcht wordt.

## Wat je het beste aanlevert

- Per verdieping 1 duidelijke PNG of JPG export van de plattegrond.
- Ideaal formaat: `1600 x 1200` pixels in liggend `4:3`.
- Ook goed: `1920 x 1440`, of minimaal ongeveer `1200px` breed.
- Vermijd telefoon-screenshots, extreem brede exports en afbeeldingen met grote witte randen.
- De lokaalnamen zoals Magister ze exact of ongeveer doorgeeft, bijvoorbeeld `A101`, `A 1.01` en `A1.01`.
- Optioneel meerdere aliases per lokaal als Magister niet altijd dezelfde notatie gebruikt.
- Voor interne lokalen: een polygon- of rechthoek-gebied op de plattegrond.
- Voor externe lokalen: een korte tekst en eventueel een adres.

De editor en app rekken de afbeelding nu niet meer uit, maar gebruiken de echte beeldverhouding van het bestand. `4:3` werkt het fijnst in de popup.

## Snelle workflow

1. Start de editor met `yarn floorplan:editor`.
2. Open `http://localhost:4310`.
3. Kies of maak een gebouw en verdieping.
4. Upload de verdiepingafbeelding.
5. Voeg lokalen toe, kies `intern` of `extern`, selecteer `polygon` of `rechthoek` en vul aliases in.
6. Teken voor interne lokalen een polygon of plaats een rechthoek op de plattegrond en sleep de punten of hoeken goed.
7. Klik op opslaan.
8. Start daarna de app opnieuw of refresh de bundler als de config al geladen was.

## Verdieping-selector

Per verdieping kun je in de editor nu ook deze opties zetten:

- `Toon in selector`: zet dit uit als de verdieping wel een plattegrond mag hebben, maar niet in het rijtje boven de viewer moet staan.
- `Vast in gedeeld vak`: gebruik dit als meerdere verdiepingen dezelfde `order` delen en er altijd 1 verdieping zichtbaar moet blijven in dat gedeelde vak.

Als meer dan 2 verdiepingen dezelfde `order` hebben, probeert de app altijd de actieve verdieping zichtbaar te houden. Met `Vast in gedeeld vak` blijft daarnaast ook jouw vaste verdieping staan.

## Hoe matching werkt

De app probeert `appointment.location` uit Magister te matchen op:

- `marker.id`
- `marker.label`
- elke waarde in `marker.aliases`

Tijdens het vergelijken worden spaties, punten, underscores, streepjes en hoofdletters genegeerd. Daardoor matchen `A101`, `A 101` en `A1.01` meestal op dezelfde marker als je die bij de aliases zet.

## Extern of onbekend

- `kind: "external"` toont geen plattegrond maar wel jouw tekst en adres.
- Als een lokaal niet matcht op een item in de config, laat de app het lopende mannetje niet zien.
