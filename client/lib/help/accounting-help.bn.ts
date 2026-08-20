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
      title: { of: "4da10f1f", bn: "প্রাথমিক প্রস্তুতি" },
      body: {
        of: "f1c894a7",
        bn: "এ ধাপটি সাধারণত একবারই সম্পন্ন করতে হয়। **Chart of accounts**-এ প্রতিষ্ঠানের সব হিসাবের তালিকা থাকে। একটি **Financial year** তৈরি করে সেটিকে ১২টি মাসে ভাগ করা হয়। সিস্টেম ব্যবহারের প্রথম দিনে প্রতিষ্ঠানের বিদ্যমান সম্পদ, দায় ও মালিকানা স্বত্ব **Opening balances**-এর মাধ্যমে হিসাবের মধ্যে আনা হয়।",
      },
    },
    record: {
      title: { of: "bfdd5106", bn: "লেনদেন নথিভুক্তকরণ" },
      body: {
        of: "de86791d",
        bn: "এটি প্রতিদিনের লেনদেন নথিভুক্ত করার ধাপ, যদিও বেশির ভাগ কাজ সংশ্লিষ্ট মডিউলেই সম্পন্ন হয়। **Payroll run** অনুমোদন, **Expense claim** পরিশোধ, সরবরাহকারীর বিল নথিভুক্তকরণ এবং কোনো কর্মীর চূড়ান্ত পাওনা নিষ্পত্তির তথ্য নিজ নিজ মডিউল থেকে আসে। যে লেনদেনগুলোর জন্য আলাদা মডিউল নেই, সেগুলো হাতে **Journal** হিসেবে নথিভুক্ত করতে হয়।",
      },
    },
    post: {
      title: { of: "a5554622", bn: "লেজারে পোস্টিং" },
      body: {
        of: "36b6d7f4",
        bn: "প্রতিটি অনুমোদিত লেনদেন **Ledger**-এ সমপরিমাণ ডেবিট ও ক্রেডিটসহ একটি ভারসাম্যপূর্ণ এন্ট্রি হিসেবে পোস্ট হয়। **Posting rules** নির্ধারণ করে কোন অঙ্ক কোন হিসাবে যাবে। তাই **Payroll run** অনুমোদনের সময় আলাদাভাবে হিসাব নম্বর নির্বাচন বা লিখতে হয় না।",
      },
    },
    read: {
      title: { of: "9b9a8d05", bn: "হিসাব পর্যালোচনা" },
      body: {
        of: "395d8052",
        bn: "একই **Ledger**-এর তথ্য প্রয়োজন অনুযায়ী বিভিন্নভাবে দেখা যায়। **General ledger**-এ একটি নির্দিষ্ট হিসাবের সব লেনদেন ধারাবাহিকভাবে দেখা যায়। **Cash book** ও **Bank book** নগদ ও ব্যাংকের টাকা আসা-যাওয়ার তথ্য দেখায়। **Trial balance** সব হিসাবের স্থিতি একসঙ্গে দেখায় এবং মোট ডেবিট ও মোট ক্রেডিট সমান আছে কি না নিশ্চিত করে।",
      },
    },
    report: {
      title: { of: "b6ce788d", bn: "আর্থিক প্রতিবেদন" },
      body: {
        of: "230387a5",
        bn: "এ ধাপে প্রতিষ্ঠানের প্রয়োজনীয় **Financial statements**, সেগুলোর বিস্তারিত **Notes**, স্থায়ী সম্পদের তফসিল এবং সম্পূর্ণ প্রতিবেদনের **PDF** তৈরি হয়। সব তথ্য সরাসরি **Ledger** থেকে হিসাব করা হয়—একই তথ্য দ্বিতীয়বার লিখতে হয় না।",
      },
    },
    close: {
      title: { of: "7d9eb7ac", bn: "হিসাবকাল বন্ধকরণ" },
      body: {
        of: "ea3370f6",
        bn: "কোনো মাসের হিসাব চূড়ান্ত হয়ে গেলে মাসটি বন্ধ করা হয়। ফলে ইতিমধ্যে প্রস্তুত বা পর্যালোচনা করা প্রতিবেদনের তথ্য পরে নতুন কিংবা আগের তারিখের এন্ট্রির কারণে বদলে যেতে পারে না। আর্থিক বছরের শেষে মুনাফা বা লোকসান **Retained earnings**-এ স্থানান্তর করে বছরটি লক করা হয়।",
      },
    },
  },
}
