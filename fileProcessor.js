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
    let sets = [];
    let promises = [];
    for (let cardInfo of cards) {
        if (!setNameCodeMap.has(cardInfo.setName)) {
            sets.push(cardInfo.setName);
            setNameCodeMap.set(cardInfo.setName, null);
            promises.push(scryfall.Cards.byName(removeParenthesisFromCardName(cardInfo.productName), true));
        } else {
            promises.push(Promise.resolve());
        }
    }

    Promise.allSettled(promises)
        .then(values => {
            let innerPromises = [];
            for (let i = 0; i < values.length; i++) {
                if (values[i].status !== "fulfilled") {
                    innerPromises.push(Promise.resolve());
                    errors.push(cards[i].productName);
                } else {
                    if (values[i].value) {
                        innerPromises.push(mtgsdk.card.where({name: values[i].value.name, number: cards[i].number}));
                    } else {
                        innerPromises.push(Promise.resolve());
                    }
                }
            }
            Promise.allSettled(innerPromises)
                .then(innerValues => {
                    let setErrors = [];
                    for (let i = 0; i < innerValues.length; i++) {
                        if (innerValues[i].status === "fulfilled" && innerValues[i].value !== undefined) {
                            if (innerValues[i].value.length === 0) {
                                setErrors.push(cards[i].setName);
                            } else {
                                setNameCodeMap.set(cards[i].setName, innerValues[i].value[0]?.set.toUpperCase());
                            }
                        }
                    }
                    if (setErrors.length > 0) {
                        scryfall.Sets.all()
                            .then(allSets => {
                                if (allSets.length > 0) {
                                    for (let setError of setErrors) {
                                        let potentialSet = allSets.find(fullSet => fullSet.name === setError);
                                        if (potentialSet) {
                                            setNameCodeMap.set(setError, potentialSet.code.toUpperCase());
                                        } else {
                                            errors.push("Set code not found for " + setError);
                                        }
                                    }
                                    addSetCodesToAllCards();
                                } else {
                                    for (let setError of setErrors) {
                                        errors.push("Set code not found for " + setError);
                                    }
                                    addSetCodesToAllCards();
                                }
                            })
                            .catch(err => {
                                console.error(err);
                                for (let setError of setErrors) {
                                    errors.push("Set code not found for " + setError);
                                }
                                addSetCodesToAllCards();
                            })
                    } else {
                        addSetCodesToAllCards();
                    }
                })
        })
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
        if (parseFloat(card.marketPrice) >= price && card.setCode != null) {
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
    if (errors.length) {
        console.error(errors.join("\n"));
    }
    console.log("Copied message to clipboard");
}

function askForFileNameAndValue() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question(`What is the file name? `, name => {
        fileName = name;
        rl.question(`What value to you want to filter above? `, baseVal => {
            if (baseVal === "") {
                baseValue = 5.00;
            } else {
                baseValue = parseFloat(baseVal);
            }
            readInFile(fileName);
            rl.close();
        });
    });

}

askForFileNameAndValue();