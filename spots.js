// Curated East Coast sunset hotspots, chosen for an unobstructed WESTERN horizon (water west of the viewer: sounds, bays, rivers, Gulf). "view" = the direction of open horizon toward sunset.
// arc = compass range of the open view toward sunset; obst = horizon obstruction in degrees (estimate); water = open water toward sunset.
window.SPOTS = [
  { id:"cadillac", name:"Cadillac Mountain", state:"ME", lat:44.3526, lng:-68.2245, type:"Summit", note:"1,530 ft granite summit in Acadia — sunset over Frenchman Bay islands and the western ridges.", arc:[200,320], obst:0.3, water:false },
  { id:"bassharbor", name:"Bass Harbor Head Light", state:"ME", lat:44.2219, lng:-68.3373, type:"Lighthouse", note:"Iconic cliffside light on Mount Desert Island; the rocks light up gold at golden hour.", arc:[180,280], obst:0.5, water:true },
  { id:"westprom", name:"Western Promenade", state:"ME", lat:43.6514, lng:-70.2770, type:"Bluff", note:"Portland's west-facing bluff with views toward the White Mountains on clear evenings.", arc:[240,320], obst:1.5, water:false },
  { id:"herring", name:"Herring Cove Beach", state:"MA", lat:42.0447, lng:-70.2175, type:"Beach", note:"Provincetown's classic — one of the few Cape beaches where the sun sets over the ocean.", arc:[200,300], obst:0, water:true },
  { id:"firstenc", name:"First Encounter Beach, Eastham (Cape Cod)", state:"MA", lat:41.8187, lng:-70.0040, type:"Beach", note:"Eastham bayside beach; huge tidal flats mirror the sky at low tide.", arc:[240,320], obst:0, water:true },
  { id:"menemsha", name:"Menemsha Beach", state:"MA", lat:41.3548, lng:-70.7663, type:"Harbor", note:"Martha's Vineyard fishing village where locals clap when the sun goes down.", arc:[240,320], obst:0, water:true },
  { id:"aquinnah", name:"Aquinnah Cliffs", state:"MA", lat:41.3489, lng:-70.8346, type:"Bluff", note:"Clay cliffs glow red and ochre; open view west over Vineyard Sound.", arc:[220,320], obst:0, water:true },
  { id:"beavertail", name:"Beavertail State Park", state:"RI", lat:41.4497, lng:-71.3994, type:"Bluff", note:"Rocky Jamestown point at the mouth of Narragansett Bay.", arc:[200,290], obst:1, water:true },
  { id:"montauk", name:"Montauk (Gin Beach / Point)", state:"NY", lat:41.0711, lng:-71.8573, type:"Lighthouse", note:"The far tip of Long Island; bayside beaches look west over Block Island Sound.", arc:[270,340], obst:0.5, water:true },
  { id:"pier45", name:"Pier 45, Hudson River Park (NYC)", state:"NY", lat:40.7331, lng:-74.0124, type:"Pier", note:"Manhattan's sunset pier — sun drops behind the Jersey skyline over the Hudson.", arc:[230,310], obst:2, water:true },
  { id:"bbpier1", name:"Brooklyn Bridge Park, Pier 1 (NYC)", state:"NY", lat:40.7010, lng:-73.9972, type:"Pier", note:"New York City harbor view — fall and winter suns set southwest over the Upper Bay past the Statue of Liberty, with Lower Manhattan lighting up to the right.", arc:[200,265], obst:1, water:true },
  { id:"capemay", name:"Sunset Beach, Cape May Point", state:"NJ", lat:38.9447, lng:-74.9702, type:"Beach", note:"Nightly flag ceremony; sun sets over Delaware Bay beside the concrete ship wreck.", arc:[220,300], obst:0, water:true },
  { id:"henlopen", name:"Cape Henlopen State Park", state:"DE", lat:38.7980, lng:-75.0925, type:"Beach", note:"Dunes and Delaware Bay views; Lewes harbor glows to the west.", arc:[250,330], obst:0, water:true },
  { id:"terrapin", name:"Terrapin Nature Park, Kent Island", state:"MD", lat:38.9866, lng:-76.3332, type:"Beach", note:"Eastern Shore beach looking west across the Chesapeake with the Bay Bridge in frame.", arc:[230,300], obst:0.5, water:true },
  { id:"annapolis", name:"Annapolis City Dock", state:"MD", lat:38.9766, lng:-76.4848, type:"Harbor", note:"Ego Alley sailboats with the sun dropping behind the historic skyline.", arc:[240,300], obst:2, water:true },
  { id:"assateague", name:"Assateague Island (bayside)", state:"MD", lat:38.2370, lng:-75.1430, type:"Marsh", note:"Wild ponies and marsh over Sinepuxent Bay.", arc:[240,300], obst:0.5, water:true },
  { id:"chincoteague", name:"Chincoteague Waterfront", state:"VA", lat:37.9337, lng:-75.3790, type:"Harbor", note:"West-facing town waterfront over Chincoteague Bay.", arc:[240,300], obst:0.5, water:true },
  { id:"capecharles", name:"Cape Charles Beach", state:"VA", lat:37.2671, lng:-76.0236, type:"Beach", note:"Rare west-facing Chesapeake beach — the sun sets straight over the Bay.", arc:[220,300], obst:0, water:true },
  { id:"fisherman", name:"Fisherman Island NWR", state:"VA", lat:37.0990, lng:-75.9785, type:"Marsh", note:"Southern tip of the Delmarva at the Chesapeake Bay Bridge-Tunnel — open bay water to the west. Refuge is closed except USFWS guided tours (roughly Oct–Mar); Kiptopeke State Park just north is the public fallback.", arc:[200,320], obst:0, water:true },
  { id:"yorktown", name:"Yorktown Riverwalk", state:"VA", lat:37.2364, lng:-76.5050, type:"Beach", note:"Sunset over the York River and the Coleman Bridge, a short drive from Hampton.", arc:[270,340], obst:1, water:true },
  { id:"huntington", name:"Huntington Park Beach", state:"VA", lat:37.0155, lng:-76.4552, type:"Beach", note:"Newport News beach on the James River with a wide-open western horizon — the closest top-tier sunset spot to Hampton.", arc:[200,280], obst:0, water:true },
  { id:"lionsbridge", name:"Lions Bridge, Newport News", state:"VA", lat:37.0415, lng:-76.4872, type:"Park", note:"Historic stone bridge at Mariners' Museum Park where Lake Maury meets the James River, with a wide view southwest across the James for sunset.", arc:[195,275], obst:0, water:true },
  { id:"jamestown", name:"Jamestown Beach", state:"VA", lat:37.2262, lng:-76.7897, type:"Beach", note:"Sandy James River beach facing southwest across miles of open water.", arc:[190,270], obst:0, water:true },
  { id:"oceanview", name:"Ocean View Beach", state:"VA", lat:36.9550, lng:-76.2500, type:"Beach", note:"Norfolk's bay beach; summer sunsets set over the water toward Hampton Roads.", arc:[280,340], obst:0.5, water:true },
  { id:"willoughby", name:"Willoughby Spit, Norfolk", state:"VA", lat:36.9671, lng:-76.2877, type:"Beach", note:"Norfolk's west-pointing sand spit — the sun drops over open Hampton Roads toward the HRBT and Fort Wool.", arc:[210,320], obst:0.5, water:true },
  { id:"hoffler", name:"Hoffler Creek Preserve, Portsmouth", state:"VA", lat:36.8953, lng:-76.4039, type:"Marsh", note:"Portsmouth's wild side — trails and an overlook where Hoffler Creek meets the James River / Hampton Roads, open water to the west-northwest. (Olde Towne seawall faces east — use it for sunrise.)", arc:[250,340], obst:1.5, water:true },
  { id:"bennettscreek", name:"Bennett's Creek Park, Suffolk", state:"VA", lat:36.8497, lng:-76.4804, type:"Waterfront", note:"Suffolk park and pier where Bennett's Creek meets the Nansemond River — looks west across the river toward Sleepy Hole Point.", arc:[230,320], obst:1, water:true },
  { id:"oldpoint", name:"Fort Monroe – Old Point Comfort", state:"VA", lat:37.0012, lng:-76.3070, type:"Waterfront", note:"Hampton's point at the mouth of Hampton Roads — fall sunsets drop southwest over open water toward the HRBT and Norfolk.", arc:[200,280], obst:0.5, water:true },
  { id:"wickham", name:"Wickham Lane, Hampton", state:"VA", lat:37.07004, lng:-76.30246, type:"Marsh", note:"Fox Hill / Clarkdale service road at the west end of Wickham Lane — looks west over the Harris River marsh toward open tidal water (best western horizon on the lane).", arc:[230,310], obst:1.5, water:true },
  { id:"lesner", name:"Chick's Beach / Lesner Bridge, Virginia Beach", state:"VA", lat:36.9086, lng:-76.0955, type:"Beach", note:"Virginia Beach's Chesapeake Bay side — looks west along the bay and Lynnhaven Inlet (the ocean side faces east).", arc:[260,330], obst:1, water:true },
  { id:"backbay", name:"Back Bay NWR – Bay Trail", state:"VA", lat:36.6692, lng:-75.9190, type:"Marsh", note:"Southern Virginia Beach boardwalk over Back Bay — wide, wild western water horizon.", arc:[220,310], obst:0.3, water:true },
  { id:"melrose", name:"Melrose Landing, Mattaponi River", state:"VA", lat:37.6373, lng:-76.8548, type:"Marsh", note:"Little Plymouth's river landing (end of Rt. 602) — sun sets west over the Mattaponi marshes. DWR lists it as a launch site; best from a kayak.", arc:[220,300], obst:0.5, water:true },
  { id:"duck", name:"Duck Boardwalk", state:"NC", lat:36.1693, lng:-75.7573, type:"Boardwalk", note:"Mile-long boardwalk on Currituck Sound, made for sunsets.", arc:[240,320], obst:0, water:true },
  { id:"jockeys", name:"Jockey's Ridge", state:"NC", lat:35.9640, lng:-75.6330, type:"Dunes", note:"Tallest East Coast sand dune; sunset over Roanoke Sound.", arc:[240,300], obst:0.5, water:true },
  { id:"avon", name:"Avon Harbor (soundside), Avon", state:"NC", lat:35.3528, lng:-75.5125, type:"Harbor", note:"Hatteras Island village harbor on Pamlico Sound — the ocean side faces east, so the sound side is where the sun sets over open water.", arc:[200,330], obst:0, water:true },
  { id:"buxton", name:"Canadian Hole (Haulover), Buxton", state:"NC", lat:35.2980, lng:-75.5145, type:"Beach", note:"Famous Buxton/Avon soundside windsurf beach — wide-open Pamlico Sound sunsets with kites and sails in silhouette.", arc:[200,330], obst:0, water:true },
  { id:"ocracoke", name:"Springer's Point, Ocracoke", state:"NC", lat:35.1040, lng:-75.9893, type:"Beach", note:"Live oaks and Pamlico Sound — remote and dark.", arc:[220,300], obst:0, water:true },
  { id:"sunsetbeach", name:"Sunset Beach", state:"NC", lat:33.8670, lng:-78.5106, type:"Beach", note:"Southernmost NC beach; west end faces the inlet at sunset.", arc:[200,260], obst:0.5, water:true },
  { id:"shemcreek", name:"Shem Creek", state:"SC", lat:32.7930, lng:-79.8785, type:"Harbor", note:"Shrimp boats, boardwalk and marsh glowing over Charleston Harbor.", arc:[230,290], obst:1.5, water:true },
  { id:"harbourtown", name:"Harbour Town Lighthouse", state:"SC", lat:32.1395, lng:-80.8122, type:"Lighthouse", note:"Hilton Head marina facing Calibogue Sound.", arc:[220,290], obst:0.5, water:true },
  { id:"tybee", name:"Tybee Back River", state:"GA", lat:31.9895, lng:-80.8532, type:"Beach", note:"Tybee's south-end river beach with marsh sunsets.", arc:[210,270], obst:1, water:true },
  { id:"stsimons", name:"St. Simons Pier", state:"GA", lat:31.1340, lng:-81.3960, type:"Pier", note:"Golden Isles pier looking across the sound toward Jekyll.", arc:[200,260], obst:0.5, water:true },
  { id:"fernandina", name:"Fernandina Harbor", state:"FL", lat:30.6718, lng:-81.4655, type:"Harbor", note:"Amelia River marina famed for west-facing sunsets.", arc:[240,300], obst:0.5, water:true },
  { id:"titusville", name:"Max Brewer Causeway", state:"FL", lat:28.6243, lng:-80.7928, type:"Waterfront", note:"Causeway over the Indian River Lagoon with open water west toward Titusville — rockets on launch nights.", arc:[240,300], obst:0.5, water:true },
  { id:"laketrail", name:"Lake Trail at Royal Park Bridge", state:"FL", lat:26.7057, lng:-80.0439, type:"Waterfront", note:"Palm Beach shore of Lake Worth Lagoon — sun sets behind the West Palm Beach skyline across the Intracoastal.", arc:[240,300], obst:2, water:true },
  { id:"miamibeach", name:"Maurice Gibb Park, Miami Beach", state:"FL", lat:25.7929, lng:-80.1448, type:"Waterfront", note:"Miami Beach's bayside — the ocean beach faces east, so sunset is over Biscayne Bay with the Miami skyline across the water.", arc:[220,300], obst:1.5, water:true },
  { id:"keywest", name:"Mallory Square", state:"FL", lat:24.5594, lng:-81.8079, type:"Pier", note:"The famous nightly Sunset Celebration in Key West.", arc:[240,300], obst:0, water:true },
  { id:"bahiahonda", name:"Bahia Honda State Park", state:"FL", lat:24.6550, lng:-81.2815, type:"Beach", note:"Old rail bridge silhouette over Gulf-side water.", arc:[230,310], obst:0, water:true },
  { id:"naples", name:"Naples Pier", state:"FL", lat:26.1317, lng:-81.8066, type:"Pier", note:"Gulf of Mexico sunset off the 1,000-ft pier — a Florida classic.", arc:[230,310], obst:0, water:true },
  { id:"sanibel", name:"Blind Pass, Sanibel/Captiva", state:"FL", lat:26.4835, lng:-82.1840, type:"Beach", note:"Shell-strewn Gulf beach between Sanibel and Captiva.", arc:[230,310], obst:0, water:true },
  { id:"siesta", name:"Siesta Key Beach", state:"FL", lat:27.2654, lng:-82.5528, type:"Beach", note:"Quartz-white sand, Friday drum circles, broad Gulf horizon.", arc:[230,300], obst:0, water:true },
  { id:"fortdesoto", name:"Fort De Soto Park", state:"FL", lat:27.6150, lng:-82.7360, type:"Beach", note:"Pristine Gulf beach at the mouth of Tampa Bay.", arc:[230,310], obst:0, water:true },
  { id:"clearwater", name:"Pier 60, Clearwater Beach", state:"FL", lat:27.9775, lng:-82.8306, type:"Pier", note:"Nightly Sunsets at Pier 60 festival.", arc:[230,310], obst:0, water:true },
  { id:"cedarkey", name:"Cedar Key", state:"FL", lat:29.1354, lng:-83.0330, type:"Harbor", note:"Old Florida fishing town; sun sets over scattered keys.", arc:[220,300], obst:0, water:true },
  { id:"stgeorge", name:"St. George Island", state:"FL", lat:29.6608, lng:-84.8650, type:"Beach", note:"Forgotten Coast barrier island facing the Gulf.", arc:[180,270], obst:0, water:true },
  { id:"pcb", name:"Panama City Beach Pier", state:"FL", lat:30.1895, lng:-85.8320, type:"Pier", note:"Emerald Gulf water; Central time zone.", arc:[190,270], obst:0, water:true },
  { id:"pensacola", name:"Pensacola Beach", state:"FL", lat:30.3305, lng:-87.1420, type:"Beach", note:"Sugar-white sand at the western edge of Florida.", arc:[190,260], obst:0, water:true }
];

// SUNRISE view for the SAME spots (Sunrise|Sunset toggle). [arcFrom, arcTo, obstructionDeg, waterTowardSunrise, note]
// Hand-estimated like the sunset arcs: spots whose east side is land get a real obstruction and no water, so their site fit drops honestly.
window.SUNRISE_VIEW = {
  cadillac:[50,150,0,true,"Famous sunrise summit — first light over Frenchman Bay and the Porcupine Islands."],
  bassharbor:[60,150,3,false,"Light faces southwest; sunrise is behind the island's woods — better for sunset."],
  westprom:[60,140,4,false,"West-facing bluff; the city blocks the eastern sky. Eastern Promenade across town is the sunrise side."],
  herring:[60,150,2,false,"Faces west; sunrise comes up over the Provincetown dunes."],
  firstenc:[60,140,2,false,"Bay-side beach; sunrise rises over Eastham behind you."],
  menemsha:[60,150,2,false,"Harbor looks west; sunrise is over the Vineyard's hills."],
  aquinnah:[60,160,1.5,false,"Cliffs face west; eastern horizon is island land."],
  beavertail:[90,190,0.5,true,"Southern tip opens east over the mouth of Narragansett Bay toward Newport."],
  montauk:[40,200,0,true,"The Point itself faces the open Atlantic to the east — a top sunrise spot."],
  pier45:[60,140,6,false,"Manhattan skyline blocks the east; sunrise lights the Jersey side instead."],
  bbpier1:[60,150,4,false,"Brooklyn Heights and DUMBO are to the east — sunrise is better from Manhattan's East River side looking back at Brooklyn."],
  capemay:[60,170,1,true,"Cape May Point — walk to the ocean side for sunrise over the Atlantic."],
  henlopen:[40,140,0.5,true,"The Point faces the Atlantic and the bay mouth to the east."],
  terrapin:[60,140,1,true,"Sunrise across the Chester River / Eastern Bay shoreline."],
  annapolis:[80,150,2,true,"City Dock looks east down Spa Creek toward the Bay — partial sunrise view."],
  assateague:[40,170,0.5,false,"Bayside marsh; walk over the dune to the ocean beach for an open eastern horizon."],
  chincoteague:[80,140,1.5,true,"Waterfront looks east over Chincoteague Channel toward Assateague's low marsh."],
  capecharles:[60,140,2,false,"Faces west over the Bay; the Eastern Shore is behind you at sunrise."],
  fisherman:[60,170,0,true,"Barrier-island tip — the Atlantic and Smith Island Inlet open to the east; sunrise straight over the ocean (guided-tour access)."],
  yorktown:[50,140,1.5,true,"York River runs northeast here — sunrise down the river past Gloucester Point."],
  huntington:[60,150,2,false,"James River beach faces southwest; Newport News is to the east."],
  jamestown:[60,140,2,false,"Faces southwest across the James; wooded land to the east."],
  oceanview:[30,90,0.5,true,"Norfolk's bay beach looks north/northeast across the Chesapeake — summer sunrises clear the water."],
  willoughby:[30,110,1,true,"Spit's bay beach looks northeast and east along Ocean View over the Chesapeake — good water sunrise."],
  hoffler:[60,150,3,false,"Woods and Harbour View are to the east — for sunrise use the Olde Towne Portsmouth seawall, looking across the Elizabeth River at the Norfolk skyline."],
  bennettscreek:[60,150,3,false,"Bennett's Creek and wooded neighborhoods to the east — sunrise filtered through trees; the view is a sunset spot."],
  oldpoint:[60,150,0.5,true,"Hampton (Fort Monroe) — the east side opens over the mouth of the Chesapeake Bay; strong sunrise spot."],
  wickham:[60,150,2.5,false,"Residential Fox Hill blocks the east — sunrise filtered through neighborhood trees; the Harris River view is the sunset side."],
  lesner:[40,140,1,true,"Virginia Beach — Chick's Beach by the Lesner Bridge on the bayside."],
  backbay:[60,160,0.5,true,"Virginia Beach — the ocean beach is a short walk east of the bay trail; wide sunrise horizon."],
  melrose:[60,150,3,false,"Little Plymouth — Mattaponi marsh and treeline to the east; sunrise is filtered through the woods."],
  duck:[40,170,0.5,true,"Cross Duck Road to the ocean beach — open Atlantic sunrise."],
  jockeys:[60,150,0,false,"From the dune crest you see east over Nags Head to the ocean."],
  avon:[40,170,0.5,true,"Cross NC-12 and the dune to Avon Pier (~0.6 mi) for an open Atlantic sunrise."],
  buxton:[40,170,0.5,true,"Walk over the dune to the ocean beach across NC-12 — open Atlantic sunrise toward Cape Hatteras."],
  ocracoke:[60,150,2,false,"Live-oak woods face the sound; the ocean beach on Ocracoke is the sunrise side."],
  sunsetbeach:[90,180,0.5,true,"South-facing beach — fall and winter sunrises come up over the ocean at the east end."],
  shemcreek:[80,150,2,true,"Looks east toward the harbor and Mount Pleasant marsh."],
  harbourtown:[60,150,2,false,"Faces Calibogue Sound to the west; Sea Pines woods to the east."],
  tybee:[60,150,2,false,"Back River faces south-west; the main Tybee ocean beach is the sunrise side."],
  stsimons:[90,170,1,true,"Pier looks southeast across St. Simons Sound toward Jekyll — decent sunrise."],
  fernandina:[60,150,2,false,"Harbor faces west over the Amelia River; town is to the east."],
  titusville:[70,130,1,true,"Causeway over the Indian River — sunrise behind Merritt Island and the launch pads."],
  laketrail:[50,180,1,true,"West Palm Beach — from the Royal Park Bridge area cross to the Palm Beach ocean beach for sunrise over the Atlantic."],
  miamibeach:[50,150,2,false,"Faces Biscayne Bay to the west — walk ~1 mile east to the ocean (Lummus Park / South Beach) for sunrise over the Atlantic."],
  keywest:[60,150,3,false,"Mallory faces west; Old Town is to the east."],
  bahiahonda:[60,170,0.5,true,"Sandspur/ocean-side beach faces the Atlantic to the east."],
  naples:[60,150,2,false,"Gulf pier faces west; sunrise is over the city."],
  sanibel:[60,150,2,false,"Gulf-facing; sunrise comes up over the islands' mangroves."],
  siesta:[60,150,2,false,"Gulf-facing beach; sunrise rises over Siesta Key and the mainland."],
  fortdesoto:[60,150,1,true,"Bay side of the park looks east across Tampa Bay toward the Skyway."],
  clearwater:[60,150,2,false,"Gulf pier; sunrise over Clearwater Harbor and the city."],
  cedarkey:[60,150,1.5,true,"Dock area looks east over the back bay marsh."],
  stgeorge:[60,150,1,true,"East end of the island opens over the Gulf/sound at sunrise."],
  pcb:[90,170,1,true,"South-facing pier — winter sunrises come up over the Gulf to the southeast."],
  pensacola:[90,170,1,true,"South-facing Gulf beach — sunrise over the water to the southeast in fall/winter."]
};

// GEOGRAPHY-MATCHED VIEWS (both modes). Sunset always faces the sun's WEST azimuth, sunrise the EAST azimuth; this table
// says what is actually in front of you on that bearing, from coastal geography (maps / satellite), per spot:
//   [sunsetFar, sunriseForeground, sunriseFar, sunriseVantage?]
// far = what sits on the horizon: open (open water), lowshore (low distant shore), islands, skyline, bridge, hills, trees.
// sunriseVantage = [name, lat, lng] when the east-facing view is a short walk/drive away in the same place
// (e.g. Avon: sunset over Pamlico Sound from the harbor, sunrise over the Atlantic from Avon Pier). Weather is still
// read at the spot's own coordinates (same town, < ~3 mi), so forecasts don't change — only the view does.
// Hand-checked against map/satellite imagery, not a terrain model.
window.SCENE = {
  cadillac:["hills","Summit","islands"],
  bassharbor:["islands","Beach","open",["the Seawall, Mount Desert Island",44.2406,-68.3017]],
  westprom:["hills","Bluff","islands",["Eastern Promenade, Portland",43.6686,-70.2424]],
  herring:["open","Pier","lowshore",["MacMillan Pier, Provincetown Harbor",42.0505,-70.1855]],
  firstenc:["open","Beach","open",["Nauset Light Beach, Eastham",41.8590,-69.9517]],
  menemsha:["islands","Beach","open",["Lucy Vincent Beach, Chilmark",41.3399,-70.7236]],
  aquinnah:["islands","Bluff","hills"],
  beavertail:["lowshore","Lighthouse","lowshore"],
  montauk:["open","Lighthouse","open",["Montauk Point (ocean side)",41.0710,-71.8569]],
  pier45:["skyline","Pier","skyline",["East River Esplanade, Pier 35 (Manhattan)",40.7096,-73.9885]],
  bbpier1:["skyline","Town","skyline"],
  capemay:["open","Beach","open",["Cape May Point State Park (ocean beach)",38.9318,-74.9603]],
  henlopen:["lowshore","Beach","open"],
  terrapin:["bridge","Marsh","trees"],
  annapolis:["skyline","Harbor","lowshore"],
  assateague:["lowshore","Beach","open",["Assateague ocean beach (North Beach)",38.2090,-75.1500]],
  chincoteague:["lowshore","Beach","open",["Assateague Beach / Tom's Cove (VA)",37.8860,-75.3450]],
  capecharles:["open","Town","trees"],
  fisherman:["open","Marsh","open"],
  yorktown:["bridge","Beach","lowshore"],
  huntington:["bridge","Town","trees"],
  jamestown:["lowshore","Woods","trees"],
  oceanview:["lowshore","Beach","lowshore"],
  willoughby:["bridge","Beach","open"],
  hoffler:["lowshore","Woods","trees"],
  bennettscreek:["lowshore","Woods","trees"],
  oldpoint:["bridge","Beach","open"],
  wickham:["trees","Town","trees"],
  lesner:["lowshore","Beach","bridge"],
  backbay:["lowshore","Beach","open",["Back Bay NWR ocean beach",36.6730,-75.9122]],
  melrose:["trees","Woods","trees"],
  duck:["lowshore","Beach","open",["Duck ocean beach",36.1710,-75.7463]],
  jockeys:["lowshore","Dunes","open"],
  avon:["open","Pier","open",["Avon Fishing Pier (oceanfront)",35.3483,-75.5016]],
  buxton:["open","Beach","open",["Haulover ocean beach, Buxton",35.2986,-75.5126]],
  ocracoke:["lowshore","Beach","open",["Ocracoke Lifeguarded Beach (ocean)",35.1165,-75.9335]],
  sunsetbeach:["lowshore","Beach","open"],
  shemcreek:["skyline","Marsh","trees"],
  harbourtown:["lowshore","Beach","open",["Coligny Beach, Hilton Head (ocean)",32.1400,-80.7505]],
  tybee:["lowshore","Pier","open",["Tybee Pier & Pavilion (ocean)",32.0090,-80.8430]],
  stsimons:["lowshore","Beach","open",["East Beach, St. Simons (ocean)",31.1452,-81.3680]],
  fernandina:["lowshore","Beach","open",["Main Beach, Fernandina (ocean)",30.6693,-81.4302]],
  titusville:["lowshore","Waterfront","lowshore"],
  laketrail:["skyline","Beach","open",["Midtown Beach, Palm Beach (ocean)",26.7062,-80.0333]],
  miamibeach:["skyline","Beach","open",["Lummus Park, South Beach (ocean)",25.7810,-80.1300]],
  keywest:["islands","Beach","open",["Smathers Beach, Key West",24.5516,-81.7720]],
  bahiahonda:["bridge","Beach","open"],
  naples:["open","Town","trees"],
  sanibel:["open","Woods","trees"],
  siesta:["open","Town","trees"],
  fortdesoto:["open","Pier","bridge",["Fort De Soto Bay Pier (Skyway view)",27.6160,-82.7262]],
  clearwater:["open","Waterfront","skyline",["Memorial Causeway, Clearwater Harbor",27.9760,-82.8170]],
  cedarkey:["islands","Marsh","lowshore"],
  stgeorge:["open","Beach","open"],
  pcb:["open","Pier","open"],
  pensacola:["open","Beach","open"]
};
// sunrise views for the relocated east-facing vantages above (replace the old "walk over there" estimates)
Object.assign(window.SUNRISE_VIEW, {
  bassharbor:[80,190,0.5,true,"Sunrise from the Seawall on Rt 102A (~2 mi east) — cobble shore facing the open Atlantic to the southeast."],
  westprom:[60,150,0.5,true,"Sunrise from Portland's Eastern Promenade — looking east over Casco Bay and its islands."],
  herring:[70,160,0.5,true,"Sunrise from MacMillan Pier — east-southeast over Provincetown Harbor toward the low Truro shore."],
  firstenc:[40,170,0,true,"Sunrise from Nauset Light Beach (~3 mi east) — open Atlantic horizon."],
  menemsha:[90,200,0.5,true,"Sunrise from Lucy Vincent Beach — south shore cliffs, open Atlantic to the southeast."],
  montauk:[40,200,0,true,"Montauk Point — open Atlantic to the east."],
  pier45:[60,140,1.5,true,"Sunrise from the East River Esplanade (Pier 35) — across the East River to the Brooklyn skyline."],
  capemay:[60,190,0,true,"Sunrise from the Cape May Point State Park ocean beach — open Atlantic."],
  assateague:[40,170,0,true,"Sunrise from Assateague's ocean beach — open Atlantic."],
  chincoteague:[60,180,0,true,"Sunrise from Assateague Beach / Tom's Cove — open Atlantic."],
  terrapin:[60,140,2,false,"Kent Island land and woods to the east — this is a sunset spot."],
  lesner:[50,170,0,true,"Sunrise from Chick's Beach by the Lesner Bridge, looking east over the bay toward Lynnhaven Inlet."],
  backbay:[50,170,0,true,"Sunrise from the refuge's ocean beach — open Atlantic."],
  duck:[40,170,0,true,"Sunrise from Duck's ocean beach — open Atlantic."],
  jockeys:[60,150,0.5,true,"From the dune crest you look east over Nags Head to the ocean horizon."],
  avon:[40,170,0,true,"Sunrise from Avon Fishing Pier — open Atlantic to the east (the harbor/sound side is the sunset view)."],
  buxton:[40,170,0,true,"Sunrise from the Haulover ocean beach across NC-12 — open Atlantic toward Cape Hatteras."],
  ocracoke:[60,180,0,true,"Sunrise from the Ocracoke ocean beach — open Atlantic."],
  harbourtown:[60,180,0,true,"Sunrise from Coligny Beach — open Atlantic to the southeast."],
  tybee:[50,170,0,true,"Sunrise from the Tybee Pier & Pavilion — open Atlantic."],
  stsimons:[50,170,0,true,"Sunrise from East Beach — open Atlantic."],
  fernandina:[50,170,0,true,"Sunrise from Fernandina's Main Beach — open Atlantic."],
  laketrail:[50,180,0,true,"Sunrise from Palm Beach's Midtown Beach — open Atlantic."],
  miamibeach:[50,170,0,true,"Sunrise from Lummus Park / South Beach — open Atlantic."],
  keywest:[90,190,0,true,"Sunrise from Smathers Beach — open Atlantic/Straits to the southeast."],
  fortdesoto:[60,130,0.5,true,"Sunrise from the Bay Pier — across Tampa Bay toward the Sunshine Skyway."],
  clearwater:[70,130,1,true,"Sunrise from the Memorial Causeway — across Clearwater Harbor to the downtown skyline."],
  bbpier1:[60,150,4,false,"Brooklyn Heights and DUMBO rise to the east — sunrise behind the buildings."]
});

// ---- DRAFT additions (afterglow-preview only) ----
(function () {
  const A = (id, name, st, lat, lng, type, note, arc, obst, water, rise, scene) => { window.SPOTS.push({ id, name, state: st, lat, lng, type, note, arc, obst, water }); window.SUNRISE_VIEW[id] = rise; window.SCENE[id] = scene; };
  const OCEAN = n => [50, 150, 0, true, n || "Open Atlantic horizon to the east."];
  A("hatteraslh", "Cape Hatteras Lighthouse, Buxton", "NC", 35.2506, -75.5288, "Lighthouse", "The lighthouse and the Point — faces the open Atlantic (east) by default; 180° shows Buxton woods and the sound side.", [220, 300], 1.5, false, OCEAN("Sun rises out of the Atlantic beside the lighthouse."), ["trees", "Beach", "open"]);
  A("windmillpt", "Windmill Point Rd, Hampton", "VA", 37.0712, -76.2860, "Marsh", "Fox Hill road end at the mouth of the Back River — open Chesapeake Bay to the east; marsh and creek to the west.", [230, 300], 1.5, true, OCEAN("Open Chesapeake Bay sunrise past Back River."), ["lowshore", "Beach", "open"]);
  A("grandview", "Grandview Beach, Hampton", "VA", 37.0868, -76.2712, "Beach", "Grandview Nature Preserve beach — faces the open Chesapeake Bay (east); Back River marsh behind you.", [230, 300], 1.5, true, OCEAN("Bay sunrise across open Chesapeake water."), ["lowshore", "Beach", "open"]);
  A("plumtree", "Plum Tree Island NWR (Poquoson)", "VA", 37.1290, -76.3270, "Marsh", "Refuge is closed to entry (former bombing range) — view from the Poquoson marsh edge/water; bay to the east.", [230, 300], 1, true, OCEAN("Sunrise over the bay beyond the refuge marsh."), ["lowshore", "Marsh", "open"]);
  A("littlecreek", "JEB Little Creek Beach (base access only)", "VA", 36.9275, -76.1650, "Beach", "Bay beach on Joint Expeditionary Base Little Creek–Fort Story — CAC/base access required. Looks north/northwest across the Chesapeake.", [270, 330], 0.5, true, [40, 90, 1, true, "Morning light across the bay toward Cape Henry."], ["open", "Beach", "lowshore"]);
  A("capehenry", "Cape Henry Lighthouse, Virginia Beach", "VA", 36.9257, -76.0083, "Lighthouse", "Where the Chesapeake meets the Atlantic (Fort Story — ID check). Faces the ocean (east) by default.", [270, 320], 1, true, OCEAN("Atlantic sunrise at the mouth of the Bay."), ["open", "Beach", "open"]);
  A("northlanding", "North Landing Rd Bridge, Chesapeake", "VA", 36.7178, -76.1002, "Marsh", "North Landing River (Intracoastal Waterway) swing bridge — wide marsh-river view to the west.", [230, 310], 1, true, [70, 140, 1.5, false, "Trees on the east bank — sunrise color mostly above the treeline."], ["lowshore", "Marsh", "trees"]);
  A("baltimore", "Fort McHenry / Inner Harbor, Baltimore", "MD", 39.2633, -76.5797, "Harbor", "Patapsco River shoreline at Fort McHenry — sun sets over the harbor and the city.", [240, 310], 2, true, [80, 140, 1.5, true, "Sunrise down the Patapsco toward the Key Bridge site."], ["city", "Harbor", "lowshore"]);
  A("avalonpier", "Avalon Fishing Pier, Kill Devil Hills", "NC", 36.0442, -75.6745, "Pier", "Ocean pier — faces the Atlantic (east) by default; 180° shows the beach road and dunes.", [240, 300], 2, false, OCEAN("Pier silhouette with Atlantic sunrise."), ["town", "Pier", "open"]);
  A("jennettes", "Jennette's Pier, Nags Head", "NC", 35.9105, -75.5960, "Pier", "1,000-ft concrete ocean pier with wind turbines — faces east by default.", [240, 300], 2, false, OCEAN("Sunrise straight off the end of the pier."), ["town", "Pier", "open"]);
  A("frisco", "Frisco Beach / Pier ruins, Frisco", "NC", 35.2263, -75.6340, "Beach", "Hatteras Island south-facing Atlantic beach — east/southeast ocean by default; Pamlico Sound behind.", [220, 300], 1, true, [80, 160, 0, true, "Atlantic sunrise; winter sun rises over water to the SE."], ["open", "Beach", "open"]);
  A("saltponds", "Buckroe Beach, Hampton", "VA", 37.0398, -76.2899, "Beach", "Public bay beach at Buckroe facing east over the Chesapeake Bay mouth; breaks on NE/E swell; offshore = W/SW wind.", [230, 300], 1.5, false, [50, 120, 0, true, "Bay-mouth sunrise over the Chesapeake."], ["lowshore", "Beach", "open"]);
  // popular East Coast + Gulf surf spots (default faces the surf)
  const S = (id, name, st, lat, lng, note) => A(id, name, st, lat, lng, "Beach", note, [230, 300], 1.5, false, OCEAN(), ["town", "Beach", "open"]);
  S("ditchplains", "Ditch Plains, Montauk", "NY", 41.0390, -71.9170, "Rock/reef points — Long Island's best surf.");
  S("rockaway", "Rockaway Beach 90th St", "NY", 40.5835, -73.8150, "NYC's surf beach; jetty-bowled sandbars.");
  S("manasquan", "Manasquan Inlet", "NJ", 40.1045, -74.0336, "Jetty wedge — big in hurricane swell.");
  S("narragansett", "Narragansett Town Beach", "RI", 41.4345, -71.4558, "Rhode Island's surf hub; Point Judith reefs nearby.");
  S("hamptonnh", "Hampton Beach / The Wall", "NH", 42.9316, -70.7977, "New Hampshire seawall break.");
  S("ocmd", "Ocean City Inlet", "MD", 38.3255, -75.0857, "South-end jetty break at the inlet.");
  S("vb1st", "1st Street Jetty, Virginia Beach", "VA", 36.8305, -75.9690, "Virginia's most consistent break, north of Rudee Inlet.");
  S("sandbridge", "Sandbridge Beach", "VA", 36.7300, -75.9370, "Open Atlantic beach break south of VB.");
  S("sturns", "S-Turns, Rodanthe", "NC", 35.6150, -75.4667, "Hatteras Island classic — barrels on NE swell with W wind.");
  S("rodanthe", "Rodanthe Pier, Rodanthe", "NC", 35.5851, -75.4615, "Hatteras Island ocean pier — classic OBX sunrise: low peach sun over dark backlit walls and glitter on the wet sand (Sean's reference photo).");
  S("wrightsville", "Wrightsville Beach (C St.)", "NC", 34.2100, -77.7926, "Wilmington's surf beach.");
  S("folly", "Folly Beach Washout", "SC", 32.6594, -79.9288, "South Carolina's best-known break.");
  S("tybee", "Tybee Island Pier", "GA", 31.9920, -80.8466, "Georgia's main surf spot.");
  S("jaxpier", "Jacksonville Beach Pier", "FL", 30.2935, -81.3885, "Pier break, north Florida.");
  S("newsmyrna", "New Smyrna Beach Inlet", "FL", 29.0735, -80.9120, "Fast, consistent Florida inlet break.");
  S("sebastian", "Sebastian Inlet (First Peak)", "FL", 27.8622, -80.4465, "Florida's famous wedge off the north jetty.");
  S("cocoa", "Cocoa Beach Pier", "FL", 28.3680, -80.6010, "Space Coast surf town.");
  const G = (id, name, st, lat, lng, note) => A(id, name, st, lat, lng, "Beach", note, [210, 290], 0, true, [70, 150, 1.5, false, "Gulf beaches face south — sunrise over land/bay."], ["open", "Dunes", "town"]);
  G("pensacola", "Pensacola Beach Pier", "FL", 30.3270, -87.1420, "Gulf surf on tropical swell; sunset southwest along the Gulf.");
  G("galveston", "Galveston 61st St Jetty", "TX", 29.2700, -94.8200, "Texas Gulf surf; sun sets down the beach.");
})();
