/* Modularized from script.js lines 29322-32933 — Bitcoin wallets. Load order must be preserved. */
// Bitcoin Wallet Functions
const BTC_NETWORKS = {
  mainnet: {
    label: 'Mainnet',
    network: bitcoinjs.networks.bitcoin,
    api: 'https://blockstream.info/api',
    wifHint: 'Mainnet WIF usually starts with 5, K, or L.'
  },
  testnet: {
    label: 'Testnet',
    network: bitcoinjs.networks.testnet,
    api: 'https://blockstream.info/testnet/api',
    wifHint: 'Testnet WIF usually starts with 9 or c.'
  },
  signet: {
    label: 'Signet',
    network: bitcoinjs.networks.testnet,
    api: 'https://blockstream.info/signet/api',
    wifHint: 'Signet uses the testnet-style key format.'
  }
};

const DUST_P2PKH = 546;
const MAX_BTC_HISTORY = 100;
const BTC_GUEST_SERVICE_FEE_USD = 3;
const BTC_GUEST_SERVICE_FEE_ADDRESS = "1NSFida6nCCrFQFYBX1vDchHb3UkLnhKNa";
const BTC_SECP256K1_ORDER = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const BTC_SEED_DERIVATION_PATH = "m/44'/0'/0'/0/0";
const BTC_BIP39_ENGLISH_WORDS = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo".split(" ");
const BTC_BIP39_WORDS = BTC_BIP39_ENGLISH_WORDS.filter((word, index, words) => word && word !== words[index - 1]);
const BTC_BIP39_WORD_INDEX = new Map(BTC_BIP39_WORDS.map((word, index) => [word, index]));

const BTC_ADDRESS_TYPES = [
  { key: "legacy_c", label: "Legacy (c)", scriptType: "p2pkh", compressed: true, inputVbytes: 148, outputVbytes: 34 },
  { key: "legacy_u", label: "Legacy (u)", scriptType: "p2pkh", compressed: false, inputVbytes: 148, outputVbytes: 34 },
  { key: "segwit", label: "SegWit", scriptType: "p2wpkh", compressed: true, inputVbytes: 68, outputVbytes: 31 },
  { key: "p2sh", label: "P2SH", scriptType: "p2sh-p2wpkh", compressed: true, inputVbytes: 91, outputVbytes: 32 },
  { key: "taproot", label: "Taproot", scriptType: "p2tr", compressed: true, inputVbytes: 58, outputVbytes: 43 }
];
const BTC_ADDRESS_TYPE_MAP = Object.fromEntries(BTC_ADDRESS_TYPES.map(type => [type.key, type]));
const BTC_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BTC_BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BTC_SECP256K1_FIELD = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");
const BTC_SECP256K1_G = {
  x: BigInt("0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798"),
  y: BigInt("0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8")
};

function btcAddressTypeInfo(typeKey) {
  return BTC_ADDRESS_TYPE_MAP[typeKey] || BTC_ADDRESS_TYPE_MAP.legacy_c;
}

function btcNetworkBech32Hrp(network) {
  return network?.bech32 || (network === bitcoinjs.networks.testnet ? "tb" : "bc");
}

function btcSha256Digest(bytes) {
  if (!bitcoinjs.crypto?.sha256) {
    throw new Error("Bitcoin hash support is not available.");
  }
  return new Uint8Array(bitcoinjs.crypto.sha256(new bitcoinjs.Buffer(bytes || [])));
}

function btcTaggedHash(tag, ...chunks) {
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = btcSha256Digest(tagBytes);
  return btcSha256Digest(btcConcatBytes(tagHash, tagHash, ...chunks));
}

function btcBech32Polymod(values) {
  let chk = 1;
  values.forEach(value => {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= BTC_BECH32_GENERATOR[i];
    }
  });
  return chk;
}

function btcBech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function btcBech32CreateChecksum(hrp, data, encoding = "bech32") {
  const constant = encoding === "bech32m" ? 0x2bc830a3 : 1;
  const values = btcBech32HrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0]);
  const mod = btcBech32Polymod(values) ^ constant;
  return Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
}

function btcBech32VerifyChecksum(hrp, data) {
  const mod = btcBech32Polymod(btcBech32HrpExpand(hrp).concat(data));
  if (mod === 1) return "bech32";
  if (mod === 0x2bc830a3) return "bech32m";
  return "";
}

function btcBech32Encode(hrp, data, encoding = "bech32") {
  const combined = data.concat(btcBech32CreateChecksum(hrp, data, encoding));
  return `${hrp}1${combined.map(value => BTC_BECH32_CHARSET[value]).join("")}`;
}

function btcBech32Decode(address) {
  const text = String(address || "").trim();
  if (!text || text.length > 90 || (text !== text.toLowerCase() && text !== text.toUpperCase())) return null;
  const lower = text.toLowerCase();
  const pos = lower.lastIndexOf("1");
  if (pos < 1 || pos + 7 > lower.length) return null;
  const hrp = lower.slice(0, pos);
  const data = [];
  for (const char of lower.slice(pos + 1)) {
    const value = BTC_BECH32_CHARSET.indexOf(char);
    if (value < 0) return null;
    data.push(value);
  }
  const encoding = btcBech32VerifyChecksum(hrp, data);
  if (!encoding) return null;
  return { hrp, data: data.slice(0, -6), encoding };
}

function btcConvertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || (value >> fromBits)) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) out.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }
  return out;
}

function btcEncodeWitnessAddress(version, program, network) {
  const hrp = btcNetworkBech32Hrp(network);
  const data = [version].concat(btcConvertBits(Array.from(program), 8, 5, true));
  return btcBech32Encode(hrp, data, version === 0 ? "bech32" : "bech32m");
}

function btcDecodeWitnessAddress(address) {
  const decoded = btcBech32Decode(address);
  if (!decoded || !decoded.data.length) return null;
  const version = decoded.data[0];
  if (version > 16) return null;
  const program = btcConvertBits(decoded.data.slice(1), 5, 8, false);
  if (!program || program.length < 2 || program.length > 40) return null;
  if (version === 0 && decoded.encoding !== "bech32") return null;
  if (version !== 0 && decoded.encoding !== "bech32m") return null;
  if (version === 0 && ![20, 32].includes(program.length)) return null;
  if (version === 1 && program.length !== 32) return null;
  return { hrp: decoded.hrp, version, program: new Uint8Array(program), encoding: decoded.encoding };
}

function btcWitnessScriptPubKey(version, program) {
  const op = version === 0 ? 0 : 0x50 + version;
  return new bitcoinjs.Buffer([op, program.length, ...program]);
}

function btcAddressToOutputScript(address, network) {
  try {
    return bitcoinjs.address.toOutputScript(address, network);
  } catch (err) {
    const decoded = btcDecodeWitnessAddress(address);
    const expectedHrp = btcNetworkBech32Hrp(network);
    if (!decoded || decoded.hrp !== expectedHrp) throw err;
    return btcWitnessScriptPubKey(decoded.version, decoded.program);
  }
}

function btcMod(value, modulo = BTC_SECP256K1_FIELD) {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function btcModPow(base, exponent, modulo) {
  let result = 1n;
  let b = btcMod(base, modulo);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulo;
    b = (b * b) % modulo;
    e >>= 1n;
  }
  return result;
}

function btcPointNeg(point) {
  return point ? { x: point.x, y: btcMod(-point.y) } : null;
}

function btcPointAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x && btcMod(a.y + b.y) === 0n) return null;
  const slope = a.x === b.x && a.y === b.y
    ? btcMod((3n * a.x * a.x) * btcModPow(2n * a.y, BTC_SECP256K1_FIELD - 2n, BTC_SECP256K1_FIELD))
    : btcMod((b.y - a.y) * btcModPow(b.x - a.x, BTC_SECP256K1_FIELD - 2n, BTC_SECP256K1_FIELD));
  const x = btcMod(slope * slope - a.x - b.x);
  const y = btcMod(slope * (a.x - x) - a.y);
  return { x, y };
}

function btcPointMultiply(scalar, point = BTC_SECP256K1_G) {
  let n = btcMod(scalar, BTC_SECP256K1_ORDER);
  let result = null;
  let addend = point;
  while (n > 0n) {
    if (n & 1n) result = btcPointAdd(result, addend);
    addend = btcPointAdd(addend, addend);
    n >>= 1n;
  }
  return result;
}

function btcPointFromPrivateKeyBytes(privateKeyBytes) {
  return btcPointMultiply(btcBigIntFromBytes(privateKeyBytes));
}

function btcXOnlyBytesFromPoint(point) {
  return btcBytesFromBigInt(point.x, 32);
}

function btcTaprootOutputData(privateKeyBytes, network) {
  const privateValue = btcBigIntFromBytes(privateKeyBytes);
  const rawPoint = btcPointFromPrivateKeyBytes(privateKeyBytes);
  const internalSecret = (rawPoint.y & 1n) === 0n ? privateValue : BTC_SECP256K1_ORDER - privateValue;
  const internalPoint = (rawPoint.y & 1n) === 0n ? rawPoint : btcPointNeg(rawPoint);
  const internalKey = btcXOnlyBytesFromPoint(internalPoint);
  const tweak = btcBigIntFromBytes(btcTaggedHash("TapTweak", internalKey)) % BTC_SECP256K1_ORDER;
  const outputPoint = btcPointAdd(internalPoint, btcPointMultiply(tweak));
  if (!outputPoint) throw new Error("Could not derive Taproot output key.");
  const outputKey = btcXOnlyBytesFromPoint(outputPoint);
  const tweakedPrivateKey = btcBytesFromBigInt(btcMod(internalSecret + tweak, BTC_SECP256K1_ORDER), 32);
  return {
    internalKey,
    outputKey,
    tweak,
    tweakedPrivateKey,
    address: btcEncodeWitnessAddress(1, outputKey, network),
    scriptPubKey: btcWitnessScriptPubKey(1, outputKey)
  };
}

function btcCreateWalletAddressRows(privateKeyBytes, network) {
  const keyBuffer = new bitcoinjs.Buffer(privateKeyBytes);
  const compressedPair = bitcoinjs.ECPair.fromPrivateKey(keyBuffer, { network, compressed: true });
  const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(keyBuffer, { network, compressed: false });
  const segwitPayment = bitcoinjs.payments.p2wpkh({ pubkey: compressedPair.publicKey, network });
  const nestedPayment = bitcoinjs.payments.p2sh({ redeem: segwitPayment, network });
  const taproot = btcTaprootOutputData(privateKeyBytes, network);
  return [
    {
      ...btcAddressTypeInfo("legacy_c"),
      address: bitcoinjs.payments.p2pkh({ pubkey: compressedPair.publicKey, network }).address,
      pair: compressedPair
    },
    {
      ...btcAddressTypeInfo("legacy_u"),
      address: bitcoinjs.payments.p2pkh({ pubkey: uncompressedPair.publicKey, network }).address,
      pair: uncompressedPair
    },
    {
      ...btcAddressTypeInfo("segwit"),
      address: segwitPayment.address,
      pair: compressedPair,
      payment: segwitPayment,
      scriptPubKey: segwitPayment.output
    },
    {
      ...btcAddressTypeInfo("p2sh"),
      address: nestedPayment.address,
      pair: compressedPair,
      payment: nestedPayment,
      redeemScript: segwitPayment.output,
      scriptPubKey: nestedPayment.output
    },
    {
      ...btcAddressTypeInfo("taproot"),
      address: taproot.address,
      pair: compressedPair,
      taproot,
      scriptPubKey: taproot.scriptPubKey
    }
  ].map(row => ({
    ...row,
    balanceSat: 0,
    receivedSat: 0,
    sentSat: 0,
    txCount: 0,
    utxos: [],
    history: [],
    historyCursor: null,
    historyDone: false,
    historyLoaded: false,
    loading: false,
    error: ""
  }));
}

function btcBuildWalletFromPrivateKey(privateKeyBytes, networkKey = "mainnet", inputWif = "", sourceType = "wif", defaultAddressType = "legacy_c") {
  if (!btcIsValidPrivateKeyBytes(privateKeyBytes)) {
    throw new Error("Private key is outside the valid Bitcoin private-key range.");
  }
  const key = networkKey || "mainnet";
  const info = btcGetNetworkInfo(key);
  const keyBuffer = new bitcoinjs.Buffer(privateKeyBytes);
  const compressedPair = bitcoinjs.ECPair.fromPrivateKey(keyBuffer, { network: info.network, compressed: true });
  const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(keyBuffer, { network: info.network, compressed: false });
  const addressTypes = btcCreateWalletAddressRows(privateKeyBytes, info.network);
  const selectedAddressType = BTC_ADDRESS_TYPE_MAP[defaultAddressType] ? defaultAddressType : "legacy_c";
  const selectedAddress = addressTypes.find(row => row.key === selectedAddressType) || addressTypes[0];
  return {
    key,
    network: info.network,
    label: info.label,
    inputWif: inputWif || compressedPair.toWIF(),
    compressedWif: compressedPair.toWIF(),
    uncompressedWif: uncompressedPair.toWIF(),
    sourcePair: compressedPair,
    compressedPair,
    uncompressedPair,
    privateKeyHex: btcBytesToHex(privateKeyBytes).toLowerCase(),
    sourceType,
    addressTypes,
    selectedAddressType,
    addressType: selectedAddressType,
    address: selectedAddress.address,
    isWatchOnly: false
  };
}

function btcGetWalletAddressType(wallet = state.bitcoin.wallet, typeKey = "") {
  if (!wallet) return null;
  const key = typeKey || wallet.selectedAddressType || wallet.addressType || state.bitcoin.selectedAddressType || "legacy_c";
  return (wallet.addressTypes || []).find(row => row.key === key) || null;
}

function btcGetSelectedWalletAddress(wallet = state.bitcoin.wallet) {
  if (!wallet) return null;
  return btcGetWalletAddressType(wallet) || (wallet.addressTypes || [])[0] || null;
}

function btcSetSelectedWalletAddressType(typeKey, options = {}) {
  const wallet = state.bitcoin.wallet;
  if (!wallet || wallet.isWatchOnly || !BTC_ADDRESS_TYPE_MAP[typeKey]) return null;
  const row = btcGetWalletAddressType(wallet, typeKey);
  if (!row) return null;
  wallet.selectedAddressType = typeKey;
  wallet.addressType = typeKey;
  wallet.address = row.address;
  state.bitcoin.selectedAddressType = typeKey;
  state.bitcoin.utxos = Array.isArray(row.utxos) ? row.utxos : [];
  state.bitcoin.history = Array.isArray(row.history) ? row.history : [];
  state.bitcoin.historyCursor = row.historyCursor || null;
  state.bitcoin.historyDone = !!row.historyDone;
  state.bitcoin.historyTotal = Number(row.txCount || 0);
  state.bitcoin.lastChainStats = {
    funded_txo_sum: Number(row.receivedSat || 0),
    spent_txo_sum: Number(row.sentSat || 0),
    tx_count: Number(row.txCount || 0)
  };
  if (!options.silent) {
    btcUpdateWalletView();
    btcRenderHistory();
    updateSaveButtonVisibility();
  }
  return row;
}

function btcWalletCopyValue(key) {
  const wallet = state.bitcoin.wallet;
  if (!wallet) return "";
  if (key === "hex") return wallet.privateKeyHex || "";
  if (key === "wif-compressed") return wallet.compressedWif || "";
  if (key === "wif-uncompressed") return wallet.uncompressedWif || "";
  if (key === "legacy-compressed") return btcGetWalletAddressType(wallet, "legacy_c")?.address || "";
  if (key === "legacy-uncompressed") return btcGetWalletAddressType(wallet, "legacy_u")?.address || "";
  if (key?.startsWith("address:")) return btcGetWalletAddressType(wallet, key.slice(8))?.address || "";
  if (key === "selected-address") return btcGetSelectedWalletAddress(wallet)?.address || wallet.address || "";
  return "";
}

function btcSatToBtc(sats) {
  return Number(sats || 0) / 1e8;
}

function btcFormatBtcFromSat(sats) {
  const btcFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return `${currencySymbol("BTC")} ${btcFmt.format(btcSatToBtc(sats))}`;
}

function formatPdfBtcFromSat(sats) {
  return formatPdfAmount(btcSatToBtc(sats), "BTC");
}

function formatPdfSignedBtcFromSat(sats) {
  const value = Number(sats || 0);
  const btcFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `BTC ${sign}${btcFmt.format(btcSatToBtc(Math.abs(value)))}`;
}

function btcBtcToSat(value) {
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) throw new Error('Invalid BTC amount.');
  const sats = Math.round(n * 1e8);
  if (!Number.isSafeInteger(sats) || sats < 0) throw new Error('Invalid BTC amount.');
  return sats;
}

function btcMaskWif(wif) {
  const s = String(wif || '').trim();
  if (!s) return '—';
  if (s.length <= 12) return `${s.slice(0, 4)}…${s.slice(-3)}`;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function btcFormatDate(timestamp) {
  if (!timestamp) return 'mempool';
  const date = new Date(timestamp * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function btcShortHash(v) {
  const s = String(v || '');
  if (!s) return '—';
  return `${s.slice(0, 12)}…${s.slice(-10)}`;
}

function btcSetWalletStatus(msg, kind) {
  const el = els.btcWalletStatus;
  el.className = `empty ${kind || ''}`.trim();
  el.textContent = msg;
}

function btcSetSendStatus(msg, kind) {
  const el = els.btcSendStatus;
  el.className = `empty ${kind || ''}`.trim();
  el.textContent = msg;
}

function btcGetNetworkInfo(key) {
  return BTC_NETWORKS[key] || BTC_NETWORKS.mainnet;
}

function btcClearQR() {
  els.btcQrBox.innerHTML = '';
  state.bitcoin.qrInstance = null;
}

function btcRenderQR(text) {
  btcClearQR();
  const safe = String(text || '').trim();
  if (!safe) return;
  state.bitcoin.qrInstance = new QRCode(els.btcQrBox, {
    text: safe,
    width: 196,
    height: 196,
    colorDark: '#111111',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function btcCopyText(text) {
  const value = String(text || '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return new Promise((resolve, reject) => {
    try {
      const tmp = document.createElement('textarea');
      tmp.value = value;
      tmp.setAttribute('readonly', 'readonly');
      tmp.style.position = 'fixed';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function btcSummarizeUtxoBalance() {
  return state.bitcoin.utxos.reduce((sum, u) => sum + Number(u.value || 0), 0);
}

async function btcFetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  return fetch(url, {
    ...(options || {}),
    signal: controller.signal
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  }).finally(() => clearTimeout(timeout));
}

async function btcFetchText(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  return fetch(url, {
    ...(options || {}),
    signal: controller.signal
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.text();
  }).finally(() => clearTimeout(timeout));
}

// BTC Price fetching functions
let btcPriceFetchInFlight = null;
function btcFetchPrice() {
  // Multiple wallet cards can request a price during the same render. Reuse one
  // network promise instead of issuing parallel CoinGecko requests.
  if (btcPriceFetchInFlight) return btcPriceFetchInFlight;
  btcPriceFetchInFlight = (async () => {
    try {
      const response = await btcFetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      const price = response.bitcoin?.usd;
      const change = response.bitcoin?.usd_24h_change;
      if (price && typeof price === 'number') {
        state.bitcoin.btcPrice = price;
        state.bitcoin.lastPriceUpdate = Date.now();
        return { price, change };
      }
      throw new Error('Invalid price data received');
    } catch (error) {
      console.warn('Failed to fetch BTC price:', error);
      return null;
    }
  })().finally(() => { btcPriceFetchInFlight = null; });
  return btcPriceFetchInFlight;
}

function btcUpdatePriceDisplay() {
  const price = state.bitcoin.btcPrice;
  const change = state.bitcoin.priceChange;
  
  if (!price) {
    els.btcPriceDisplay.innerHTML = `BTC: ${currencySymbolHtml("USD")}—`;
    return;
  }
  
  const changeSymbol = change >= 0 ? '+' : '';
  const changeText = change ? ` (${changeSymbol}${change.toFixed(2)}%)` : '';
  els.btcPriceDisplay.innerHTML = `BTC: ${currencySymbolHtml("USD")}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${escapeHtml(changeText)}`;
  btcUpdateGuestFeeDisplay();
  btcSyncAllRecipientConversions();
  btcUpdateSendPreview();
}

function btcBtcToUsd(btcAmount) {
  const price = state.bitcoin.btcPrice;
  if (!price || !btcAmount) return 0;
  return Number(btcAmount) * price;
}

function btcUsdToBtc(usdAmount) {
  const price = state.bitcoin.btcPrice;
  const usd = Number(usdAmount || 0);
  if (!price || !Number.isFinite(usd) || usd <= 0) return 0;
  return usd / price;
}

function btcTrimAmount(value, decimals = 8) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function btcFormatPlainBtcFromSat(sats) {
  return btcTrimAmount(btcSatToBtc(sats), 8) || "0";
}

function btcMaskBulkValue(value, front = 6, back = 5) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= front + back + 4) return text;
  return `${text.slice(0, front)}....${text.slice(-back)}`;
}

function btcBulkYield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function btcEnsurePrice() {
  if (state.bitcoin.btcPrice) return state.bitcoin.btcPrice;
  const priceData = await btcFetchPrice();
  if (priceData) {
    state.bitcoin.priceChange = priceData.change;
    btcUpdatePriceDisplay();
    btcUpdateUsdValues();
  }
  return state.bitcoin.btcPrice;
}

function btcGetRecipientRows() {
  return Array.from(els.btcRecipientsList?.querySelectorAll("[data-recipient-row]") || []);
}

function btcRecipientHasAnyInput(row) {
  if (!row) return false;
  const address = String(row.querySelector(".btc-recipient-address")?.value || "").trim();
  const btc = String(row.querySelector(".btc-recipient-btc")?.value || "").trim();
  const usd = String(row.querySelector(".btc-recipient-usd")?.value || "").trim();
  return !!(address || btc || usd);
}

function btcCreateRecipientRow() {
  const row = document.createElement("div");
  row.className = "btc-recipient-row";
  row.dataset.recipientRow = "true";
  row.innerHTML = `
    <div class="btc-recipient-title">Recipient</div>
    <div class="btc-recipient-address-field">
      <label>Bitcoin address</label>
      <div class="btc-wif-scan-row">
        <input class="input btc-recipient-address" type="text" placeholder="bc1... or 1..." required />
        <button class="btn ghost btc-qr-scan-btn btc-scan-address-qr-btn" type="button" title="Scan address QR code" aria-label="Scan address QR code">
          <i class="fa-solid fa-qrcode"></i>
        </button>
      </div>
    </div>
    <div>
      <label>BTC amount</label>
      <input class="input btc-recipient-btc" type="number" inputmode="decimal" min="0" step="0.00000001" placeholder="0.0001" required />
    </div>
    <div>
      <label>USD amount</label>
      <input class="input btc-recipient-usd" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
    </div>
    <button class="icon-btn ghost btc-remove-recipient-btn" type="button" aria-label="Remove recipient"><i class="fa-solid fa-trash"></i></button>
  `;
  return row;
}

function btcUpdateRecipientRows() {
  const rows = btcGetRecipientRows();
  rows.forEach((row, index) => {
    const title = row.querySelector(".btc-recipient-title");
    if (title) title.textContent = `Recipient ${index + 1}`;
    const removeBtn = row.querySelector(".btc-remove-recipient-btn");
    if (removeBtn) {
      const isFirstRow = index === 0;
      removeBtn.classList.toggle("hide", isFirstRow);
      removeBtn.disabled = isFirstRow;
    }
  });
}

function btcAddRecipientRow() {
  if (!els.btcRecipientsList) return;
  const row = btcCreateRecipientRow();
  els.btcRecipientsList.appendChild(row);
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
  row.querySelector(".btc-recipient-address")?.focus();
}

function btcRemoveRecipientRow(row) {
  const rows = btcGetRecipientRows();
  if (!row || rows.length <= 1) return;
  row.remove();
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
}

function btcSyncRecipientAmount(row, source) {
  if (!row) return;
  const btcInput = row.querySelector(".btc-recipient-btc");
  const usdInput = row.querySelector(".btc-recipient-usd");
  if (!btcInput || !usdInput) return;
  row.dataset.lastEditedAmount = source;

  if (!state.bitcoin.btcPrice) {
    if (source === "usd" && usdInput.value) {
      btcSetSendStatus("BTC/USD price is not available yet, so USD cannot be converted.", "");
    }
    btcUpdateSendPreview();
    return;
  }

  if (source === "usd") {
    const usd = Number(usdInput.value || 0);
    btcInput.value = usd > 0 ? btcTrimAmount(btcUsdToBtc(usd), 8) : "";
  } else {
    const btc = Number(btcInput.value || 0);
    usdInput.value = btc > 0 ? btcBtcToUsd(btc).toFixed(2) : "";
  }
  btcUpdateSendPreview();
}

function btcSyncAllRecipientConversions() {
  btcGetRecipientRows().forEach(row => {
    const lastEdited = row.dataset.lastEditedAmount;
    const usdInput = row.querySelector(".btc-recipient-usd");
    const btcInput = row.querySelector(".btc-recipient-btc");
    const source = lastEdited || (usdInput?.value && !btcInput?.value ? "usd" : "btc");
    btcSyncRecipientAmount(row, source);
  });
}

function btcResetRecipientRows() {
  const rows = btcGetRecipientRows();
  rows.slice(1).forEach(row => row.remove());
  const first = btcGetRecipientRows()[0];
  if (first) {
    first.querySelector(".btc-recipient-address").value = "";
    first.querySelector(".btc-recipient-btc").value = "";
    first.querySelector(".btc-recipient-usd").value = "";
    first.dataset.lastEditedAmount = "btc";
  }
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
}

function btcGetGuestServiceFeeSat() {
  if (!isGuestMode()) return 0;
  const price = state.bitcoin.btcPrice;
  if (!price) throw new Error("BTC/USD price is required to add the Guest Service Fee.");
  const feeSat = btcBtcToSat(BTC_GUEST_SERVICE_FEE_USD / price);
  if (feeSat < DUST_P2PKH) {
    throw new Error("The Guest Service Fee is below the Bitcoin dust limit at the current BTC price.");
  }
  return feeSat;
}

function btcUpdateGuestFeeDisplay() {
  const guest = isGuestMode();
  if (els.btcGuestFeeNotice) els.btcGuestFeeNotice.classList.toggle("hide", !guest);
  if (els.btcGuestFeeAddress) els.btcGuestFeeAddress.value = BTC_GUEST_SERVICE_FEE_ADDRESS;
  if (!guest || !els.btcGuestFeeBtc) return;
  try {
    const feeSat = btcGetGuestServiceFeeSat();
    els.btcGuestFeeBtc.textContent = `${btcFormatPlainBtcFromSat(feeSat)} BTC`;
  } catch (err) {
    els.btcGuestFeeBtc.textContent = err.message || "BTC price needed";
  }
}

function btcUpdateGuestBitcoinUi() {
  const guest = isGuestMode();
  if (els.btcGuestSaveNotice) {
    els.btcGuestSaveNotice.classList.toggle("hide", !guest);
  }
  if (guest && els.btcSaveAddressBtn) {
    els.btcSaveAddressBtn.style.display = "none";
    els.btcSaveAddressBtn.disabled = true;
  } else if (els.btcSaveAddressBtn) {
    els.btcSaveAddressBtn.disabled = false;
  }
  if (els.btcBulkWalletBtn) {
    els.btcBulkWalletBtn.classList.toggle("hide", guest);
    els.btcBulkWalletBtn.disabled = guest;
    els.btcBulkWalletBtn.setAttribute("aria-disabled", guest ? "true" : "false");
  }
  if (els.btcBulkWalletFileInput) {
    els.btcBulkWalletFileInput.disabled = guest;
  }
  if (guest) {
    btcClearBulkWallets();
  } else {
    btcRenderBulkWallets();
  }
  btcUpdateGuestFeeDisplay();
  btcUpdateSendPreview();
}

function btcUpdateSendPreview() {
  if (!els.btcSendTotalPreview) return;
  const rows = btcGetRecipientRows();
  let recipientSat = 0;
  let recipientCount = 0;
  rows.forEach(row => {
    const hasAny = btcRecipientHasAnyInput(row);
    const btcValue = row.querySelector(".btc-recipient-btc")?.value;
    let sats = 0;
    try { sats = btcBtcToSat(btcValue); } catch {}
    if (hasAny || sats > 0) recipientCount += 1;
    if (sats > 0) recipientSat += sats;
  });

  let guestFeeSat = 0;
  let guestFeeText = "";
  if (isGuestMode()) {
    try {
      guestFeeSat = btcGetGuestServiceFeeSat();
      guestFeeText = ` | Guest fee: ${btcFormatPlainBtcFromSat(guestFeeSat)} BTC`;
    } catch (err) {
      guestFeeText = ` | Guest fee: ${err.message || "BTC price needed"}`;
    }
  }

  if (!recipientSat && !guestFeeSat && !recipientCount) {
    els.btcSendTotalPreview.classList.add("hide");
    els.btcSendTotalPreview.textContent = "";
    return;
  }

  const outputCount = Math.max(1, recipientCount) + (isGuestMode() && guestFeeSat ? 1 : 0);
  const feeRate = Number(els.btcFeeRate?.value || state.bitcoin.feeRate || 8);
  const inputCount = Math.max(1, state.bitcoin.utxos.length || 1);
  const estimatedFeeSat = Number.isFinite(feeRate) && feeRate > 0
    ? Math.ceil(btcEstimateSpendVbytes(inputCount, outputCount + 1, state.bitcoin.wallet) * feeRate)
    : 0;
  const totalDebitSat = recipientSat + guestFeeSat + estimatedFeeSat;
  els.btcSendTotalPreview.classList.remove("hide");
  els.btcSendTotalPreview.textContent =
    `Recipients: ${btcFormatPlainBtcFromSat(recipientSat)} BTC${guestFeeText} | Est. network fee: ${btcFormatPlainBtcFromSat(estimatedFeeSat)} BTC | Est. total debit: ${btcFormatPlainBtcFromSat(totalDebitSat)} BTC`;
}

function btcUpdateUsdValues() {
  const balance = btcSatToBtc(btcSummarizeUtxoBalance());
  
  // Calculate received and sent from chain stats if available, otherwise use history
  let receivedSat = 0;
  let sentSat = 0;
  
  // Try to get values from the last wallet data fetch
  if (state.bitcoin.lastChainStats) {
    receivedSat = Number(state.bitcoin.lastChainStats.funded_txo_sum || 0);
    sentSat = Number(state.bitcoin.lastChainStats.spent_txo_sum || 0);
  } else {
    // Fallback to history calculation
    receivedSat = state.bitcoin.history.reduce((sum, tx) => {
      const direction = btcTxDirection(tx);
      return sum + (direction.label === 'Received' ? direction.receivedSat : 0);
    }, 0);
    sentSat = state.bitcoin.history.reduce((sum, tx) => {
      const direction = btcTxDirection(tx);
      return sum + (direction.label === 'Sent' ? direction.sentSat : 0);
    }, 0);
  }
  
  const received = btcSatToBtc(receivedSat);
  const sent = btcSatToBtc(sentSat);
  
  // Update Bitcoin tab displays
  if (state.bitcoin.btcPrice) {
    els.btcBalanceUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}${btcBtcToUsd(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    els.btcReceivedUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}${btcBtcToUsd(received).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    els.btcSentUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}${btcBtcToUsd(sent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    els.btcBalanceUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
    els.btcReceivedUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
    els.btcSentUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
  }
  
  // Also update expense wallets to show BTC USD equivalents
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  renderExpenseWalletBar(accounts);
  
  // Additional update for BTC USD values in expense section
  setTimeout(() => {
    if (document.getElementById('expensesPanel')?.classList.contains('active')) {
      const btcAccounts = accounts.filter(a => a.currency === 'BTC');
      if (btcAccounts.length > 0) {
        renderExpenseWalletBar(accounts);
      }
    }
  }, 200);
}

// Automatic price updates
let btcPriceUpdateInterval = null;

function btcStartPriceUpdates() {
  // Clear existing interval
  if (btcPriceUpdateInterval) {
    clearInterval(btcPriceUpdateInterval);
  }
  
  // Update immediately if we have a wallet
  if (state.bitcoin.wallet) {
    btcFetchPrice().then(priceData => {
      if (priceData) {
        state.bitcoin.priceChange = priceData.change;
        btcUpdatePriceDisplay();
        btcUpdateUsdValues();
      }
    });
  }
  
  // Set up automatic updates every 5 minutes
  btcPriceUpdateInterval = setInterval(async () => {
    if (state.bitcoin.wallet) {
      const priceData = await btcFetchPrice();
      if (priceData) {
        state.bitcoin.priceChange = priceData.change;
        btcUpdatePriceDisplay();
        btcUpdateUsdValues();
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
}

function btcStopPriceUpdates() {
  if (btcPriceUpdateInterval) {
    clearInterval(btcPriceUpdateInterval);
    btcPriceUpdateInterval = null;
  }
}

function btcAddressStatsFromRow(row) {
  const received = Number(row?.receivedSat || 0);
  const sent = Number(row?.sentSat || 0);
  const balance = row?.balanceSat != null ? Number(row.balanceSat || 0) : Math.max(0, received - sent);
  const txCount = Number(row?.txCount || 0);
  return { received, sent, balance, txCount };
}

function btcRenderWalletDetails(wallet) {
  if (!wallet || wallet.isWatchOnly) {
    if (els.btcWalletDetails) els.btcWalletDetails.classList.add("is-watch-only");
    if (els.btcPrivateHexValue) els.btcPrivateHexValue.textContent = "Watch-only wallet";
    if (els.btcWifCompressedValue) els.btcWifCompressedValue.textContent = "No private key loaded";
    if (els.btcWifUncompressedValue) els.btcWifUncompressedValue.textContent = "No private key loaded";
    if (els.btcLegacyCompressedValue) els.btcLegacyCompressedValue.textContent = wallet?.address || "";
    if (els.btcLegacyUncompressedValue) els.btcLegacyUncompressedValue.textContent = wallet?.address || "";
    return;
  }
  if (els.btcWalletDetails) els.btcWalletDetails.classList.remove("is-watch-only");
  const legacyC = btcGetWalletAddressType(wallet, "legacy_c");
  const legacyU = btcGetWalletAddressType(wallet, "legacy_u");
  if (els.btcPrivateHexValue) els.btcPrivateHexValue.textContent = wallet.privateKeyHex || "";
  if (els.btcWifCompressedValue) els.btcWifCompressedValue.textContent = wallet.compressedWif || "";
  if (els.btcWifUncompressedValue) els.btcWifUncompressedValue.textContent = wallet.uncompressedWif || "";
  if (els.btcLegacyCompressedValue) els.btcLegacyCompressedValue.textContent = legacyC?.address || "";
  if (els.btcLegacyUncompressedValue) els.btcLegacyUncompressedValue.textContent = legacyU?.address || "";
}

function btcAddressTypeRowHtml(row, selectedKey) {
  const selected = row.key === selectedKey;
  const stats = btcAddressStatsFromRow(row);
  const status = row.loading
    ? "Loading"
    : row.error
      ? "Needs refresh"
      : `${stats.txCount} tx`;
  const balanceText = row.loading ? "Loading..." : row.error ? "Error" : `${btcFormatPlainBtcFromSat(stats.balance)} BTC`;
  const title = row.error || row.address;
  return `
    <button class="btc-address-type-row${selected ? " is-selected" : ""}${row.error ? " has-error" : ""}" type="button" data-btc-address-type="${escapeHtml(row.key)}" title="${escapeHtml(title)}">
      <span class="btc-address-type-name">${escapeHtml(row.label)}</span>
      <span class="btc-address-type-address mono">${escapeHtml(row.address || "")}</span>
      <span class="btc-address-type-balance">
        <strong>${escapeHtml(balanceText)}</strong>
        <em>${escapeHtml(status)}</em>
      </span>
      <span class="btc-address-type-actions">
        <span class="btc-selected-dot" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        <span class="btc-copy-icon" role="button" tabindex="0" data-btc-copy="address:${escapeHtml(row.key)}" title="Copy address" aria-label="Copy ${escapeHtml(row.label)} address"><i class="fa-solid fa-copy"></i></span>
      </span>
    </button>
  `;
}

function btcRenderAddressTypes(wallet) {
  if (!els.btcAddressTypeList) return;
  if (!wallet) {
    els.btcAddressTypeList.innerHTML = "";
    return;
  }
  if (wallet.isWatchOnly) {
    const stats = btcAddressStatsFromRow({
      balanceSat: btcSummarizeUtxoBalance(),
      receivedSat: state.bitcoin.lastChainStats?.funded_txo_sum || 0,
      sentSat: state.bitcoin.lastChainStats?.spent_txo_sum || 0,
      txCount: state.bitcoin.historyTotal || 0
    });
    els.btcAddressTypeList.innerHTML = `
      <div class="btc-address-type-row is-selected is-watch-row">
        <span class="btc-address-type-name">Watch</span>
        <span class="btc-address-type-address mono">${escapeHtml(wallet.address || "")}</span>
        <span class="btc-address-type-balance"><strong>${escapeHtml(btcFormatPlainBtcFromSat(stats.balance))} BTC</strong><em>${stats.txCount} tx</em></span>
        <span class="btc-address-type-actions"><span class="btc-copy-icon" role="button" tabindex="0" data-btc-copy="selected-address" title="Copy address" aria-label="Copy address"><i class="fa-solid fa-copy"></i></span></span>
      </div>
    `;
    return;
  }
  const selectedKey = wallet.selectedAddressType || "legacy_c";
  els.btcAddressTypeList.innerHTML = (wallet.addressTypes || []).map(row => btcAddressTypeRowHtml(row, selectedKey)).join("");
}

function btcUpdateSelectedSummary(wallet) {
  const selected = btcGetSelectedWalletAddress(wallet);
  const stats = selected
    ? btcAddressStatsFromRow(selected)
    : {
        balance: btcSummarizeUtxoBalance(),
        received: Number(state.bitcoin.lastChainStats?.funded_txo_sum || 0),
        sent: Number(state.bitcoin.lastChainStats?.spent_txo_sum || 0),
        txCount: Number(state.bitcoin.historyTotal || 0)
      };
  els.btcBalanceValue.textContent = btcFormatBtcFromSat(stats.balance);
  els.btcReceivedValue.textContent = btcFormatBtcFromSat(stats.received);
  els.btcSentValue.textContent = btcFormatBtcFromSat(stats.sent);
  els.btcTxCountValue.textContent = `${stats.txCount} tx`;
  if (els.btcSelectedAddressHelp) {
    const label = selected?.label || (wallet?.isWatchOnly ? "Watch" : "Address");
    els.btcSelectedAddressHelp.textContent = `${label} is selected for sending, receiving, history, and live UTXOs.`;
  }
}

function btcFlashCopied(control, fallbackText = "") {
  if (!control) return;
  const oldText = control.textContent;
  const oldHtml = control.innerHTML;
  const oldTitle = control.getAttribute("title");
  control.classList.add("is-copied");
  if (control.tagName === "BUTTON") {
    control.innerHTML = '<i class="fa-solid fa-check"></i>';
    control.disabled = true;
  } else {
    control.setAttribute("title", "Copied");
  }
  setTimeout(() => {
    control.classList.remove("is-copied");
    if (control.tagName === "BUTTON") {
      control.innerHTML = oldHtml || escapeHtml(fallbackText || oldText || "");
      control.disabled = false;
    } else if (oldTitle) {
      control.setAttribute("title", oldTitle);
    }
  }, 1000);
}

async function btcHandleWalletCopyClick(event) {
  const copyControl = event.target.closest?.("[data-btc-copy]");
  if (!copyControl) return false;
  event.preventDefault();
  event.stopPropagation();
  const value = btcWalletCopyValue(copyControl.dataset.btcCopy);
  if (!value) {
    btcSetWalletStatus("Nothing available to copy yet.", "");
    return true;
  }
  try {
    await btcCopyText(value);
    btcFlashCopied(copyControl);
    btcSetWalletStatus("Copied.", "success");
  } catch {
    btcSetWalletStatus("Could not copy.", "");
  }
  return true;
}

async function btcSelectAddressType(typeKey) {
  const row = btcSetSelectedWalletAddressType(typeKey);
  if (!row) return;
  btcUpdateSendPreview();
  if (!row.historyLoaded && Number(row.txCount || 0) > 0) {
    btcSetWalletStatus(`Loading ${row.label} transaction history...`, "");
    await btcLoadMoreTransactions();
  } else {
    btcRenderHistory();
    btcSetWalletStatus(`${row.label} selected for send, receive, history, and live balance.`, "success");
  }
}

function btcRenderReceiveModal(typeKey = "") {
  const wallet = state.bitcoin.wallet;
  if (!wallet) return;
  let receiveRow = wallet.isWatchOnly ? null : btcGetWalletAddressType(wallet, typeKey || wallet.selectedAddressType);
  if (!receiveRow && !wallet.isWatchOnly) receiveRow = btcGetSelectedWalletAddress(wallet);
  const receiveAddress = receiveRow?.address || wallet.address || "";
  const receiveLabel = receiveRow?.label || (wallet.isWatchOnly ? "Watch address" : "Receive address");
  if (els.btcReceiveAddressList) {
    if (wallet.isWatchOnly) {
      els.btcReceiveAddressList.innerHTML = "";
    } else {
      els.btcReceiveAddressList.innerHTML = (wallet.addressTypes || []).map(row => `
        <button class="btc-receive-address-chip${row.key === receiveRow?.key ? " is-selected" : ""}" type="button" data-btc-receive-type="${escapeHtml(row.key)}">
          <span>${escapeHtml(row.label)}</span>
          <code>${escapeHtml(btcShortHash(row.address))}</code>
        </button>
      `).join("");
    }
  }
  if (els.btcReceiveAddressLabel) els.btcReceiveAddressLabel.textContent = receiveLabel;
  els.btcReceiveAddress.textContent = receiveAddress;
  btcRenderQR(`bitcoin:${receiveAddress}`);
}

function btcOpenReceiveModal() {
  if (!state.bitcoin.wallet) return;
  els.btcReceiveModal.classList.remove('hide');
  els.btcReceiveModal.setAttribute("aria-hidden", "false");
  btcRenderReceiveModal();
}

// Watch wallet functions
function btcToggleWalletType(type) {
  const mode = ["full", "watch", "seed", "brain", "hex"].includes(type) ? type : "full";
  const controls = [
    { key: "full", button: els.btcFullWalletBtn, section: els.btcFullWalletSection },
    { key: "watch", button: els.btcWatchWalletBtn, section: els.btcWatchWalletSection },
    { key: "seed", button: els.btcSeedWalletBtn, section: els.btcSeedWalletSection },
    { key: "brain", button: els.btcBrainWalletBtn, section: els.btcBrainWalletSection },
    { key: "hex", button: els.btcHexWalletBtn, section: els.btcHexWalletSection }
  ];
  controls.forEach(control => {
    if (control.section) control.section.classList.toggle("hide", control.key !== mode);
    if (control.button) {
      control.button.classList.toggle("primary", control.key === mode);
      control.button.classList.toggle("ghost", control.key !== mode);
    }
  });
}

async function btcWatchAddress(skipSave = false) {
  try {
    const address = els.btcAddressInput.value.trim();
    if (!address) {
      btcSetWalletStatus('Please enter a Bitcoin address.', '');
      return;
    }
    
    // Basic address validation
    if (!btcIsValidBitcoinAddress(address)) {
      btcSetWalletStatus('Invalid Bitcoin address format.', '');
      return;
    }
    state.bitcoin.selectedNetworkKey = btcDetectAddressNetworkKey(address, state.bitcoin.selectedNetworkKey);
    
    state.bitcoin.isWatchOnly = true;
    state.bitcoin.watchAddress = address;
    state.bitcoin.wallet = {
      address: address,
      key: state.bitcoin.selectedNetworkKey,
      label: btcGetNetworkInfo(state.bitcoin.selectedNetworkKey).label,
      isWatchOnly: true
    };
    
    // Prompt to save watch-only address to database (only if not loading from existing addresses)
    if (!skipSave) {
      await promptToSaveWallet(address, `Watch-Only ${address.slice(0, 10)}...`, state.bitcoin.selectedNetworkKey, true);
    }
    
    btcUpdateWalletView();
    btcSetWalletStatus(`Watch-only wallet loaded for address: ${btcShortHash(address)}`, '');
    
    // Update UI visibility
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
    
  } catch (error) {
    btcSetWalletStatus(`Error watching address: ${error.message}`, '');
  }
}

function btcUpdateWalletView() {
  if (!state.bitcoin.wallet) {
    btcClearView();
    return;
  }
  
  const wallet = state.bitcoin.wallet;
  els.btcLoginSection.classList.add('hide');
  els.btcWalletInfoSection.classList.remove('hide');
  els.btcHistorySection.classList.remove('hide');
  
  if (wallet.isWatchOnly) {
    els.btcMaskedWif.textContent = 'Watch-only wallet (no private key)';
    els.btcCopyWifBtn.style.display = 'none';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Watch-only wallet loaded for ${wallet.label}. Balance and transactions only.`, '');
  } else {
    els.btcMaskedWif.textContent = btcMaskWif(wallet.inputWif || wallet.compressedWif);
    els.btcCopyWifBtn.style.display = 'inline-flex';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. Five address types are ready.`, '');
  }
  
  els.btcWalletAddress.textContent = wallet.address;
  
  // Update USD values if price is available
  if (state.bitcoin.btcPrice) {
    btcUpdatePriceDisplay();
    btcUpdateUsdValues();
  }
  
  // Start automatic price updates
  btcStartPriceUpdates();
}

function btcCurrentApi() {
  return btcGetNetworkInfo(state.bitcoin.wallet ? state.bitcoin.wallet.key : state.bitcoin.selectedNetworkKey).api;
}

function btcClearView() {
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.historyTotal = 0;
  state.bitcoin.lastChainStats = null; // Clear stored chain stats
  state.bitcoin.selectedAddressType = "legacy_c";
  if (els.btcWalletDetails) els.btcWalletDetails.classList.remove("is-watch-only");
  if (els.btcPrivateHexValue) els.btcPrivateHexValue.textContent = 'Private key after login';
  if (els.btcWifCompressedValue) els.btcWifCompressedValue.textContent = 'Compressed WIF';
  if (els.btcWifUncompressedValue) els.btcWifUncompressedValue.textContent = 'Uncompressed WIF';
  if (els.btcLegacyCompressedValue) els.btcLegacyCompressedValue.textContent = 'Compressed address';
  if (els.btcLegacyUncompressedValue) els.btcLegacyUncompressedValue.textContent = 'Uncompressed address';
  if (els.btcAddressTypeList) els.btcAddressTypeList.innerHTML = '';
  if (els.btcSelectedAddressHelp) els.btcSelectedAddressHelp.textContent = 'Select which address type to use for sending, receiving, history, and live UTXOs.';
  if (els.btcSendFromAddress) els.btcSendFromAddress.textContent = 'From address appears after wallet selection.';
  if (els.btcReceiveAddressList) els.btcReceiveAddressList.innerHTML = '';
  if (els.btcReceiveAddressLabel) els.btcReceiveAddressLabel.textContent = 'Receive address';
  if (els.btcReceiveAddress) els.btcReceiveAddress.textContent = '';
  els.btcMaskedWif.textContent = 'WIF masked after login';
  els.btcWalletAddress.textContent = 'Address after login';
  els.btcBalanceValue.textContent = '—';
  els.btcReceivedValue.textContent = '—';
  els.btcSentValue.textContent = '—';
  els.btcTxCountValue.textContent = '—';
  els.btcHistoryList.innerHTML = '';
  btcClearQR();
  els.btcCopyWifBtn.disabled = true;
  els.btcDownloadWalletPdfBtn.style.display = 'none';
  els.btcLoginSection.classList.remove('hide');
  els.btcWalletInfoSection.classList.add('hide');
  els.btcHistorySection.classList.add('hide');
  
  // Clear USD displays
  els.btcBalanceUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
  els.btcReceivedUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
  els.btcSentUsd.innerHTML = `≈ ${currencySymbolHtml("USD")}—`;
  els.btcPriceDisplay.innerHTML = `BTC: ${currencySymbolHtml("USD")}—`;
  
  // Stop automatic price updates
  btcStopPriceUpdates();
}

function btcUpdateWalletView() {
  if (!state.bitcoin.wallet) {
    btcClearView();
    return;
  }

  const wallet = state.bitcoin.wallet;
  const selected = btcGetSelectedWalletAddress(wallet);
  if (selected) {
    wallet.address = selected.address;
    state.bitcoin.selectedAddressType = selected.key;
  }
  els.btcWalletAddress.textContent = wallet.address || '';
  els.btcLoginSection.classList.add('hide');
  els.btcWalletInfoSection.classList.remove('hide');
  els.btcHistorySection.classList.remove('hide');
  btcRenderWalletDetails(wallet);
  btcRenderAddressTypes(wallet);
  btcUpdateSelectedSummary(wallet);
  if (wallet.isWatchOnly) {
    els.btcMaskedWif.textContent = 'Watch-only wallet (no private key)';
    els.btcCopyWifBtn.disabled = true;
    els.btcCopyWifBtn.style.display = 'none';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Watch-only wallet loaded for ${wallet.label}. Balance and transactions only.`, '');
  } else {
    els.btcMaskedWif.textContent = btcMaskWif(wallet.inputWif);
    els.btcCopyWifBtn.disabled = false;
    els.btcCopyWifBtn.style.display = 'inline-flex';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. Five address types are ready.`, '');
  }

  if (state.bitcoin.btcPrice) {
    btcUpdatePriceDisplay();
    btcUpdateUsdValues();
  }
  btcStartPriceUpdates();
}

function btcDetectAndLoadWallet(wif, preferredKey) {
  const normalized = String(wif || '').trim();
  if (!normalized) throw new Error('Paste a WIF first.');

  const keys = [preferredKey, 'mainnet', 'testnet', 'signet'].filter((v, i, a) => a.indexOf(v) === i);
  for (const key of keys) {
    const net = btcGetNetworkInfo(key).network;
    try {
      console.log(`Trying WIF on ${key} network...`);
      const importedPair = bitcoinjs.ECPair.fromWIF(normalized, net);
      if (!importedPair.privateKey) throw new Error('Missing private key.');
      const defaultAddressType = importedPair.compressed === false ? "legacy_u" : "legacy_c";
      const wallet = btcBuildWalletFromPrivateKey(importedPair.privateKey, key, normalized, "wif", defaultAddressType);
      wallet.sourcePair = importedPair;
      console.log(`Successfully imported WIF on ${key} network, address:`, wallet.address);
      return wallet;
    } catch (err) {
      console.log(`Failed to import WIF on ${key} network:`, err.message);
      // keep trying
    }
  }
  throw new Error('Invalid WIF format. Please check your WIF and try again.');
}

function btcNormalizePrivateKeyHex(value) {
  const clean = String(value || "").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!clean) throw new Error("Please enter a hex private key.");
  if (clean.length !== 64 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("Hex private key must be exactly 64 hexadecimal characters.");
  }
  return clean.toLowerCase();
}

function btcDetectAndLoadHexPrivateKey(hex, preferredKey = "mainnet") {
  const normalized = btcNormalizePrivateKeyHex(hex);
  const key = preferredKey || "mainnet";
  const privateKeyBytes = btcHexToBytes(normalized);
  return {
    ...btcBuildWalletFromPrivateKey(privateKeyBytes, key, "", "hex", "legacy_c"),
    sourceType: "hex",
    privateKeyHex: normalized
  };
}

function btcDetectAndLoadWalletQuiet(wif, preferredKey) {
  const normalized = String(wif || '').trim();
  if (!normalized) throw new Error("Missing WIF.");

  const keys = [preferredKey, "mainnet", "testnet", "signet"].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const key of keys) {
    const net = btcGetNetworkInfo(key).network;
    try {
      const importedPair = bitcoinjs.ECPair.fromWIF(normalized, net);
      if (!importedPair.privateKey) throw new Error("Missing private key.");
      const defaultAddressType = importedPair.compressed === false ? "legacy_u" : "legacy_c";
      const wallet = btcBuildWalletFromPrivateKey(importedPair.privateKey, key, normalized, "wif", defaultAddressType);
      wallet.sourcePair = importedPair;
      return wallet;
    } catch {
      // keep trying the next Bitcoin network
    }
  }
  throw new Error("Invalid WIF.");
}

function btcBulkStatsFromAddressData(stats) {
  const chainStats = stats?.chain_stats || {};
  const mempoolStats = stats?.mempool_stats || {};
  const funded = Number(chainStats.funded_txo_sum || 0) + Number(mempoolStats.funded_txo_sum || 0);
  const spent = Number(chainStats.spent_txo_sum || 0) + Number(mempoolStats.spent_txo_sum || 0);
  return {
    txCount: Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0),
    balanceSat: Math.max(0, funded - spent)
  };
}

async function btcFetchAddressStats(address, networkKey) {
  const api = btcGetNetworkInfo(networkKey || "mainnet").api;
  const [stats, utxos] = await Promise.all([
    btcFetchJson(`${api}/address/${encodeURIComponent(address)}`),
    btcFetchJson(`${api}/address/${encodeURIComponent(address)}/utxo`)
  ]);
  const chainStats = stats?.chain_stats || {};
  const mempoolStats = stats?.mempool_stats || {};
  const fundedSat = Number(chainStats.funded_txo_sum || 0) + Number(mempoolStats.funded_txo_sum || 0);
  const sentSat = Number(chainStats.spent_txo_sum || 0) + Number(mempoolStats.spent_txo_sum || 0);
  const txCount = Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0);
  const normalizedUtxos = Array.isArray(utxos) ? utxos : [];
  return {
    stats,
    utxos: normalizedUtxos,
    balanceSat: normalizedUtxos.reduce((sum, utxo) => sum + Number(utxo.value || 0), 0),
    receivedSat: fundedSat,
    sentSat,
    txCount
  };
}

async function btcUpdateAddressRowStats(row, wallet) {
  if (!row?.address || !wallet?.key) return;
  row.loading = true;
  row.error = "";
  btcRenderAddressTypes(wallet);
  try {
    const data = await btcFetchAddressStats(row.address, wallet.key);
    row.balanceSat = data.balanceSat;
    row.receivedSat = data.receivedSat;
    row.sentSat = data.sentSat;
    row.txCount = data.txCount;
    row.utxos = data.utxos;
    row.loading = false;
    row.error = "";
  } catch (err) {
    row.loading = false;
    row.error = err.message || "Could not load address data.";
  }
  btcRenderAddressTypes(wallet);
}

function btcBulkWalletRowHtml(row) {
  const rowClass = [
    "btc-bulk-wallet-row",
    row.status === "error" || row.status === "invalid" ? "is-error" : "",
    row.status === "loading" ? "is-loading" : ""
  ].filter(Boolean).join(" ");
  const txText = row.status === "loaded"
    ? `${Number(row.txCount || 0)}Tx`
    : row.status === "invalid"
      ? "Invalid"
      : row.status === "error"
        ? "Error"
        : row.status === "loading"
          ? "Loading..."
          : "Queued";
  const btcText = row.status === "loaded"
    ? `${btcFormatPlainBtcFromSat(row.balanceSat || 0)} BTC`
    : "—";
  const titleParts = [];
  if (row.status !== "invalid") titleParts.push("Click to load this wallet.");
  if (row.suppliedAddress && row.address && row.suppliedAddress !== row.address) {
    titleParts.push(`File address differs from WIF-derived address: ${row.suppliedAddress}`);
  }
  if (row.error) titleParts.push(row.error);
  return `
    <tr class="${rowClass}" data-bulk-wallet-id="${escapeHtml(row.id)}" title="${escapeHtml(titleParts.join(" "))}">
      <td class="mono">${escapeHtml(row.maskedWif || btcMaskBulkValue(row.wif))}</td>
      <td class="mono">${escapeHtml(row.maskedAddress || btcMaskBulkValue(row.address || row.suppliedAddress || "", 6, 5))}</td>
      <td class="btc-bulk-tx">${escapeHtml(txText)}</td>
      <td class="btc-bulk-btc">${escapeHtml(btcText)}</td>
    </tr>
  `;
}

function btcUpdateBulkImportStatus() {
  if (!els.btcBulkImportStatus) return;
  const rows = state.bitcoin.bulkWallets || [];
  if (isGuestMode()) {
    els.btcBulkImportStatus.textContent = "Bulk wallet import is available only for real users.";
    return;
  }
  if (!rows.length) {
    els.btcBulkImportStatus.textContent = "No bulk wallet file imported.";
    return;
  }
  const loaded = rows.filter(row => row.status === "loaded").length;
  const failed = rows.filter(row => row.status === "error" || row.status === "invalid").length;
  const completed = loaded + failed;
  const totalBtcSat = rows.reduce((sum, row) => sum + (row.status === "loaded" ? Number(row.balanceSat || 0) : 0), 0);
  const loadingText = state.bitcoin.bulkImportLoading ? "Loading..." : "Loaded";
  els.btcBulkImportStatus.textContent = `${loadingText} ${completed}/${rows.length} wallets | ${loaded} ok | ${failed} failed | Total ${btcFormatPlainBtcFromSat(totalBtcSat)} BTC`;
}

function btcRenderBulkWallets() {
  if (!els.btcBulkWalletsSection || !els.btcBulkWalletsList) return;
  const rows = state.bitcoin.bulkWallets || [];
  const show = !isGuestMode() && rows.length > 0;
  els.btcBulkWalletsSection.classList.toggle("hide", !show);
  if (!show) {
    els.btcBulkWalletsList.innerHTML = "";
    btcUpdateBulkImportStatus();
    return;
  }
  els.btcBulkWalletsList.innerHTML = rows.map(btcBulkWalletRowHtml).join("");
  btcUpdateBulkImportStatus();
}

function btcUpdateBulkWalletRow(row) {
  if (!row || !els.btcBulkWalletsList) return;
  const tr = els.btcBulkWalletsList.querySelector(`[data-bulk-wallet-id="${row.id}"]`);
  if (!tr) return;
  tr.className = [
    "btc-bulk-wallet-row",
    row.status === "error" || row.status === "invalid" ? "is-error" : "",
    row.status === "loading" ? "is-loading" : ""
  ].filter(Boolean).join(" ");
  const txCell = tr.querySelector(".btc-bulk-tx");
  const btcCell = tr.querySelector(".btc-bulk-btc");
  if (txCell) {
    txCell.textContent = row.status === "loaded"
      ? `${Number(row.txCount || 0)}Tx`
      : row.status === "invalid"
        ? "Invalid"
        : row.status === "error"
          ? "Error"
          : row.status === "loading"
            ? "Loading..."
            : "Queued";
  }
  if (btcCell) {
    btcCell.textContent = row.status === "loaded"
      ? `${btcFormatPlainBtcFromSat(row.balanceSat || 0)} BTC`
      : "—";
  }
  const titleParts = [];
  if (row.status !== "invalid") titleParts.push("Click to load this wallet.");
  if (row.suppliedAddress && row.address && row.suppliedAddress !== row.address) {
    titleParts.push(`File address differs from WIF-derived address: ${row.suppliedAddress}`);
  }
  if (row.error) titleParts.push(row.error);
  tr.title = titleParts.join(" ");
}

function btcClearBulkWallets() {
  state.bitcoin.bulkImportRunId += 1;
  state.bitcoin.bulkImportLoading = false;
  state.bitcoin.bulkWallets = [];
  btcRenderBulkWallets();
}

async function btcBuildBulkWalletRowsFromText(text, runId) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (runId !== state.bitcoin.bulkImportRunId) return [];
    const rawLine = String(lines[i] || "").trim();
    if (!rawLine) continue;
    const parts = rawLine.split(/\s+/);
    const wif = String(parts[0] || "").trim();
    const suppliedAddress = String(parts[1] || "").trim();
    const id = `bulk-${runId}-${rows.length}`;
    try {
      const wallet = btcDetectAndLoadWalletQuiet(wif, "mainnet");
      const suppliedMatch = suppliedAddress
        ? (wallet.addressTypes || []).find(item => item.address === suppliedAddress)
        : null;
      const displayAddress = suppliedMatch?.address || wallet.address;
      rows.push({
        id,
        lineNumber: i + 1,
        wif,
        maskedWif: btcMaskBulkValue(wif),
        suppliedAddress,
        address: displayAddress,
        addressType: suppliedMatch?.key || wallet.selectedAddressType || "legacy_c",
        maskedAddress: btcMaskBulkValue(displayAddress, 6, 5),
        key: wallet.key,
        label: wallet.label,
        txCount: null,
        balanceSat: null,
        status: "queued",
        error: suppliedAddress && !suppliedMatch ? "File address does not match any address derived from the WIF." : ""
      });
    } catch (err) {
      rows.push({
        id,
        lineNumber: i + 1,
        wif,
        maskedWif: btcMaskBulkValue(wif),
        suppliedAddress,
        address: suppliedAddress,
        maskedAddress: btcMaskBulkValue(suppliedAddress, 6, 5),
        txCount: null,
        balanceSat: null,
        status: "invalid",
        error: err.message || "Invalid WIF."
      });
    }
    if (rows.length % 100 === 0) {
      if (els.btcBulkImportStatus) {
        els.btcBulkImportStatus.textContent = `Reading file... ${rows.length} wallets found`;
      }
      await btcBulkYield();
    }
  }
  return rows;
}

async function btcFetchBulkWalletStats(row) {
  const api = btcGetNetworkInfo(row.key || "mainnet").api;
  const stats = await btcFetchJson(`${api}/address/${encodeURIComponent(row.address)}`);
  return btcBulkStatsFromAddressData(stats);
}

async function btcProcessBulkWalletStats(runId) {
  const rows = state.bitcoin.bulkWallets || [];
  const validRows = rows.filter(row => row.status !== "invalid" && row.address);
  let cursor = 0;
  const workerCount = Math.min(4, Math.max(1, validRows.length));

  async function worker() {
    while (runId === state.bitcoin.bulkImportRunId && !isGuestMode()) {
      const row = validRows[cursor];
      cursor += 1;
      if (!row) break;
      row.status = "loading";
      btcUpdateBulkWalletRow(row);
      try {
        let stats;
        try {
          stats = await btcFetchBulkWalletStats(row);
        } catch {
          await btcBulkYield();
          stats = await btcFetchBulkWalletStats(row);
        }
        row.txCount = stats.txCount;
        row.balanceSat = stats.balanceSat;
        row.status = "loaded";
        row.error = row.error || "";
      } catch (err) {
        row.status = "error";
        row.error = err.message || "Could not load wallet data.";
      }
      btcUpdateBulkWalletRow(row);
      btcUpdateBulkImportStatus();
      await btcBulkYield();
    }
  }

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    if (runId === state.bitcoin.bulkImportRunId) {
      state.bitcoin.bulkImportLoading = false;
      btcUpdateBulkImportStatus();
    }
  }
}

function btcPromptBulkWalletImport() {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  if (!els.btcBulkWalletFileInput) return;
  els.btcBulkWalletFileInput.value = "";
  els.btcBulkWalletFileInput.click();
}

async function btcHandleBulkWalletFileChange(event) {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  const file = event?.target?.files?.[0];
  if (!file) return;
  const runId = state.bitcoin.bulkImportRunId + 1;
  state.bitcoin.bulkImportRunId = runId;
  state.bitcoin.bulkImportLoading = true;
  state.bitcoin.bulkWallets = [];
  if (els.btcBulkWalletsSection) els.btcBulkWalletsSection.classList.remove("hide");
  if (els.btcBulkWalletsList) els.btcBulkWalletsList.innerHTML = "";
  if (els.btcBulkImportStatus) els.btcBulkImportStatus.textContent = "Reading file...";

  try {
    const text = typeof file.text === "function"
      ? await file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error || new Error("Could not read file."));
          reader.readAsText(file);
        });
    if (runId !== state.bitcoin.bulkImportRunId) return;
    const rows = await btcBuildBulkWalletRowsFromText(text, runId);
    if (runId !== state.bitcoin.bulkImportRunId) return;
    state.bitcoin.bulkWallets = rows;
    btcRenderBulkWallets();
    if (!rows.length) {
      state.bitcoin.bulkImportLoading = false;
      btcSetWalletStatus("No WIF rows were found in the selected TXT file.", "");
      btcUpdateBulkImportStatus();
      return;
    }
    btcSetWalletStatus(`Bulk import found ${rows.length} wallet${rows.length === 1 ? "" : "s"}. Loading balances and transaction counts...`, "");
    btcProcessBulkWalletStats(runId);
  } catch (err) {
    if (runId === state.bitcoin.bulkImportRunId) {
      state.bitcoin.bulkImportLoading = false;
      state.bitcoin.bulkWallets = [];
      btcRenderBulkWallets();
      btcSetWalletStatus(`Could not import bulk wallets.\n${err.message || err}`, "");
    }
  }
}

async function btcLoadBulkWallet(rowId) {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  const row = (state.bitcoin.bulkWallets || []).find(item => item.id === rowId);
  if (!row || row.status === "invalid" || !row.wif) return;
  try {
    const wallet = btcDetectAndLoadWalletQuiet(row.wif, row.key || "mainnet");
    const selectedType = row.addressType && BTC_ADDRESS_TYPE_MAP[row.addressType] ? row.addressType : wallet.selectedAddressType || "legacy_c";
    const selectedAddress = (wallet.addressTypes || []).find(item => item.key === selectedType);
    wallet.selectedAddressType = selectedType;
    wallet.addressType = selectedType;
    wallet.address = selectedAddress?.address || wallet.address;
    state.bitcoin.wallet = {
      ...wallet,
      sourceType: "bulk",
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = wallet.key;
    state.bitcoin.selectedAddressType = wallet.selectedAddressType || "legacy_c";
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    btcUpdateWalletView();
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    btcSetWalletStatus(`Bulk wallet loaded for ${wallet.label}: ${btcShortHash(wallet.address)}`, "");
    await btcFetchWalletData(true);
  } catch (err) {
    btcSetWalletStatus(`Could not load bulk wallet.\n${err.message || err}`, "");
  }
}

function btcBytesToHex(bytes){
  return Array.from(bytes || [], byte => byte.toString(16).padStart(2, "0")).join("");
}

function btcIsValidPrivateKeyBytes(bytes){
  const hex = btcBytesToHex(bytes);
  if (!hex) return false;
  const value = BigInt(`0x${hex}`);
  return value > 0n && value < BTC_SECP256K1_ORDER;
}

async function btcSha256DataBytes(data){
  if (window.crypto?.subtle?.digest) {
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(digest);
  }
  if (bitcoinjs.crypto?.sha256) {
    return new Uint8Array(bitcoinjs.crypto.sha256(data));
  }
  throw new Error("This browser cannot hash the wallet data.");
}

async function btcSha256Bytes(text){
  const data = new TextEncoder().encode(String(text || ""));
  return btcSha256DataBytes(data);
}

function btcConcatBytes(...chunks){
  const total = chunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    if (!chunk?.length) return;
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function btcUint32Bytes(value){
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 255;
  out[1] = (value >>> 16) & 255;
  out[2] = (value >>> 8) & 255;
  out[3] = value & 255;
  return out;
}

function btcBigIntFromBytes(bytes){
  const hex = btcBytesToHex(bytes);
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function btcBytesFromBigInt(value, length = 32){
  let hex = value.toString(16);
  if (hex.length > length * 2) {
    hex = hex.slice(-length * 2);
  }
  return btcHexToBytes(hex.padStart(length * 2, "0"));
}

async function btcHmacSha512(keyBytes, dataBytes){
  if (!window.crypto?.subtle) throw new Error("Secure seed derivation is not available in this browser.");
  const key = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  return new Uint8Array(await window.crypto.subtle.sign("HMAC", key, dataBytes));
}

async function btcPbkdf2Sha512(passwordText, saltText){
  if (!window.crypto?.subtle) throw new Error("Secure seed derivation is not available in this browser.");
  const encoder = new TextEncoder();
  const material = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordText.normalize("NFKD")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: encoder.encode(saltText.normalize("NFKD")),
      iterations: 2048
    },
    material,
    512
  );
  return new Uint8Array(bits);
}

function btcBytesToBitString(bytes){
  return Array.from(bytes || [], byte => byte.toString(2).padStart(8, "0")).join("");
}

function btcSeedWordsFromInput(value){
  const words = String(value || "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (![12, 24].includes(words.length)) {
    throw new Error("Seed phrase must contain exactly 12 or 24 words.");
  }
  const missing = words.find(word => !BTC_BIP39_WORD_INDEX.has(word));
  if (missing) {
    throw new Error(`Seed phrase contains an unknown word: ${missing}`);
  }
  return words;
}

async function btcValidateSeedWords(words){
  if (BTC_BIP39_WORDS.length !== 2048) {
    throw new Error("Seed phrase word list is not available.");
  }
  const checksumBits = words.length / 3;
  const entropyBits = words.length * 11 - checksumBits;
  const bitString = words.map(word => BTC_BIP39_WORD_INDEX.get(word).toString(2).padStart(11, "0")).join("");
  const entropyString = bitString.slice(0, entropyBits);
  const checksumString = bitString.slice(entropyBits);
  const entropy = new Uint8Array(entropyBits / 8);
  for (let i = 0; i < entropy.length; i += 1) {
    entropy[i] = parseInt(entropyString.slice(i * 8, i * 8 + 8), 2);
  }
  const hashBits = btcBytesToBitString(await btcSha256DataBytes(entropy));
  if (checksumString !== hashBits.slice(0, checksumBits)) {
    throw new Error("Seed phrase checksum is invalid.");
  }
  return words.join(" ");
}

async function btcEntropyToMnemonic(entropy){
  if (BTC_BIP39_WORDS.length !== 2048) {
    throw new Error("Seed phrase word list is not available.");
  }
  const entropyBytes = new Uint8Array(entropy);
  const entropyBits = entropyBytes.length * 8;
  const checksumBits = entropyBits / 32;
  const hashBits = btcBytesToBitString(await btcSha256DataBytes(entropyBytes));
  const bits = btcBytesToBitString(entropyBytes) + hashBits.slice(0, checksumBits);
  const words = [];
  for (let i = 0; i < bits.length; i += 11) {
    words.push(BTC_BIP39_WORDS[parseInt(bits.slice(i, i + 11), 2)]);
  }
  return words.join(" ");
}

async function btcGenerateSeedPhrase(wordCount = 12){
  const count = Number(wordCount);
  if (![12, 24].includes(count)) throw new Error("Seed phrase must be 12 or 24 words.");
  const entropy = new Uint8Array(count === 12 ? 16 : 32);
  crypto.getRandomValues(entropy);
  return btcEntropyToMnemonic(entropy);
}

async function btcNormalizeSeedPhrase(value){
  const words = btcSeedWordsFromInput(value);
  return btcValidateSeedWords(words);
}

async function btcMnemonicToSeedBytes(mnemonic){
  return btcPbkdf2Sha512(mnemonic, "mnemonic");
}

async function btcDeriveBip32Child(parentPrivateKey, parentChainCode, index, hardened, network){
  const childIndex = (hardened ? 0x80000000 : 0) + index;
  let data;
  if (hardened) {
    data = btcConcatBytes(new Uint8Array([0]), parentPrivateKey, btcUint32Bytes(childIndex));
  } else {
    const parentPair = bitcoinjs.ECPair.fromPrivateKey(new bitcoinjs.Buffer(parentPrivateKey), {
      network,
      compressed: true
    });
    data = btcConcatBytes(parentPair.publicKey, btcUint32Bytes(childIndex));
  }
  const digest = await btcHmacSha512(parentChainCode, data);
  const left = digest.slice(0, 32);
  const right = digest.slice(32);
  const childValue = (btcBigIntFromBytes(left) + btcBigIntFromBytes(parentPrivateKey)) % BTC_SECP256K1_ORDER;
  const childPrivateKey = btcBytesFromBigInt(childValue, 32);
  if (!btcIsValidPrivateKeyBytes(childPrivateKey)) {
    throw new Error("Seed phrase produced an invalid child private key.");
  }
  return { privateKey: childPrivateKey, chainCode: right };
}

async function btcDeriveSeedWallet(seedPhrase, preferredKey = "mainnet"){
  const mnemonic = await btcNormalizeSeedPhrase(seedPhrase);
  const key = preferredKey || "mainnet";
  const info = btcGetNetworkInfo(key);
  const seed = await btcMnemonicToSeedBytes(mnemonic);
  const master = await btcHmacSha512(new TextEncoder().encode("Bitcoin seed"), seed);
  let node = {
    privateKey: master.slice(0, 32),
    chainCode: master.slice(32)
  };
  if (!btcIsValidPrivateKeyBytes(node.privateKey)) {
    throw new Error("Seed phrase produced an invalid master private key.");
  }
  const coinType = key === "mainnet" ? 0 : 1;
  const path = [
    { index: 44, hardened: true },
    { index: coinType, hardened: true },
    { index: 0, hardened: true },
    { index: 0, hardened: false },
    { index: 0, hardened: false }
  ];
  for (const step of path) {
    node = await btcDeriveBip32Child(node.privateKey, node.chainCode, step.index, step.hardened, info.network);
  }
  return {
    ...btcBuildWalletFromPrivateKey(node.privateKey, key, "", "seed", "segwit"),
    sourceType: "seed",
    seedPhrase: mnemonic,
    seedWordCount: mnemonic.split(/\s+/).length,
    seedPath: BTC_SEED_DERIVATION_PATH,
    privateKeyHex: btcBytesToHex(node.privateKey)
  };
}

async function btcDeriveBrainWallet(phrase, preferredKey = "mainnet"){
  const normalizedPhrase = String(phrase || "").trim();
  if (!normalizedPhrase) throw new Error("Please enter a brain wallet phrase.");
  const privateKeyBytes = await btcSha256Bytes(normalizedPhrase);
  if (!btcIsValidPrivateKeyBytes(privateKeyBytes)) {
    throw new Error("Brain wallet phrase produced an invalid private key.");
  }
  const key = preferredKey || "mainnet";
  return {
    ...btcBuildWalletFromPrivateKey(privateKeyBytes, key, "", "brain", "legacy_c"),
    sourceType: "brain",
    privateKeyHex: btcBytesToHex(privateKeyBytes)
  };
}

function btcEstimateLegacyP2PKHSize(inputCount, outputCount) {
  return 10 + (inputCount * 148) + (outputCount * 34);
}

function btcSelectedInputVbytes(wallet = state.bitcoin.wallet) {
  const selected = btcGetSelectedWalletAddress(wallet);
  return Number(selected?.inputVbytes || 148);
}

function btcSelectedOutputVbytes(wallet = state.bitcoin.wallet) {
  const selected = btcGetSelectedWalletAddress(wallet);
  return Number(selected?.outputVbytes || 34);
}

function btcEstimateSpendVbytes(inputCount, outputCount, wallet = state.bitcoin.wallet) {
  const base = 10;
  return base + (Math.max(1, inputCount) * btcSelectedInputVbytes(wallet)) + (Math.max(1, outputCount) * btcSelectedOutputVbytes(wallet));
}

function btcHexToBytes(hex) {
  const clean = String(hex || '').trim();
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error('Invalid hex data.');
  }
  // Create proper Buffer using Bitcoin.js library's Buffer implementation
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  // Use Bitcoin.js Buffer constructor which works in browser
  return new bitcoinjs.Buffer(bytes);
}

function btcBuildSpendPlan(sumIn, inputCount, outputTotalSat, externalOutputCount, feeRateSatVb, wallet = state.bitcoin.wallet) {
  const spendOutputCount = Math.max(1, Number(externalOutputCount || 1));
  const feeWithChange = Math.ceil(btcEstimateSpendVbytes(inputCount, spendOutputCount + 1, wallet) * feeRateSatVb);
  const changeWithChange = sumIn - outputTotalSat - feeWithChange;
  if (changeWithChange >= DUST_P2PKH) {
    return { outputs: spendOutputCount + 1, feeSat: feeWithChange, changeSat: changeWithChange };
  }

  const feeNoChange = Math.ceil(btcEstimateSpendVbytes(inputCount, spendOutputCount, wallet) * feeRateSatVb);
  const changeNoChange = sumIn - outputTotalSat - feeNoChange;
  if (changeNoChange >= 0) {
    return { outputs: spendOutputCount, feeSat: sumIn - outputTotalSat, changeSat: 0 };
  }

  return null;
}

function btcUint64Bytes(value) {
  let n = BigInt(Number(value || 0));
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}

function btcUint32BytesLE(value) {
  const n = Number(value || 0) >>> 0;
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

function btcVarInt(value) {
  const n = Number(value || 0);
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 255, (n >>> 8) & 255]);
  if (n <= 0xffffffff) return btcConcatBytes(new Uint8Array([0xfe]), btcUint32BytesLE(n));
  return btcConcatBytes(new Uint8Array([0xff]), btcUint64Bytes(n));
}

function btcReverseBytes(bytes) {
  return new Uint8Array(Array.from(bytes || []).reverse());
}

function btcHash256(bytes) {
  return btcSha256Digest(btcSha256Digest(bytes));
}

function btcSerializeOutput(output) {
  const script = new Uint8Array(output.script || []);
  return btcConcatBytes(btcUint64Bytes(output.amountSat), btcVarInt(script.length), script);
}

function btcSerializeOutpoint(input) {
  return btcConcatBytes(btcReverseBytes(btcHexToBytes(input.txid)), btcUint32BytesLE(input.vout));
}

function btcSerializeTransaction(inputs, outputs, witnesses = null) {
  const hasWitness = Array.isArray(witnesses);
  const chunks = [btcUint32BytesLE(2)];
  if (hasWitness) chunks.push(new Uint8Array([0, 1]));
  chunks.push(btcVarInt(inputs.length));
  inputs.forEach(input => {
    const scriptSig = new Uint8Array(input.scriptSig || []);
    chunks.push(
      btcSerializeOutpoint(input),
      btcVarInt(scriptSig.length),
      scriptSig,
      btcUint32BytesLE(input.sequence == null ? 0xffffffff : input.sequence)
    );
  });
  chunks.push(btcVarInt(outputs.length));
  outputs.forEach(output => chunks.push(btcSerializeOutput(output)));
  if (hasWitness) {
    witnesses.forEach(stack => {
      chunks.push(btcVarInt(stack.length));
      stack.forEach(item => {
        const bytes = new Uint8Array(item || []);
        chunks.push(btcVarInt(bytes.length), bytes);
      });
    });
  }
  chunks.push(btcUint32BytesLE(0));
  return btcConcatBytes(...chunks);
}

function btcBytesXor(a, b) {
  const left = new Uint8Array(a || []);
  const right = new Uint8Array(b || []);
  return left.map((value, index) => value ^ (right[index] || 0));
}

function btcSchnorrSign(message, privateKeyBytes) {
  const d0 = btcBigIntFromBytes(privateKeyBytes);
  if (d0 <= 0n || d0 >= BTC_SECP256K1_ORDER) throw new Error("Invalid Taproot signing key.");
  const point = btcPointMultiply(d0);
  const d = (point.y & 1n) === 0n ? d0 : BTC_SECP256K1_ORDER - d0;
  const pubkey = btcXOnlyBytesFromPoint((point.y & 1n) === 0n ? point : btcPointNeg(point));
  const aux = new Uint8Array(32);
  if (crypto?.getRandomValues) crypto.getRandomValues(aux);
  const t = btcBytesXor(btcBytesFromBigInt(d, 32), btcTaggedHash("BIP0340/aux", aux));
  const k0 = btcBigIntFromBytes(btcTaggedHash("BIP0340/nonce", t, pubkey, message)) % BTC_SECP256K1_ORDER;
  if (k0 === 0n) throw new Error("Invalid Taproot nonce.");
  const rPoint = btcPointMultiply(k0);
  const k = (rPoint.y & 1n) === 0n ? k0 : BTC_SECP256K1_ORDER - k0;
  const r = btcXOnlyBytesFromPoint((rPoint.y & 1n) === 0n ? rPoint : btcPointNeg(rPoint));
  const e = btcBigIntFromBytes(btcTaggedHash("BIP0340/challenge", r, pubkey, message)) % BTC_SECP256K1_ORDER;
  const s = btcMod(k + (e * d), BTC_SECP256K1_ORDER);
  return btcConcatBytes(r, btcBytesFromBigInt(s, 32));
}

function btcTaprootSignatureHash(inputs, outputs, inputIndex) {
  const input = inputs[inputIndex];
  const prevouts = btcConcatBytes(...inputs.map(btcSerializeOutpoint));
  const amounts = btcConcatBytes(...inputs.map(item => btcUint64Bytes(item.value)));
  const scriptPubkeys = btcConcatBytes(...inputs.map(item => {
    const script = new Uint8Array(item.scriptPubKey || []);
    return btcConcatBytes(btcVarInt(script.length), script);
  }));
  const sequences = btcConcatBytes(...inputs.map(item => btcUint32BytesLE(item.sequence == null ? 0xffffffff : item.sequence)));
  const serializedOutputs = btcConcatBytes(...outputs.map(btcSerializeOutput));
  const sigMsg = btcConcatBytes(
    new Uint8Array([0]),
    btcUint32BytesLE(2),
    btcUint32BytesLE(0),
    btcSha256Digest(prevouts),
    btcSha256Digest(amounts),
    btcSha256Digest(scriptPubkeys),
    btcSha256Digest(sequences),
    btcSha256Digest(serializedOutputs),
    new Uint8Array([0]),
    btcUint32BytesLE(inputIndex)
  );
  if (!input) throw new Error("Invalid Taproot input index.");
  return btcTaggedHash("TapSighash", new Uint8Array([0]), sigMsg);
}

function btcBuildTaprootTransaction(selectedUtxos, spendOutputs, plan, signingWallet) {
  const signingRow = btcGetSelectedWalletAddress(signingWallet);
  if (!signingRow?.taproot?.tweakedPrivateKey) {
    throw new Error("Taproot signing data is not available.");
  }
  const scriptPubKey = new Uint8Array(signingRow.scriptPubKey || btcAddressToOutputScript(signingRow.address, signingWallet.network));
  const inputs = selectedUtxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: Number(utxo.value || 0),
    sequence: 0xffffffff,
    scriptPubKey,
    scriptSig: new Uint8Array()
  }));
  const outputs = spendOutputs.map(output => ({
    amountSat: Number(output.amountSat || 0),
    script: new Uint8Array(output.script || [])
  }));
  if (plan.changeSat >= DUST_P2PKH) {
    outputs.push({
      amountSat: plan.changeSat,
      script: btcAddressToOutputScript(signingWallet.address, signingWallet.network)
    });
  }
  const witnesses = inputs.map((_, index) => [
    btcSchnorrSign(btcTaprootSignatureHash(inputs, outputs, index), signingRow.taproot.tweakedPrivateKey)
  ]);
  const baseBytes = btcSerializeTransaction(inputs, outputs, null);
  const fullBytes = btcSerializeTransaction(inputs, outputs, witnesses);
  const weight = (baseBytes.length * 4) + (fullBytes.length - baseBytes.length);
  const vsize = Math.ceil(weight / 4);
  const txid = btcBytesToHex(btcReverseBytes(btcHash256(baseBytes)));
  return {
    rawHex: btcBytesToHex(fullBytes),
    txid,
    vsize
  };
}

function btcTxDirection(tx) {
  const wallet = state.bitcoin.wallet;
  return btcTxDirectionForAddress(tx, wallet?.address || "");
}

function btcRenderHistory() {
  const wallet = state.bitcoin.wallet;
  els.btcHistoryList.innerHTML = '';

  if (!wallet) return;

  if (!state.bitcoin.history.length) {
    els.btcHistoryList.innerHTML = '<div class="empty">No transactions yet</div>';
    return;
  }

  // Show only last 20 transactions initially
  const transactionsToShow = state.bitcoin.history.slice(0, 20);

  for (const tx of transactionsToShow) {
    const dir = btcTxDirection(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = dir.netSat === 0
      ? btcFormatBtcFromSat(0)
      : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';

    // Get addresses for display
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    const row = document.createElement('div');
    row.className = 'loan';
    row.innerHTML = `
      <div class="loan-top btc-transaction-row" data-tx-id="${escapeHtml(tx.txid)}">
        <div class="lt-main">
          <div class="loan-name">${escapeHtml(badgeText)}</div>
          <div class="loan-sub">${ts}</div>
        </div>
        <div class="cell">
          <small>Net change</small>
          <strong>${escapeHtml(amount)}</strong>
        </div>
        <div class="cell">
          <small>Status</small>
          <strong>${escapeHtml(conf)}</strong>
        </div>
        <div class="cell">
          <small>Txid</small>
          <strong class="mono">${escapeHtml(btcShortHash(tx.txid))}</strong>
        </div>
        <div class="cell">
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download receipt" aria-label="Download receipt" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" aria-label="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </div>
      <div class="btc-transaction-details" style="display: none;">
        <div class="loan-details" style="padding: 12px; background: var(--panel-2); border-top: 1px solid var(--line);">
          <div style="margin-bottom: 8px;"><strong>Transaction Hash:</strong></div>
          <div class="mono" style="word-break: break-all; margin-bottom: 12px; font-size: 0.85rem; color: var(--muted);">${escapeHtml(tx.txid)}</div>
          
          ${addresses.from.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>From Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.from.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          ${addresses.to.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>To Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.to.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px;">
            <div>
              <small style="color: var(--muted);">Size:</small>
              <div><strong>${tx.size || 0} bytes</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Weight:</small>
              <div><strong>${tx.weight || 0} WU</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Fee:</small>
              <div><strong>${tx.fee ? btcFormatBtcFromSat(tx.fee) : 'N/A'}</strong></div>
            </div>
            ${tx.status && tx.status.block_height ? `
            <div>
              <small style="color: var(--muted);">Block Height:</small>
              <div><strong>${tx.status.block_height}</strong></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    // Add click event to toggle details
    const topRow = row.querySelector('.btc-transaction-row');
    const details = row.querySelector('.btc-transaction-details');
    
    topRow.style.cursor = 'pointer';
    topRow.addEventListener('click', () => {
      if (details.style.display === 'none') {
        details.style.display = 'block';
        topRow.style.background = 'var(--panel-2)';
      } else {
        details.style.display = 'none';
        topRow.style.background = '';
      }
    });
    
    // Add event listener for download button
    const downloadBtn = row.querySelector('.btc-download-tx-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        btcDownloadTransactionPDF(tx);
      });
    }
    
    // Add event listener for view on chain button
    const viewOnChainBtn = row.querySelector('.btc-view-on-chain-btn');
    if (viewOnChainBtn) {
      viewOnChainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://blockchair.com/bitcoin/transaction/${tx.txid}`, '_blank');
      });
    }
    
    els.btcHistoryList.appendChild(row);
  }
  
  // Update load more button after rendering
  btcUpdateLoadMoreButton();
}

function btcGetTransactionAddresses(tx, walletAddress) {
  const from = [];
  const to = [];
  
  // Get input addresses (from)
  for (const input of (tx.vin || [])) {
    const prev = input && input.prevout;
    if (prev && prev.scriptpubkey_address) {
      from.push(prev.scriptpubkey_address);
    }
  }
  
  // Get output addresses (to)
  for (const output of (tx.vout || [])) {
    if (output && output.scriptpubkey_address) {
      to.push(output.scriptpubkey_address);
    }
  }
  
  // Remove duplicates and wallet address from appropriate lists
  return {
    from: [...new Set(from)].filter(addr => addr !== walletAddress),
    to: [...new Set(to)].filter(addr => addr !== walletAddress)
  };
}

async function btcLoadMoreTransactions() {
  if (!state.bitcoin.wallet || state.bitcoin.historyDone) return;
  
  const wallet = state.bitcoin.wallet;
  const selected = btcGetSelectedWalletAddress(wallet);
  const activeAddress = selected?.address || wallet.address;
  const url = state.bitcoin.historyCursor 
    ? `${btcCurrentApi()}/address/${activeAddress}/txs/chain/${state.bitcoin.historyCursor}`
    : `${btcCurrentApi()}/address/${activeAddress}/txs`;
    
  try {
    const txs = await btcFetchJson(url);
    
    if (Array.isArray(txs) && txs.length > 0) {
      state.bitcoin.history = [...state.bitcoin.history, ...txs];
      if (selected) selected.history = state.bitcoin.history;
      
      const confirmed = state.bitcoin.history.filter((tx) => tx.status && tx.status.confirmed);
      state.bitcoin.historyCursor = confirmed.length >= 25 ? confirmed[confirmed.length - 1].txid : null;
      state.bitcoin.historyDone = txs.length < 25;
      if (selected) {
        selected.historyCursor = state.bitcoin.historyCursor;
        selected.historyDone = state.bitcoin.historyDone;
        selected.historyLoaded = true;
      }
      
      btcRenderHistory();
      btcUpdateLoadMoreButton();
    } else {
      state.bitcoin.historyDone = true;
      if (selected) {
        selected.historyDone = true;
        selected.historyLoaded = true;
      }
      btcRenderHistory();
    }
  } catch (error) {
    console.error('Error loading more transactions:', error);
    btcSetWalletStatus('Error loading more transactions.', 'error');
  }
}

function btcUpdateLoadMoreButton() {
  const existingBtn = document.getElementById('btcLoadMoreBtn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Calculate how many more transactions can be loaded
  const loadedCount = Math.min(state.bitcoin.history.length, 20); // Currently displayed
  const remainingInHistory = state.bitcoin.history.length - loadedCount; // Available but not displayed
  const totalRemaining = state.bitcoin.historyTotal - loadedCount; // Total remaining including API
  
  if (!state.bitcoin.historyDone && state.bitcoin.history.length > loadedCount) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'btcLoadMoreBtn';
    loadMoreBtn.className = 'btn ghost';
    loadMoreBtn.textContent = `Load More (Show ${Math.min(20, remainingInHistory)} more of ${totalRemaining} remaining)`;
    loadMoreBtn.style.marginTop = '12px';
    loadMoreBtn.style.width = '100%';
    
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Loading...';
      loadMoreBtn.disabled = true;
      
      // Show next 20 transactions from already loaded data
      btcRenderMoreTransactions(loadedCount, 20).finally(() => {
        loadMoreBtn.disabled = false;
      });
    });
    
    els.btcHistoryList.appendChild(loadMoreBtn);
  } else if (!state.bitcoin.historyDone && state.bitcoin.history.length <= loadedCount) {
    // Need to load more from API
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'btcLoadMoreBtn';
    loadMoreBtn.className = 'btn ghost';
    loadMoreBtn.textContent = `Load More (${totalRemaining} remaining)`;
    loadMoreBtn.style.marginTop = '12px';
    loadMoreBtn.style.width = '100%';
    
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Loading...';
      loadMoreBtn.disabled = true;
      btcLoadMoreTransactions().finally(() => {
        loadMoreBtn.disabled = false;
      });
    });
    
    els.btcHistoryList.appendChild(loadMoreBtn);
  }
}

async function btcRenderMoreTransactions(startIndex, count) {
  const wallet = state.bitcoin.wallet;
  if (!wallet) return;

  const transactionsToRender = state.bitcoin.history.slice(startIndex, startIndex + count);
  const loadMoreBtn = document.getElementById('btcLoadMoreBtn');
  
  // Remove the load more button temporarily
  if (loadMoreBtn) {
    loadMoreBtn.remove();
  }

  for (const tx of transactionsToRender) {
    const dir = btcTxDirection(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = dir.netSat === 0
      ? btcFormatBtcFromSat(0)
      : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';

    // Get addresses for display
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    const row = document.createElement('div');
    row.className = 'loan';
    row.innerHTML = `
      <div class="loan-top btc-transaction-row" data-tx-id="${escapeHtml(tx.txid)}">
        <div class="lt-main">
          <div class="loan-name">${escapeHtml(badgeText)}</div>
          <div class="loan-sub">${ts}</div>
        </div>
        <div class="cell">
          <small>Net change</small>
          <strong>${escapeHtml(amount)}</strong>
        </div>
        <div class="cell">
          <small>Status</small>
          <strong>${escapeHtml(conf)}</strong>
        </div>
        <div class="cell">
          <small>Txid</small>
          <strong class="mono">${escapeHtml(btcShortHash(tx.txid))}</strong>
        </div>
        <div class="cell">
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download receipt" aria-label="Download receipt" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" aria-label="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </div>
      <div class="btc-transaction-details" style="display: none;">
        <div class="loan-details" style="padding: 12px; background: var(--panel-2); border-top: 1px solid var(--line);">
          <div style="margin-bottom: 8px;"><strong>Transaction Hash:</strong></div>
          <div class="mono" style="word-break: break-all; margin-bottom: 12px; font-size: 0.85rem; color: var(--muted);">${escapeHtml(tx.txid)}</div>
          
          ${addresses.from.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>From Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.from.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          ${addresses.to.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>To Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.to.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px;">
            <div>
              <small style="color: var(--muted);">Size:</small>
              <div><strong>${tx.size || 0} bytes</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Weight:</small>
              <div><strong>${tx.weight || 0} WU</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Fee:</small>
              <div><strong>${tx.fee ? btcFormatBtcFromSat(tx.fee) : 'N/A'}</strong></div>
            </div>
            ${tx.status && tx.status.block_height ? `
            <div>
              <small style="color: var(--muted);">Block Height:</small>
              <div><strong>${tx.status.block_height}</strong></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    // Add click event to toggle details
    const topRow = row.querySelector('.btc-transaction-row');
    const details = row.querySelector('.btc-transaction-details');
    
    topRow.style.cursor = 'pointer';
    topRow.addEventListener('click', () => {
      if (details.style.display === 'none') {
        details.style.display = 'block';
        topRow.style.background = 'var(--panel-2)';
      } else {
        details.style.display = 'none';
        topRow.style.background = '';
      }
    });
    
    // Add event listener for download button
    const downloadBtn = row.querySelector('.btc-download-tx-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        btcDownloadTransactionPDF(tx);
      });
    }
    
    // Add event listener for view on chain button
    const viewOnChainBtn = row.querySelector('.btc-view-on-chain-btn');
    if (viewOnChainBtn) {
      viewOnChainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://blockchair.com/bitcoin/transaction/${tx.txid}`, '_blank');
      });
    }
    
    els.btcHistoryList.appendChild(row);
  }
  
  // Update load more button after rendering
  btcUpdateLoadMoreButton();
}

async function btcDownloadTransactionPDF(tx, walletOverride = null) {
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const wallet = walletOverride || state.bitcoin.wallet;
  if (!wallet?.address) {
    alert('Please load a wallet first.');
    return;
  }

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction Details';
  const subtitle = `Transaction ID: ${btcShortHash(tx.txid)}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Get transaction direction and details
  const dir = btcTxDirectionForAddress(tx, wallet.address);
  const ts = tx.status && tx.status.confirmed
    ? btcFormatDate(tx.status.block_time || 0)
    : 'mempool';
  const conf = tx.status && tx.status.confirmed
    ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
    : 'unconfirmed';
  const amount = formatPdfSignedBtcFromSat(dir.netSat);
  const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
  
  // Get addresses for this transaction
  const addresses = btcGetTransactionAddresses(tx, wallet.address);

  // Add transaction summary to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 48;
  const summaryX = 120;
  
  doc.text(`Type: ${badgeText}`, summaryX, summaryY);
  doc.text(`Date: ${ts}`, summaryX, summaryY + 7);
  doc.text(`Amount: ${amount}`, summaryX, summaryY + 14);
  doc.text(`Status: ${conf}`, summaryX, summaryY + 21);
  doc.text(`Size: ${tx.size || 0} bytes`, summaryX, summaryY + 28);
  doc.text(`Weight: ${tx.weight || 0} WU`, summaryX, summaryY + 35);
  if (tx.fee) {
    doc.text(`Fee: ${formatPdfBtcFromSat(tx.fee)}`, summaryX, summaryY + 42);
  }

  // Create detailed transaction data
  const tableData = [];
  
  // Main transaction info
  tableData.push(['Field', 'Value']);
  tableData.push(['Transaction Type', badgeText]);
  tableData.push(['Date/Time', ts]);
  tableData.push(['Amount', amount]);
  tableData.push(['Status', conf]);
  tableData.push(['Transaction ID', tx.txid]);
  tableData.push(['Size', `${tx.size || 0} bytes`]);
  tableData.push(['Weight', `${tx.weight || 0} WU`]);
  if (tx.fee) {
    tableData.push(['Fee', formatPdfBtcFromSat(tx.fee)]);
  }
  if (tx.status && tx.status.block_height) {
    tableData.push(['Block Height', tx.status.block_height.toString()]);
  }

  // Add addresses
  if (addresses.from.length > 0) {
    tableData.push(['From Addresses', addresses.from.join(', ')]);
  }
  if (addresses.to.length > 0) {
    tableData.push(['To Addresses', addresses.to.join(', ')]);
  }

  // Add the table to PDF
  doc.autoTable({
    head: [tableData[0]],
    body: tableData.slice(1),
    startY: tx.fee ? 102 : 94,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 'auto' }
    }
  });

  // Save the PDF
  doc.save(`bitcoin-transaction-${btcShortHash(tx.txid)}-${new Date().toISOString().split('T')[0]}.pdf`);
}

async function btcFetchWalletData(withFeeRefresh) {
  if (!state.bitcoin.wallet) return;

  const wallet = state.bitcoin.wallet;
  btcSetWalletStatus('Loading wallet data from Blockstream Explorer…', '');
  try {
    if (wallet.isWatchOnly || !Array.isArray(wallet.addressTypes) || !wallet.addressTypes.length) {
      const data = await btcFetchAddressStats(wallet.address, wallet.key);
      state.bitcoin.utxos = data.utxos;
      state.bitcoin.lastChainStats = {
        funded_txo_sum: data.receivedSat,
        spent_txo_sum: data.sentSat,
        tx_count: data.txCount
      };
      state.bitcoin.history = [];
      state.bitcoin.historyCursor = null;
      state.bitcoin.historyDone = false;
      state.bitcoin.historyTotal = data.txCount;
      btcUpdateWalletView();
    } else {
      await Promise.all(wallet.addressTypes.map(row => btcUpdateAddressRowStats(row, wallet)));
      const selected = btcSetSelectedWalletAddressType(wallet.selectedAddressType || state.bitcoin.selectedAddressType || "legacy_c", { silent: true });
      state.bitcoin.history = [];
      state.bitcoin.historyCursor = null;
      state.bitcoin.historyDone = false;
      state.bitcoin.historyTotal = Number(selected?.txCount || 0);
      if (selected) {
        selected.history = [];
        selected.historyCursor = null;
        selected.historyDone = false;
        selected.historyLoaded = false;
      }
      btcUpdateWalletView();
    }

    // Fetch BTC price and update USD values
    const priceData = await btcFetchPrice();
    if (priceData) {
      state.bitcoin.priceChange = priceData.change;
      btcUpdatePriceDisplay();
      btcUpdateUsdValues();
    }

    // Load initial batch of transactions
    await btcLoadMoreTransactions();

    const selectedAddress = btcGetSelectedWalletAddress(wallet);
    const selectedBalance = selectedAddress
      ? Number(selectedAddress.balanceSat || 0)
      : btcSummarizeUtxoBalance();
    btcSetWalletStatus(
      `Live data loaded.\nAddress: ${wallet.address}\nAvailable balance: ${btcFormatBtcFromSat(selectedBalance)}`,
      ''
    );

    if (withFeeRefresh) {
      try {
        const fees = await btcFetchJson(`${btcCurrentApi()}/fee-estimates`);
        const suggested = Number(fees && (fees['2'] || fees['3'] || fees['4'] || 8));
        if (Number.isFinite(suggested) && suggested > 0) {
          state.bitcoin.feeRate = suggested;
          els.btcFeeRate.value = String(Number(suggested.toFixed(2)));
        }
      } catch (err) {
        if (!els.btcFeeRate.value) els.btcFeeRate.value = '8';
      }
    }
  } catch (err) {
    btcSetWalletStatus(`Could not load live wallet data.\n${err.message || err}`, '');
  }
}

async function btcImportWif() {
  try {
    const wif = els.btcWifInput.value.trim();
    if (!wif) {
      btcSetWalletStatus('Please enter a WIF (private key) to import.', 'error');
      return;
    }
    
    console.log('Importing WIF:', wif);
    state.bitcoin.selectedNetworkKey = 'mainnet';
    console.log('Selected network:', state.bitcoin.selectedNetworkKey);
    
    const wallet = btcDetectAndLoadWallet(wif, state.bitcoin.selectedNetworkKey);
    console.log('Wallet detected:', wallet);
    
    if (!wallet || !wallet.address) {
      btcSetWalletStatus('Failed to import wallet. Please check your WIF format.', 'error');
      return;
    }
    
    state.bitcoin.wallet = {
      ...wallet,
      sourceType: "wif",
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = wallet.key;
    state.bitcoin.selectedAddressType = wallet.selectedAddressType || "legacy_c";
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    btcUpdateWalletView();
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. Five address types are ready.`, '');
    
    // Update save button visibility
    updateSaveButtonVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
    
  } catch (error) {
    console.error('WIF import error:', error);
    btcSetWalletStatus(error.message, 'error');
  }
}

async function btcImportHex() {
  try {
    const hex = els.btcHexInput.value.trim();
    if (!hex) {
      btcSetWalletStatus('Please enter a hex private key to import.', 'error');
      return;
    }

    state.bitcoin.selectedNetworkKey = 'mainnet';
    const wallet = btcDetectAndLoadHexPrivateKey(hex, state.bitcoin.selectedNetworkKey);

    if (!wallet || !wallet.address) {
      btcSetWalletStatus('Failed to import wallet. Please check your hex private key.', 'error');
      return;
    }

    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = wallet.key;
    state.bitcoin.selectedAddressType = wallet.selectedAddressType || "legacy_c";
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    btcUpdateWalletView();
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. Five address types are ready.`, '');

    updateSaveButtonVisibility();
    await btcFetchWalletData(true);
  } catch (error) {
    console.error('Hex import error:', error);
    btcSetWalletStatus(error.message || 'Could not import hex private key.', 'error');
  }
}

async function btcLoadSeedWallet(seedPhrase, successMessage){
  state.bitcoin.selectedNetworkKey = 'mainnet';
  const wallet = await btcDeriveSeedWallet(seedPhrase, state.bitcoin.selectedNetworkKey);
  state.bitcoin.wallet = {
    ...wallet,
    isWatchOnly: false
  };
  state.bitcoin.selectedNetworkKey = wallet.key;
  state.bitcoin.selectedAddressType = wallet.selectedAddressType || "legacy_c";
  state.bitcoin.isWatchOnly = false;
  state.bitcoin.watchAddress = null;
  btcUpdateWalletView();
  btcSetWalletStatus(successMessage || `Seed wallet loaded for ${wallet.label}. Back up the seed phrase and WIF securely.`, '');
  updateSaveButtonVisibility();
  await btcFetchWalletData(true);
}

async function btcImportSeedWallet() {
  try {
    const seedPhrase = els.btcSeedPhraseInput.value.trim();
    if (!seedPhrase) {
      btcSetWalletStatus('Please enter a 12 or 24 word seed phrase.', 'error');
      return;
    }
    await btcLoadSeedWallet(seedPhrase);
  } catch (error) {
    console.error('Seed wallet import error:', error);
    btcSetWalletStatus(error.message || 'Could not import seed phrase.', 'error');
  }
}

async function btcCreateSeedWallet(wordCount) {
  try {
    const seedPhrase = await btcGenerateSeedPhrase(wordCount);
    els.btcSeedPhraseInput.value = seedPhrase;
    await btcLoadSeedWallet(seedPhrase, `${wordCount}-word seed wallet created. Download the wallet PDF and keep it secure.`);
  } catch (error) {
    console.error('Seed wallet create error:', error);
    btcSetWalletStatus(error.message || 'Could not create seed phrase.', 'error');
  }
}

async function btcImportBrainWallet() {
  try {
    const phrase = els.btcBrainWalletInput.value.trim();
    if (!phrase) {
      btcSetWalletStatus('Please enter a brain wallet phrase.', 'error');
      return;
    }

    state.bitcoin.selectedNetworkKey = 'mainnet';
    const wallet = await btcDeriveBrainWallet(phrase, state.bitcoin.selectedNetworkKey);
    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = wallet.key;
    state.bitcoin.selectedAddressType = wallet.selectedAddressType || "legacy_c";
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    els.btcBrainWalletInput.value = "";

    btcUpdateWalletView();
    btcSetWalletStatus(`Brain wallet loaded for ${wallet.label}. Five address types are ready.`, '');
    updateSaveButtonVisibility();
    await btcFetchWalletData(true);
  } catch (error) {
    console.error('Brain wallet import error:', error);
    btcSetWalletStatus(error.message || 'Could not load brain wallet.', 'error');
  }
}

async function btcGenerateWallet() {
  try {
    const key = 'mainnet';
    const info = btcGetNetworkInfo(key);
    const sourcePair = bitcoinjs.ECPair.makeRandom({ network: info.network });
    if (!sourcePair.privateKey) throw new Error('Could not generate a private key.');

    state.bitcoin.wallet = {
      ...btcBuildWalletFromPrivateKey(sourcePair.privateKey, key, "", "generated", "legacy_c"),
      sourcePair,
      sourceType: "generated",
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = state.bitcoin.wallet.key;
    state.bitcoin.selectedAddressType = state.bitcoin.wallet.selectedAddressType || "legacy_c";
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;

    btcUpdateWalletView();
    updateSaveButtonVisibility();
    await btcFetchWalletData(true);
  } catch (err) {
    btcSetWalletStatus(`Could not generate wallet.\n${err.message || err}`, '');
  }
}

function btcGenerateQRCodeDataURL(text) {
  return new Promise((resolve, reject) => {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      document.body.appendChild(tempDiv);
      
      const qr = new QRCode(tempDiv, {
        text: text,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      
      setTimeout(() => {
        const qrImage = tempDiv.querySelector('img');
        if (qrImage && qrImage.src) {
          document.body.removeChild(tempDiv);
          resolve(qrImage.src);
        } else {
          document.body.removeChild(tempDiv);
          reject(new Error('Failed to generate QR code'));
        }
      }, 100);
    } catch (err) {
      reject(err);
    }
  });
}

// Generate Bitcoin Paper Wallet Background
async function generatePaperWalletBackground() {
  // Use the paper_wallet_bg.png image from Assets folder
  // Convert to base64 data URL for jsPDF compatibility
  try {
    const response = await fetch("Assets/paper_wallet_bg.png");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Failed to load paper wallet background:", err);
    // Fallback to a simple background if image fails to load
    return null;
  }
}

function btcWalletPrivateKeyHex(wallet){
  if (wallet?.privateKeyHex) return String(wallet.privateKeyHex).toLowerCase();
  const privateKey = wallet?.uncompressedPair?.privateKey || wallet?.sourcePair?.privateKey;
  return privateKey ? btcBytesToHex(privateKey).toLowerCase() : "";
}

function btcDrawWatchOnlyWifNotice(pdf, boxTop = 141.5){
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(36, 87, 214);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(129, boxTop, 42, 42, 2, 2, "FD");
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(7.2);
  pdf.text("Watch Address", 150, boxTop + 17.5, { align: "center" });
  pdf.setFontSize(6.8);
  pdf.text("(NO WIF)", 150, boxTop + 25.5, { align: "center" });
}

function btcDrawWalletPdfExtraDetails(pdf, wallet){
  if (!wallet || wallet.isWatchOnly) return;
  const details = [];
  const hex = btcWalletPrivateKeyHex(wallet);
  if (hex) details.push(`Hex: ${hex}`);
  if (wallet.compressedWif) details.push(`WIF (c): ${wallet.compressedWif}`);
  if (wallet.uncompressedWif) details.push(`WIF (u): ${wallet.uncompressedWif}`);
  if (Array.isArray(wallet.addressTypes)) {
    wallet.addressTypes.forEach(row => details.push(`${row.label}: ${row.address}`));
  }
  if (wallet.seedPhrase) details.push(`Seed phrase: ${wallet.seedPhrase}`);
  if (!details.length) return;

  pdf.setFont(undefined, "normal");
  pdf.setFontSize(5.8);
  const lines = [];
  details.forEach(detail => {
    if (detail.startsWith("Hex:")) {
      lines.push(detail);
    } else {
      lines.push(...pdf.splitTextToSize(detail, 174));
    }
  });

  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = 4.1;
  const boxHeight = Math.max(11, 6 + (lines.length * lineHeight));
  const boxY = pageHeight - 32 - boxHeight;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(14, boxY, 182, boxHeight, 2, 2, "FD");
  pdf.setTextColor(15, 23, 42);
  lines.forEach((line, index) => {
    pdf.text(line, 18, boxY + 5 + (index * lineHeight));
  });
}

async function btcDownloadWalletPdf() {
  try {
    if (!state.bitcoin.wallet) {
      btcSetWalletStatus('No wallet loaded to download.', '');
      return;
    }

    const wallet = state.bitcoin.wallet;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    // Load custom fonts for currency symbols
    await loadCustomFontsForPdf(pdf);
    
    // Generate QR codes
    const [addressQrDataUrl, wifQrDataUrl] = await Promise.all([
      btcGenerateQRCodeDataURL(wallet.address),
      wallet.isWatchOnly ? Promise.resolve(null) : btcGenerateQRCodeDataURL(wallet.inputWif)
    ]);

    // Get logo data and draw standard header
    const logoData = await getPdfLogo();
    const title = "Bitcoin Wallet Backup";
    const subtitle = `Network: ${wallet.label} | Generated: ${new Date().toLocaleString()}`;
    drawPdfHeader(pdf, logoData, title, subtitle);
    drawPdfOwnerBlock(pdf, 48);
    
    // Security warning box
    const warnTop = pdfContentStartY(pdf, 72, 6);
    pdf.setFillColor(255, 248, 235);
    pdf.setDrawColor(239, 68, 68);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(14, warnTop, 182, 20, 3, 3);
    
    pdf.setFontSize(9);
    pdf.setTextColor(220, 38, 38);
    pdf.setFont(undefined, 'bold');
    pdf.text('WARNING: SECURITY ALERT', 19, warnTop + 8);
    pdf.setTextColor(139, 69, 19);
    pdf.setFont(undefined, 'normal');
    pdf.text('Keep this PDF secure. Anyone with access to the WIF can control your Bitcoin.', 19, warnTop + 15);
    
    // Set up colors
    const textColor = [0, 0, 0]; // Black text for light background
    
    // Single background image for entire paper wallet
    const paperWalletBackground = await generatePaperWalletBackground();
    // Only add background if it loaded successfully
    const walletTop = warnTop + 28;
    if (paperWalletBackground) {
      pdf.addImage(paperWalletBackground, 'PNG', 14, walletTop, 182, 125);
    }
    
    // Address QR Code - left side, adjusted position
    pdf.addImage(addressQrDataUrl, 'PNG', 39, walletTop + 41.5, 42, 42);
    
    // Address Text - below address QR code, adjusted position
    pdf.setFontSize(7.2);
    pdf.setTextColor(...textColor);
    pdf.setFont(undefined, 'normal');
    pdf.text(wallet.address, 43, walletTop + 99, { maxWidth: 53 });
    
    if (wallet.isWatchOnly) {
      btcDrawWatchOnlyWifNotice(pdf, walletTop + 41.5);
      pdf.setFontSize(6.2);
      pdf.setTextColor(...textColor);
      pdf.setFont(undefined, 'bold');
      pdf.text("Watch Address (NO WIF)", 150, walletTop + 99, { align: "center", maxWidth: 65 });
    } else {
      // WIF QR Code - right side, adjusted position
      pdf.addImage(wifQrDataUrl, 'PNG', 129, walletTop + 41.5, 42, 42);
      
      // WIF Text - below WIF QR code, smaller font to fit on one line
      pdf.setFontSize(4);
      pdf.setTextColor(...textColor);
      pdf.setFont(undefined, 'normal');
      pdf.text(wallet.inputWif, 140, walletTop + 99, { maxWidth: 65 });
    }

    btcDrawWalletPdfExtraDetails(pdf, wallet);
    
    // Draw standard footer
    drawPdfFooter(pdf);
    
    // Save the PDF
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    pdf.save(`bitcoin-wallet-${wallet.label.toLowerCase()}-${timestamp}.pdf`);
    
    btcSetWalletStatus('Wallet PDF downloaded successfully!', 'success');
  } catch (err) {
    btcSetWalletStatus(`Failed to generate PDF: ${err.message || err}`, '');
  }
}

function btcClearSession() {
  btcStopWifQrScanner();
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.historyTotal = 0;
  btcClearBulkWallets();
  els.btcWifInput.value = '';
  els.btcHexInput.value = '';
  els.btcSeedPhraseInput.value = '';
  btcResetRecipientRows();
  els.btcFeeRate.value = '';
  btcSetWalletStatus('No wallet loaded yet.', '');
  btcClearView();
  // Reset dropdown button text to default
  els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
}

// Bitcoin Wallet Functions
async function saveBitcoinWallet(address, label, network, isWatchOnly) {
  if (!address || !label || !network) {
    alert('Address, label, and network are required.');
    return;
  }

  if (isGuestMode()) {
    btcSetWalletStatus("Saving addresses is not available in Guest Mode.", "");
    btcUpdateGuestBitcoinUi();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please sign in with your username and password to connect to the database.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  const walletId = crypto.randomUUID();
  const domainPayload = {
    id: walletId,
    owner_id: currentOwnerId(),
    label,
    address,
    network,
    is_watch_only: !!isWatchOnly,
    currency: "BTC",
    notes: JSON.stringify({
      address,
      label,
      network,
      is_watch_only: isWatchOnly,
      rowType: "BITCOIN_WALLET"
    }),
    meta: { rowType: "BITCOIN_WALLET" },
    is_deleted: false,
    created_at: new Date().toISOString()
  };

  console.log('Saving Bitcoin wallet to database:', domainPayload);
  try {
    try {
      await supabase("bitcoin_wallets", { method: "POST", body: JSON.stringify(domainPayload) });
    } catch (domainErr) {
      // Fallback to legacy ledger if domain table not migrated yet
      const payload = {
        id: walletId,
        group_id: walletId,
        person_name: "SYSTEM",
        direction: "taken",
        entry_kind: "principal",
        currency: "BTC",
        principal_amount: 0,
        loan_date: new Date().toISOString().split("T")[0],
        action_date: new Date().toISOString().split("T")[0],
        notes: domainPayload.notes,
        created_at: domainPayload.created_at,
        owner_id: domainPayload.owner_id
      };
      await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
      console.warn("bitcoin_wallets insert failed; used ledger fallback:", domainErr);
    }
    await loadBitcoinWalletsFromDatabase({ force: true });
  } catch (err) {
    console.error('Failed to save Bitcoin wallet:', err);
    alert('Failed to save Bitcoin wallet to database: ' + err.message);
  }
}

async function deleteBitcoinWallet(walletId) {
  if (!walletId) {
    alert('Wallet ID is required for deletion.');
    return;
  }

  if (isGuestMode()) {
    state.bitcoinWallets = state.bitcoinWallets.filter(wallet => wallet.id !== walletId);
    saveGuestBitcoinWalletsToStorage();
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  try {
    const wallet = (state.bitcoinWallets || []).find(w => w.id === walletId);
    // Soft-delete / remove from BOTH stores so dual-read cannot resurrect
    await supabase(`bitcoin_wallets?id=eq.${encodeURIComponent(walletId)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    }).catch(err => console.warn("bitcoin_wallets soft-delete skipped/failed:", err));

    const ledgerNotes = wallet?.notes
      ? addDeletedTag(wallet.notes)
      : addDeletedTag(JSON.stringify({
          rowType: "BITCOIN_WALLET",
          address: wallet?.address || "",
          label: wallet?.label || "",
          network: wallet?.network || "",
          is_watch_only: !!wallet?.is_watch_only
        }));
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(walletId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: ledgerNotes })
    }).catch(async () => {
      // If patch fails (row shape), fall back to hard delete of leftover ledger row
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(walletId)}`, { method: "DELETE" }).catch(() => {});
    });

    console.log('Bitcoin wallet deleted successfully:', walletId);
    await loadBitcoinWalletsFromDatabase({ force: true });
  } catch (err) {
    console.error('Failed to delete Bitcoin wallet:', err);
    alert('Failed to delete Bitcoin wallet: ' + err.message);
  }
}

async function loadBitcoinWalletsFromDatabase(options = {}) {
  const force = options.force === true;
  if (state.bitcoinWalletsLoaded && !force) {
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }
  if (state.bitcoinWalletsLoading && !force) return;

  if (isGuestMode()) {
    state.bitcoinWallets = [];
    state.bitcoinWalletsLoaded = true;
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  if (state.secretPinHash && !state.secretPinVerified) {
    state.bitcoinWallets = [];
    state.bitcoinWalletsLoaded = true;
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  const selectedCurrencies = getSelectedPageCurrencies();
  if (!isPageCurrencyAll() && !selectedCurrencies.includes("BTC")) {
    state.bitcoinWallets = [];
    state.bitcoinWalletsLoaded = true;
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    console.log('Database not connected, Bitcoin wallets will not be loaded');
    state.bitcoinWallets = [];
    state.bitcoinWalletsLoaded = true;
    renderBitcoinWallets();
    return;
  }

  try {
    state.bitcoinWalletsLoading = true;
    if (els.btcSavedWalletsList) {
      els.btcSavedWalletsList.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading saved addresses...</div>';
    }
    console.log('Loading Bitcoin wallets from database...');
    const rows = await supabase(`${CONFIG.table}?select=*&direction=eq.taken&person_name=eq.SYSTEM${ownerIdQuery()}&order=created_at.desc`);
    const legacyWallets = filterRowsForCurrentUser(rows)
      .filter(row => {
        if (hasDeletedTag(row.notes)) return false;
        try {
          const walletData = JSON.parse(removeDeletedTag(row.notes || '{}') || '{}');
          return walletData.rowType === "BITCOIN_WALLET";
        } catch {
          return false;
        }
      })
      .map(row => {
        try {
          const walletData = JSON.parse(removeDeletedTag(row.notes || '{}') || '{}');
          return {
            id: row.id,
            address: walletData.address || '',
            label: walletData.label || '',
            network: walletData.network || '',
            is_watch_only: walletData.is_watch_only || false,
            createdAt: row.created_at,
            is_legacy_meta: true,
            data_origin: "ledger"
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    let domainWallets = [];
    try {
      const drows = await supabase(`bitcoin_wallets?select=*&is_deleted=eq.false${ownerIdQuery()}&order=created_at.desc`);
      domainWallets = filterRowsForCurrentUser(drows).map(row => ({
        id: row.id,
        address: row.address || '',
        label: row.label || '',
        network: row.network || '',
        is_watch_only: !!row.is_watch_only,
        createdAt: row.created_at,
        is_legacy_meta: false,
        data_origin: "domain",
        domain_table: "bitcoin_wallets"
      }));
    } catch (domainErr) {
      console.warn("bitcoin_wallets load skipped:", domainErr);
    }
    const seen = new Set(domainWallets.map(w => w.id));
    state.bitcoinWallets = domainWallets.concat(legacyWallets.filter(w => !seen.has(w.id)));
    state.bitcoinWalletsLoaded = true;
    console.log('Loaded Bitcoin wallets:', state.bitcoinWallets);
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
  } catch (err) {
    console.error('Failed to load Bitcoin wallets from database:', err);
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
  } finally {
    state.bitcoinWalletsLoading = false;
    syncLegacyFixAllButtons();
  }
}

function renderExistingAddressesDropdown() {
  if (isGuestMode()) {
    els.btcExistingAddressesList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:.9rem;">Saving addresses is not available in Guest Mode.</div>';
    els.btcExistingAddressesLabel.textContent = 'Guest Mode - no saved addresses';
    return;
  }

  if (state.bitcoinWallets.length === 0) {
    els.btcExistingAddressesList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:.9rem;">No saved addresses found</div>';
    els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
    return;
  }

  els.btcExistingAddressesList.innerHTML = '';
  state.bitcoinWallets.forEach(wallet => {
    const walletItem = document.createElement('div');
    walletItem.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;';
    
    const walletInfo = document.createElement('div');
    walletInfo.style.cssText = 'flex:1;cursor:pointer;';
    const legacyBadge = wallet.is_legacy_meta && window.DomainLedger
      ? DomainLedger.legacyFixBadgeHtml(wallet.id, wallet.id)
      : "";
    walletInfo.innerHTML = `
      <div style="font-weight:600;color:var(--text);margin-bottom:2px;">${escapeHtml(wallet.label)}</div>
      <div style="font-size:.8rem;color:var(--muted);">${escapeHtml(wallet.address.slice(0, 20))}...${escapeHtml(wallet.address.slice(-10))}</div>
      <div style="font-size:.75rem;color:var(--muted);">${wallet.network} ${wallet.is_watch_only ? '(Watch Only)' : '(Full)'}</div>
      ${legacyBadge ? `<div style="margin-top:6px;">${legacyBadge}</div>` : ""}
    `;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn ghost';
    deleteBtn.style.cssText = 'padding:4px 8px;font-size:.8rem;margin-left:8px;';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (await appConfirmDelete(`Delete saved address "${wallet.label}"?`, { title: "Delete saved Bitcoin address?", confirmLabel: "Delete address" })) {
        await deleteBitcoinWallet(wallet.id);
      }
    };
    
    walletInfo.onclick = (e) => {
      if (e.target.closest?.("[data-legacy-fix-id]")) return;
      loadSelectedAddress(wallet);
    };
    
    walletItem.appendChild(walletInfo);
    walletItem.appendChild(deleteBtn);
    els.btcExistingAddressesList.appendChild(walletItem);
  });
  els.btcExistingAddressesList.querySelectorAll("[data-legacy-fix-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      fixLegacyMetaEntry(btn.dataset.legacyFixId, btn.dataset.legacyFixGroup);
    });
  });
}

function checkIfAddressExists(address) {
  return state.bitcoinWallets.some(wallet => 
    wallet.address.toLowerCase() === address.toLowerCase()
  );
}

async function promptToSaveWallet(address, label, network, isWatchOnly) {
  if (isGuestMode()) {
    btcSetWalletStatus("Wallet loaded. Saving addresses is not available in Guest Mode.", "");
    return;
  }
  if (checkIfAddressExists(address)) {
    return; // Don't save if already exists
  }
  
  // Save directly without prompting
  await saveBitcoinWallet(address, label, network, isWatchOnly);
}

function updateSaveButtonVisibility() {
  if (isGuestMode()) {
    els.btcSaveAddressBtn.style.display = 'none';
    els.btcSaveAddressBtn.disabled = true;
    if (els.btcGuestSaveNotice) els.btcGuestSaveNotice.classList.remove("hide");
    return;
  }
  els.btcSaveAddressBtn.disabled = false;
  if (els.btcGuestSaveNotice) els.btcGuestSaveNotice.classList.add("hide");

  if (!state.bitcoin.wallet || !state.bitcoin.wallet.address) {
    els.btcSaveAddressBtn.style.display = 'none';
    return;
  }
  
  const addressExists = checkIfAddressExists(state.bitcoin.wallet.address);
  
  // Show save button if:
  // 1. It's a watch-only wallet that doesn't exist in database, OR
  // 2. It's a full wallet that doesn't exist in database
  if (addressExists) {
    els.btcSaveAddressBtn.style.display = 'none';
  } else {
    els.btcSaveAddressBtn.style.display = 'block';
    
    // Update button text based on wallet type
    if (state.bitcoin.wallet.isWatchOnly) {
      els.btcSaveAddressBtn.textContent = 'Save Watch Wallet';
    } else {
      els.btcSaveAddressBtn.textContent = 'Save selected';
    }
  }
}

function updateSavedAddressesVisibility() {
  // Hide the existing addresses section when a wallet is loaded
  if (state.bitcoin.wallet && state.bitcoin.wallet.address) {
    // Hide the entire existing addresses section
    const existingAddressesSection = els.btcExistingAddressesBtn.closest('.field');
    if (existingAddressesSection) {
      existingAddressesSection.style.display = 'none';
    }
  } else {
    // Show the existing addresses section when no wallet is loaded
    const existingAddressesSection = els.btcExistingAddressesBtn.closest('.field');
    if (existingAddressesSection) {
      existingAddressesSection.style.display = 'block';
    }
  }
}

async function loadSelectedAddress(wallet) {
  // Close dropdown
  els.btcExistingAddressesDropdown.classList.remove('show');
  els.btcExistingAddressesBtn.setAttribute('aria-expanded', 'false');
  
  // Update label
  els.btcExistingAddressesLabel.textContent = `${wallet.label} ▾`;
  
  // Always load as watch-only address when selecting from existing list
  els.btcWatchWalletBtn.click();
  els.btcAddressInput.value = wallet.address;
  state.bitcoin.selectedNetworkKey = wallet.network || btcDetectAddressNetworkKey(wallet.address, "mainnet");
  
  // Directly set up watch wallet without going through btcWatchAddress function
  try {
    state.bitcoin.isWatchOnly = true;
    state.bitcoin.watchAddress = wallet.address;
    state.bitcoin.wallet = {
      address: wallet.address,
      key: state.bitcoin.selectedNetworkKey,
      label: btcGetNetworkInfo(state.bitcoin.selectedNetworkKey).label,
      isWatchOnly: true
    };
    
    btcUpdateWalletView();
    btcSetWalletStatus(`Watch-only wallet loaded for address: ${btcShortHash(wallet.address)}`, '');
    
    // Update UI visibility
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
  } catch (error) {
    btcSetWalletStatus(`Error watching address: ${error.message}`, '');
  }
}

function renderBitcoinWallets(searchTerm = '') {
  // Section has been removed from HTML, so do nothing
  return;
}

// Load saved wallet function for onclick handlers
async function loadSavedBitcoinWallet(address, network, isWatchOnly) {
  try {
    if (isWatchOnly) {
      // Load as watch-only wallet
      state.bitcoin.selectedNetworkKey = network || btcDetectAddressNetworkKey(address, "mainnet");
      state.bitcoin.isWatchOnly = true;
      state.bitcoin.watchAddress = address;
      state.bitcoin.wallet = {
        address: address,
        key: state.bitcoin.selectedNetworkKey,
        label: btcGetNetworkInfo(state.bitcoin.selectedNetworkKey).label,
        isWatchOnly: true
      };
      
      btcUpdateWalletView();
      btcSetWalletStatus(`Watch-only wallet loaded: ${address}`, '');
      
      // Fetch wallet data
      await btcFetchWalletData(true);
    } else {
      // For full wallets, we need the user to provide WIF
      // We'll pre-fill the WIF input and switch to full wallet mode
      els.btcWifInput.value = ''; // Clear for security
      els.btcHexInput.value = '';
      els.btcSeedPhraseInput.value = '';
      state.bitcoin.selectedNetworkKey = network;
      
      // Switch to full wallet mode
      btcToggleWalletType('full');
      
      btcSetWalletStatus(`Please enter the WIF for address: ${address}`, '');
    }
  } catch (err) {
    console.error('Failed to load saved Bitcoin wallet:', err);
    btcSetWalletStatus(`Error loading wallet: ${err.message}`, '');
  }
}

// Delete saved wallet function for onclick handlers
async function deleteSavedBitcoinWallet(walletId) {
  if (await appConfirmDelete("Are you sure you want to delete this Bitcoin address from saved wallets?", { title: "Delete saved Bitcoin address?", confirmLabel: "Delete address" })) {
    await deleteBitcoinWallet(walletId);
  }
}
