# One Reader — Brand identity

**Stato:** fonte canonica corrente  
**Implementazione di riferimento:** `src/styles/global.css` e `src/components/SiteHeader.astro`

Queste regole prevalgono sui brief storici e si applicano al sito, all'area Account, alle email Supabase Auth e alle email inviate tramite Resend.

## Wordmark

Il wordmark è il testo `One Reader`, senza simboli, punto finale o varianti serif.

| Proprietà | Valore |
| --- | --- |
| Font | IBM Plex Mono, con fallback monospace |
| Peso | 700 |
| Dimensione | 16 px |
| Spaziatura | `0.02em` |
| Colore | Ink `#1a1a18` |

Nel web usare la classe `.brand-logo`. Nelle email riprodurre gli stessi valori inline. I client email possono applicare il fallback disponibile, ma il wordmark deve restare monospace, bold e della stessa scala dell'interfaccia: non deve diventare un titolo serif.

## Sistema tipografico

| Ruolo | Famiglia | Uso |
| --- | --- | --- |
| Brand e interfaccia | IBM Plex Mono | wordmark, titoli di prodotto, navigazione, CTA, form, stati e metadati |
| Voce editoriale | IBM Plex Serif | testo editoriale, passaggi narrativi, citazioni e corpo delle lettere |

I titoli di prodotto usano normalmente peso 400. Il peso 700 è riservato al wordmark e alle enfasi funzionali necessarie. Il corpo di una lettera resta serif; le email di servizio e sicurezza restano prevalentemente monospace.

Nel codice, i passaggi narrativi usano `.brand-prose`; nell'Account usano la variante più specifica `.account-prose`. Il serif non va applicato direttamente ai titoli per poi essere corretto tramite override CSS.

## Palette

| Token | Valore |
| --- | --- |
| Paper | `#ffffff` |
| Soft paper | `#faf8f3` |
| Ink | `#1a1a18` |
| Muted ink | `#4a4a45` |
| Rule | `#e4e1d8` |
| Accent | `#26344e` |

L'identità è quasi monocroma: niente ombre, gradienti o colori decorativi. L'accento serve per orientamento e stati, non per riempire la pagina.

## Layout e controlli

- Contenuto prodotto: colonna principale da 720 px con molto spazio bianco.
- Email: colonna massima da 620 px su fondo bianco.
- Separazioni: bordi sottili da 1 px.
- Azioni principali: forma pill, fondo Ink e testo Paper.
- Icone: rare, sottili e funzionali.
- Nessuna ombra decorativa o gradiente cromatico; caricamenti e placeholder restano nella palette canonica.

## Area Account

- L'Account è una superficie di prodotto: wordmark, titoli, stati, dati, controlli e azioni usano IBM Plex Mono.
- IBM Plex Serif compare soltanto nei passaggi narrativi esplicitamente marcati come `.account-prose`.
- Non applicare `font-serif` ai titoli di sezione, al nome del piano o ai valori dell'account.
- Il wordmark usa sempre `.brand-logo`, identico alla Home.

## Pagine e social card

- Home, accesso, onboarding, pricing, iniziative e pagine legali seguono la stessa gerarchia: titoli di prodotto monospace, testo narrativo serif, controlli monospace.
- Journal mantiene i titoli nell'interfaccia monospace e il corpo degli articoli nella voce serif.
- Le social card riprendono wordmark, tipografia e palette correnti; non usano la precedente combinazione serif e terracotta.

## Email

- Il wordmark segue sempre la specifica sopra.
- Magic link, conferme e messaggi di servizio usano IBM Plex Mono.
- Il testo scritto da un membro usa IBM Plex Serif.
- Nessun pixel di tracking; il tracciamento click/open resta disabilitato.
- I template Auth versionati in `supabase/templates/` devono essere sincronizzati nel progetto Supabase ospitato dopo ogni modifica.

## Controllo prima della pubblicazione

Prima di pubblicare una nuova superficie, confrontare il wordmark con la Home e verificare che:

- non compaiano i vecchi font Libre Baskerville, DM Sans o DM Mono come identità attiva;
- nessun titolo di prodotto usi il serif;
- ombre, gradienti e colori fuori palette non vengano introdotti;
- il serif sia limitato a contenuti narrativi, editoriali o al corpo delle lettere.
