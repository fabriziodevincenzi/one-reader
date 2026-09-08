import type { SiteLocale } from './i18n';

export interface JournalUiCopy {
  title: string;
  description: string;
  featuredNote: string;
  readNote: string;
  earlierNotes: string;
  readIn: string;
  translationsLabel: string;
  writeToSomeone: string;
  writeHelp: string;
  backToJournal: string;
  homeLabel: string;
  footerLabel: string;
  about: string;
  privacy: string;
  terms: string;
}

export const journalLanguageNames: Record<SiteLocale, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  uk: 'Українська',
  ja: '日本語',
  pl: 'Polski',
  pt: 'Português',
  nl: 'Nederlands',
};

export const journalUiCopy: Record<SiteLocale, JournalUiCopy> = {
  en: {
    title: 'Notes on pen pals, attention, and finding a way to begin.',
    description: 'Thoughts on pen-pal correspondence, attention, and the strange, hopeful work of beginning a conversation with someone you do not know.',
    featuredNote: 'Featured note', readNote: 'Read the note', earlierNotes: 'Earlier notes', readIn: 'Read in',
    translationsLabel: 'Available translations', writeToSomeone: 'Write to someone',
    writeHelp: 'Opens your email app. If it does not, email write@onereader.co.', backToJournal: 'Back to Journal',
    homeLabel: 'One Reader, home', footerLabel: 'Site footer navigation', about: 'About', privacy: 'Privacy', terms: 'Terms',
  },
  it: {
    title: 'Appunti sulla corrispondenza, l’attenzione e il modo di cominciare.',
    description: 'Riflessioni sulla corrispondenza tra amici di penna, sull’attenzione e sullo strano, fiducioso tentativo di iniziare una conversazione con qualcuno che non conosciamo.',
    featuredNote: 'In evidenza', readNote: 'Leggi l’articolo', earlierNotes: 'Articoli precedenti', readIn: 'Leggi in',
    translationsLabel: 'Traduzioni disponibili', writeToSomeone: 'Scrivi a qualcuno',
    writeHelp: 'Apre la tua applicazione email. Se non si apre, scrivi a write@onereader.co.', backToJournal: 'Torna al Journal',
    homeLabel: 'One Reader, pagina iniziale', footerLabel: 'Navigazione a piè di pagina', about: 'Chi siamo', privacy: 'Privacy', terms: 'Termini',
  },
  es: {
    title: 'Notas sobre correspondencia, atención y cómo encontrar una forma de empezar.',
    description: 'Reflexiones sobre la correspondencia entre amigos por carta, la atención y la extraña y esperanzadora tarea de iniciar una conversación con alguien a quien no conocemos.',
    featuredNote: 'Artículo destacado', readNote: 'Leer el artículo', earlierNotes: 'Artículos anteriores', readIn: 'Leer en',
    translationsLabel: 'Traducciones disponibles', writeToSomeone: 'Escribe a alguien',
    writeHelp: 'Abre tu aplicación de correo. Si no se abre, escribe a write@onereader.co.', backToJournal: 'Volver al Journal',
    homeLabel: 'One Reader, inicio', footerLabel: 'Navegación del pie de página', about: 'Acerca de', privacy: 'Privacidad', terms: 'Términos',
  },
  fr: {
    title: 'Notes sur la correspondance, l’attention et la manière de commencer.',
    description: 'Réflexions sur la correspondance entre amis de plume, l’attention et l’étrange travail, plein d’espoir, qui consiste à engager une conversation avec une personne inconnue.',
    featuredNote: 'Article à la une', readNote: 'Lire l’article', earlierNotes: 'Articles précédents', readIn: 'Lire en',
    translationsLabel: 'Traductions disponibles', writeToSomeone: 'Écrire à quelqu’un',
    writeHelp: 'Ouvre votre application de messagerie. Sinon, écrivez à write@onereader.co.', backToJournal: 'Retour au Journal',
    homeLabel: 'One Reader, accueil', footerLabel: 'Navigation du pied de page', about: 'À propos', privacy: 'Confidentialité', terms: 'Conditions',
  },
  de: {
    title: 'Notizen über Brieffreundschaften, Aufmerksamkeit und darüber, einen Anfang zu finden.',
    description: 'Gedanken über Brieffreundschaften, Aufmerksamkeit und die seltsame, hoffnungsvolle Aufgabe, ein Gespräch mit einem unbekannten Menschen zu beginnen.',
    featuredNote: 'Ausgewählter Beitrag', readNote: 'Beitrag lesen', earlierNotes: 'Frühere Beiträge', readIn: 'Lesen auf',
    translationsLabel: 'Verfügbare Übersetzungen', writeToSomeone: 'Jemandem schreiben',
    writeHelp: 'Öffnet Ihre E-Mail-App. Falls nicht, schreiben Sie an write@onereader.co.', backToJournal: 'Zurück zum Journal',
    homeLabel: 'One Reader, Startseite', footerLabel: 'Navigation in der Fußzeile', about: 'Über uns', privacy: 'Datenschutz', terms: 'Bedingungen',
  },
  sv: {
    title: 'Anteckningar om brevvänner, uppmärksamhet och att hitta ett sätt att börja.',
    description: 'Tankar om brevväxling, uppmärksamhet och det märkliga, hoppfulla arbetet med att inleda ett samtal med någon man inte känner.',
    featuredNote: 'Utvald text', readNote: 'Läs texten', earlierNotes: 'Tidigare texter', readIn: 'Läs på',
    translationsLabel: 'Tillgängliga översättningar', writeToSomeone: 'Skriv till någon',
    writeHelp: 'Öppnar din e-postapp. Om den inte öppnas, skriv till write@onereader.co.', backToJournal: 'Tillbaka till Journal',
    homeLabel: 'One Reader, startsida', footerLabel: 'Sidfotsnavigering', about: 'Om', privacy: 'Integritet', terms: 'Villkor',
  },
  da: {
    title: 'Noter om pennevenner, opmærksomhed og om at finde en måde at begynde på.',
    description: 'Tanker om brevveksling mellem pennevenner, opmærksomhed og det mærkelige, håbefulde arbejde med at indlede en samtale med et menneske, man ikke kender.',
    featuredNote: 'Udvalgt tekst', readNote: 'Læs teksten', earlierNotes: 'Tidligere tekster', readIn: 'Læs på',
    translationsLabel: 'Tilgængelige oversættelser', writeToSomeone: 'Skriv til nogen',
    writeHelp: 'Åbner dit e-mailprogram. Hvis det ikke åbner, så skriv til write@onereader.co.', backToJournal: 'Tilbage til Journal',
    homeLabel: 'One Reader, forside', footerLabel: 'Navigation i sidefoden', about: 'Om', privacy: 'Privatliv', terms: 'Vilkår',
  },
  no: {
    title: 'Notater om brevvenner, oppmerksomhet og det å finne en måte å begynne på.',
    description: 'Tanker om brevveksling mellom brevvenner, oppmerksomhet og det merkelige, håpefulle arbeidet med å innlede en samtale med et menneske man ikke kjenner.',
    featuredNote: 'Utvalgt tekst', readNote: 'Les teksten', earlierNotes: 'Tidligere tekster', readIn: 'Les på',
    translationsLabel: 'Tilgjengelige oversettelser', writeToSomeone: 'Skriv til noen',
    writeHelp: 'Åpner e-postappen din. Hvis den ikke åpnes, skriv til write@onereader.co.', backToJournal: 'Tilbake til Journal',
    homeLabel: 'One Reader, forside', footerLabel: 'Navigasjon i bunnteksten', about: 'Om', privacy: 'Personvern', terms: 'Vilkår',
  },
  uk: {
    title: 'Нотатки про друзів за листуванням, увагу й пошук способу почати.',
    description: 'Роздуми про листування, увагу й дивну, сповнену надії працю — розпочати розмову з людиною, якої ми не знаємо.',
    featuredNote: 'Вибраний текст', readNote: 'Читати текст', earlierNotes: 'Попередні тексти', readIn: 'Читати мовою',
    translationsLabel: 'Доступні переклади', writeToSomeone: 'Написати комусь',
    writeHelp: 'Відкриває вашу поштову програму. Якщо вона не відкрилася, напишіть на write@onereader.co.', backToJournal: 'Повернутися до Journal',
    homeLabel: 'One Reader, головна', footerLabel: 'Навігація внизу сторінки', about: 'Про нас', privacy: 'Конфіденційність', terms: 'Умови',
  },
  ja: {
    title: '文通と注意深さ、そして始め方を見つけることについて。',
    description: '文通、注意深く向き合うこと、そして知らない人との会話を始めるという、不思議で希望に満ちた営みについて考えます。',
    featuredNote: '注目の記事', readNote: '記事を読む', earlierNotes: 'これまでの記事', readIn: '言語を選ぶ',
    translationsLabel: '利用できる翻訳', writeToSomeone: '誰かに手紙を書く',
    writeHelp: 'メールアプリが開きます。開かない場合は write@onereader.co に送信してください。', backToJournal: 'Journalに戻る',
    homeLabel: 'One Reader、ホーム', footerLabel: 'フッターナビゲーション', about: '概要', privacy: 'プライバシー', terms: '利用規約',
  },
  pl: {
    title: 'Notatki o korespondencji, uwadze i szukaniu sposobu, by zacząć.',
    description: 'Refleksje o korespondencji między nieznajomymi, uwadze i dziwnej, pełnej nadziei pracy rozpoczynania rozmowy z kimś, kogo nie znamy.',
    featuredNote: 'Polecany tekst', readNote: 'Przeczytaj tekst', earlierNotes: 'Wcześniejsze teksty', readIn: 'Czytaj po',
    translationsLabel: 'Dostępne tłumaczenia', writeToSomeone: 'Napisz do kogoś',
    writeHelp: 'Otwiera aplikację pocztową. Jeśli się nie otworzy, napisz na write@onereader.co.', backToJournal: 'Wróć do Journal',
    homeLabel: 'One Reader, strona główna', footerLabel: 'Nawigacja w stopce', about: 'O nas', privacy: 'Prywatność', terms: 'Warunki',
  },
  pt: {
    title: 'Notas sobre correspondência, atenção e como encontrar uma forma de começar.',
    description: 'Reflexões sobre correspondência entre amigos por carta, atenção e o estranho e esperançoso trabalho de iniciar uma conversa com alguém que não conhecemos.',
    featuredNote: 'Texto em destaque', readNote: 'Ler o texto', earlierNotes: 'Textos anteriores', readIn: 'Ler em',
    translationsLabel: 'Traduções disponíveis', writeToSomeone: 'Escreva a alguém',
    writeHelp: 'Abre a sua aplicação de e-mail. Se não abrir, escreva para write@onereader.co.', backToJournal: 'Voltar ao Journal',
    homeLabel: 'One Reader, início', footerLabel: 'Navegação do rodapé', about: 'Sobre', privacy: 'Privacidade', terms: 'Termos',
  },
  nl: {
    title: 'Notities over penvrienden, aandacht en een manier vinden om te beginnen.',
    description: 'Gedachten over briefwisseling, aandacht en het vreemde, hoopvolle werk van een gesprek beginnen met iemand die we niet kennen.',
    featuredNote: 'Uitgelicht artikel', readNote: 'Lees het artikel', earlierNotes: 'Eerdere artikelen', readIn: 'Lees in',
    translationsLabel: 'Beschikbare vertalingen', writeToSomeone: 'Schrijf iemand',
    writeHelp: 'Opent je e-mailapp. Als die niet opent, mail dan naar write@onereader.co.', backToJournal: 'Terug naar Journal',
    homeLabel: 'One Reader, startpagina', footerLabel: 'Navigatie in de voettekst', about: 'Over', privacy: 'Privacy', terms: 'Voorwaarden',
  },
};
