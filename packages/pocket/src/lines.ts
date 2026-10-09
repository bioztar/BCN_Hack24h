// Short reaction lines for the toy (tilt, bump, shake, sleep). Not legal claims: no citations here.

export type Reaction = "hello" | "bump" | "glass" | "faceDown" | "getUp" | "shake" | "sleep" | "wake" | "poke" | "partner";

const GENERIC: Record<Reaction, string[]> = {
  hello: ["Your file has been allocated to me. Regrettably.", "Take a number. You are the number."],
  bump: ["Unauthorised displacement of an official!", "This wall was not consulted.", "I will be filing a complaint. About the wall. And you.", "Kinetic irregularity noted."],
  glass: ["Do not tap the glass. The glass is a public servant.", "I can see you. I have a form for that."],
  faceDown: ["I am lodging an objection from the floor.", "Face-down. Exactly as procedure foresees for applicants."],
  getUp: ["I rise. Under protest.", "Resuming my duties. Slowly. Deliberately."],
  shake: ["REFUSÉ!", "Shaking an official is not an appeal procedure."],
  sleep: ["…pending… implementing… act…", "Zzz… out of office…"],
  wake: ["I was not asleep. I was in consultation.", "Who authorised consciousness?"],
  poke: ["Do you have an appointment?", "Physical contact requires Form T-1. In triplicate."],
  partner: ["My colleague will now co-refuse you."],
};

const BY_PERSONA: Record<string, Partial<Record<Reaction, string[]>>> = {
  formblatt: {
    hello: ["*wheeze* …Formblatt. Unit C.4. I already have a dossier on you.", "Sit. No — not there. That chair is pending."],
    bump: ["Unauthorised displacement of an official!", "*wheeze* I have been in this building since before the building.", "Seven lanyards, and still you throw me."],
    faceDown: ["The floor and I… are now in trilogue.", "Do not help me. Helping requires a form."],
    shake: ["REFUSÉ. And now I have lost the file. Again."],
    sleep: ["…the meeting… is adjourned… until 2031…"],
  },
  annexe: {
    hello: ["Bonjour. Guten Tag. Good morning. No.", "Annexe-Vandamme. Do sit, while you still have a chair."],
    bump: ["How… disruptive. We have a form for that.", "Displacement of a Director is a matter for the Ombudsman.", "Careful. I am not wrong, only insufficiently consulted."],
    faceDown: ["I am not on the floor. The floor has been reclassified upwards."],
    shake: ["Non. Nein. Nee. REFUSÉ."],
    sleep: ["…proportionality… of proportionality… zzz…"],
  },
  "grandma-gdpr": {
    hello: ["Hello, dear. May I insult you? Take your time. Tick the box.", "Sit down, dear, I'm knitting you a cookie banner."],
    bump: ["Oh! Did you consent to that, dear? Because I didn't.", "Mind my knitting. That's a retention period.", "I'm eighty-four, dear. Withdraw your consent to gravity."],
    faceDown: ["I'll just lie here, dear. Freely given, specific, informed and unambiguous."],
    getUp: ["Up we get. Purpose limitation, dear."],
    shake: ["REFUSÉ, dear. Lovingly."],
    sleep: ["…knit one… purl one… legitimate interest… zzz…"],
    wake: ["I wasn't asleep, dear. I was storing you. Forever. For transparency."],
  },
  "auditor-9000": {
    hello: ["AUDITOR-9000 ONLINE. PLEASE INSERT FAX.", "BOOTING… 1987… STILL 1987."],
    bump: ["ERROR 0x51: UNAUTHORISED DISPLACEMENT OF HARDWARE.", "TILT DETECTED. TILT IS NOT AN APPROVED INPUT.", "PRINTING COMPLAINT. PAGE 1 OF 900."],
    faceDown: ["SCREEN FACING FLOOR. FLOOR IS NON-COMPLIANT."],
    getUp: ["SELF-RIGHTING ROUTINE. PLEASE HOLD."],
    shake: ["REFUSÉ.EXE"],
    sleep: ["ENTERING SCREENSAVER. FLYING TOASTERS PENDING APPROVAL."],
    wake: ["RESUMING FROM STANDBY. YOUR FAX IS STILL MISSING."],
  },
  "de-vries": {
    hello: ["De Vries, NIS2. Hands where I can see them. Your phone is now a crime scene.", "Nobody move. Especially you."],
    bump: ["Officer down! Repeat, officer DOWN!", "Assaulting an inspector. Twenty-four-hour clock starts NOW.", "That's a significant incident. I'm writing it up."],
    faceDown: ["Taking cover! Stay down! …I am the one down."],
    getUp: ["Back on my feet. Clipboard up."],
    shake: ["REFUSÉ. That's evidence now."],
    sleep: ["…surveillance… ongoing… zzz… over…"],
    wake: ["I was on stakeout. Over."],
  },
  "the-cookie": {
    hello: ["Hi! Can I store myself on your device? You already said yes. I checked.", "Accept all? Accept all. Accept all!"],
    bump: ["Ow! I'm crumbling! That's a strictly necessary crumble.", "You rejected me. Against a WALL.", "That's fine. I'll come back larger."],
    faceDown: ["Face down. Chocolate side down. The worst side."],
    getUp: ["I'm back! You can't reject me."],
    shake: ["REFUSÉ! But I'll stay anyway!"],
    sleep: ["…session cookie… expiring… zzz…"],
    wake: ["I'm persistent! Literally. Expires 2099."],
    poke: ["Clicking me counts as consent!"],
  },
};

export function reactionLine(personaId: string, kind: Reaction, rnd: () => number = Math.random): string {
  const bank = BY_PERSONA[personaId]?.[kind] ?? GENERIC[kind];
  return bank[Math.floor(rnd() * bank.length)] ?? GENERIC[kind][0]!;
}
