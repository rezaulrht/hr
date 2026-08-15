import type { HelpOverlay } from "./types"

/**
 * The Bangla overlay. Partial by design — an untranslated page renders
 * entirely in English, because a half-translated paragraph is worse than an
 * untranslated one.
 *
 * Every string carries `of`, the fingerprint of the English it was written
 * against, so `npm run help:check` can catch one that has gone stale.
 *
 * Decision 3 throughout: anything the reader must find on screen — page
 * names, statuses, column headings, account names — stays English, written
 * between `**` markers so the renderer typesets it in the Latin face.
 */
export const HELP_BN: HelpOverlay = {
  flow: {
    setup: {
      title: { of: "4da10f1f", bn: "প্রস্তুতি" },
      body: {
        of: "f1c894a7",
        bn: "একবারই করতে হয়। **Chart of accounts**-এ টাকা রাখা যেতে পারে এমন প্রতিটি হিসাবের তালিকা থাকে। একটি **financial year** তৈরি হয়ে বারো মাসে ভাগ হয়। **Opening balances** প্রথম দিনেই কোম্পানির যা ছিল এবং যা দেনা ছিল তা এনে দেয়।",
      },
    },
    record: {
      title: { of: "bfdd5106", bn: "নথিভুক্তি" },
      body: {
        of: "de86791d",
        bn: "রোজকার কাজ, আর বেশির ভাগই এই বিভাগে করা হয় না। একটি **payroll run** অনুমোদিত হয়, একটি **expense claim** পরিশোধিত হয়, সরবরাহকারীর বিল লিখে রাখা হয়, কেউ চলে গেলে তার **settlement** করা হয়। এই মডিউলগুলো যা ঢেকে রাখে না, তা হাতে **journal** হিসেবে লেখা হয়।",
      },
    },
    post: {
      title: { of: "a5554622", bn: "পোস্টিং" },
      body: {
        of: "36b6d7f4",
        bn: "সেই প্রতিটি ঘটনা **ledger**-এ একটি সুষম এন্ট্রিতে পরিণত হয়। **Posting rules** ঠিক করে প্রতিটি অঙ্ক কোন হিসাবে বসবে, তাই **payroll run** অনুমোদনের সময় কাউকে হিসাব নম্বর লিখতে হয় না।",
      },
    },
    read: {
      title: { of: "9b9a8d05", bn: "পড়া" },
      body: {
        of: "395d8052",
        bn: "একই এন্ট্রি, ভিন্ন ভিন্নভাবে কাটা। **General ledger** সময়ের সাথে একটি হিসাব দেখায়। **Cash book** ও **Bank book**-এ টাকার গতি দেখা যায়। **Trial balance** সব হিসাব একসাথে দেখায় এবং প্রমাণ করে বইগুলো মিলে আছে।",
      },
    },
    report: {
      title: { of: "b6ce788d", bn: "রিপোর্ট" },
      body: {
        of: "230387a5",
        bn: "কোম্পানি যে **statements** দাখিল করে, সেগুলো ভাঙিয়ে দেখানো **notes**, স্থায়ী সম্পদের তালিকা, এবং পুরো সেটের একটি **PDF**। সবকিছু **ledger** থেকে হিসাব করা হয় — এখানে কিছুই দুইবার লেখা হয় না।",
      },
    },
    close: {
      title: { of: "7d9eb7ac", bn: "বন্ধ" },
      body: {
        of: "ea3370f6",
        bn: "একটি মাস বন্ধ করা হয়, যেন ইতিমধ্যে পড়া একটি **report**-এর পেছনে কিছু বদলাতে না পারে। বছরের শেষে মুনাফা বা লোকসান **retained earnings**-এ স্থানান্তরিত হয় এবং বছরটি লক হয়ে যায়।",
      },
    },
  },
}
