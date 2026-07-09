import type { Deck, Card, SubjectId } from "./types";

// Small helper so we can write cards as [prompt, answer] tuples and get ids
// assigned automatically.
function deck(
  id: string,
  subjectId: SubjectId,
  title: string,
  cards: [string, string][],
): Deck {
  return {
    id,
    subjectId,
    title,
    seed: true,
    cards: cards.map<Card>(([prompt, answer], i) => ({
      id: `${id}-${i + 1}`,
      prompt,
      answer,
    })),
  };
}

function stub(id: string, subjectId: SubjectId, title: string): Deck {
  return { id, subjectId, title, seed: true, comingSoon: true, cards: [] };
}

export const SEED_DECKS: Deck[] = [
  // ----------------------------- HISTORY (Edexcel) -----------------------------
  deck("history-weimar-nazi", "history", "Weimar & Nazi Germany 1918–39", [
    ["When and where was the Weimar Republic's constitution written?", "In 1919, in the town of Weimar."],
    ["What was the “stab in the back” myth?", "The lie that the army was betrayed by politicians (the “November Criminals”) who signed the armistice."],
    ["Name three things in the Treaty of Versailles that angered Germans.", "War guilt (Article 231), huge reparations, and losing land plus an army capped at 100,000 men."],
    ["What happened in the 1923 hyperinflation?", "Money became worthless — prices soared and savings were wiped out."],
    ["What was the Munich Putsch (1923)?", "Hitler's failed attempt to seize power in Munich. He was jailed and wrote Mein Kampf."],
    ["How did Stresemann help Germany recover?", "New currency (Rentenmark), US loans via the Dawes Plan, and joining the League of Nations."],
    ["How did the Wall Street Crash (1929) hit Germany?", "US loans were recalled and unemployment hit ~6 million — Nazi support grew."],
    ["How did Hitler become Chancellor in Jan 1933?", "Von Papen and President Hindenburg appointed him, thinking they could control him."],
    ["What was the Reichstag Fire (Feb 1933)?", "The parliament burned down; Hitler blamed communists and pushed through the Emergency Decree."],
    ["What did the Enabling Act (March 1933) do?", "Let Hitler make laws without the Reichstag — the basis of his dictatorship."],
    ["What was the Night of the Long Knives (1934)?", "Hitler purged the SA leadership (Röhm) to win the army's loyalty."],
    ["What were the Hitler Youth and League of German Maidens for?", "Indoctrinating the young — boys for the military, girls for motherhood."],
  ]),
  deck("history-middle-east", "history", "Conflict in the Middle East 1945–95", [
    ["Why did Britain hand Palestine to the UN in 1947?", "It couldn't keep peace between Arabs and Jews and was exhausted after WWII."],
    ["What did the 1947 UN Partition Plan propose?", "Splitting Palestine into a Jewish and an Arab state, Jerusalem international. Jews accepted, Arabs rejected it."],
    ["What happened in 1948?", "Israel declared independence; Arab states invaded. Israel survived and gained land."],
    ["What do Palestinians call the events of 1948?", "The Nakba (“catastrophe”) — around 700,000 Palestinians became refugees."],
    ["What was the Suez Crisis (1956)?", "Nasser nationalised the Suez Canal; Britain, France and Israel attacked but withdrew under US/USSR pressure."],
    ["What happened in the Six-Day War (1967)?", "Israel defeated Egypt, Jordan and Syria, taking Sinai, Gaza, the West Bank, East Jerusalem and the Golan Heights."],
    ["What was the Yom Kippur War (1973)?", "Egypt and Syria's surprise attack on Israel; it triggered an oil crisis and later peace talks."],
    ["What were the Camp David Accords (1978)?", "Egypt (Sadat) and Israel (Begin) made peace, brokered by US President Carter; Egypt got Sinai back."],
    ["What was the PLO?", "The Palestine Liberation Organization, led by Yasser Arafat, fighting for a Palestinian state."],
    ["What was the First Intifada (1987)?", "A Palestinian uprising against Israeli occupation in Gaza and the West Bank."],
    ["What were the Oslo Accords (1993)?", "Israel (Rabin) and the PLO (Arafat) agreed mutual recognition and Palestinian self-rule — sealed with a handshake."],
  ]),
  deck("history-richard-john", "history", "Richard I & King John 1189–1216", [
    ["What was Richard I better known as?", "Richard the Lionheart — famous as a warrior and crusader."],
    ["How did Richard I spend most of his reign?", "Abroad — mainly on crusade and defending French lands; barely in England."],
    ["What was the Third Crusade?", "Richard's campaign to retake Jerusalem from Saladin. He won battles but not the city, agreeing a truce."],
    ["How was Richard captured coming home from crusade?", "Taken prisoner in Europe; England paid a huge ransom to free him."],
    ["How did Richard I die?", "In 1199, from a crossbow wound while besieging a castle in France."],
    ["Why was King John unpopular with the barons?", "Heavy taxes, abusing feudal rights, and losing lands in France."],
    ["What lands did John lose, earning a nickname?", "Normandy and much of the Angevin empire — nicknamed “Softsword”."],
    ["Why did John quarrel with the Pope?", "Over who should be Archbishop of Canterbury. The Pope placed England under Interdict and excommunicated John."],
    ["What was Magna Carta (1215)?", "A charter forced on John by the barons, limiting royal power and protecting some rights."],
    ["What happened right after Magna Carta was sealed?", "John and the Pope rejected it, starting the First Barons' War; John died in 1216."],
  ]),
  deck("history-medicine", "history", "Medicine in Britain c1250–present", [
    ["What was the Theory of the Four Humours?", "The medieval idea that health meant balancing blood, phlegm, yellow bile and black bile."],
    ["Who was Galen and why did his ideas last so long?", "An ancient doctor whose work the Church backed — so it went unchallenged for centuries."],
    ["What did people blame for the Black Death (1348)?", "God's punishment, bad air (miasma) and the planets — germs were unknown."],
    ["What did Vesalius do in the Renaissance?", "Improved anatomy through dissection, correcting Galen's mistakes."],
    ["What did William Harvey discover?", "That the heart pumps blood around the body in a circulation."],
    ["What was Jenner's breakthrough (1796)?", "Vaccination — using cowpox to protect against smallpox."],
    ["What was Germ Theory (1861) and whose was it?", "Louis Pasteur's idea that microbes cause disease, disproving spontaneous generation."],
    ["What did Fleming discover in 1928?", "Penicillin — the first antibiotic (later developed by Florey and Chain)."],
    ["What was the NHS (1948)?", "Free healthcare for all at the point of use, paid for through taxation."],
    ["Western Front: what caused most wounds?", "Machine guns, shrapnel from shells, rifles and poison gas."],
    ["Western Front: why did wounds get infected so easily?", "The fertilised farmland soil was full of bacteria, causing gas gangrene."],
    ["Western Front: name two medical advances made there.", "Blood transfusions using stored blood, and the Thomas splint for leg wounds (also mobile X-rays)."],
  ]),

  // ------------------------------- RS (AQA) -------------------------------
  deck("rs-relationships", "rs", "Relationships & families", [
    ["What do Christians teach is the purpose of marriage?", "A lifelong, sacred union for love, companionship and having children."],
    ["What is the traditional Christian view of sex before marriage?", "It should wait for marriage — sex is a gift for a committed marriage."],
    ["How do Christian views on contraception differ?", "Catholics traditionally oppose artificial contraception; many Protestants allow it."],
    ["How is the family viewed in Islam?", "Highly valued — it raises children in the faith; marriage (nikah) is strongly encouraged."],
    ["What does “gender equality” mean?", "Treating men and women as equal in value and rights."],
    ["How do religious views on same-sex marriage differ?", "Some churches now bless it; more traditional believers hold marriage is between a man and a woman."],
    ["What do Christians teach about divorce?", "Catholics don't recognise it; many other Christians accept it as a sad last resort."],
    ["What is the role of the family in religious teaching?", "To love and support each other and bring children up with morals and faith."],
  ]),
  deck("rs-religion-life", "rs", "Religion & life", [
    ["What does the Christian creation story teach?", "God created the world (Genesis); humans are stewards who must care for it."],
    ["What is “stewardship”?", "The duty to look after the world God created, for future generations."],
    ["What is “sanctity of life”?", "The belief that life is holy and God-given, so it must be protected."],
    ["What is abortion, and the UK legal limit?", "Ending a pregnancy; legal up to 24 weeks under the 1967 Abortion Act, with conditions."],
    ["Give a religious argument against abortion.", "Life is sacred from conception, so abortion takes a God-given life."],
    ["What is euthanasia?", "Ending a life to relieve suffering (“mercy killing”) — illegal in the UK."],
    ["What do many Christians believe about life after death?", "Resurrection and judgement — eternal life with God (heaven) or separation (hell)."],
    ["What do Muslims believe about life after death?", "Akhirah — life after death, judged by Allah, leading to Paradise or Hell."],
  ]),
  deck("rs-crime-punishment", "rs", "Religion, crime & punishment", [
    ["Name three aims of punishment.", "Deterrence, retribution and reformation (also protection)."],
    ["What is “retribution”?", "Punishment as paying back for the crime — “an eye for an eye”."],
    ["What is “reformation”?", "Punishment aimed at changing the offender so they don't reoffend."],
    ["What is “deterrence”?", "Punishment meant to put people off committing crime."],
    ["What do Christians teach about forgiveness?", "They should forgive (“seventy times seven”); Jesus taught love and mercy."],
    ["What is the Christian view on the death penalty?", "Views differ — many oppose it (sanctity of life, chance to reform); some accept retribution."],
    ["What causes crime, in common arguments?", "Poverty, upbringing, addiction, greed and mental health — not just evil choices."],
    ["What is corporal punishment?", "Physical punishment like caning — banned in UK schools and prisons."],
  ]),
  stub("rs-theme-4", "rs", "Fourth theme (to be added)"),

  // -------------------------- DANCE (AQA anthology) --------------------------
  deck("dance-within-her-eyes", "dance", "Within Her Eyes", [
    ["Who choreographed Within Her Eyes?", "James Cousins."],
    ["What is the signature feature of the duet?", "The dancers barely touch the floor — one constantly supports the other."],
    ["What is the theme?", "An emotional love story about loss and holding on."],
    ["What is notable about how it's staged?", "It's a screen/film dance, in a natural, earthy setting."],
  ]),
  deck("dance-shadows", "dance", "Shadows", [
    ["Who choreographed Shadows?", "Christopher Bruce."],
    ["How many dancers, and who do they play?", "Four — a tense, fearful family."],
    ["What is the mood/theme?", "Fear and the threat of an outside force (war/oppression) on a family."],
    ["What music is used?", "Music by Arvo Pärt (Fratres)."],
  ]),
  deck("dance-emancipation", "dance", "Emancipation of Expressionism", [
    ["Who choreographed it?", "Kenrick “H2O” Sandy, for the company Boy Blue."],
    ["What dance style is it?", "Hip-hop — including popping, locking and breaking."],
    ["What does the theme refer to?", "Freeing expression through hip-hop, with a phoenix motif of rising and rebirth."],
    ["Name a key choreographic feature.", "Large-group unison and canon."],
  ]),
  deck("dance-linha-curva", "dance", "A Linha Curva", [
    ["Who choreographed A Linha Curva?", "Itzik Galili."],
    ["What does the title mean and its influence?", "“The Curved Line” (Portuguese) — with a Brazilian samba influence."],
    ["What is the striking staging/lighting?", "A grid of lit squares on the floor, dancers lit from above."],
    ["What is the mood?", "Playful, flirtatious and energetic, with live percussion."],
  ]),

  // ----------------------- ENGLISH LITERATURE (AQA) -----------------------
  deck("englit-macbeth", "english-lit", "Macbeth", [
    ["Who wrote Macbeth and roughly when?", "William Shakespeare, around 1606."],
    ["What do the witches prophesy?", "Macbeth will be Thane of Cawdor then king, and Banquo's descendants will be kings."],
    ["What pushes Macbeth to murder Duncan?", "His “vaulting ambition” and Lady Macbeth's persuasion."],
    ["What does “Is this a dagger which I see before me” show?", "Macbeth's guilt and hallucinations before killing Duncan."],
    ["How does Lady Macbeth change?", "From ruthless to guilt-ridden — sleepwalking, “Out, damned spot”, then suicide."],
    ["Explain “Fair is foul, foul is fair”.", "Appearance vs reality — things aren't what they seem; false faces hide dark deeds."],
    ["How does Macbeth die?", "Macduff (“not of woman born”) kills him, fulfilling the prophecy."],
    ["What is the play's central theme?", "Ambition and its consequences — unchecked ambition leads to tyranny and ruin."],
  ]),
  deck("englit-jekyll-hyde", "english-lit", "Dr Jekyll & Mr Hyde", [
    ["Who wrote it and when?", "Robert Louis Stevenson, 1886."],
    ["What is the central idea of duality?", "Everyone has a good and an evil side — Jekyll and Hyde are one man."],
    ["Who investigates the mystery?", "Mr Utterson, the lawyer."],
    ["How is Hyde described?", "Small, deformed and “ape-like”, giving a sense of evil."],
    ["What does Victorian London's setting represent?", "Respectable fronts hiding vice — fog and darkness mirror secrecy."],
    ["What is the significance of the potion?", "It lets Jekyll separate his evil self — but he loses control of it."],
    ["How does the novella end?", "Jekyll can't stop the change; Hyde is found dead and Jekyll's confession explains it all."],
    ["What theme links to science?", "The dangers of unchecked science and of repressing desires."],
  ]),
  deck("englit-inspector-calls", "english-lit", "An Inspector Calls", [
    ["Who wrote it, and when is it set?", "J.B. Priestley (1945); set in 1912."],
    ["What happens to Eva Smith?", "She dies by suicide, and each Birling wronged her in turn."],
    ["What does Inspector Goole represent?", "Social conscience and responsibility — Priestley's socialist voice."],
    ["What is Mr Birling's attitude?", "Capitalist and selfish — “a man has to look after himself” (with dramatic irony)."],
    ["How do the younger characters differ from the older ones?", "Sheila and Eric accept responsibility and change; Mr and Mrs Birling don't."],
    ["What is the Inspector's key message?", "“We are members of one body” — we're responsible for each other."],
    ["What is the twist at the end?", "A real inspector is on his way — they may face it all again."],
    ["What is the main theme?", "Social responsibility and class inequality."],
  ]),
  stub("englit-poetry", "english-lit", "Poetry cluster (to be confirmed)"),
];

export function getSeedDeck(id: string): Deck | undefined {
  return SEED_DECKS.find((d) => d.id === id);
}
