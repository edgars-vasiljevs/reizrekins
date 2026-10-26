# Reizrēķins

Vienkārša tāfeles stila spēle reizrēķina trenēšanai. Tīrs HTML/CSS/JS, bez build soļa.

## Kā spēlēt

- **3 līmeņi**: Iesācējs (reizini ar 1–3), Pratējs (līdz 5), Meistars (viss reizrēķins līdz 10)
- **2 veidi**: atrodi pareizo atbildi no četrām vai atceries un uzraksti to pats
- Piemēri, kuros iepriekš kļūdījies, parādās biežāk.

Īsinājumtaustiņi: `1`–`4` vai `A`–`D` atbildes izvēlei, `Enter` pārbaudīt / tālāk, `0`–`9` cipari, `Backspace` dzēst, `Esc` iziet.

## Statistika

Glabājas pārlūka `localStorage` (atslēga `reizrekins.v1`): spēles, kļūdas, kopējais domāšanas laiks, vidējais laiks uz piemēru, rekordi katram līmenim un piemēru karte (10×10).

Sadaļā **Progress**: dienu sērija, kalendārs ar trenētajām dienām, līknes pa dienām (pareizo atbilžu % un vidējais domāšanas laiks) ar salīdzinājumu pret iepriekšējo periodu. Var filtrēt pēc līmeņa un perioda (7 / 30 / 90 dienas / viss).

## Lietotne (PWA)

Spēli var instalēt kā lietotni (`manifest.webmanifest`, `sw.js`, `icons/`), un tā strādā arī bez interneta. Izvēlnē parādās poga **Instalēt kā lietotni**: Chrome/Edge/Android tā atver pārlūka instalēšanas logu, iPhone/iPad un Mac Safari — rāda soļus (*Kopīgot → Pievienot sākuma ekrānam* / *File → Add to Dock*). Ja lietotne jau atvērta kā instalēta, poga nerādās.

Instalēšana strādā tikai caur `https://` (GitHub Pages der) vai `localhost`.

## Lokāli

```bash
python3 -m http.server 8765
```

## GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.

Fonti: Caveat Brush, Patrick Hand, Fredoka (Google Fonts, bezmaksas).
