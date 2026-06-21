const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const initialKeywords = [
  // Banglish
  "bazar", "kacha", "cha", "nasta", "ruti", "dim", "chal", "dal", "tel", "lobun", "sobji", "mach", "mangsho", "murgi", 
  "basha", "vara", "gas", "current", "bill", "wifi", "internet", "mobile", "recharge", "flexiload", "dokane", 
  "baki", "dhar", "karjo", "hawlat", "parishodh", "beton", "salary", "bonus", "eid", "shopping", "jama", "kapor", 
  "transport", "bus", "rickshaw", "cng", "pathao", "uber", "bike", "khoroch", "jomano", "kisti", "bank", "atm", 
  "bkash", "nagad", "rocket", "upay", "send", "money", "cash", "out", "in", "bhaia", "apu", "kaka", "mama", "chacha",
  "dada", "nana", "khalu", "fufa", "vai", "bon", "dost", "bondhu", "office", "dokan", "malik", "kormochari", 
  "manager", "advance", "baksis", "chaanda", "donation", "jakat", "fitra", "sodga", "loan", "rin",
  "medicine", "osudh", "doctor", "hospital", "clinic", "test", "fee", "school", "college", "varsity", 
  "tution", "sir", "madam", "boi", "khata", "kolom", "pencil", "stationery", "print", "photocopy", "khabar",
  "lunch", "dinner", "breakfast", "pani", "water", "coffee", "biscuit", "cake", "misti", "doi", "fol", "fruit",
  "apple", "kola", "mango", "orange", "angur", "pepe", "alu", "peyaj", "roshun", "ada", "morich", "jhal", "mosla",
  "halud", "jira", "dhania", "elach", "daruchini", "lobo", "juta", "moja", "pant", "shirt", "tshirt", "lungi", 
  "sari", "kamiz", "orna", "dorji", "tailor", "selai", "dawa", "kawa", "mela", "ghura", "berano", "tour", "ticket", 
  "voucher", "upohar", "gift", "biye", "holud", "khatna", "milad", "doa", "mahfil", "khatam", "quran", "namaz", 
  "mosjid", "madrasa", "etimkhana", "dan", "khoyrat", "koyla", "khori", "khari", "mati", "bali", "cement", "rod", 
  "it", "khowa", "rong", "color", "paint", "mistri", "rajmistri", "jogali", "contractor", "khamar", "goru", 
  "chagol", "hash", "pukur", "khet", "krishi", "sar", "bij", "kitnashok", "tractor", "machine", "motor", "pump", 
  "meter", "line", "tar", "cable", "switch", "board", "light", "bulb", "fan", "ac", "tv", "fridge", "washing", "iron",
  "computer", "laptop", "charger", "headphone", "earphone", "cover", "glass", "repair", "service", "parts",
  "mobil", "oil", "petrol", "octane", "diesel", "lpg", "cylinder", "chula", "hari", "patil", "plate",
  "jog", "bati", "chamoch", "boti", "churi", "dao", "koral", "shabol", "kodal", "kachi", "hasua", "kaste",
  "sabun", "shampoo", "paste", "brush", "cream", "lotion", "powder", "perfume", "bodyspray", "atel",
  "narkel", "shorisha", "soyabean", "palm", "ghee", "dalda", "butter", "cheese", "panir", "borof", "ice",
  "chocolate", "chips", "chanachur", "muri", "chira", "gur", "chini", "lobon", "jeera",
  
  // Bengali Script
  "বাজার", "কাঁচা", "চা", "নাস্তা", "রুটি", "ডিম", "চাল", "ডাল", "তেল", "লবণ", "সবজি", "মাছ", "মাংস", "মুরগি", 
  "বাসা", "ভাড়া", "গ্যাস", "কারেন্ট", "বিল", "ওয়াইফাই", "ইন্টারনেট", "মোবাইল", "রিচার্জ", "ফ্লেক্সিলোড", "দোকানে", 
  "বাকি", "ধার", "কর্য", "হাওলাত", "পরিশোধ", "বেতন", "বোনাস", "ঈদ", "শপিং", "জামা", "কাপড়", "যাতায়াত", "বাস", 
  "রিকশা", "সিএনজি", "পাঠাও", "উবার", "বাইক", "খরচ", "জমানো", "কিস্তি", "ব্যাংক", "এটিএম", "বিকাশ", "নগদ", "রকেট", 
  "উপায়", "সেন্ড", "মানি", "ক্যাশ", "আউট", "ইন", "ভাইয়া", "আপু", "কাকা", "মামা", "চাচা", "দাদা", "নানা", "খালু", 
  "ফুফা", "ভাই", "বোন", "দোস্ত", "বন্ধু", "অফিস", "দোকান", "মালিক", "কর্মচারী", "ম্যানেজার", "অ্যাডভান্স", "বকশিস", 
  "চাঁদা", "দান", "যাকাত", "ফিতরা", "সদকা", "লোন", "ঋণ", "ওষুধ", "ডাক্তার", "হাসপাতাল", "ক্লিনিক", "টেস্ট", "ফি", 
  "স্কুল", "কলেজ", "ভার্সিটি", "টিউশন", "স্যার", "ম্যাডাম", "বই", "খাতা", "কলম", "পেন্সিল", "স্টেশনারি", "প্রিন্ট", 
  "ফটোকপি", "খাবার", "লাঞ্চ", "ডিনার", "ব্রেকফাস্ট", "পানি", "কফি", "বিস্কুট", "কেক", "মিষ্টি", "দই", "ফল", "আপেল", 
  "কলা", "আম", "কমলা", "আঙ্গুর", "পেঁপে", "আলু", "পেঁয়াজ", "রসুন", "আদা", "মরিচ", "ঝাল", "মসলা", "হলুদ", "জিরা", 
  "ধনিয়া", "এলাচ", "দারুচিনি", "জুতো", "মোজা", "প্যান্ট", "শার্ট", "টিশার্ট", "লুঙ্গি", "শাড়ি", "কামিজ", "ওড়না", 
  "দর্জি", "টেইলর", "সেলাই", "মেলা", "ঘোরা", "বেড়ানো", "ট্যুর", "টিকেট", "উপহার", "বিয়ে", "খতনা", "মিলাদ", "দোয়া", 
  "মাহফিল", "খতম", "কোরআন", "নামাজ", "মসজিদ", "মাদরাসা", "এতিমখানা", "খয়রাত", "কয়লা", "খড়ি", "মাটি", "বালি", "সিমেন্ট", 
  "রড", "ইট", "খোয়া", "রং", "কালার", "পেইন্ট", "মিস্ত্রি", "রাজমিস্ত্রি", "জোগালী", "কন্ট্রাক্টর", "খামার", "গরু", 
  "ছাগল", "হাঁস", "পুকুর", "ক্ষেত", "কৃষি", "সার", "বীজ", "কীটনাশক", "ট্রাক্টর", "মেশিন", "মোটর", "পাম্প", "মিটার", 
  "লাইন", "তার", "ক্যাবল", "সুইচ", "বোর্ড", "লাইট", "বাল্ব", "ফ্যান", "এসি", "টিভি", "ফ্রিজ", "ওয়াশিং", "আয়রন", 
  "কম্পিউটার", "ল্যাপটপ", "চার্জার", "হেডফোন", "ইয়ারফোন", "কভার", "গ্লাস", "রিপেয়ার", "সার্ভিস", "পার্টস", "মবিল", 
  "তেল", "পেট্রোল", "অকটেন", "ডিজেল", "এলপিজি", "সিলিন্ডার", "চুলা", "হাঁড়ি", "পাতিল", "প্লেট", "জগ", "বাটি", "চামচ", 
  "বঁটি", "ছুরি", "দাও", "কুড়াল", "শাবল", "কোদাল", "কাঁচি", "হাঁসুয়া", "কাস্তে", "সাবান", "শ্যাম্পু", "পেস্ট", "ব্রাশ", 
  "ক্রিম", "লোশন", "পাউডার", "পারফিউম", "বডি স্প্রে", "আতর", "নারিকেল", "সরিষা", "সয়াবিন", "পাম", "ঘি", "ডালডা", 
  "মাখন", "পনির", "বরফ", "আইস", "চকলেট", "চিপস", "চানাচুর", "মুড়ি", "চিঁড়া", "গুড়", "চিনি"
];

const uniqueKeywords = [...new Set(initialKeywords)];

async function seed() {
  console.log(`Seeding ${uniqueKeywords.length} common Bengali transaction keywords...`);
  
  const keywordsData = uniqueKeywords.map(word => ({
    word,
    count: 100
  }));

  const result = await prisma.noteKeyword.createMany({
    data: keywordsData,
    skipDuplicates: true,
  });
  
  console.log(`Seeding complete! Added ${result.count} new words to the global dictionary.`);
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
