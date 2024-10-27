let readline = require('readline');
let fs = require('fs');
const mtgsdk = require('mtgsdk');
const ncp = require('copy-paste');
const scryfall = require('scryfall-api');
readline.emitKeypressEvents(process.stdin);

if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

class CardData {
    id = '';
    product = '';
    setName = '';
    productName = '';
    title = '';
    number = 0;
    rarity = '';
    condition = '';
    marketPrice = 0;
    directLow = 0;
    lowPrice = 0;
    pending = 0;
    total = 0;
    addTo = 0;
    marketPrice2 = 0;
    myStoreReserve = 0;
    myStorePrice = 0;
    photoUrl = '';
    rs = 0;
    rc = 0;
    value = '';
    cardId = '';
    fixedName = '';
    setCode = '';

    constructor(id, product, setName, productName, title, number, rarity, condition, marketPrice, directLow, lowPrice, pending, total, addTo, marketPrice2,
                myStoreReserve, myStorePrice, photoUrl, rs, rc, value, cardId) {
        this.id = id ;
        this.product = product;
        this.setName = setName;
        this.productName = productName;
        this.title = title;
        this.number = number;
        this.rarity = rarity;
        this.condition = condition;
        this.marketPrice = marketPrice;
        this.directLow = directLow;
        this.lowPrice = lowPrice;
        this.pending = pending;
        this.total = total;
        this.addTo = addTo;
        this.marketPrice2 = marketPrice2;
        this.myStoreReserve = myStoreReserve;
        this.myStorePrice = myStorePrice;
        this.photoUrl = photoUrl;
        this.rs = rs;
        this.rc = rc;
        this.value = value;
        this.cardId = cardId;
    }

    setSetCode(code) {
        this.setCode = code;
    }

    setFixedName(name) {
        this.fixedName = name;
    }
}

let cards = [];
let baseValue = 0;
let fileName = '';
let setNameCodeMap = new Map();
let errors = [];
function readInFile(fileName) {
    const rl = readline.createInterface({
        input: fs.createReadStream('./' + fileName + '.csv'),
        crlfDelay: Infinity // Ensure proper line endings
    });

    let firstLine = true;
    rl.on('line', (line) => {
        // Process each line here
        if (!firstLine) {
            const sl = line.split(',');
            const fixedSl = [];
            let rightQuoteFound = true;
            while (sl.length > 0) {
                if (sl[0].includes('"')) {
                    rightQuoteFound = false;
                    let tempStrs = [];
                    tempStrs.push(sl[0])
                    sl.shift();
                    while (!rightQuoteFound) {
                        if (sl[0].includes('"')) {
                            rightQuoteFound = true;
                        }
                        tempStrs.push(sl[0]);
                        sl.shift();
                    }
                    let newStr = tempStrs.join(',');
                    if (sl.length === 1) {
                        let lastCommaIndex = newStr.lastIndexOf(',');
                        newStr = newStr.substring(0, lastCommaIndex) + newStr.substring(lastCommaIndex+1, newStr.length);
                    }
                    fixedSl.push(newStr);
                } else {
                    fixedSl.push(sl[0]);
                    sl.shift();
                }
            }
            cards.push(new CardData(...fixedSl));
        }
        firstLine = false;
    });

    rl.on('close', () => {
        removeQuotesFromNames();
    });
}

function removeQuotesFromNames() {
    for (let card of cards) {
        card.productName = card.productName.replaceAll('"', '');
    }
    getAllSetCodes(cards.length - 1);
}

function getAllSetCodes(current) {
    if (setNameCodeMap.has(cards[current].setName)) {
        getPreviousSetCodesOrAddSetCodes(current);
    } else {
        scryfall.Cards.byName(removeParenthesisFromCardName(cards[current].productName), true)
            .then(currentCardData => {
                mtgsdk.card.where({name: currentCardData.name, number: cards[current].number})
                    .then(data => {
                        setNameCodeMap.set(cards[current].setName, data[0]?.set);
                        getPreviousSetCodesOrAddSetCodes(current);
                    })
                    .catch(err => {
                        console.error(err);
                        getPreviousSetCodesOrAddSetCodes(current);
                    })
                ;
            })
            .catch(err => {
                console.log(err);
                errors.push(cards[current].productName);
                getPreviousSetCodesOrAddSetCodes(current);
            });
    }
}

function getPreviousSetCodesOrAddSetCodes(current) {
    if (current !== 0) {
        getAllSetCodes(current - 1);
    } else {
        addSetCodesToAllCards();
    }
}

function addSetCodesToAllCards() {
    for (let card of cards) {
        if (setNameCodeMap.has(card.setName)) {
            card.setCode = setNameCodeMap.get(card.setName);
        }
    }
    filterCardsByPrice(baseValue);
}

function removeParenthesisFromCardName(cardName) {
    if (cardName.indexOf('(') >= 0) {
        return cardName.substring(0, cardName.indexOf('(')).trim();
    }
    return cardName;
}

function filterCardsByPrice(price) {
    let tempCards = [];
    for (let card of cards) {
        if (parseFloat(card.marketPrice) >= price) {
            tempCards.push(card);
        }
    }
    formatCardsForDiscordBot(tempCards);
}

function formatCardsForDiscordBot(tempCards) {
    let messages = [];
    tempCards.forEach(card => {
        messages.push(["[[", [removeParenthesisFromCardName(card.productName), card.setCode, card.number].join("|"), "]]"].join("") + " $" + Math.ceil(card.marketPrice * .9));
    });
    ncp.copy(messages.join("\n"));
    console.log("Copied message to clipboard");
}

function parseCardName(value) {
    let cardName = replaceUTFInName(value);
    let maybeCardName = cardName.substring(3, cardName.length - 3);
    if (maybeCardName.charAt(0) === '"' && maybeCardName.charAt(maybeCardName.length - 1) === '"') {
        return maybeCardName.substring(1, maybeCardName.length - 1);
    }
    return maybeCardName;
}

function replaceUTFInName(name) {
    const regex = /(\\[A-Za-z0-9]{3}){2}/g;
    while (name.search(regex) >= 0) {
        let regFindIndex = name.search(regex);
        let newString = name.substring(regFindIndex, regFindIndex + 8);
        let correctedCharacter = utf8decode(ucs2encode([parseInt(newString.substring(2,4), 16), parseInt(newString.substring(6,8), 16)]));
        name = name.replace(newString, correctedCharacter);
    }
    return name;
}

function askForFileNameAndValue() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question(`What is the file name? `, name => {
        fileName = name;
        rl.question(`What value to you want to filter above? `, baseVal => {
            baseValue = parseFloat(baseVal);
            readInFile(fileName);
            rl.close();
        });
    });

}

askForFileNameAndValue();
//
// function testfunc() {
//     console.log(removeParenthesisFromCardName("Call Forth the Tempest (Borderless)"))
// }
//
// testfunc();

// All the code below here was borrowed from the utf8js library
function ucs2decode(string) {
    var output = [];
    var counter = 0;
    var length = string.length;
    var value;
    var extra;
    while (counter < length) {
        value = string.charCodeAt(counter++);
        if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
            // high surrogate, and there is a next character
            extra = string.charCodeAt(counter++);
            if ((extra & 0xFC00) == 0xDC00) { // low surrogate
                output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
            } else {
                // unmatched surrogate; only append this code unit, in case the next
                // code unit is the high surrogate of a surrogate pair
                output.push(value);
                counter--;
            }
        } else {
            output.push(value);
        }
    }
    return output;
}

var byteArray;
var byteCount;
var byteIndex;

function utf8decode(byteString) {
    byteArray = ucs2decode(byteString);
    byteCount = byteArray.length;
    byteIndex = 0;
    var codePoints = [];
    var tmp;
    while ((tmp = decodeSymbol()) !== false) {
        codePoints.push(tmp);
    }
    return ucs2encode(codePoints);
}

function ucs2encode(array) {
    var length = array.length;
    var index = -1;
    var value;
    var output = '';
    while (++index < length) {
        value = array[index];
        if (value > 0xFFFF) {
            value -= 0x10000;
            output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
            value = 0xDC00 | value & 0x3FF;
        }
        output += stringFromCharCode(value);
    }
    return output;
}

function readContinuationByte() {
    if (byteIndex >= byteCount) {
        throw Error('Invalid byte index');
    }

    var continuationByte = byteArray[byteIndex] & 0xFF;
    byteIndex++;

    if ((continuationByte & 0xC0) == 0x80) {
        return continuationByte & 0x3F;
    }

    // If we end up here, it’s not a continuation byte
    throw Error('Invalid continuation byte');
}

function decodeSymbol() {
    var byte1;
    var byte2;
    var byte3;
    var byte4;
    var codePoint;

    if (byteIndex > byteCount) {
        throw Error('Invalid byte index');
    }

    if (byteIndex == byteCount) {
        return false;
    }

    // Read first byte
    byte1 = byteArray[byteIndex] & 0xFF;
    byteIndex++;

    // 1-byte sequence (no continuation bytes)
    if ((byte1 & 0x80) == 0) {
        return byte1;
    }

    // 2-byte sequence
    if ((byte1 & 0xE0) == 0xC0) {
        byte2 = readContinuationByte();
        codePoint = ((byte1 & 0x1F) << 6) | byte2;
        if (codePoint >= 0x80) {
            return codePoint;
        } else {
            throw Error('Invalid continuation byte');
        }
    }

    // 3-byte sequence (may include unpaired surrogates)
    if ((byte1 & 0xF0) == 0xE0) {
        byte2 = readContinuationByte();
        byte3 = readContinuationByte();
        codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
        if (codePoint >= 0x0800) {
            checkScalarValue(codePoint);
            return codePoint;
        } else {
            throw Error('Invalid continuation byte');
        }
    }

    // 4-byte sequence
    if ((byte1 & 0xF8) == 0xF0) {
        byte2 = readContinuationByte();
        byte3 = readContinuationByte();
        byte4 = readContinuationByte();
        codePoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0C) |
            (byte3 << 0x06) | byte4;
        if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
            return codePoint;
        }
    }

    throw Error('Invalid UTF-8 detected');
}

var stringFromCharCode = String.fromCharCode;