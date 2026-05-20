"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
const translitMap = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
};
function slugify(input, maxLength = 80) {
    const transliterated = input
        .trim()
        .toLowerCase()
        .replace(/[а-яё]/g, (letter) => translitMap[letter] ?? letter)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return transliterated.slice(0, maxLength).replace(/-+$/g, "") || "material";
}
