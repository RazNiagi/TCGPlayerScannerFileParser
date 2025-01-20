let readline = require('readline');
let fs = require('fs');
const mtgsdk = require('mtgsdk');
const ncp = require('copy-paste');
const scryfall = require('scryfall-api');
const os = require('os');

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
    askingPrice = 0;

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

class TcgCardData {
    quantity = 0;
    name = '';
    simpleName = '';
    set = '';
    cardNumber = '';
    setCode = '';
    externalId = '';
    printing = '';
    condition = '';
    language = '';
    rarity = '';
    productId = '';
    sku = '';
    price = '';
    priceEach = '';
    setCodeForScryfall = '';
    askingPrice = '';

    constructor(quantity, name, simpleName, set, cardNumber, setCode, externalId, printing, condition, language, rarity, productId, sku, price, priceEach) {
        this.quantity = quantity;
        this.name = name;
        this.simpleName = simpleName;
        this.set = set;
        this.cardNumber = cardNumber;
        this.setCode = setCode;
        this.externalId = externalId;
        this.printing = printing;
        this.condition = condition;
        this.language = language;
        this.rarity = rarity;
        this.productId = productId;
        this.sku = sku;
        this.price = price;
        this.priceEach = priceEach;
    }
}

let cards = [];
let baseValue = 0;
let fileName = '';
let setNameCodeMap = new Map();
let errors = [];
let documentsFileExtension = "\\Documents\\TCGRocaFileParser\\"
let setNameCodeMapFile = "setNameCodeMap.json";
let scryfallSetsDataFile = "scryfallSetsData.json";
let scryfallSetsData = [];
let isRocaFile = true;

function readInFile(fileName) {
    const rl = readline.createInterface({
        input: fs.createReadStream('./' + fileName + '.csv'),
        crlfDelay: Infinity // Ensure proper line endings
    });

    let firstLine = true;
    rl.on('line', (line) => {
        if (firstLine && line.split(',').length === 15) {
            isRocaFile = false;
        }

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
                        if (sl[0].includes('"') && numQuotesInString(sl[0]) % 2 !== 0) {
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
            cards.push(isRocaFile ? new CardData(...fixedSl) : new TcgCardData(...fixedSl));
        }
        firstLine = false;
    });

    rl.on('close', () => {
        if (isRocaFile) {
            removeQuotesFromNames();
        } else {
            removeQuotesFromNamesTcgFile();
        }
    });
}

function numQuotesInString(str) {
    let charMap = new Map();
    for (let char of str) {
        charMap.set(char, (charMap.get(char) || 0) + 1);
    }
    return charMap.get('"');
}

function removeQuotesFromNames() {
    for (let card of cards) {
        card.productName = card.productName.replaceAll('"', '');
    }
    filterCardsOverPrice(baseValue);
    populateExistingSetNames();
    addSetCodesToAllCards(false);
    getAllSetCodes();
}

function removeQuotesFromNamesTcgFile() {
    for (let card of cards) {
        card.simpleName = card.simpleName.replaceAll('"', '');
    }
    removeDollarSignsFromCardPrices();
    filterCardsOverPrice(baseValue);
    populateExistingSetNames();
    addSetCodesToAllCards(false);
    getAllSetCodes();
}

function removeDollarSignsFromCardPrices() {
    for (let card of cards) {
        card.price = card.price.replaceAll('$', '');
        card.priceEach = card.priceEach.replaceAll('$', '');
    }
}

function populateExistingSetNames() {
    if (isRocaFile) {
        for (let card of cards) {
            if (setNameCodeMap.has(card.setName)) {
                card.setCode = setNameCodeMap.get(card.setName);
            }
        }
    } else {
        for (let card of cards) {
            if (setNameCodeMap.has(card.set)) {
                card.setCodeForScryfall = setNameCodeMap.get(card.set);
            }
        }
    }
}

function getAllSetCodes() {
    let sets = [];
    let promises = [];
    if (isRocaFile) {
        for (let cardInfo of cards) {
            if (!setNameCodeMap.has(cardInfo.setName) || setNameCodeMap.get(cardInfo.setName) === null) {
                sets.push(cardInfo.setName);
                setNameCodeMap.set(cardInfo.setName, null);
                promises.push(scryfall.Cards.byName(removeParenthesisFromCardName(cardInfo.productName), true));
            } else {
                promises.push(Promise.resolve());
            }
        }
        if (sets.length === 0) {
            console.log("No calls needed, set codes already established");
            replaceSetCodesForEdgeCases();
            addAskingPriceToEachCard();
            sortCardsByAskingPrice();
            filterCardsWithSetCodes();
        } else {
            console.log("Making initial calls to Scryfall to ensure card name");
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
                    console.log("Making secondary calls to mtgsdk for specific card versions");
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
                                for (let setError of setErrors) {
                                    errors.push("Set code not found for " + setError);
                                }
                            }
                            addSetCodesToAllCards();
                        })
                })
        }
    } else {
        for (let cardInfo of cards) {
            if (!setNameCodeMap.has(cardInfo.set) || setNameCodeMap.get(cardInfo.set) === null) {
                sets.push(cardInfo.set);
                setNameCodeMap.set(cardInfo.set, null);
                promises.push(scryfall.Cards.byTcgPlayerId(cardInfo.productId));
            } else {
                promises.push(Promise.resolve());
            }
        }
        if (sets.length === 0) {
            console.log("No calls needed, set codes already established");
            addAskingPriceToEachCard();
            sortCardsByAskingPrice();
            filterCardsWithSetCodes();
        }
        console.log("Making calls to Scryfall to get specific cards by tcgplayer Id");
        Promise.allSettled(promises)
            .then(values => {
                for (let i = 0; i < values.length; i++) {
                    if (values[i].status !== "fulfilled") {
                        errors.push(cards[i].productName);
                    } else {
                        if (values[i].value) {
                            cards[i].setCodeForScryfall = values[i]?.value[0]?.set.toUpperCase();
                            setNameCodeMap.set(cards[i].set, values[i].value?.set.toUpperCase());
                        }
                    }
                }
                addSetCodesToAllCards();
            })
    }
}

function addSetCodesToAllCards(filterDown = true) {
    if (isRocaFile) {
        for (let card of cards) {
            if (setNameCodeMap.has(card.setName) && setNameCodeMap.get(card.setName) !== null) {
                card.setCode = setNameCodeMap.get(card.setName);
            } else {
                let altName = alternatePotentialSetName(card.setName);
                if (altName !== card.setName && setNameCodeMap.has(altName)) {
                    card.setCode = setNameCodeMap.get(altName);
                    setNameCodeMap.set(card.setName, setNameCodeMap.get(altName));
                }
            }
        }
    } else {
        for (let card of cards) {
            if (setNameCodeMap.has(card.set) && setNameCodeMap.get(card.set) !== null) {
                card.setCodeForScryfall = setNameCodeMap.get(card.set);
            } else {
                let altName = alternatePotentialSetName(card.set);
                if (altName !== card.set && setNameCodeMap.has(altName)) {
                    card.setCodeForScryfall = setNameCodeMap.get(altName);
                    setNameCodeMap.set(card.set, setNameCodeMap.get(altName));
                }
            }
        }
    }

    if (filterDown) {
        if (isRocaFile) {
            replaceSetCodesForEdgeCases();
        }
        addAskingPriceToEachCard();
        sortCardsByAskingPrice();
        filterCardsWithSetCodes();
    }
}

function alternatePotentialSetName(name) {
    let newName = "";
    if (name.startsWith("Universes Beyond: ")) {
        newName = name.replace("Universes Beyond: ", "");
    }
    if (name.startsWith("Commander: ")) {
        newName = name.replace("Commander: ", "") + " Commander";
    }
    return newName;
}

function removeParenthesisFromCardName(cardName) {
    if (cardName.indexOf('(') >= 0) {
        return cardName.substring(0, cardName.indexOf('(')).trim();
    }
    return cardName;
}

function replaceSetCodesForEdgeCases() {
    for (let card of cards) {
        if (card.setCode === "MH1" && card.productName.includes("(Retro Frame)")) {
            card.setCode = "H1R";
        }
        if (card.setCode === "MH2" && card.productName.includes("(Retro Frame)")) {
            card.setCode = "H2R";
        }
        if (card.setCode === "BRO" && card.productName.includes("(")) {
            card.setCode = "BRR";
        }
    }
}

function addAskingPriceToEachCard() {
    for (let card of cards) {
        card.askingPrice = isRocaFile ? Math.ceil(card.marketPrice * .9) : Math.ceil(card.priceEach * .9);
    }
}

function sortCardsByAskingPrice() {
    cards.sort((a, b) => {
        if (a.askingPrice !== b.askingPrice) {
            return a.askingPrice - b.askingPrice;
        } else {
            return isRocaFile ? a.productName.localeCompare(b.productName) : a.simpleName.localeCompare(b.simpleName);
        }
    });
}

function filterCardsOverPrice(price) {
    if (isRocaFile) {
        cards = cards.filter(card => parseFloat(card.marketPrice) >= price);
    } else {
        cards = cards.filter(card => parseFloat(card.priceEach) >= price);
    }
}

function filterCardsWithSetCodes() {
    let tempCards = [];
    for (let card of cards) {
        if (isRocaFile) {
            if (card.setCode != null) {
                tempCards.push(card);
            }
        } else {
            if (card.setCodeForScryfall != null) {
                tempCards.push(card);
            }
        }
    }
    formatCardsForDiscordBot(tempCards);
    saveSetNameCodeMapToFile();
}

function formatCardsForDiscordBot(tempCards) {
    let messages = [];
    if (isRocaFile) {
        tempCards.forEach(card => {
            messages.push(["[[", [removeParenthesisFromCardName(card.productName), card.setCode, card.number].join("|"), "]]"].join("") + " $" + card.askingPrice);
        });
    } else {
        tempCards.forEach(card => {
            messages.push(["[[", [removeParenthesisFromCardName(card.simpleName), card.setCodeForScryfall, card.cardNumber].join("|"), "]]"].join("") + " $" + card.askingPrice);
        });
    }
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

function importScryfallSetsDataAndCodeMap() {
    if (!scryfallSetsData.length) {
        console.log("Importing Scryfall set data");
        scryfallSetsData = JSON.parse(fs.readFileSync(os.homedir() + documentsFileExtension + scryfallSetsDataFile, "utf8"));
    }
    console.log("Importing set code map data");
    const setCodeMapData = fs.readFileSync(os.homedir() + documentsFileExtension + setNameCodeMapFile, "utf8")
    if (setCodeMapData.length > 0) {
        setNameCodeMap = new Map(Object.entries(JSON.parse(setCodeMapData)));
    }
    populateSetNameCodeMapFromScryfall();
    askForFileNameAndValue();
}

function populateSetNameCodeMapFromScryfall() {
    console.log("Adding set names and codes to map from Scryfall data");
    let setNamesFromScryfall = new Set(scryfallSetsData.map(setInfo => setInfo.name));
    if (setNameCodeMap.size > 0) {
        for (let key of setNameCodeMap.keys()) {
            if (setNamesFromScryfall.has(key)) {
                setNamesFromScryfall.delete(key);
            }
        }
    }
    setNamesFromScryfall.forEach(setName => {
        setNameCodeMap.set(setName, scryfallSetsData.find(setInfo => setInfo.name === setName).code.toUpperCase());
    })
    console.log("Finished populating pre-existing set names");
}

function saveSetNameCodeMapToFile() {
    console.log("Saving set name code data to file");
    fs.writeFileSync(os.homedir() + documentsFileExtension + setNameCodeMapFile, JSON.stringify(Object.fromEntries(setNameCodeMap)));
}

/**********Check if data needs updating at start of script with functions below*************/

function shouldUpdateScryfallSetsDataFile() {
    const filePath = os.homedir() + documentsFileExtension + scryfallSetsDataFile;
    const stats = fs.statSync(filePath);
    return differenceInDays(stats.mtime, new Date()) > 0 || stats.size === 0;
}

function differenceInDays(date1, date2) {
    const diffTime = Math.abs(date2 - date1);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function createDataFolderIfDoesNotExist() {
    const folderPath = os.homedir() + documentsFileExtension;
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
    }
}

function createFileIfDoesNotExist(fileName) {
    const filePath = os.homedir() + documentsFileExtension + fileName;
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "");
    }
}

function ensureDataFilesExist() {
    console.log("Creating files for Scryfall set data and code map. Files will be in " + os.homedir() + documentsFileExtension.replace("/", "\\"));
    createDataFolderIfDoesNotExist();
    createFileIfDoesNotExist(scryfallSetsDataFile);
    createFileIfDoesNotExist(setNameCodeMapFile);
}

function updateScryfallData() {
    ensureDataFilesExist();
    if (shouldUpdateScryfallSetsDataFile()) {
        console.log("Updating Scryfall sets data");
        try {
            scryfall.Sets.all()
                .then(setsData => {
                    const filePath = os.homedir() + documentsFileExtension + scryfallSetsDataFile;
                    scryfallSetsData = setsData;
                    fs.writeFileSync(filePath, JSON.stringify(setsData));
                    importScryfallSetsDataAndCodeMap();
                })
                .catch(err => console.log(err));
        } catch (err) {
            console.log(err);
            importScryfallSetsDataAndCodeMap();
        }
    } else {
        console.log("Scryfall data is up to date");
        importScryfallSetsDataAndCodeMap()
    }
}

/**********Check if data needs updating at start of script with functions above*************/

updateScryfallData();