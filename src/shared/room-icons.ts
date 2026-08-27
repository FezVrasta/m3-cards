// Guesses a Material icon from a room's (German/English) name — there's no
// area-icon precedent in this repo to reuse, and most users won't have set
// one explicitly in HA's area registry either.
//
// Shared by every card that groups entities into rooms (climate overview,
// occupancy), so a room called "Flur" gets the same door icon wherever it
// shows up rather than a different one per card.
const ROOM_ICON_RULES: Array<[RegExp, string]> = [
  [/wohnzimmer|living\s*room|lounge/i, "mdi:sofa"],
  [/schlafzimmer|bedroom/i, "mdi:bed"],
  [/kinderzimmer|nursery|kids?\s*room/i, "mdi:teddy-bear"],
  [/arbeitszimmer|b(ü|ue)ro|office|study/i, "mdi:desk"],
  [/k(ü|ue)che|kitchen/i, "mdi:silverware-fork-knife"],
  [/bad(ezimmer)?|bathroom/i, "mdi:bathtub"],
  [/g(ä|ae)ste-?wc|\bwc\b|toilette|toilet|\bklo\b/i, "mdi:toilet"],
  [/flur|diele|hallway|corridor|entrance/i, "mdi:door"],
  [/keller|basement|cellar/i, "mdi:home-floor-b"],
  [/dachboden|attic|loft/i, "mdi:home-roof"],
  [/garage/i, "mdi:garage"],
  [/garten|garden|outdoor|terrasse|balkon|balcony/i, "mdi:flower"],
  [/ess-?zimmer|dining/i, "mdi:table-furniture"],
];

export function guessRoomIcon(name: string): string {
  for (const [re, icon] of ROOM_ICON_RULES) {
    if (re.test(name)) return icon;
  }
  return "mdi:home-outline";
}
