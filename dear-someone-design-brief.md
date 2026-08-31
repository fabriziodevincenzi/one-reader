# Dear Someone — Brief per il primo mockup

> **Documento storico.** Conserva il contesto del primo mockup, ma non è più la fonte della brand identity attuale. Per logo, tipografia, palette ed email usare `one-reader-brand-guidelines.md`.

**A chi è rivolto:** designer incaricato del primo mockup visivo del prodotto
**Riferimento:** `dear-someone-project-spec.md` (documento di progetto per gli sviluppatori, versione 1.1)

---

## 1. Il prodotto in una riga

Un club privato di corrispondenza casuale via email tra sconosciuti. *"One letter. One reader. Maybe a reply. No judgment."* — "no judgment" significa nessun confronto sociale tra membri (niente foto, niente profili da sfogliare, niente punteggi visibili), non assenza di moderazione.

## 2. Cosa NON deve sembrare

Questo è il vincolo più importante, va tenuto presente prima di ogni scelta visiva:

- **non un social network** (niente feed, niente contatori pubblici, niente "mi piace");
- **non un'app di dating** (nessuna vetrina di profili da sfogliare o scegliere);
- **non un prodotto SaaS "smart"** (niente gamification, niente badge, niente streak, niente notifiche urgenti);
- **non deve massimizzare il tempo speso nel prodotto** — l'obiettivo è mettere in contatto due persone e poi farsi da parte.

L'esperienza principale del membro avviene **nella sua normale casella email**, non nell'interfaccia web. Il mockup riguarda solo le poche superfici web di supporto: sito pubblico, checkout/iscrizione, verifica email, area riservata (gestione sottoscrizione + storico lettere).

## 3. Tono e direzione stilistica

**Parola chiave: editoriale e silenzioso.** Pensa più a una rivista di carta ben fatta o a un set di carta da lettere di qualità che a un prodotto digitale "smart".

- **Tipografia**: questa indicazione appartiene al primo mockup ed è stata sostituita. Il sistema attuale usa **IBM Plex Mono** per wordmark, titoli di prodotto, interfaccia e metadati; **IBM Plex Serif** per testo editoriale, voce umana e corpo delle lettere. Le specifiche correnti sono in `one-reader-brand-guidelines.md`.
- **Gerarchia**: i titoli principali sono grandi, con linee compatte e molto spazio intorno. Il testo editoriale usa una colonna di lettura stretta e un'interlinea generosa. I metadati sono piccoli, discreti, in maiuscolo e mai trattati come elementi decorativi.
- **Palette**: quasi monocroma. Toni caldi e neutri (pensa a carta, inchiostro, non a un dashboard). Un solo colore di accento, usato con estrema parsimonia (es. per un singolo badge di stato "nuovo"), mai diffuso su più elementi contemporaneamente.
- **Superfici**: un solo bordo sottile per separare i blocchi, zero ombre, zero gradienti. Niente che "urli" o attiri l'occhio con forza — coerente con la promessa di calma.
- **Spaziatura**: generosa. Molto white space. Il prodotto non deve avere fretta di mostrare tutto.
- **Iconografia**: minima, quasi assente. Dove serve, tratto sottile, mai colorata a meno che non sia l'unico accento della schermata.
- **Metadati umani ma anonimi**: dove opportuno (es. anteprima lettera) si può mostrare un'area geografica generica e la lingua del mittente — mai identità, foto, nome reale.

## 4. Riferimento visivo già validato

L'esempio storico della card resta valido per tono, spaziatura e gerarchia, ma i font sono stati sostituiti dalla coppia IBM Plex descritta nelle linee guida correnti.

## 5. Schermate da includere nel primo mockup

In ordine di priorità:

1. **Pagina pubblica / landing** — presentazione del club, regole in breve, prova sociale tramite il contatore iscritti alla waitlist una volta raggiunta la soglia pubblica, call to action verso l'iscrizione o la waitlist.
2. **Iscrizione alla waitlist** — form minimo (email, eventualmente lingua), conferma. Il numero aggiornato compare soltanto quando il contatore è già pubblico.
3. **Area riservata — panoramica** — stato della sottoscrizione, azione per scrivere una nuova lettera (rispettando il limite di una ogni 24 ore). **Attenzione**: non è un form da compilare nel sito — le lettere si scrivono dalla propria casella email, indirizzate a un indirizzo unico (`write@onereader.co`). Il bottone/azione nell'area riservata è quindi un link `mailto:` che apre il client email dell'utente già pronto per scrivere, non un editor di testo dentro al sito.
4. **Area riservata — storico lettere** — stile diario, ogni voce mostra stato (scritta, consegnata, riconosciuta, risposta, conversazione aperta...), **senza numeri comparativi, streak o classifiche**.
5. **Notifica email "hai una lettera"** — non è una schermata dell'app ma il template email stesso: è probabilmente il touchpoint più frequente e vale la pena disegnarlo con la stessa cura, seguendo la card di riferimento al punto 4.

Non è necessario in questa fase disegnare: gestione pagamento/fatturazione dettagliata, flusso di segnalazione/blocco (può restare testuale/funzionale per ora), pannello di amministrazione.

## 6. Contenuti segnaposto coerenti

Per i testi di esempio nel mockup, mantieni il registro già usato nella card di riferimento (frasi brevi, tono intimo, mai frasi da marketing tipo "Scopri nuove connessioni!"). Evita segnaposto generici tipo "Lorem ipsum" nelle anteprime di lettere: rompono la percezione di autenticità che il prodotto vuole trasmettere fin dal mockup.

## 7. Indicazioni di copy risolte

- **Cadenze dei piani**: per il piano annuale, una nuova lettera ogni 24 ore non va presentata come restrizione, ma come conseguenza del fatto che ogni membro è anche l'unico lettore possibile di qualcun altro. Copy indicativo vicino all'azione "Write a letter": *"You get one letter a day, because someone will be its only reader."* Il piano gratuito apre una nuova corrispondenza ogni tre mesi, ancorata alla data di iscrizione.
- **Stato "nessuna risposta" nello storico**: mai la parola "ignorata" nell'interfaccia. Usare "No reply yet", con eventuale testo secondario *"Not every letter finds a reply — that's part of writing to someone new."* Non deve mai leggersi come un fallimento di nessuno dei due membri.
- **Contatore iscritti waitlist**: resta nascosto sotto 100 iscritti. Prima della soglia si comunica soltanto che la waitlist è aperta; dal raggiungimento di 100 viene mostrato sempre e non torna più nascosto.
