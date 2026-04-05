/**
 * MARATHON SCRAPER — 7-hour non-stop keyword research
 * 2500+ keywords across all high-ticket Etsy niches
 * Auto-refreshes token, saves progress continuously
 */
const { chromium } = require('playwright');
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');

const API_BASE = 'alura-api-3yk57ena2a-uc.a.run.app';
const DB = { host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' };
const PROGRESS_FILE = 'C:\\Windows\\Temp\\marathon_progress.json';
const RESULTS_FILE = 'C:\\Windows\\Temp\\marathon_results.json';

// ════════════════════════════════════════════════════════════════════════════
// 2500+ KEYWORDS — High-ticket, no personalization, Etsy-native niches
// ════════════════════════════════════════════════════════════════════════════
const MARATHON_KEYWORDS = [
  // ── FURNITURE DEEP DIVE ─────────────────────────────────────────────────
  'floating shelf set','wall mounted shelf','rustic floating shelf','industrial shelf',
  'bathroom floating shelf','kitchen shelf','entryway shelf','bedroom shelf',
  'bar shelf','corner wall shelf','barn wood shelf','reclaimed wood shelf',
  'floating desk','wall mounted desk','fold down desk','murphy desk',
  'writing desk','standing desk','computer desk','L shaped desk',
  'industrial desk','farmhouse desk','floating TV shelf',
  'hallway table','console table','sofa table','entryway table',
  'accent table','drum table','pedestal table','nesting tables',
  'coffee table set','rustic coffee table','industrial coffee table',
  'log coffee table','tree trunk table','round coffee table',
  'side table set','C shaped table','bedside table','lamp table',
  'outdoor coffee table','patio table','balcony table',
  'dining bench','kitchen bench','farmhouse bench','piano bench',
  'storage bench with cushion','shoe storage bench','mudroom bench',
  'window seat bench','church pew bench','settee bench',
  'tv console','floating tv console','mid century tv stand',
  'industrial tv stand','barn door tv stand','tv cabinet',
  'media cabinet','credenza','sideboard','buffet table',
  'sofa table shelf','sofa side table','armchair side table',
  'bookcase with doors','glass bookcase','cube bookcase',
  'billy bookcase hack','ladder bookcase','tree bookcase',
  'floating bookcase','corner bookcase','leaning bookcase',
  'record player stand','vinyl record storage','record shelf',
  'bar cabinet','home bar','cocktail cabinet','wine storage',
  'wine wall','wine cellar','bottle rack','glass holder',
  'plant pot stand','plant corner shelf','tiered plant stand',
  'plant cart','potting bench','greenhouse shelf',
  'bathroom vanity','bathroom cabinet','bathroom storage',
  'bathroom shelf unit','towel rack','toilet paper holder',
  'kitchen cart','kitchen trolley','microwave cart',
  'spice rack','kitchen organizer','pantry shelf',
  'closet organizer','wardrobe organizer','shoe rack',
  'coat rack with shelf','umbrella stand','key holder',
  'bedroom dresser','chest of drawers','tallboy',
  'kids bookcase','kids toy storage','kids shelf',
  'garage shelf','workshop shelf','tool organizer',

  // ── MIRRORS DEEP DIVE ───────────────────────────────────────────────────
  'large wall mirror','floor mirror','full length mirror',
  'oversized mirror','statement mirror','designer mirror',
  'sunburst mirror','starburst mirror','rattan mirror',
  'wicker mirror','bamboo mirror','seagrass mirror',
  'gold mirror','brass mirror','black mirror frame',
  'white mirror','wood mirror frame','driftwood mirror',
  'geometric mirror','hexagon mirror','octagon mirror',
  'triptych mirror','set of mirrors','grouping mirrors',
  'bathroom mirror','vanity mirror','medicine cabinet mirror',
  'closet mirror','bedroom mirror','living room mirror',
  'entryway mirror','hall mirror','leaning mirror',
  'vintage mirror frame','ornate mirror','baroque mirror',
  'carved mirror','art deco mirror','mid century mirror',

  // ── LIGHTING DEEP DIVE ──────────────────────────────────────────────────
  'rattan pendant light','bamboo pendant light','wicker pendant light',
  'seagrass pendant light','jute pendant light','paper pendant light',
  'drum pendant light','globe pendant light','cone pendant light',
  'boho chandelier','rattan chandelier','wood bead chandelier',
  'capiz chandelier','driftwood chandelier','crystal chandelier',
  'mini chandelier','small chandelier','dining chandelier',
  'bedroom chandelier','bathroom chandelier','nursery chandelier',
  'tripod floor lamp','arched floor lamp','swing arm floor lamp',
  'drum shade lamp','linen shade lamp','rattan shade lamp',
  'ceramic table lamp','wood table lamp','marble table lamp',
  'concrete table lamp','glass table lamp','crystal table lamp',
  'wall sconce pair','bathroom sconce','bedroom sconce',
  'plug in sconce','swing arm sconce','boho sconce',
  'rattan wall sconce','wicker sconce','bamboo sconce',
  'outdoor string lights','patio string lights','bistro lights',
  'copper string lights','vintage string lights','edison string lights',
  'lantern pendant','industrial pendant','pipe light fixture',
  'mason jar light','wagon wheel light','drum light fixture',
  'flush mount light','semi flush mount','ceiling light fixture',
  'track lighting','bar pendant light','island pendant light',
  'swag light','plug in pendant','no wire pendant',
  'himalayan salt lamp set','selenite lamp','crystal cluster lamp',
  'lava lamp','mushroom night light','moon lamp',
  'touch lamp','bedside reading lamp','clip on lamp',

  // ── RUGS DEEP DIVE ──────────────────────────────────────────────────────
  'moroccan area rug','beni ourain rug','azilal rug','boujaad rug',
  'berber carpet','tribal rug','geometric rug','diamond rug',
  'abstract rug','contemporary rug','modern area rug',
  'persian rug','oriental rug','turkish rug','oushak rug',
  'kilim rug','dhurrie rug','flat weave rug',
  'braided rug','hand braided rug','cotton rug',
  'jute rug runner','sisal rug','seagrass rug set',
  'natural fiber area rug','eco friendly rug',
  'sheepskin area rug','mongolian sheepskin','genuine sheepskin',
  'cowhide area rug','patchwork cowhide','animal print rug',
  'faux fur rug','shag rug','fluffy rug',
  '8x10 area rug','5x8 rug','2x3 rug set',
  'entryway rug','kitchen runner','hallway runner',
  'bathroom rug set','memory foam bath mat','teak bath mat',
  'outdoor rug','waterproof rug','all weather rug',
  'kids rug','playroom rug','nursery rug',
  'yoga rug','meditation mat','prayer rug',

  // ── CRYSTALS & MINERALS DEEP DIVE ───────────────────────────────────────
  'large amethyst geode','amethyst cathedral','amethyst cluster specimen',
  'raw amethyst point','amethyst tower','amethyst slab',
  'clear quartz cluster','quartz point','quartz tower',
  'smoky quartz','citrine cluster','citrine geode',
  'rose quartz sphere','rose quartz tower','rose quartz chunk',
  'pyrite cluster','fools gold','pyrite cube',
  'malachite sphere','malachite raw','malachite slab',
  'labradorite palm stone','labradorite slab','labradorite sphere',
  'black tourmaline','tourmaline raw','tourmaline tower',
  'lapis lazuli','lapis lazuli sphere','lapis lazuli slab',
  'selenite charging plate','selenite bowl','selenite block',
  'selenite wand','selenite log','desert rose selenite',
  'celestite crystal','celestite cluster','blue celestite',
  'kyanite blade','blue kyanite','black kyanite',
  'crystal lamp','amethyst lamp','rose quartz lamp',
  'crystal chandelier natural','geode bookends','crystal bookends',
  'crystal home decor set','crystal display stand','crystal shelf',
  'large crystal specimen','mineral specimen','fossil specimen',
  'petrified wood','agate slab','agate slice',
  'druzy agate','blue agate','green agate',
  'crystal healing kit','chakra crystal set','crystal grid set',
  'crystal wand set','crystal sphere set','crystal tower set',

  // ── JEWELRY DEEP DIVE ───────────────────────────────────────────────────
  'solid gold necklace','14k gold chain','18k gold necklace',
  'gold rope chain','gold box chain','gold figaro chain',
  'gold link bracelet','gold bangle','gold cuff bracelet',
  'solid gold ring','14k gold band','gold signet ring',
  'gold pinky ring','gold stacking ring','gold midi ring',
  'gold hoop earrings large','gold huggie hoops','thick gold hoops',
  'pearl necklace strand','baroque pearl necklace','freshwater pearl',
  'pearl bracelet','pearl drop earrings','pearl stud earrings',
  'diamond alternative ring','moissanite ring','lab diamond ring',
  'emerald ring','ruby ring','sapphire ring',
  'tanzanite ring','aquamarine ring','morganite ring',
  'statement bracelet','bold bracelet','chunky bracelet',
  'tennis necklace','layered chain necklace','chain choker',
  'silver chain necklace','sterling silver necklace','silver torque',
  'oxidized silver','hammered silver ring','forged silver ring',
  'mens silver ring','mens chain necklace','mens leather bracelet',
  'mens bead bracelet','mens cuff bracelet','mens signet ring',
  'crystal earrings dangle','gemstone drop earrings','boho earrings',
  'tassel earrings','fringe earrings','chandelier earrings',
  'vintage brooch','art deco brooch','enamel brooch',
  'enamel pin set','lapel pin','hat pin',
  'body jewelry','belly ring','nose ring','septum ring',

  // ── POTTERY & CERAMICS DEEP DIVE ────────────────────────────────────────
  'large ceramic vase','tall ceramic vase','floor vase',
  'handmade ceramic vase set','ceramic bud vase','minimalist vase',
  'wabi sabi vase','japandi vase','organic vase',
  'ceramic planter large','ceramic pot indoor','hanging ceramic planter',
  'ceramic hanging planter','wall planter ceramic','window planter ceramic',
  'stoneware serving bowl','ceramic salad bowl','mixing bowl set',
  'ceramic dinner set','stoneware dinnerware','handmade plate set',
  'ceramic pasta bowl','soup bowl handmade','ramen bowl',
  'espresso cup set','cappuccino cup','matcha bowl',
  'ceramic mug set','handmade coffee mug','latte mug',
  'pottery tea set','ceramic teapot','tea kettle ceramic',
  'ceramic butter dish','ceramic canister set','ceramic jar',
  'ceramic soap dish','ceramic toothbrush holder','bathroom set ceramic',
  'ceramic oil burner','incense holder ceramic','ring dish ceramic',
  'clay wall art','ceramic tile art','sculptural ceramic',
  'ceramic face vase','head vase','bust vase',
  'ceramic mushroom','ceramic animal','ceramic bird',
  'raku fired pottery','pit fired pottery','wood fired bowl',
  'crystalline glaze','reactive glaze','drip glaze pottery',
  'speckled pottery','speckled mug','speckled bowl',
  'textured vase','relief vase','carved vase',

  // ── MACRAME & TEXTILES DEEP DIVE ────────────────────────────────────────
  'large macrame tapestry','macrame fiber art','woven art piece',
  'macrame statement piece','bedroom macrame','living room fiber art',
  'macrame headboard queen','macrame headboard king','bed canopy macrame',
  'macrame room divider screen','macrame curtain panel','window treatment macrame',
  'bohemian room divider','hanging room divider','decorative screen',
  'rope swing chair','hanging egg chair','rattan egg chair',
  'macrame hanging chair outdoor','porch swing','garden swing',
  'macrame shoulder bag','fringe bag','boho crossbody',
  'woven handbag','rattan bag','straw bag',
  'macrame table runner','boho table runner','woven placemat set',
  'macrame coasters','woven coaster set','jute coaster',
  'chunky knit throw','merino wool throw','alpaca wool throw',
  'handwoven throw blanket','loom woven blanket','wall blanket',
  'tapestry throw blanket','fringe throw','decorative throw',
  'linen cushion cover','woven pillow cover','rattan cushion',
  'floor pillow large','meditation floor cushion','japanese floor cushion',
  'moon chair cushion','papasan cushion','egg chair cushion',
  'giant floor pillow','oversized floor cushion','reading cushion',
  'knitted blanket pattern','chunky knit pattern','arm knitting',
  'weaving wall hanging kit','tapestry loom kit','frame loom',
  'macrame supply kit','macrame cord bulk','jute twine bulk',

  // ── WOODWORKING DEEP DIVE ───────────────────────────────────────────────
  'end grain cutting board','walnut cutting board','maple cutting board',
  'cherry wood cutting board','bamboo cutting board set','wood board set',
  'personalized-free charcuterie board','slate cheese board','marble cheese board',
  'tiered serving board','oval serving board','large serving platter',
  'wood serving bowl','salad bowl set','bread bowl',
  'wooden fruit bowl','centerpiece bowl','dough bowl',
  'turned wood vase','carved wood vase','driftwood vase',
  'wood sculpture','carved sculpture','driftwood art',
  'driftwood decor','sea glass decor','natural wood decor',
  'wood wall clock','oversized clock','farmhouse clock',
  'mantle clock','bracket clock','chiming clock',
  'wooden jewelry box','earring organizer','ring holder',
  'watch box','cufflink box','valet tray',
  'wooden cigar box','humidor','smoking accessories',
  'wooden game set','chess set walnut','backgammon set',
  'dominoes set','cribbage board','card game box',
  'rolling pin set','wooden spoon set','spatula set',
  'wooden knife block','magnetic knife strip','knife organizer',
  'wooden recipe box','index card box','recipe card holder',
  'wooden phone dock','charging station wood','desk organizer wood',
  'pen holder wood','pencil cup wood','desk accessories set',
  'wood picture frame','rustic frame set','shadow box frame',
  'wood letter board','wood memo board','wood calendar',
  'memory box wood','baby keepsake box','time capsule box',
  'wooden urn','cremation urn wood','memorial box',
  'wooden toy box','toy chest','kids storage box',
  'wine box','whiskey box','gift box wood',
  'crate set','wooden crate','storage crate',
  'wooden stool','step stool','bar stool wood',
  'plant stool','side stool','accent stool',
  'log slice table','tree stump table','tree slice decor',
  'epoxy table','resin table top','live edge resin',
  'epoxy river table','resin art table','geode table',

  // ── OUTDOOR & GARDEN DEEP DIVE ──────────────────────────────────────────
  'outdoor metal art','rusty metal art','corten steel art',
  'steel garden sculpture','bronze garden statue','garden gnome set',
  'garden plaque','yard sign','metal yard art',
  'wind spinner large','kinetic sculpture','yard spinner',
  'wind chime large','garden bell','gazing ball',
  'solar garden light','outdoor solar decor','pathway lights',
  'garden torch','tiki torch','fire torch',
  'outdoor fire pit bowl','chiminea cast iron','fire bowl',
  'propane fire pit','tabletop fire pit','indoor fire pit',
  'outdoor planter large','garden urn','terracotta urn',
  'window box planter','hanging basket','coconut coir basket',
  'raised planter box','garden bed kit','cedar raised bed',
  'vertical garden planter','wall mounted planter','pallet planter',
  'bird bath stone','concrete bird bath','ceramic bird bath',
  'garden fountain small','tabletop fountain','zen fountain',
  'rain chain','downspout garden','water feature',
  'garden arch','metal arch trellis','rose arch',
  'obelisk trellis','pyramid trellis','climbing plant tower',
  'garden bench stone','concrete garden bench','mosaic bench',
  'adirondack chair','rocking chair outdoor','swing set adult',
  'hammock stand free standing','portable hammock stand','tree strap hammock',
  'outdoor throw pillow','patio cushion set','outdoor rug set',
  'patio umbrella','cantilever umbrella','offset umbrella',
  'fairy garden kit','miniature house','miniature accessories',
  'stepping stone molds','concrete molds','garden art project',

  // ── ART & COLLECTIBLES DEEP DIVE ────────────────────────────────────────
  'abstract oil painting large','contemporary painting','modern art original',
  'abstract canvas print','gallery canvas','large format print',
  'photographic print large','fine art print','museum quality print',
  'limited edition print','art print signed','numbered print',
  'sculpture abstract','abstract metal sculpture','kinetic mobile',
  'paper sculpture','origami art','paper art installation',
  'wire sculpture','wire art','metal wire figure',
  'ceramic abstract sculpture','clay art piece','fired clay sculpture',
  'wood sculpture abstract','carved wood art','jigsaw sculpture',
  'glass art piece','fused glass panel','glass mosaic art',
  'stained glass window panel','leaded glass panel','sun catcher large',
  'resin art panel','geode resin art','resin pour art',
  'fluid art canvas','pour painting','acrylic pour art',
  'encaustic wax art','wax painting','hot wax art',
  'mixed media art','assemblage art','found object art',
  'fiber art piece','textile art','woven art',
  'printmaking original','screen print art','linocut print',
  'woodblock print','etching print','mezzotint',
  'watercolor original','gouache painting','ink drawing',
  'pen and ink art','stippling art','crosshatch drawing',
  'charcoal drawing','pastel drawing','conte drawing',
  'botanical illustration','scientific illustration','nature illustration',
  'vintage art reproduction','reproduction print','facsimile print',

  // ── MUSICAL INSTRUMENTS DEEP DIVE ───────────────────────────────────────
  'steel tongue drum large','tongue drum 15 notes','drum with mallets',
  'tongue drum steel set','handpan alternative','rav vast drum',
  'hang drum alternative','tongue drum beginner','drum meditation',
  'kalimba 17 key','thumb piano 17 key','kalimba with case',
  'kalimba mahogany','kalimba oak','electric kalimba',
  'kalimba with pickup','kalimba accessories','kalimba tuning',
  'djembe drum large','djembe beginner','african drum',
  'conga drums','bongo drum set','hand drum',
  'frame drum','shamanic drum','native drum',
  'rain drum','ocean drum','wave drum',
  'ukulele concert','ukulele soprano','ukulele baritone',
  'ukulele solid wood','mahogany ukulele','koa ukulele',
  'ukulele bundle','ukulele beginner kit','ukulele with case',
  'harp lap','lever harp','celtic harp',
  'harp beginner','small harp 15 string','zither harp',
  'dulcimer mountain','hammered dulcimer','lap dulcimer',
  'autoharp','chromaharp','accordion small',
  'harmonica set','blues harmonica','chromatic harmonica',
  'ocarina pendant','double ocarina','bass ocarina',
  'wooden flute','native flute','pan flute',
  'singing bowl set complete','tibetan bowl set','crystal bowl set',
  'chakra singing bowl','bronze singing bowl','antique singing bowl',
  'tingsha bells','tibetan tingsha','meditation bell',
  'wind chime metal','solfeggio wind chime','tuned wind chime',
  'angel chime','carousel chime','spinning chime',

  // ── BATH & BEAUTY DEEP DIVE ─────────────────────────────────────────────
  'luxury bath set gift','spa basket set','wellness gift set',
  'aromatherapy gift set','essential oil set premium','diffuser oil set',
  'ultrasonic diffuser','large diffuser','car diffuser set',
  'perfume solid','natural perfume roll on','botanical perfume',
  'crystal perfume bottle','perfume atomizer','perfume decanter',
  'handmade soap bar set','artisan soap set','cold process soap',
  'goat milk soap set','honey soap','shea butter soap',
  'charcoal soap','clay soap','coffee scrub soap',
  'bath salts set','dead sea salt bath','mineral bath soak',
  'bath bomb gift set','luxury bath bomb','fizzy bath tablet',
  'shower steamers set','shower bombs aromatherapy','shower melts',
  'body scrub set','sugar scrub set','salt scrub set',
  'coffee body scrub','brown sugar scrub','coconut sugar scrub',
  'body butter set','whipped body butter','shea body butter',
  'face serum set','vitamin c serum','hyaluronic serum',
  'face oil natural','rosehip face oil','argan face oil',
  'clay mask set','bentonite clay mask','kaolin clay mask',
  'hair oil set','scalp serum','hair growth oil',
  'massage candle set','lotion candle','body butter candle',
  'beeswax lip balm set','natural lip care','tinted lip balm',
  'face roller set','jade roller','gua sha set',
  'dry brush set','body brush','exfoliating mitt',
  'loofah natural set','bath sponge set','sea sponge',
  'bamboo bath accessories','wooden bath accessories','bath tray bamboo',

  // ── SPIRITUAL & METAPHYSICAL DEEP DIVE ──────────────────────────────────
  'tarot card deck premium','luxury tarot deck','illustrated tarot',
  'rider waite tarot','marseille tarot','thoth tarot',
  'oracle card deck premium','oracle cards illustrated','angel oracle',
  'lenormand deck','kipper deck','playing card oracle',
  'tarot cloth altar','reading cloth','pendulum board',
  'pendulum set crystals','crystal pendulum','dowsing pendulum',
  'smudge kit complete','sage bundle set','palo santo bundle',
  'white sage bundle','black sage bundle','cedar smudge',
  'altar kit complete','ritual kit','spell kit',
  'candle magic kit','ritual candle set','beeswax taper candles',
  'incense cone set','incense stick set','nag champa',
  'incense holder backflow','waterfall incense burner','ash catcher',
  'moon phase decor','lunar calendar art','moon phase wall art',
  'moon phase shelf','crescent moon shelf','moon shelves',
  'witchcraft supply kit','witchcraft starter kit','herb kit magic',
  'dried herb set magical','apothecary jar set','potion bottles',
  'resin molds set','epoxy resin kit','crystal resin kit',
  'mushroom decor set','forest decor','woodland decor',
  'fairy decor set','fantasy decor','cottage witch decor',
  'evil eye decor','hamsa decor','protection symbols',
  'rune set','elder futhark runes','runic alphabet set',
  'ogham staves','bone runes','crystal runes',
  'I ching coins','divination set','scrying mirror',
  'black mirror scrying','obsidian mirror','magic mirror',
  'ouija board premium','spirit board','talking board',
  'astrology wheel print','birth chart print','natal chart art',
  'zodiac print set','constellation map','star chart',

  // ── VINTAGE & ANTIQUE DEEP DIVE ─────────────────────────────────────────
  'vintage jewelry lot','estate jewelry bundle','vintage brooch collection',
  'vintage rhinestone jewelry','vintage cameo brooch','vintage locket',
  'art nouveau jewelry','art deco necklace','edwardian jewelry',
  'victorian brooch','georgian jewelry','georgian ring',
  'vintage wristwatch','vintage mens watch','vintage ladies watch',
  'pocket watch working','railroad watch','dress watch vintage',
  'vintage camera film','vintage rangefinder','vintage slr',
  'polaroid camera vintage','pinhole camera','toy camera',
  'vintage binoculars','opera glasses','vintage telescope',
  'antique compass','navigation instruments','sextant',
  'vintage map framed','antique atlas','old world map',
  'vintage botanical print','antique botanical','naturalist print',
  'vintage science diagram','anatomy print vintage','biology diagram',
  'vintage travel poster','retro airline poster','railway poster',
  'vintage advertising sign','tin sign retro','enamel sign',
  'vintage book collection','leather bound classics','antiquarian books',
  'vintage record album','vinyl LP collection','rare record',
  'vintage toy collection','tin toy vintage','mechanical toy',
  'vintage kitchen items','enamelware set','graniteware',
  'vintage copper pot','brass cookware','cast iron antique',
  'vintage lamp oil','hurricane lamp','kerosene lamp',
  'vintage textile','antique quilt','vintage embroidery',
  'vintage fabric bolt','kimono vintage','haori jacket vintage',
  'vintage military','vintage badge','vintage medal',
  'vintage coin lot','silver coin','gold coin vintage',

  // ── LEATHER GOODS DEEP DIVE ─────────────────────────────────────────────
  'genuine leather bag','full grain leather bag','top grain leather',
  'vegetable tanned leather','leather messenger bag','satchel bag leather',
  'leather weekend bag','leather duffle','travel bag leather',
  'leather laptop sleeve','leather laptop case','leather portfolio',
  'leather notebook cover','leather journal cover','refillable journal',
  'leather field notes cover','leather passport wallet','travel wallet',
  'leather card wallet','slim card holder','leather bifold slim',
  'leather trifold wallet','leather zip wallet','coin purse leather',
  'leather camera bag','camera case leather','vintage camera bag',
  'leather guitar strap','leather banjo strap','instrument strap',
  'leather apron woodworking','leather tool apron','leather work apron',
  'leather tool pouch','leather tool roll','tool wrap leather',
  'leather belt handmade','western belt leather','carved leather belt',
  'leather cuff bracelet','leather wrap bracelet','leather bead bracelet',
  'leather ankle bracelet','leather wristband','leather medical id',
  'leather dog collar wide','leather harness dog','leather leash',
  'leather key fob','keychain leather','key wallet leather',
  'leather phone wallet case','leather sleeve phone','flip case leather',
  'leather watch strap handmade','nato strap leather','horween leather',
  'leather planner cover','leather agenda','leather binder',
  'leather wine carrier','leather bottle holder','flask leather',
  'leather coaster set','leather desk mat','leather mouse pad',
  'leather cord organizer','cable tidy leather','leather cable wrap',

  // ── PET PRODUCTS DEEP DIVE ──────────────────────────────────────────────
  'cat tree large','cat tower tall','cat climbing tree',
  'cat condo multi level','cat wall shelf set','cat perch set',
  'cat bed cave','cat igloo','cat pod bed',
  'heated cat bed','orthopedic cat bed','window cat bed',
  'cat hammock window','cat shelf wall mount','floating cat shelf',
  'cat tunnel set','cat tunnel bag','collapsible tunnel',
  'interactive cat toy set','puzzle feeder cat','slow feeder cat',
  'cat wand set','feather wand','laser cat toy',
  'dog bed orthopedic','dog sofa bed','dog bolster bed',
  'luxury dog bed','elevated dog bed','cooling dog bed',
  'dog crate furniture','wooden dog crate','dog kennel indoor',
  'dog steps large','pet stairs foam','dog ramp car',
  'dog carrier bag','pet travel bag','airline approved carrier',
  'dog life jacket','dog floatation','water rescue dog',
  'leather dog collar','wide dog collar','martingale collar',
  'no pull harness','front clip harness','step in harness',
  'leather dog leash','braided leash','hands free leash',
  'bird cage large','bird aviary','bird flight cage',
  'rabbit hutch outdoor','guinea pig run','large enclosure',
  'aquarium decor set','planted aquarium','terrarium vivarium',
  'reptile habitat','gecko setup','snake terrarium',
  'hamster cage large','rat cage multi level','gerbil habitat',
  'fish tank decoration','coral reef decor','driftwood aquarium',

  // ── TECH & DESK ACCESSORIES DEEP DIVE ───────────────────────────────────
  'mechanical keyboard 65%','mechanical keyboard 75%','mechanical keyboard tenkeyless',
  'keyboard case aluminum','keyboard case wood','split keyboard',
  'ergonomic keyboard','wireless mechanical keyboard','bluetooth keyboard',
  'artisan keycap set','keycap set custom','gmk keycaps',
  'keyboard wrist rest leather','wrist rest wood','wrist pad desk',
  'desk pad leather large','desk blotter leather','executive desk pad',
  'monitor riser wood','monitor stand bamboo','dual monitor stand',
  'laptop riser foldable','adjustable laptop stand','cooling laptop stand',
  'desk lamp architect','swing arm desk lamp','drafting lamp',
  'wireless charging desk','charging pad wood','multi device charger',
  'desk organizer leather','inbox tray leather','document holder',
  'bookend set decorative','marble bookends','concrete bookends',
  'pen cup leather','pencil holder ceramic','desk vase',
  'business card holder','card holder desk','memo clip',
  'magnetic board','corkboard frame','pegboard organizer',
  'cable management box','cable raceway','desk grommet',
  'monitor light bar','screen light','clip on monitor light',
  'webcam cover privacy','screen privacy filter','anti glare filter',
  'headphone stand wood','headphone hanger','headset holder',
  'microphone stand desk','mic arm','boom arm',
  'speaker stand desktop','monitor speaker stand','bookshelf speaker stand',
  'gaming chair mat','chair mat hardwood','floor mat office',

  // ── PLANTS, TERRARIUMS & BOTANICAL ──────────────────────────────────────
  'terrarium kit complete','bioactive terrarium','vivarium kit',
  'planted terrarium glass','geometric glass terrarium large','dome terrarium',
  'open terrarium glass','wardian case','bottle garden',
  'kokedama set','moss ball plant','string garden hanging',
  'mounted staghorn fern','mounted tropical fern','fern mount board',
  'airplant display wall','airplant frame','tillandsia frame',
  'succulent arrangement large','cactus garden bowl','desert garden',
  'bonsai tree juniper','bonsai tree ficus','tropical bonsai',
  'bonsai starter kit complete','bonsai tools set','bonsai wire set',
  'mushroom grow kit gourmet','oyster mushroom kit','shiitake kit',
  'lion mane mushroom kit','pink oyster mushroom','blue oyster kit',
  'herb garden kit indoor','windowsill herb kit','countertop garden',
  'microgreens kit','sprout kit','hydroponic herb kit',
  'aerogarden pods','hydroponic pods','grow light plant',
  'dried flower bouquet large','dried pampas grass','dried botanicals',
  'preserved moss wall art','moss frame','living moss art',
  'dried flower wreath large','eucalyptus wreath','lavender wreath',
  'preserved rose arrangement','forever roses','eternal rose box',
  'flower pressing kit','botanical pressing','flower art kit',
  'seed collection rare','heirloom seed set','flower seed collection',
  'grow bag set','fabric pot set','self watering planter',

  // ── CRAFT & ART SUPPLIES DEEP DIVE ──────────────────────────────────────
  'professional watercolor set','artist grade watercolor','winsor newton set',
  'oil paint set professional','linen canvas set','canvas board set',
  'acrylic paint set professional','heavy body acrylic','fluid acrylic set',
  'professional brush set','kolinsky sable brush','watercolor brush set',
  'easel studio','french easel','table top easel',
  'sketch set professional','drawing set artist','charcoal set',
  'pastels set professional','soft pastels set','oil pastels set',
  'colored pencil set premium','watercolor pencil set','mechanical pencil set',
  'ink set premium','india ink','sumi ink',
  'calligraphy set premium','pointed pen set','broad nib set',
  'linocut kit professional','printmaking set','carving tools',
  'screen printing kit','silkscreen kit','squeegee set',
  'leather craft kit premium','saddle stitch kit','leather punch set',
  'bookbinding kit','coptic stitch kit','book repair kit',
  'glass mosaic kit','tile mosaic kit','stained glass kit starter',
  'fusing glass kit','glass kiln accessories','dichroic glass',
  'resin art kit complete','casting resin kit','uv resin kit',
  'metal clay kit','silver clay kit','PMC kit',
  'enameling kit','cloisonne kit','champlevé kit',
  'wire jewelry kit','jewelry wire set','wire wrapping kit',
  'polymer clay set premium','fimo set','sculpey set',
  'air dry clay set','creative paperclay','self hardening clay',
  'wood burning kit premium','pyrography kit','wood burning tips set',
  'carving tool set','whittling kit','chip carving set',
  'weaving loom set','rigid heddle loom','tapestry loom',
  'embroidery hoop set','counted cross stitch kit','needlepoint canvas',
  'macrame kit beginner','macrame wall hanging kit','macrame starter',
  'knitting needle set circular','interchangeable needle set','bamboo needles',
  'crochet hook set ergonomic','tunisian crochet set','knooking set',
  'felting kit needle','wet felting kit','felting wool set',

  // ── KITCHEN & DINING HIGH END ───────────────────────────────────────────
  'cast iron skillet set','cast iron cookware set','dutch oven cast iron',
  'carbon steel pan','carbon steel wok','seasoned wok',
  'copper pot set','copper cookware','copper mixing bowl',
  'ceramic cookware set','clay pot cooking','tagine pot',
  'mortar and pestle large','granite mortar','marble mortar',
  'wooden mortar pestle','herb grinder wooden','spice grinder',
  'chef knife set premium','japanese knife set','santoku knife',
  'bread knife premium','boning knife','filleting knife',
  'sharpening stone set','whetstone kit','honing rod',
  'knife roll chef','knife bag','knife block magnetic',
  'cast iron teapot','japanese teapot','tetsubin teapot',
  'matcha ceremony set','matcha bowl whisk set','matcha gift set',
  'coffee grinder hand','ceramic coffee dripper','pour over set',
  'french press large','aeropress kit','moka pot',
  'wine decanter set','crystal decanter','whiskey decanter',
  'bar tool set premium','cocktail kit','mixology set',
  'cocktail shaker premium','copper muddler','bar spoon',
  'ice bucket premium','champagne bucket','wine chiller',
  'cheese board set premium','marble cheese board','slate board set',
  'olive wood board','acacia wood board','live edge serving',
  'bread basket wicker','bread box wood','bread bin',
  'fruit basket large','wire fruit bowl','hanging fruit basket',
  'spice rack wall mounted','magnetic spice rack','spice drawer organizer',
  'kitchen scale professional','digital scale premium','analog scale',
  'apron linen','chef apron','baking apron',
  'oven mitt set premium','silicone oven gloves','pot holder set',

  // ── WELLNESS & FITNESS ──────────────────────────────────────────────────
  'yoga mat premium thick','natural rubber yoga mat','cork yoga mat',
  'yoga block set cork','yoga strap set','yoga wheel',
  'yoga bolster','meditation cushion set','zafu zabuton set',
  'meditation bench','kneeling bench','prayer bench',
  'foam roller set','massage roller','trigger point roller',
  'massage ball set','lacrosse ball set','spiky ball set',
  'resistance band set premium','exercise band set','loop band set',
  'acupressure mat set','reflexology mat','foot massager',
  'eye mask premium','silk eye mask','weighted eye mask',
  'sauna blanket','infrared sauna','portable sauna',
  'cold plunge tub','ice bath','contrast therapy',
  'neti pot set','nasal rinse','sinus kit',
  'tongue scraper set','oil pulling kit','oral hygiene set',
  'crystal water bottle','gemstone infused bottle','healing water bottle',
  'copper water bottle','ayurvedic bottle','copper tumbler',
  'balance board','wobble board','proprioception board',
  'inversion table','back stretcher','lumbar support',
  'acupuncture needle set','dry needling','cupping set',
  'gua sha board large','facial roller set','body sculpting tool',

  // ── HOME DECOR OBJECTS ───────────────────────────────────────────────────
  'decorative bowl large','centerpiece bowl wood','serving bowl display',
  'decorative tray set','bar tray marble','ottoman tray',
  'decorative objects set','vignette set','shelf decor set',
  'bookend decorative set','marble bookends set','geode bookends',
  'hourglass decor','sand timer large','decorative hourglass',
  'snow globe large','custom snow globe','water globe',
  'decorative lantern set','hurricane lantern','pillar candle lantern',
  'candle holder set','pillar candle holder','taper candle holder',
  'candelabra set','candelabra vintage','iron candelabra',
  'votive holder set','tealight holder set','glass tealight',
  'diffuser bottle set','reed diffuser premium','room spray set',
  'wax melt burner','soy wax melt set','aroma melt set',
  'bookmarker set premium','leather bookmark','brass bookmark',
  'paperweight set','glass paperweight','marble paperweight',
  'magnifying glass decorative','desktop magnifier','brass magnifier',
  'globe decorative','vintage globe','antique globe',
  'compass rose decor','vintage compass set','navigational decor',
  'anatomical heart','skull decor','skeleton decor',
  'taxidermy inspired','natural history decor','cabinet of curiosities',
  'bone decor','feather collection','shell collection',
  'diorama box','scene in glass','bottle art',
  'sand art bottle','kinetic sand art','balancing sculpture',
  'geometric sculpture','abstract object','modern sculpture',
  'wire art figure','shadow puppet set','silhouette art',

  // ── WEDDING & EVENT DECOR NON-PERSONALIZED ───────────────────────────────
  'wedding arch backdrop stand','metal arch wedding','gold arch frame',
  'geometric arch frame','triangle arch','hexagon arch',
  'freestanding backdrop frame','pipe and drape frame','backdrop stand set',
  'wedding ceiling draping','fairy light backdrop','curtain backdrop',
  'photo booth props set','photo booth backdrop','photo booth frame',
  'wedding table decor set','centerpiece supplies','floral foam',
  'wedding canopy frame','chuppah frame','pergola frame',
  'wedding aisle decor','pew cone','ceremony flowers',
  'wedding ceremony chair','chiavari chair decoration','chair sash set',
  'wedding runner aisle','petal runner','artificial petal',
  'artificial flower garland','silk flower garland','greenery garland',
  'eucalyptus garland','faux greenery','artificial eucalyptus',
  'wedding balloon arch kit','balloon garland kit','balloon backdrop',
  'wedding signage stand','easel sign holder','frame sign holder',
  'table number holder set','place card holder set','escort card',
  'wedding card box','gift card box','envelope box',
  'sweetheart table decor','head table backdrop','sweetheart backdrop',
  'seating chart frame','wedding chart display','acrylic seating chart',
  'wedding flower wall frame','flower wall backdrop','panel frame',
  'wedding pedestal set','display pedestal','column set',

  // ── SEASONAL & HOLIDAY NON-PERSONALIZED ─────────────────────────────────
  'advent calendar box set','countdown calendar','chocolate advent',
  'christmas village set','department 56','ceramic village',
  'nutcracker set','large nutcracker','decorative nutcracker',
  'christmas wreath large','premium wreath','magnolia wreath',
  'christmas garland premium','mantle garland','staircase garland',
  'christmas tree topper premium','star topper','angel topper',
  'christmas tree skirt premium','velvet tree skirt','plaid tree skirt',
  'ornament set premium','glass ornament collection','hand blown ornaments',
  'christmas stocking set','velvet stocking','knit stocking',
  'christmas candle set','pillar candle holiday','advent pillar candles',
  'halloween decoration set','haunted house decor','gothic decor',
  'skull decoration set','pumpkin set decorative','cauldron decor',
  'halloween wreath','black wreath','gothic wreath',
  'easter decoration set','spring wreath','easter basket filler',
  'passover seder set','hannukah menorah','menorah set',
  'thanksgiving decor','harvest decor','fall wreath',
  'valentines arrangement','heart decor set','rose arrangement',
  'st patricks day decor','irish decor','shamrock set',
];

async function getAuthToken() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('alura.io'));
  if (!page) { page = await context.newPage(); await page.setViewportSize({ width: 1920, height: 1080 }); }
  let token = null;
  page.on('request', req => { if (req.url().includes('alura-api') && req.headers()['authorization']) token = req.headers()['authorization']; });
  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);
  await browser.close();
  return token;
}

function apiGet(token, keyword) {
  return new Promise((resolve, reject) => {
    const path = `/api/v3/keywords/${encodeURIComponent(keyword)}?language=en&forceUpdate=false&tool=keyword-finder-new&source=research-keyword`;
    const opts = {
      hostname: API_BASE, path, method: 'GET',
      headers: { 'Authorization': token, 'Accept': 'application/json', 'Origin': 'https://app.alura.io', 'Referer': 'https://app.alura.io/research/keyword', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, raw: d.substring(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function extractFull(r, kw) {
  if (!r || typeof r !== 'object') return null;
  return {
    keyword: r.keyword || kw,
    google_volume: r.google_volume_mo || null,
    google_change_qr: parseFloat(r.google_change_qr) || 0,
    google_change_yr: parseFloat(r.google_change_yr) || 0,
    etsy_volume: r.etsy_volume_mo || null,
    etsy_change_qr: parseFloat(r.etsy_change_qr) || 0,
    etsy_change_yr: parseFloat(r.etsy_change_yr) || 0,
    competing_listings: r.competing_listings || null,
    competition_level: r.competition_level || null,
    keyword_score: r.keyword_score || null,
    avg_price_usd: (r.avg_prices && r.avg_prices.USD) ? parseFloat(r.avg_prices.USD) : null,
    total_sales: r.sales ? parseInt(r.sales) : null,
    avg_sales_per_listing: r.avg_sales ? parseFloat(r.avg_sales) : null,
    total_revenue: r.revenue ? parseFloat(r.revenue) : null,
    avg_revenue_per_listing: r.avg_revenue ? parseFloat(r.avg_revenue) : null,
    avg_conversion: r.avg_conversion_rate || null,
    avg_views: r.avg_views ? parseInt(r.avg_views) : null,
    avg_lqs: r.avg_lqs ? parseFloat(r.avg_lqs) : null,
    avg_review_score: r.avg_review_score ? parseFloat(r.avg_review_score) : null,
    avg_listing_age_days: r.avg_listing_age ? parseInt(r.avg_listing_age) : null,
    avg_google_cpc: r.avg_google_cpc || null,
    etsy_trend_6mo: r.etsy_volumes ? r.etsy_volumes.slice(-6).map(v => ({ month: v.month, year: v.year, searches: v.monthlySearches })) : null,
    source: 'alura'
  };
}

async function main() {
  console.log('🏃 MARATHON SCRAPER STARTED');
  console.log(`📊 ${MARATHON_KEYWORDS.length} keywords queued\n`);

  let token = null;
  try {
    token = fs.readFileSync('C:\\Windows\\Temp\\alura_token.txt', 'utf8').trim();
    console.log('✅ Token loaded');
  } catch(e) {}
  if (!token) {
    console.log('🔑 Getting token from browser...');
    token = await getAuthToken();
    if (token) fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8');
  }
  if (!token) { console.log('❌ No token!'); process.exit(1); }

  const db = new Client(DB);
  await db.connect();
  console.log('✅ DB connected\n');

  // Filter already scraped (today)
  const done = await db.query("SELECT keyword FROM research_keywords_raw WHERE source='alura'");
  const alreadyDone = new Set(done.rows.map(r => r.keyword.toLowerCase()));
  const toScrape = MARATHON_KEYWORDS.filter(kw => !alreadyDone.has(kw.toLowerCase()));
  console.log(`📦 ${alreadyDone.size} already in DB, ${toScrape.length} new to scrape\n`);

  const results = [];
  let success = 0, failed = 0, tokenRefreshes = 0;
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < toScrape.length; i += BATCH_SIZE) batches.push(toScrape.slice(i, i + BATCH_SIZE));

  const startTime = Date.now();
  let lastTokenRefresh = Date.now();

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pct = ((bi / batches.length) * 100).toFixed(1);
    const elapsed = Math.round((Date.now() - startTime) / 60000);
    console.log(`[${pct}%] Batch ${bi+1}/${batches.length} | ${success} done | ${elapsed}m elapsed | ${batch.join(', ')}`);

    // Auto-refresh token every 45 minutes
    if (Date.now() - lastTokenRefresh > 45 * 60 * 1000) {
      console.log('🔄 Auto-refreshing token (45min)...');
      try {
        const newToken = await getAuthToken();
        if (newToken) { token = newToken; fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8'); tokenRefreshes++; lastTokenRefresh = Date.now(); console.log('✅ Token refreshed'); }
      } catch(e) { console.log('⚠️ Token refresh failed:', e.message); }
    }

    const batchResults = await Promise.all(batch.map(async kw => {
      try {
        const res = await apiGet(token, kw);
        if (res.status === 200 && res.data && (res.data.results || res.data.result)) {
          if (!res.data.results && res.data.result) res.data.results = res.data.result;
          const r = res.data.results;
          if (!r || !r.keyword_score) return { success: false, error: 'empty_results', kw };
          const item = extractFull(r, kw);
          return { success: true, item };
        } else if (res.status === 429) {
          return { success: false, error: 'rate_limited', kw };
        } else if (res.status === 401) {
          return { success: false, error: 'unauthorized', kw };
        } else {
          return { success: false, error: `status_${res.status}`, kw };
        }
      } catch(e) { return { success: false, error: e.message, kw }; }
    }));

    let needsRefresh = false;
    for (const br of batchResults) {
      if (br.success) {
        success++;
        results.push(br.item);
        const price = br.item.avg_price_usd ? '$' + Math.round(br.item.avg_price_usd) : '–';
        const etsy = br.item.etsy_volume ? br.item.etsy_volume.toLocaleString() : '–';
        const rev = br.item.avg_revenue_per_listing ? '$' + Math.round(br.item.avg_revenue_per_listing).toLocaleString() : '–';
        console.log(`  ✅ ${br.item.keyword.padEnd(35)} | s:${String(br.item.keyword_score||'').padStart(3)} | vol:${String(br.item.google_volume||'').padStart(7)} | comp:${String(br.item.competing_listings||'').padStart(7)} | price:${price.padStart(7)} | rev/listing:${rev}`);
        try {
          await db.query(`
            INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
            VALUES ($1, 'alura', $2::jsonb, NOW())
            ON CONFLICT (keyword, source, scraped_date) DO UPDATE SET data = $2::jsonb, scraped_at = NOW()
          `, [br.item.keyword, JSON.stringify(br.item)]);
        } catch(e) {}
      } else {
        failed++;
        if (br.error === 'rate_limited') {
          console.log('  ⏸️ Rate limited! Waiting 20s...');
          await new Promise(r => setTimeout(r, 20000));
        } else if (br.error === 'unauthorized') {
          needsRefresh = true;
        } else if (br.error !== 'empty_results') {
          console.log(`  ❌ ${br.kw}: ${br.error}`);
        }
      }
    }

    if (needsRefresh) {
      console.log('🔄 Token expired, refreshing...');
      try {
        const newToken = await getAuthToken();
        if (newToken) { token = newToken; fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8'); tokenRefreshes++; lastTokenRefresh = Date.now(); console.log('✅ Token refreshed'); }
      } catch(e) { console.log('❌ Refresh failed:', e.message); }
    }

    // Save progress every 25 batches
    if (bi % 25 === 24) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(results, null, 2), 'utf8');
      console.log(`\n💾 Progress saved: ${success} keywords, ${tokenRefreshes} token refreshes\n`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // Final save
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n\n✅ MARATHON DONE! ${success} success, ${failed} failed, ${tokenRefreshes} token refreshes`);
  console.log(`📁 Results: ${RESULTS_FILE}`);

  // TOP FINDINGS
  const withPrice = results.filter(r => r.avg_price_usd > 0).sort((a,b) => b.avg_price_usd - a.avg_price_usd);
  console.log('\n\n💰 TOP 30 HIGH-PRICE KEYWORDS:');
  console.log('Keyword'.padEnd(35) + ' | Price USD | Score | EtsyVol  | Competition | Rev/Listing');
  console.log('-'.repeat(120));
  withPrice.slice(0, 30).forEach(r => {
    const rev = r.avg_revenue_per_listing ? '$' + Math.round(r.avg_revenue_per_listing).toLocaleString() : '–';
    console.log(r.keyword.padEnd(35) + ' | $' + String(Math.round(r.avg_price_usd)).padStart(7) + ' | ' + String(r.keyword_score||'').padStart(5) + ' | ' + String(r.etsy_volume||r.google_volume||'').padStart(8) + ' | ' + String(r.competing_listings||'').padStart(11) + ' | ' + rev);
  });

  await db.end();
}

main().catch(e => { console.error('💥 Fatal:', e.message); process.exit(1); });
