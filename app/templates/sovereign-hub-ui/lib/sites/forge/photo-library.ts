/**
 * Curated free photographs for generated websites, grouped by topic.
 *
 * Each id and description was copied from Unsplash search pages filtered to
 * free licences (2026-10-14); Unsplash+ photos are excluded. The Unsplash
 * Licence allows commercial use without permission or attribution.
 * Used when no photo API key is configured, so a site about coffee gets
 * coffee photographs instead of ids a model remembers from training.
 * Not wired into generation yet: groundwork for the Malik Site Forge.
 */

export type CuratedPhoto = { id: string; topic: string; alt: string }

export const CURATED_PHOTOS: readonly CuratedPhoto[] = [
  { id: "photo-1598959652545-c0230cdbb01f", topic: "coffee-interior", alt: "brown wooden framed menu board" },
  { id: "photo-1464979681340-bdd28a61699e", topic: "coffee-interior", alt: "woman standing on food counter" },
  { id: "photo-1542181961-9590d0c79dab", topic: "coffee-interior", alt: "people sitting inside establishment" },
  { id: "photo-1565650839149-2c48a094196c", topic: "coffee-interior", alt: "round brown wooden tables beside black leather sofa" },
  { id: "photo-1551887196-72e32bfc7bf3", topic: "coffee-interior", alt: "a bar with lots of plants and hanging lights" },
  { id: "photo-1527512666523-bb0e4389d842", topic: "coffee-interior", alt: "woman sitting beside front desk of cafe" },
  { id: "photo-1469631423273-6995642a6a40", topic: "coffee-interior", alt: "a coffee shop with lots of coffee machines" },
  { id: "photo-1645677020082-721a854c24f2", topic: "coffee-interior", alt: "a coffee shop with a coffee machine and lights" },
  { id: "photo-1599579134411-bd068f77d4d9", topic: "coffee-interior", alt: "brown wooden table and chairs" },
  { id: "photo-1572982270699-473dfa34d7e7", topic: "coffee-interior", alt: "turned-on pendant lamp" },
  { id: "photo-1593443320739-77f74939d0da", topic: "latte", alt: "white ceramic cup with saucer on brown wooden table" },
  { id: "photo-1579265898841-79c7890d69cf", topic: "latte", alt: "man making coffee" },
  { id: "photo-1563311977-d285756282dc", topic: "latte", alt: "cappuccino" },
  { id: "photo-1596018589878-217d8603c4c6", topic: "latte", alt: "person pouring brown liquid on black ceramic mug" },
  { id: "photo-1650097364104-eef0e54af0da", topic: "latte", alt: "a cappuccino with a leaf design on it" },
  { id: "photo-1503240778100-fd245e17a273", topic: "latte", alt: "coffee on white ceramic mug" },
  { id: "photo-1550731358-491ded4af838", topic: "latte", alt: "person holding cup of cappuccino" },
  { id: "photo-1511920170033-f8396924c348", topic: "latte", alt: "flat lay photography of coffee latte, ground coffee, and coffee beans" },
  { id: "photo-1742549626436-bf3c11dab212", topic: "latte", alt: "Coffee latte art: a close-up view of a beverage" },
  { id: "photo-1507915135761-41a0a222c709", topic: "latte", alt: "person pouring cup of coffee in white ceramic cup" },
  { id: "photo-1507133750040-4a8f57021571", topic: "latte", alt: "high angle photo of two green mugs filled with coffee" },
  { id: "photo-1676277571294-f0bcdb8dc7c8", topic: "latte", alt: "a cappuccino with a leaf on top of it" },
  { id: "photo-1553292218-4892c2e7e1ae", topic: "barista", alt: "A person holding two portafilters filled with roasted coffee beans and ground coffee" },
  { id: "photo-1532713107108-dfb5d8d2fc42", topic: "barista", alt: "man pouring latte on coffee" },
  { id: "photo-1619860703338-9c70a1af6a63", topic: "barista", alt: "person pouring coffee on coffee cup" },
  { id: "photo-1515860734122-e0d771b36d3e", topic: "barista", alt: "man wearing blue shirt pouring coffee in his cup" },
  { id: "photo-1599549192669-6baac5d32432", topic: "barista", alt: "woman in yellow crew neck t-shirt holding stainless steel pitcher" },
  { id: "photo-1539021897569-06e9fa3c6bb9", topic: "barista", alt: "stainless steel espresso machine pouring on cup" },
  { id: "photo-1517701848373-805868efd0ac", topic: "barista", alt: "man in gray crew-neck T-shirt making cappuccino" },
  { id: "photo-1531441059801-fa3f5859e128", topic: "barista", alt: "person holding cup making latte art" },
  { id: "photo-1718791985055-e1b06ef5961d", topic: "barista", alt: "A man pouring a cup of coffee in a coffee shop" },
  { id: "photo-1447933601403-0c6688de566e", topic: "coffee-beans", alt: "coffee bean lot" },
  { id: "photo-1610632380989-680fe40816c6", topic: "coffee-beans", alt: "white ceramic teacup with coffee beans" },
  { id: "photo-1675306408031-a9aad9f23308", topic: "coffee-beans", alt: "A dense pile of roasted brown coffee beans filling the frame" },
  { id: "photo-1513530176992-0cf39c4cbed4", topic: "coffee-beans", alt: "brown coffee bean lot" },
  { id: "photo-1606791405792-1004f1718d0c", topic: "coffee-beans", alt: "Coffee beans, ground coffee, and a cup of black coffee on a white surface" },
  { id: "photo-1587734195503-904fca47e0e9", topic: "coffee-beans", alt: "brown coffee beans on white ceramic bowl" },
  { id: "photo-1497935586351-b67a49e012bf", topic: "coffee-beans", alt: "coffee beans beside coffee powder on brown wooden board" },
  { id: "photo-1625021659159-f63f546d74a7", topic: "coffee-beans", alt: "A white ceramic cup resting in a pile of roasted coffee beans" },
  { id: "photo-1524350876685-274059332603", topic: "coffee-beans", alt: "shallow focus photography of coffee beans in sack" },
  { id: "photo-1623334044303-241021148842", topic: "croissant", alt: "a bunch of croissants that are on a table" },
  { id: "photo-1691480162735-9b91238080f6", topic: "croissant", alt: "a croissant sitting on top of a white surface" },
  { id: "photo-1530610476181-d83430b64dcd", topic: "croissant", alt: "croissant on top of stainless steel tray" },
  { id: "photo-1555507036-ab1f4038808a", topic: "croissant", alt: "two brown croissants" },
  { id: "photo-1700915704616-b455b3679024", topic: "croissant", alt: "a pile of croissants sitting next to each other" },
  { id: "photo-1693483640461-267d788b6148", topic: "croissant", alt: "croissants on a baking sheet lined up in a row" },
  { id: "photo-1747459707229-7b1b7c8367e0", topic: "croissant", alt: "Freshly baked croissants on a baking sheet" },
  { id: "photo-1501721358449-1505ca840822", topic: "croissant", alt: "baked pastry on white ceramic saucer" },
  { id: "photo-1612366747681-e4ca6992b1e9", topic: "croissant", alt: "bread on brown wooden tray beside white ceramic mug" },
  { id: "photo-1567891026259-c133718572a4", topic: "croissant", alt: "shallow focus photography of breads" },
  { id: "photo-1461023058943-07fcbe16d735", topic: "iced-coffee", alt: "glass cup filled with ice latte on tabletop" },
  { id: "photo-1517701550927-30cf4ba1dba5", topic: "iced-coffee", alt: "clear glass filled ice coffee" },
  { id: "photo-1562447457-579fc34967fb", topic: "iced-coffee", alt: "Milk pouring into a glass of iced coffee on a wooden coaster" },
  { id: "photo-1592663527359-cf6642f54cff", topic: "iced-coffee", alt: "A hand pouring cream into a glass of iced coffee on a wooden board" },
  { id: "photo-1578314675249-a6910f80cc4e", topic: "iced-coffee", alt: "An iced coffee with a straw in a plastic cup on a dark surface" },
  { id: "photo-1527156231393-7023794f363c", topic: "iced-coffee", alt: "highball glass filled with iced coffee" },
  { id: "photo-1504753793650-d4a2b783c15e", topic: "iced-coffee", alt: "selective focus photography of milk pouring on shot glass" },
  { id: "photo-1524351199678-941a58a3df50", topic: "cheesecake", alt: "sliced of cake on black plate" },
  { id: "photo-1676300185983-d5f242babe34", topic: "cheesecake", alt: "a piece of cheesecake on a plate next to a cup of coffee" },
  { id: "photo-1708175313856-8573b2bf8a3a", topic: "cheesecake", alt: "a piece of cheesecake on a white plate" },
  { id: "photo-1695088957420-c3b97d1f1138", topic: "cheesecake", alt: "a piece of cheesecake with blueberries on a plate" },
  { id: "photo-1567171466295-4afa63d45416", topic: "cheesecake", alt: "sliced cake with berries on top" },
  { id: "photo-1578775887804-699de7086ff9", topic: "cheesecake", alt: "cheesecake with pink toppings" },
  { id: "photo-1547414368-ac947d00b91d", topic: "cheesecake", alt: "slice of caramel cake on black plate beside fork" },
  { id: "photo-1533134242443-d4fd215305ad", topic: "cheesecake", alt: "slice blueberry cheesecake pie on white ceramic plate" },
  { id: "photo-1567327613485-fbc7bf196198", topic: "cheesecake", alt: "blueberry cake on plate" },
  { id: "photo-1551632436-cbf8dd35adfa", topic: "restaurant-interior", alt: "woman in front on brown dining table and chairs inside building" },
  { id: "photo-1613274554329-70f997f5789f", topic: "restaurant-interior", alt: "white and brown dining table and chairs" },
  { id: "photo-1729394405518-eaf2a0203aa7", topic: "restaurant-interior", alt: "A restaurant with a lot of tables and chairs" },
  { id: "photo-1570560258879-af7f8e1447ac", topic: "restaurant-interior", alt: "people inside eatery" },
  { id: "photo-1538334421852-687c439c92f4", topic: "restaurant-interior", alt: "brown wooden tables and chairs inside building" },
  { id: "photo-1636405189493-181ecf851006", topic: "restaurant-interior", alt: "a restaurant with a tree in the middle of the room" },
  { id: "photo-1538333581680-29dd4752ddf2", topic: "restaurant-interior", alt: "empty chairs and tables inside room with lights turned on" },
  { id: "photo-1682778418768-16081e4470a1", topic: "restaurant-interior", alt: "a restaurant filled with wooden tables and chairs" },
  { id: "photo-1709548145082-04d0cde481d4", topic: "restaurant-interior", alt: "a dimly lit restaurant with tables and chairs" },
  { id: "photo-1552960226-639240203497", topic: "restaurant-interior", alt: "lighted lamps in room" },
  { id: "photo-1653259038915-7cf0b7a4dd6c", topic: "restaurant-interior", alt: "a dimly lit restaurant with a view of the city" },
  { id: "photo-1414235077428-338989a2e8c0", topic: "fine-dining", alt: "dish on white ceramic plate" },
  { id: "photo-1663530761401-15eefb544889", topic: "fine-dining", alt: "chef pouring sauce over plated steak" },
  { id: "photo-1467003909585-2f8a72700288", topic: "fine-dining", alt: "salmon fillet with salsa and red wine" },
  { id: "photo-1611520175743-30ff00129621", topic: "fine-dining", alt: "person holding stainless steel fork and knife slicing meat on black ceramic plate" },
  { id: "photo-1560053608-13721e0d69e8", topic: "fine-dining", alt: "restaurant close-up photography" },
  { id: "photo-1676471926534-d5c9771909fa", topic: "fine-dining", alt: "a white plate topped with fish and vegetables" },
  { id: "photo-1689672235501-6dc1e56d454c", topic: "fine-dining", alt: "a white plate topped with food next to a glass of wine" },
  { id: "photo-1616669944447-d65d41a222bd", topic: "fine-dining", alt: "cooked food on white ceramic plate" },
  { id: "photo-1574966739987-65e38db0f7ce", topic: "fine-dining", alt: "clear wine glasses on top of dining table" },
  { id: "photo-1484156818044-c040038b0719", topic: "fine-dining", alt: "focused photo of wine glasses lined on table" },
  { id: "photo-1643101570532-88c8ecc07c1f", topic: "fine-dining", alt: "a dining room table with place settings and wine glasses" },
  { id: "photo-1572715376701-98568319fd0b", topic: "chef", alt: "man standing front of plate with vegetable" },
  { id: "photo-1577219491135-ce391730fb2c", topic: "chef", alt: "man preparing food" },
  { id: "photo-1600565193348-f74bd3c7ccdf", topic: "chef", alt: "man in white chef uniform cooking" },
  { id: "photo-1681270543584-8e541a1bb056", topic: "chef", alt: "a person in a chef's uniform preparing food on a table" },
  { id: "photo-1622021142947-da7dedc7c39a", topic: "chef", alt: "A chef in a white coat chopping vegetables on a green board in a kitchen" },
  { id: "photo-1577219492769-b63a779fac28", topic: "chef", alt: "chef preparing foods" },
  { id: "photo-1577106263724-2c8e03bfe9cf", topic: "chef", alt: "person putting food on plate" },
  { id: "photo-1541614101331-1a5a3a194e92", topic: "chef", alt: "man cooking" },
  { id: "photo-1697898109582-40f15c65f174", topic: "chef", alt: "a man in a chef's hat holding a plate of food" },
  { id: "photo-1566554273541-37a9ca77b91f", topic: "chef", alt: "chef using knife front of bowl" },
  { id: "photo-1568901346375-23c9450c58cd", topic: "burger", alt: "burger with lettuce and tomatoes" },
  { id: "photo-1586190848861-99aa4a171e90", topic: "burger", alt: "burger with lettuce and tomato" },
  { id: "photo-1572802419224-296b0aeee0d9", topic: "burger", alt: "double patty cheeseburger" },
  { id: "photo-1550547660-d9450f859349", topic: "burger", alt: "burger with vegetable on brown wooden tray" },
  { id: "photo-1571091718767-18b5b1457add", topic: "burger", alt: "A cheeseburger with lettuce, tomato, and onion on a dark wooden surface" },
  { id: "photo-1607013251379-e6eecfffe234", topic: "burger", alt: "A double cheeseburger with pickles on a dark surface" },
  { id: "photo-1551782450-a2132b4ba21d", topic: "burger", alt: "hamburger by french fries on board" },
  { id: "photo-1565299507177-b0ac66763828", topic: "burger", alt: "burgers" },
  { id: "photo-1561758033-d89a9ad46330", topic: "burger", alt: "burger with fries" },
  { id: "photo-1460306855393-0410f61241c7", topic: "burger", alt: "selective focus photography of burger patty, mayonnaise, and French fries served on platter" },
]

export const CURATED_PHOTO_TOPICS = [...new Set(CURATED_PHOTOS.map((photo) => photo.topic))]

/** A CDN address sized for the slot it fills. */
export function curatedPhotoUrl(id: string, width = 1600, height?: number) {
  const size = height ? `&w=${width}&h=${height}&fit=crop` : `&w=${width}&fit=max`
  return `https://images.unsplash.com/${id}?auto=format&q=80${size}`
}

export function photosForTopic(topic: string) {
  return CURATED_PHOTOS.filter((photo) => photo.topic === topic)
}
