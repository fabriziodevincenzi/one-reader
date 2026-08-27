# Dear Someone — Project spec per lo sviluppo

**Versione:** 1.2 — consolidato dal brief v0.1 (5 agosto 2026), dalle decisioni di prodotto successive e dal riepilogo interno dell'8 agosto 2026
**Stato:** direzione di prodotto consolidata; pronto per fondazioni tecniche, mockup, waitlist e blog editoriale

---

## 1. Cos'è il prodotto

Dear Someone è un club privato di corrispondenza casuale via email. Ogni membro può scrivere una lettera che raggiunge un solo membro sconosciuto del club. Chi la riceve può rispondere con parole proprie, interrompere esplicitamente la corrispondenza oppure non proseguire. Tutta l'esperienza vive nella normale casella email del membro: nessuna app da installare, nessun profilo pubblico, nessun feed.

Se nasce una corrispondenza, gli indirizzi reali restano nascosti finché entrambi i membri non scelgono esplicitamente di uscire dal servizio e proseguire in autonomia.

**Non è**: un social network, un'app di messaggistica, un servizio di dating, una terapia o un sostituto del supporto psicologico.

**Nota su "club"**: il termine è usato solo come posizionamento di tono (appartenenza, qualità, distanza dal rumore dei social — come un club del libro), non come meccanismo di ammissione reale. Non esiste selezione né approvazione dei membri: chiunque può iscriversi. Di conseguenza, in tutti i testi pubblici e nei flussi (waitlist, FAQ, email) va evitato linguaggio che implichi una selezione ("Apply to join", "La tua richiesta è in revisione", "Invite only"). La waitlist comunica una coda dovuta a motivi tecnici di lancio (equilibrio mittenti/destinatari nel cold start), non un giudizio di idoneità — es. *"We're opening slowly, in small groups, so every letter finds a reader."*

Proposta di valore: *"One letter. One reader. Maybe a reply. No judgment."* — "no judgment" va inteso come assenza di confronto sociale tra membri (niente foto, niente profili da sfogliare, niente punteggi visibili), non come assenza di moderazione: il servizio continua a moderare tramite segnalazioni, blocco e score interno invisibile (§6).

---

## 2. Modello economico

- **Ingresso gratuito**: una prima corrispondenza per entrare nella stanza. Dopo la prima apertura, il membro può continuare a ricevere lettere e rispondere alle conversazioni aperte; per iniziare nuove corrispondenze serve l'annuale.
- **Piano annuale**: **18 euro / 12 mesi**, quota unica. Un membro pagante può aprire una nuova corrispondenza ogni 24 ore; le risposte non consumano il limite. Il prezzo pieno va comunicato fin dalla landing page, insieme al perché del periodo gratuito iniziale — nessun trial nascosto dietro le 8 settimane gratuite.
- **Lancio in tre passaggi**:
  1. Waitlist pubblica, con obiettivo/cap interno indicativo di **100 iscritti**. Il contatore resta **nascosto fino al 10% dell'obiettivo** (10 iscritti) — sotto quella soglia un numero piccolo toglie prova sociale invece di darla; raggiunta la soglia, il contatore va mostrato sempre. Quando il tetto viene raggiunto, il servizio parte: non si raccolgono altri iscritti in una coda separata.
  2. Gli iscritti alla waitlist entrano in una **coorte sincronizzata** con 8 settimane gratuite all'accesso del piano annuale (fino a una nuova corrispondenza al giorno). I nuovi membri che arrivano dopo l'apertura entrano invece sul piano Free (una nuova corrispondenza ogni tre mesi) e possono passare all'annuale in qualsiasi momento.
- **Funnel di accesso unico**: ogni persona crea/verifica un solo account tramite email. Dopo la verifica può attivare immediatamente il piano Free senza pagamento oppure proseguire nello stesso account verso il checkout annuale localizzato. Se il pagamento annuale viene abbandonato o fallisce, l'account resta attivo sul piano Free: non esistono due registrazioni separate.
- **Prezzo per la coorte waitlist**: il prezzo founding resta bloccato per i **primi tre anni pagati** (es. 12€ invece di 18€ per ciascuno dei primi tre cicli annuali). Dal quarto anno si applica il prezzo pieno comunicato prima del rinnovo. Lo status simbolico "founding member" (es. badge nell'area riservata) resta anche dopo la fine del vantaggio economico.
- Fatturazione annuale preferita al mensile per ridurre l'incidenza delle commissioni di pagamento e rafforzare la percezione di "ingresso in un club". Da sottolineare in comunicazione: 18 euro l'anno equivalgono a meno di 5 centesimi al giorno.
- Quando la cadenza del piano non consente una nuova apertura, la lettera non viene conservata né inviata automaticamente più avanti. Il mittente riceve la data esatta in cui potrà riprovare e dovrà inviare una nuova lettera. Per chi è sul piano Free, il messaggio spiega con discrezione che l'annuale riduce l'attesa a una nuova apertura ogni 24 ore; ricezione e risposte dentro conversazioni già aperte restano disponibili.
- Nel form waitlist l'email operativa richiesta per gestire l'iscrizione resta distinta dal consenso facoltativo a ricevere Journal e product news. Il consenso opzionale è separato, non preselezionato, versionato e revocabile con la stessa facilità con cui viene dato.
- **Obiettivo di scala**: 15.000 utenti paganti è l'obiettivo dichiarato di lungo periodo. Il primo traguardo operativo è 1.000 paganti nel primo anno; con una conversione waitlist del 15-25% richiede indicativamente 4.000-6.500 iscritti alla waitlist.

### Accesso dall'Ucraina

- Per le persone che dichiarano di accedere dal mercato ucraino, l'iscrizione annuale è **gratuita senza scadenza per quella sottoscrizione**. Tecnicamente resta una normale sottoscrizione Stripe, con un coupon al 100% e `duration: "forever"`, applicato tramite un promotion code dedicato.
- L'accesso è su base **dichiarativa**: nessun documento, prova di residenza o blocco IP. Il percorso può essere proposto quando la persona seleziona Ucraina, ucraino o UAH, ma deve restare una scelta esplicita e modificabile; lingua, valuta e paese non vanno usati come prova automatica di residenza.
- Il promotion code non va esposto nella comunicazione globale: viene distribuito nella pagina/percorso dedicato e nei canali rivolti a quel mercato. Vanno comunque previste protezioni tecniche non invasive contro l'abuso automatizzato e il riutilizzo massivo del codice.
- La concessione viene **riesaminata ogni 12 mesi per le nuove attivazioni**. Chi l'ha già ottenuta mantiene il 100% a vita finché la sua sottoscrizione resta attiva: la revisione non modifica retroattivamente la promessa.
- Stripe consente di creare una sottoscrizione senza metodo di pagamento quando, dopo il coupon, non è dovuto alcun importo immediato. Il flusso dedicato va quindi testato senza forzare l'inserimento di una carta.

---

## 3. Regole di funzionamento del club

- Un membro del **piano annuale** può inviare **una nuova lettera ogni 24 ore** (finestra mobile, non giorno di calendario). Comunicazione: non va presentato come una restrizione da app freemium, ma come conseguenza del fatto che ogni membro è anche l'unico lettore possibile di qualcun altro — copy indicativo vicino all'azione "Write a letter": *"You get one letter a day, because someone will be its only reader."*
- Un membro non pagante può aprire una sola corrispondenza iniziale. Questa è una soglia di ingresso, non un contatore comparativo: ricezione e risposte alle conversazioni aperte restano disponibili.
- Le risposte all'interno di una conversazione già aperta **non** consumano alcun limite e non hanno un numero massimo per conversazione.
- Se la cadenza non è ancora disponibile, la nuova lettera viene rifiutata senza conservarne il testo e non partirà automaticamente più avanti. Il membro riceve la prossima data esatta e, se Free, un invito secondario e senza pressione a valutare l'annuale.
- La verifica della casella tramite magic link diventa anche un segnale operativo di disponibilità a ricevere. Se tre link consecutivi non vengono utilizzati e non c'è altra attività email riconoscibile per 30 giorni, il membro entra nello stato **delivery paused**: non riceve nuove assegnazioni, ma non viene escluso, cancellato o considerato disinteressato. L'account e le conversazioni esistenti restano intatti. Il recupero avviene utilizzando un nuovo magic link, rispondendo dall'alias verificato della conversazione oppure cambiando email da una sessione già autenticata; finché il recupero non avviene, non si instradano nuove lettere verso una casella potenzialmente non più accessibile.
- Se il destinatario non risponde, la lettera si chiude lì: non viene rimessa in circolo.
- Regola culturale (non tecnicamente imposta): rispondere è una cortesia. Non viene introdotto un pulsante separato "I read you": chi vuole può scrivere una risposta breve con parole proprie. La lettura resta implicita; l'azione esplicita disponibile fin dalla prima email è interrompere la corrispondenza.
- In fondo a ogni email compaiono tre azioni: **Non desidero proseguire**, **Segnala questa lettera**, **Vorrei continuare direttamente** (quest'ultima richiede consenso reciproco prima di scambiare i contatti reali).

---

## 4. Ciclo di vita di una lettera (stati)

```
Scritta → Assegnata → Consegnata → {Rimbalzata | Ignorata | Riconosciuta | Risposta}
Risposta → Conversazione aperta → {Uscita concordata | Interrotta (blocco)}
```

- **Scritta**: il membro invia il testo a `write@onereader.co`.
- **Assegnata**: il motore di assegnazione casuale sceglie un destinatario idoneo (vedi §5).
- **Consegnata**: la lettera arriva nella casella email del destinatario tramite alias.
- **Rimbalzata**: consegna fallita (bounce).
- **Ignorata**: nessuna azione del destinatario entro la finestra di osservazione. Attenzione al copy rivolto all'utente: mai la parola "ignorata" nell'interfaccia (suggerisce un torto da parte del destinatario); mostrare invece "No reply yet", eventualmente con testo secondario tipo *"Not every letter finds a reply — that's part of writing to someone new."* Non deve mai leggersi come un fallimento né del mittente né del destinatario.
- **Riconosciuta**: il destinatario invia un segno minimo di ricezione.
- **Risposta**: il destinatario scrive una risposta sostanziale.
- **Conversazione aperta**: scambio proseguito oltre la prima risposta.
- **Uscita concordata**: doppio consenso a proseguire fuori dalla piattaforma.
- **Interrotta (blocco)**: uno dei due membri interrompe la corrispondenza (può avvenire da qualunque stato, non solo da "Conversazione aperta").

Lo storico delle corrispondenze resta nella casella email del membro: l'area riservata non duplica il contenuto delle lettere e non mostra contatori di attività. Serve solo per membership, consensi, preferenze di lingua/disponibilità, privacy request e cancellazione account.

---

## 5. Assegnazione casuale

**Filtri di idoneità** (must-have, MVP):
- lingua compatibile (vedi §8);
- entrambi maggiorenni;
- destinatario con iscrizione attiva e disponibile a ricevere;
- destinatario con casella verificata e attività sufficiente a ricevere una nuova lettera;
- nessun blocco pregresso tra le due persone;
- esclusione, se possibile, di assegnazioni recenti alla stessa coppia.

**Algoritmo consigliato — weighted random / inverse-frequency**:
1. Costruire il pool di candidati idonei secondo i filtri sopra.
2. Calcolare il peso di ciascun candidato: `peso = 1 / (1 + lettere_ricevute_ultimi_30_giorni)` — chi ha ricevuto meno lettere di recente ha più probabilità di essere scelto, evitando che i membri più attivi vengano sommersi mentre altri restano sempre esclusi.
3. Estrazione pesata (distribuzione cumulativa + numero casuale).
4. Applicare un cap giornaliero di lettere in ricezione per membro (es. 1-2/giorno) per non sovraccaricare nessuno.

Fattori minori opzionali da valutare in una versione successiva (non bloccanti per l'MVP): leggero bonus di peso per coppie in cui almeno uno scrive nella propria lingua madre (riduce corrispondenze "deboli" linguisticamente); oppure bonus per coppie con lingua madre diversa tra loro (favorisce l'incontro tra culture, coerente con lo spirito del prodotto).

La casualità deve restare percepibile e reale — niente selezione da catalogo, che riporterebbe il prodotto verso dating/social.

---

## 6. Blocco e segnalazione

- **Livello 1 — disconnessione**: B può bloccare A in qualunque momento. Il blocco è un record separato `block(B, A)` controllato prima di ogni inoltro — non richiede la scadenza dell'alias della conversazione.
  - Se A tenta comunque di scrivere a B, riceve un messaggio rispettoso e generico: *"L'altra persona ha scelto di interrompere questa corrispondenza."* Nessun nome, nessun motivo.
- **Livello 2 — segnalazione**: per contenuti problematici. Chi riceve sceglie una categoria, la corrispondenza viene chiusa e la lettera già conservata in forma cifrata diventa disponibile per una revisione separata da parte di One Reader.
  - La segnalazione non sospende automaticamente l'account e non alimenta score automatici. Eventuali limitazioni o esclusioni richiedono una decisione di moderazione basata sulle regole pubblicate, sul contenuto segnalato e sul contesto disponibile.
  - La semplice assenza di risposta non è mai una segnalazione e non riduce l'affidabilità di un membro.
- Procedura dedicata e prioritaria per contenuti che indicano pericolo immediato o autolesionismo.

---

## 7. Privacy, sicurezza dei dati e retention

- Il servizio è **pseudonimo tra i membri**, non anonimo in senso tecnico assoluto: la piattaforma può accedere ai contenuti in caso di segnalazione. Comunicazione corretta: "indirizzi nascosti", "corrispondenza privata" — **mai** "crittografia end-to-end", che non è implementata.
- **Crittografia at-rest** per il contenuto delle lettere, con pattern envelope encryption:
  - ogni lettera cifrata con una Data Encryption Key (DEK) generata al momento (es. AES-256);
  - la DEK è a sua volta cifrata con una Key Encryption Key (KEK) gestita da un servizio dedicato (es. AWS KMS, Google Cloud KMS, Vault), mai insieme ai contenuti nello stesso database;
  - protegge da furti/dump del database, non dalla piattaforma stessa (che mantiene le credenziali per operare).
- **Retention differenziata**:
  - contenuto delle lettere: conservato **24 mesi dall'ultimo scambio** in quella corrispondenza, poi cancellato definitivamente;
  - relazione di blocco (solo gli ID coinvolti, non il contenuto): conservata più a lungo del contenuto, finché entrambi gli account restano attivi — necessaria per evitare riassegnazioni accidentali tra membri che si sono bloccati; rimossa solo alla chiusura dell'account.
- Tracciamento aperture/click disattivato.
- Cancellazione account e dati offerta, compatibilmente con obblighi di sicurezza/legge (coerente con richieste GDPR: si può spiegare chiaramente cosa viene cancellato e cosa resta per motivi di sicurezza legittimi).

---

## 8. Gestione delle lingue

- **Nessuna traduzione automatica** nell'MVP: incompatibile con l'identità del prodotto (voce autentica del mittente) e con il modello di crittografia/privacy (richiederebbe l'invio dei testi a un servizio terzo).
- Modello dati essenziale: **una sola lista "lingue"** per membro, senza livelli di padronanza. Ogni lingua selezionata è considerata utilizzabile per la corrispondenza.
  - Ogni lingua mantiene due segnali distinti: **disposto a scrivere** e **disposto a leggere**. Il filtro di matching usa l'incrocio dei due segnali tra mittente e destinatario.
- **Roadmap linguistica**: lancio english first (mercato anglofono principale), poi spagnolo, francese, tedesco, lingue scandinave, ucraino, giapponese, italiano — sia per la localizzazione del sito sia per le lingue di corrispondenza disponibili. L'accesso agevolato per l'Ucraina può essere attivato prima della localizzazione completa, purché il percorso e il supporto essenziale siano disponibili in ucraino.

### Mercati e valute

- **Prima espansione anglofona**: Regno Unito/Irlanda, Stati Uniti/Canada, Australia, Nuova Zelanda, Singapore, Hong Kong e India. Singapore e Hong Kong sono mercati e valute distinti anche se condividono la priorità di lancio.
- **Europa**: i paesi dell'Eurozona usano il prezzo in EUR; la Finlandia rientra correttamente in questo gruppo. La Polonia usa un prezzo dedicato in PLN, non EUR.
- **Ucraina**: UAH disponibile come valuta di presentazione, ma il percorso dedicato applica il coupon al 100%; mostrare comunque il prezzo pieno di riferimento e spiegare chiaramente la concessione.
- **Cina**: esclusa dalla prima fase commerciale. Il prezzo CNY è comunque presente nella griglia completa di listino, ma non viene mostrato né attivato finché la deliverability verso i provider locali non supera un test dedicato.
- **Griglia prezzi approvata** (prezzo annuale pieno / prezzo founding applicato ai primi tre anni pagati): EUR 18/12, USD 25/12, GBP 18/12, CAD 32/12, AUD 32/12, BRL 30/—, DKK 150/90, ISK 2.800/1.400, NOK 220/145, SEK 220/145, JPY 3.350/2.186, CNY 140/94, CHF 18/12, TWD 700/445, KRW 29.000/2.000, UAH 300/600, ILS 65/42, PLN 50/40. L'accesso Ucraina resta un percorso separato con coupon al 100% per la sottoscrizione agevolata.

---

## 9. Allegati

- **Non gestiti nella prima versione**: il parser che riceve le email via webhook estrae solo la parte di testo, scartando ogni parte MIME non testuale (niente sviluppo dedicato a upload/storage/scansione allegati nell'MVP).
- Il mittente riceve un avviso automatico che gli allegati non sono stati recapitati (es. *"Il tuo testo è stato consegnato. Le immagini o i file allegati non vengono trasmessi da Dear Someone."*).
- Angolo di comunicazione coerente: "qui contano le parole" — il limite tecnico diventa un tratto distintivo del prodotto.

---

## 10. Componenti tecnici essenziali (dal brief originale)

### Fondazione frontend

- Usare **Cooper** come scaffolding tecnico iniziale, non come riferimento visivo: mantenere la struttura Astro, TypeScript, Tailwind, i18n, primitive accessibili e configurazione dei test; importare i componenti Shadcn necessari per form, bottoni e input, poi ristilizzarli tramite token.
- Eliminare subito ciò che non appartiene al prodotto: documentazione del template, changelog, ricerca, logo cloud, feature grid, testimonial, dashboard analytics, temi decorativi, dark-mode toggle se non viene progettato esplicitamente, animazioni e sezioni SaaS. **Mantenere invece il blog editoriale**, in sottocartella `/blog/`, perché è previsto come canale pubblico fin dal lancio.
- Non mantenere React come default per ogni superficie: usarlo solo per le isole realmente interattive. Landing, pagine editoriali e gran parte dell'area riservata devono restare Astro-first e leggere.
- Ricostruire quasi completamente tipografia, densità, palette e superfici secondo il brief visuale: Libre Baskerville per titoli, voce umana e lettura editoriale; DM Sans per struttura e controlli; DM Mono per metadati, date, categorie e stati brevi; palette calda quasi monocroma, un solo accento, bordi sottili, zero ombre e spaziatura generosa.
- Prima di costruire pagine complete, definire token semantici per colore, tipografia, spaziatura, raggi, bordi, focus e stati. I componenti Cooper/Shadcn sono implementazioni sostituibili; i token sono il contratto visivo del prodotto.

- pagina pubblica con presentazione, regole e pagamento;
- landing pre-lancio su `/` orientata alla waitlist e landing post-lancio preparata su `/launch/`, da rendere pubblica al cambio di fase;
- blog editoriale Astro in `/blog/`, sul dominio principale, con tassonomia e contenuti versionati nel repository;
- database dei membri e dello stato dell'iscrizione (scelta: **Supabase/Postgres**, con Row Level Security per applicare a livello di database le regole di retention e accesso ai contenuti di §7);
- Stripe (o equivalente) per il pagamento annuale, con **prezzi multipli per valuta** (un `Price` dedicato per le valute prioritarie, non solo conversione automatica) e una regola di billing deterministica che mantenga il prezzo founding per i primi tre cicli annuali e passi al prezzo pieno dal quarto;
- sito in Astro con **i18n routing nativo** per le lingue previste (§8); lingua e valuta mostrate di default in base a rilevamento automatico (header `Accept-Language` per la lingua, paese dedotto via header di geolocalizzazione della CDN per la valuta — solo a livello di paese, non di posizione precisa), sempre sovrascrivibile con un selettore manuale salvato in cookie;
- Resend (o equivalente) per ricezione e consegna email, con webhook che riceve le notifiche in arrivo;
- motore di assegnazione casuale (§5);
- alias non interpretabili per ogni conversazione;
- funzioni di blocco, segnalazione e gestione amministrativa (§6);
- **controllo del mittente**: non basarsi solo sul campo "Da" (falsificabile) — verificare SPF/DKIM/DMARC, valutare un indirizzo segreto per membro, ignorare autoresponder e cicli automatici. Alla ricezione su `write@onereader.co` il sistema riconosce tre casi: **membro attivo** → la lettera viene assegnata e inoltrata in forma anonimizzata (indirizzo temporaneo → indirizzo temporaneo) a un altro membro idoneo, mai lo stesso mittente; **indirizzo sconosciuto** → non viene creato alcun account e non viene conservato il corpo della lettera: resta soltanto il tentativo minimo necessario per deduplica e anti-abuso, seguito da una sola email con il percorso di registrazione; **account chiuso** → la lettera non viene conservata o inoltrata e viene indicato il percorso previsto dalla policy per tornare al servizio;
- **trattamento della lettera in uscita**: non inoltrare il messaggio originale integralmente — ricostruire una nuova email con solo il testo utile, senza intestazioni tecniche originali, cronologia citata, firme automatiche o allegati.

---

## 11. Perimetro dell'MVP

- 100-200 membri nella coorte di lancio;
- una sola lingua (inglese) nella primissima release, poi estensione secondo la roadmap di §8;
- persone dai 14 anni, con bacini 14–17 e 18+ separati, solo testo;
- piano gratuito con una nuova corrispondenza ogni tre mesi, ancorata alla data di iscrizione;
- piano annuale con una nuova corrispondenza ogni 24 ore;
- assegnazione automatica secondo l'algoritmo di §5 (non manuale);
- email tramite alias; integrazione Stripe reale e testata prima dell'apertura pagante; la coorte iniziale resta nella stagione gratuita di 8 settimane già decisa, poi mantiene il prezzo founding per i primi tre anni pagati;
- nessuna app, nessun profilo pubblico.

### Domande da validare con l'MVP

1. Le persone pagano prima di sapere chi riceverà la loro lettera?
2. Quanti iscritti inviano almeno una lettera?
3. Quante lettere ricevono una risposta, anche breve?
4. Quante producono una risposta sostanziale?
5. Quante conversazioni proseguono oltre il primo scambio?
6. Quanto abuso o contenuto problematico emerge?
7. L'email rende l'esperienza naturale o crea problemi di spam/consegna?
8. Dopo alcune settimane, le persone continuano a voler scrivere a sconosciuti?

---

## 12. Metriche fondamentali

- % iscritti che invia la prima lettera;
- tempo medio tra iscrizione e prima lettera;
- % lettere con una risposta, anche breve;
- % lettere con risposta sostanziale;
- % scambi che superano tre risposte;
- equilibrio invio/ricezione per membro;
- segnalazioni ogni cento lettere;
- tasso di rinnovo annuale;
- costo di acquisizione di un membro pagante;
- % email consegnate correttamente.
- iscritti waitlist → membri paganti;
- nuovi paganti acquisiti per canale e costo di acquisizione;
- utenti paganti attivi verso l'obiettivo di 15.000.

**Metrica guida**: percentuale di nuove lettere che ricevono un segno umano di ricezione entro sette giorni.

---

## 13. Direzione di stile per l'interfaccia (le poche schermate previste)

Il prodotto ha pochissime superfici UI (sito pubblico, checkout, verifica email, area riservata con gestione sottoscrizione, consensi e privacy controls) — l'esperienza principale resta nella casella email del membro. Per le schermate web:

- tono **editoriale e silenzioso**: Libre Baskerville per titoli, sottotitoli editoriali e testo delle lettere/anteprime; DM Sans per navigazione, CTA, form, etichette e struttura; DM Mono per metadati, categorie, date, tempi di lettura e stati brevi;
- titoli principali grandi e molto distanziati; corpo editoriale in colonna stretta con interlinea generosa; metadati piccoli, discreti e in maiuscolo;
- palette quasi monocroma, un solo accento discreto per stati tipo "nuovo" — niente colori decorativi diffusi;
- un solo bordo sottile, zero ombre, nessun elemento che "urla" — coerente con la promessa di calma e assenza di gamification;
- metadati minimi ma umani nelle anteprime (es. area geografica generica e lingua del mittente), mai identità.

---

## 14. Decisioni ancora aperte e relativo gate

- Rifiuto prima della lettura — default raccomandato: **no nell'MVP**, perché la lettera vive già nel corpo dell'email; da confermare prima del mockup dell'email.
- "I read you" — decisione: **nessun pulsante dedicato**. La risposta breve resta una cortesia suggerita nel copy, mentre "interrompere la corrispondenza" è l'azione esplicita disponibile fin dalla prima email.
- Conversazioni aperte — default raccomandato: **più di una consentita**, senza contatore competitivo; da confermare prima del modello dati della fase 5.
- Chiusura alias inattivo — decisione: **30 giorni dall'ultimo scambio**, indipendente dalla retention del contenuto a 24 mesi.
- Toggle "leggo ma non scrivo in questa lingua" — default raccomandato: **post-MVP**; da riesaminare prima della seconda lingua.
- Dati minimi oltre all'email: mese e anno di nascita, lingue/livelli, paese o mercato dichiarato e disponibilità a ricevere; nessun nome reale richiesto. Il giorno di nascita non viene raccolto. Il matching mantiene separati i bacini 14–17 e 18+, calcolando in modo conservativo il passaggio al bacino adulto dal primo giorno del mese successivo al mese del diciottesimo compleanno.
- Importi locali — decisione: griglia completa definita per le valute elencate in §8; restano da chiudere solo IVA, arrotondamenti Stripe e quali mercati attivare operativamente per primi.
- Gestione IVA e imposte per iscrizioni internazionali — da chiudere con consulenza fiscale e configurazione Stripe prima del primo pagamento reale.
- Provider di hosting/CDN e regione dati — da chiudere prima di progettare header di geolocalizzazione, runtime server e deployment.
- Metodo di autenticazione dell'area riservata — decisione: **magic link senza password**. Il link sarà monouso, a scadenza breve e inviato solo all'indirizzo già associato all'account; la sessione avrà cookie sicuro e revoca esplicita. Restano da definire provider, durata esatta del token e requisiti aggiuntivi per azioni sensibili.

---

## 15. Ciò che il prodotto non deve diventare

Dear Someone non deve cercare di massimizzare il tempo speso nel prodotto. Deve rendere possibile un incontro tra due persone e poi farsi da parte.

> Qualcuno che ti presta attenzione senza che tu debba esibirti.

---

## 16. Roadmap di realizzazione

Le fasi sono ordinate per dipendenza. Le decisioni aperte del §14 diventano bloccanti solo al gate indicato; non impediscono di iniziare la fase 0.

### Fase 0 — Fondazione e pulizia dello scaffolding

1. Inizializzare il progetto da Cooper e fissare le versioni del runtime.
2. Rimuovere sezioni, dipendenze e contenuti demo non pertinenti.
3. Configurare Astro-first, Tailwind, TypeScript, linting, test e i18n con inglese come unica lingua attiva.
4. Introdurre solo le primitive Shadcn necessarie e definire i token semantici Dear Someone.
5. Preparare variabili d'ambiente separate per locale, preview e produzione.

**Completata quando:** build, test base e preview funzionano; nessun contenuto o stile SaaS del template è visibile; i token governano tutte le primitive.

### Fase 1 — Direzione visuale e prototipo dei touchpoint

1. Ricostruire la card di riferimento come componente reale.
2. Disegnare e implementare landing, waitlist, conferma, panoramica membro, impostazioni account, template email "You have a letter" e indice editoriale `/blog/`.
3. Scrivere copy inglese reale, inclusi i due piani (cadenza gratuita trimestrale e cadenza annuale giornaliera), stagione gratuita, prezzo pieno e stati senza giudizio.
4. Verificare mobile, tastiera, screen reader, contrasto e motion reduction.

**Completata quando:** tutte le superfici prioritarie del brief sono navigabili con dati finti coerenti e approvate come sistema visivo unico.

### Fase 2 — Waitlist pubblica

1. Creare schema Supabase minimo per contatti, consenso, lingua/mercato dichiarati, timestamp e stato di verifica.
2. Implementare iscrizione con verifica email, deduplicazione, rate limit e messaggi non selettivi.
3. Nascondere il numero sotto 10 iscritti; una volta superata la soglia, mostrarlo sempre.
4. Aggiungere analytics essenziali senza tracking delle email e una pagina privacy coerente.

**Completata quando:** un visitatore può iscriversi, verificarsi e ricevere conferma; il conteggio pubblico rispetta la soglia; esportazione e cancellazione dati sono testate.

### Fase 3 — Identità, iscrizione e billing

1. Implementare account maggiorenni, magic link, profilo lingue, disponibilità a ricevere e l'entitlement del piano (free / annual / founding season).
2. Definire prezzi locali e trattamento IVA; creare Product/Price Stripe e webhook idempotenti.
3. Implementare stagione gratuita, cadenza free ogni tre mesi, cadenza annuale ogni 24 ore, prezzo founding bloccato per i primi tre cicli annuali e programma Ucraina `100% forever`.
4. Testare rinnovo, mancato pagamento, cancellazione, ex membro e Customer Portal.

**Completata quando:** ogni evento Stripe produce uno stato membro deterministico e riconciliabile; nessun segreto raggiunge il client; i tre percorsi economici sono coperti da test.

### Fase 4 — Pipeline email in ambiente controllato

1. Configurare dominio, SPF, DKIM, DMARC, inbound webhook, bounce e suppression list.
2. Verificare il mittente e distinguere membro attivo, non membro ed ex membro.
3. Estrarre solo testo utile, rimuovendo firme, cronologia, header e allegati; inviare l'avviso sugli allegati scartati.
4. Generare alias non interpretabili per conversazione e prevenire autoresponder, loop e replay dei webhook.

**Completata quando:** una suite di messaggi reali attraversa andata, risposta, bounce e allegato senza esporre gli indirizzi reali.

### Fase 5 — Motore delle lettere e matching

1. Implementare stato delle lettere e conversazioni come macchina a stati esplicita.
2. Applicare limite mobile di 24 ore solo alle nuove lettere.
3. Implementare filtri di idoneità, inverse-frequency weighted random, cap di ricezione ed esclusione delle coppie recenti.
4. Aggiungere cifratura envelope at-rest, audit log minimo e job di retention.

**Completata quando:** simulazioni su pool sbilanciati mostrano distribuzione equa, nessun self-match o coppia bloccata e transizioni valide soltanto.

### Fase 6 — Sicurezza, moderazione e privacy operativa

1. Implementare disconnessione, segnalazione con revisione umana e uscita con doppio consenso, senza score o sospensioni automatiche.
2. Creare una console amministrativa minimale con accessi tracciati e principio del minimo privilegio.
3. Definire procedura per pericolo immediato/autolesionismo, tempi di risposta e escalation.
4. Testare cancellazione account, retention a 24 mesi e conservazione separata dei blocchi.

**Completata quando:** ogni azione sensibile ha autorizzazione, audit e procedura; una segnalazione non rivela identità e interrompe subito la coppia.

### Fase 7 — Beta chiusa e stagione gratuita

1. Invitare una coorte sincronizzata di 100-200 membri dalla waitlist.
2. Eseguire seed test di deliverability nei mercati della prima espansione, con attenzione particolare a provider e paesi nuovi.
3. Monitorare la metrica guida a 7 giorni, equilibrio invio/ricezione, bounce, segnalazioni e loop email.
4. Correggere soltanto problemi di affidabilità, sicurezza e comprensione prima di ampliare la coorte.

**Completata quando:** il recapito è stabile, la moderazione è sostenibile e la metrica guida ha un campione sufficiente per decidere l'apertura.

### Fase 8 — Apertura pagante e crescita per mercato

1. Aprire l'annuale ai nuovi membri, mantenere il piano gratuito trimestrale e applicare il prezzo founding ai primi tre anni pagati dei founding members.
2. Attivare gradualmente i `Price` per NZD, SGD, HKD, INR e PLN senza mostrare mercati non ancora supportati operativamente.
3. Aprire il percorso Ucraina gratuito con copy e supporto essenziale in ucraino.
4. Localizzare una lingua alla volta seguendo domanda, densità del pool e deliverability; tenere la Cina fuori finché non supera un test dedicato.
5. Riesaminare annualmente prezzi locali e disponibilità della concessione Ucraina per le nuove attivazioni, senza modificare quelle esistenti.

**Completata quando:** rinnovi, tasse, supporto e deliverability sono gestibili per ciascun mercato attivo e ogni nuovo pool linguistico ha densità sufficiente per il matching.

---

## 17. Acquisizione, blog e validazione commerciale

- Il posizionamento da rendere riconoscibile è il ritorno dell'email a gesto umano: non newsletter, bolletta, marketing o feed, ma qualcuno che scrive soltanto a te.
- Il collo di bottiglia atteso è l'acquisizione, non il costo infrastrutturale. Il blog sul dominio principale è quindi un canale di prodotto, non un accessorio SEO da aggiungere in seguito.
- Il piano editoriale segue quattro filoni: contesto e attenzione, confronti con servizi affini, guide pratiche alla scrittura e building in public.
- Prima dell'outreach a giornalisti e testate devono esistere i primi articoli pubblicati e una pagina chiara che spieghi il meccanismo distintivo: email-first, matching casuale e doppio consenso per il contatto diretto.
- I concorrenti di riferimento da monitorare sono Slowly, Lettre e DearStranger. Sono utili per il confronto di meccaniche, non come modelli visuali o di posizionamento da imitare.
- Il piano di crescita distingue il primo traguardo operativo di 1.000 paganti dal traguardo di scala di 15.000 paganti; waitlist, conversione e costo di acquisizione sono metriche di pari importanza rispetto alla deliverability.
- Restano da definire: tassonomia definitiva del blog, primi articoli e calendario editoriale prima dell'avvio dell'outreach.
